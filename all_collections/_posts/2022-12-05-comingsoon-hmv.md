---
layout: post
title: ComingSoon
date: 2022-12-05
categories: ["HMV", "File Upload", "Cryptography", "Brute Force"]
thumbnail: "assets/images/ComingSoon.png"
---

# ComingSoon [ Hack My VM ]

### Reconocimiento
##### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 192.168.1.111 -oG allPorts`
- `nmap -sCV -p22,80 192.168.1.111 -oN targeted`

No vemos nada interesante, sigamos investigando.

### Shell
Si entramos a la web veremos un contador y un texto no relevante. Si inspeccionamos la página veremos un comentario que pone que el botón de `upload` se añadirá cuando `EnableUploader` esté activado. 

Como no vemos mucho vamos a hacer `fuzzing` para descubrir directorios y ficheros. Para ello utilizaremos `GoBuster` ya que es más rápido que `WFuzz`:

```
gobuster dir -u "http://192.168.1.111/" -w directory-list-2.3-medium.txt -x php,txt
```

```
/index.php            (Status: 200) [Size: 3988]
/assets               (Status: 200) [Size: 1492]
/license.txt          (Status: 200) [Size: 528] 
/notes.txt            (Status: 200) [Size: 279] 
```

Vemos un archivo algo curioso, `notes.txt` tal vez tenga alguna pista de lo que hacer. Vamos a ver qué pone:

> Set ssh to use keys only (passphrase same as the password)
>
> Just need to sort the images out:
> resize and scp them or using the built-in image uploader.
>
> Test the backups and delete anything not needed.

Nos está diciendo que pongamos el servicio `ssh` para que sólo use llaves, las cuales tendrán el mismo valor que la contraseña. Vemos algo que nos llama la atención, `built-in image uploader`.

Si nos acordamos en el `index.php` vimos un comentario que nos decía que se activaría el `EnableUploader` si se activa. Si miramos las `cookies` veremos que están en `base64` y si las decodificamos nos dará el siguiente resultado:

- `echo RW5hYmxlVXBsb2FkZXIK| base64 -d`

```
EnableUploader
```
- `echo ZmFsc2UK| base64 -d`

```
false
```

Wow! Vemos que las `cookies` están para definir un permiso! Vamos a ver qué pasa si cambiamos el `false` por un `true` (en `base64`):

- `echo -n true | base64`

```
dHJ1ZQ==
```

Si añadimos la `cookie` veremos un nuevo botón. Bien! Como vemos ahora nos da la opción de subir un archivo, vamos a intentar ganar acceso a la máquina por aquí.

Primero me descargué una Reverse Shell de [`PentestMonkey`](https://github.com/pentestmonkey/php-reverse-shell/blob/master/php-reverse-shell.php) y la edité para que apunte a mi equipo.

Una vez hecho me puse en escucha con `NC` por el puerto que especifiqué, en mi caso el puerto `4444`.

- `nc -nlvp 4444`

Bien! Ya estamos preparados! Aunque hay un error, no nos deja subir archivos `PHP`, por lo que tenemos que tratar de saltarlo. Tras varias pruebas llegué a una extensión llamada `PHTML`. Gracias a dicha extensión de archivo logré subir el código.

Bien! Ya estamos en la máquina com `www-data`!

### Subida de privilegios #1
Para poder escalar privilegios y lograr ser `scpuser` comencé por enumeración básica, lo cual no funcionó muy bien. Tras estar mirando la máquina y recordar el archivo `notes.txt` llegué a la ruta `/var/backups` donde había un comprimido. Me lo llevé a mi máquina.

Una vez en mi máquina lo extraje con `tar -xf backup.tar.gz` y me dejó con dos carpetas: `var` y `etc`. En `var` no hay nada interesante, en cambio, en `etc` podemos ver dos ficheros: `passwd` y `shadow`.

Si miramos el fichero `shadow` veremos lo siguiente:

```
root:$y$j9T$/E0VUDL7uS9RsrvwmGcOH0$LEB/7ERUX9bkm646n3v3RJBxttSVWmTBvs2tUjKe9I6:18976:0:99999:7:::
daemon:*:18976:0:99999:7:::
bin:*:18976:0:99999:7:::
sys:*:18976:0:99999:7:::
sync:*:18976:0:99999:7:::
games:*:18976:0:99999:7:::
man:*:18976:0:99999:7:::
lp:*:18976:0:99999:7:::
mail:*:18976:0:99999:7:::
news:*:18976:0:99999:7:::
uucp:*:18976:0:99999:7:::
proxy:*:18976:0:99999:7:::
www-data:*:18976:0:99999:7:::
backup:*:18976:0:99999:7:::
list:*:18976:0:99999:7:::
irc:*:18976:0:99999:7:::
gnats:*:18976:0:99999:7:::
nobody:*:18976:0:99999:7:::
_apt:*:18976:0:99999:7:::
systemd-timesync:*:18976:0:99999:7:::
systemd-network:*:18976:0:99999:7:::
systemd-resolve:*:18976:0:99999:7:::
messagebus:*:18976:0:99999:7:::
avahi-autoipd:*:18976:0:99999:7:::
sshd:*:18976:0:99999:7:::
systemd-coredump:!*:18976::::::
scpuser:$y$j9T$rVt3bxjp6uYKKYJbYU2Zq0$Ysn02LrCwTUB7iQdRiROO7/WQi8JSGtwLZllR54iX0.:18976:0:99999:7:::
```

Wow! Podemos ver la contraseña `hasheada` de `scpuser` y `root`! Vamos a intentar, mediante fuerza bruta con `John`, adivinar la contraseña. Antes de todo metí los dos `hashes` en un fichero llamado `hash.txt`.

```
john hash.txt -w=/usr/share/wordlists/rockyou.txt --format=crypt
```

Estupendo! Tras unos segundos logramos obtener la contraseña de `scpuser` (`scpuser:tigger`)!

### Subida de privilegios #2
Una vez como `scpuser` tenemos que intentar ser `root`. Si nos vamos al directorio personal de `scpuser` veremos un fichero oculto con el nombre de `.oldpasswords`. Vamos a ver qué nos dice:

> Previous root passwords just incase they are needed for a backup\restore
>
> Incredibles2
>
> Paddington2
>
> BigHero6
>
> 101Dalmations

Como vemos son todas las contraseñas antiguas de `root`. Si nos fijamos poder ver un patrón: Las contraseñas son películas animadas con un número en el título, aunque le han quitado el espacio.

Tras una búsqueda llegamos a un [`top`](https://parade.com/554753/samuelmurrian/the-20-greatest-animated-films-of-all-time/) 51 películas animadas de todos los tiempos. Vemos que hay bastantes como para ir probando manualmente, por lo que si queréis podéis haceros un `script` para automatizarlo. Yo lo hice manual.

Tras un buen rato nos encontramos con `Toy Story`, si leemos vemos una mención a `Toy Story 3`.

Enhorabuena! Ya estamos en la máquina como `root` (`root:ToyStory3`)! Lo último ha sido tedioso!