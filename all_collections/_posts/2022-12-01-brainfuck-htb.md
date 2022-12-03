---
layout: post
title: BrainFuck
date: 2022-12-01
categories: ["HTB", "WordPress", "SMTP", "Cryptography", "Brute Force"]
thumbnail: "assets/images/BrainFuck.png"
---

# BrainFuck [ Hack The Box ]

### Reconocimiento
##### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 10.10.10.17 -oG allPorts`
- `nmap -sCV -p22,25,110,143,443 10.10.10.17 -oN targeted`

`NMAP` nos reporta un dominio y un subdominio (`sup3rs3cr3t.brainfuck.htb`).

### Inspección
Una vez agregado el dominio y el subdominio al archivo `/etc/hosts` entraremos a la web (por el puerto `443` necesitas poner `https://`). Vemos que es una página creada con `WordPress`, por lo que podemos lanzar `WPScan` para que nos enumere `plugins`, `themes` y usuarios, para ello nos la instalaremos (`sudo apt-get install wpscan`) y la ejecutaremos:

- `wpscan --url "https://brainfuck.htb" --enumerate p,t,u`

```
 | [!] Title: WP Support Plus Responsive Ticket System < 8.0.0 - Privilege Escalation
 |     Fixed in: 8.0.0
 |     References:
 |      - https://wpscan.com/vulnerability/b1808005-0809-4ac7-92c7-1f65e410ac4f
 |      - https://security.szurek.pl/wp-support-plus-responsive-ticket-system-713-privilege-escalation.html
 |      - https://packetstormsecurity.com/files/140413/
```

Además de dos usuarios (`admin` y `Administrator`) nos encontramos con un plugin llamado `WP Support Plus Responsive Ticket System` y nos dice que es vulnerable a `Privilege Escalation`.

Para poder explotarlo primero debemos buscar dicha vulnerabilidad, en mi caso utilizaré [`Exploit-DB`](https://www.exploit-db.com/exploits/41006). Vemos que está el resultado que queríamos, además nos dejan una prueba de concepto para que podamos imitarla, vamos a ver cómo funciona:

```
<form method="post" action="http://wp/wp-admin/admin-ajax.php">
	Username: <input type="text" name="username" value="administrator">
	<input type="hidden" name="email" value="sth">
	<input type="hidden" name="action" value="loginGuestFacebook">
	<input type="submit" value="Login">
</form>
```

Vemos que tras preguntarnos el nombre de usuario que queremos usar (en este caso pone `administrator`, pero utilizaremos `admin`) manda una petición (tenemos que cambiar `wp` por la `URL`) a un archivo `PHP`, por lo que tras cambiar unas cosas nos montaremos un servidor con `Python` para poder mandar la solicitud.

- `python3 -m http.server 80`

Bien! Ya tenemos acceso al `dashboard` como `admin`! Vamos a inspeccionarlo. Vemos que hay varias opciones y, tras un rato de búsqueda e intentos fallidos, damos con la opción `Settings` y dentro `SMTP Configuration`.

Vemos que hay una contraseña, pero no la podemos ver, para ello le daremos a inspeccionar código y veremos su valor, nos lo copiamos. Como os habéis dado cuenta es un servidor `SMTP`, por lo que es para recibir correos electrónicos.

Para acceder al correo utilizaré una herramienta llamada `Evolution` ya que es más cómodo. Tras configurar el usuario con el correo y contraseña que habíamos encontrado podemos leer sus mails. Vemos uno de parte de `root`, vamos a leer lo que pone:

> Hi there, your credentials for our "secret" forum are below :)
>
> username: orestis
>
> password: kIEnnfEKJ#9Umd0
>
> Regards

Nos ha dado las credenciales para el foro "secreto" el cual habíamos descubierto al principio con `NAMP`, por lo que nos dirigimos allí e iniciamos sesión.

### Shell
Una vez hayamos entrado en ese foro veremos tres canales: `Key`, `SSH Access` y `Development`. En el último no hay nada relevante, pero en el canal `SSH Access` vemos una conversación entre `admin` y `orestis`. `Admin` dice que el servicio `SSH` ha sido mejorado y ahora utilizará llaves, por lo que el `login` con contraseña ha sido deshabilitado para siempre. Vemos que `orestis` se enfada y le dice que le evíe una llave lo más rápido posible, a lo que `admin` le contesta que si de verdad quiere que se la envíe por aquí y que todo el mundo la vea. `Orestis` responde diciendo que ha creado un hilo encriptado, que hable por ahí.

Bien, después de leer la conversación nos vamos a `Key`, en el que vemos letras sin sentido, vamos a tratar de desencriptar los mensajes.

Si nos fijamos bien veremos que todos los mensajes de `Orestis` terminan con `Orestis - Hacking for fun and profit`, por lo que `Pieagnm - Jkoijeg nbw zwx mle grwsnn` será la equivalencia. Bien! Ya tenemos una parte resuelta, gracias a esto ya podemos desencriptar lo demás, vamos allá:

Tras varios minutos de búsqueda intensa llegué a `Vigenere Cipher`, un tipo de cifrado. Para poder obtener algo de información me dirigí a [`DCode`](https://www.dcode.fr/vigenere-cipher) el cual tiene muchas herramientas de desencriptación, así que pegué la equivalencia y el texto original (sin espacios) en `Knowing the Key/Password`. Tras unos segundos de espera veremos un resultado:

```
Brainfu - Ckmybra inf uck myb rainfu
```

Como podemos leer pone `brainfuckmybrain fuckmybrain fuck`, podemos intuir que uno de estos tres resultados es la llave para desencriptar lo demás, en este caso es `fuckmybrain` (es ir probando hasta que algo tenga sentido). Bien! Ya podemos desencriptar todo!

Si leemos la conversación veremos que `admin` nos da una `URL` con la `id_rsa` de `orestis`, pero la llave no está. Por último `orestis` dice que utilizará la fuerza bruta, por lo que ya sabes qué hacer.

Una vez nos hayamos descargado el archivo podemos utilizar `ssh2john` para obtener el `hash` y de ahí con `John` hacer fuerza bruta para obtener la contraseña. Veámoslo:

- `ssh2john id_rsa > hash.txt`
- `john hash.txt -w=rockyou.txt`

```
Using default input encoding: UTF-8
Loaded 1 password hash (SSH, SSH private key [RSA/DSA/EC/OPENSSH 32/64])
Cost 1 (KDF/cipher [0=MD5/AES 1=MD5/3DES 2=Bcrypt/AES]) is 0 for all loaded hashes
Cost 2 (iteration count) is 1 for all loaded hashes
Will run 4 OpenMP threads
Press 'q' or Ctrl-C to abort, 'h' for help, almost any other key for status
3poulakia!       (orestis.id_rsa)     
1g 0:00:00:02 DONE (2022-05-12 13:37) 0.4366g/s 5441Kp/s 5441Kc/s 5441KC/s 3pran54..3porfirio
Use the "--show" option to display all of the cracked passwords reliably
Session completed. 
```

Como vemos en unos segundos `John` ha sido capaz de encontrar la contraseña (`3poulakia!`)!

Fantástico! Ya podemos entrar por `SSH` utilizando la `id_rsa` y la contraseña!

### Subida de privilegios
Una vez estemos dentro de la máquina podemos comenzar con enumeración básica, por lo que hice `uname -a` y me fijé que la versión era `4.4`, por lo que busqué vulnerabilidades para esa versión.

En [`Exploit-DB`](https://www.exploit-db.com/exploits/44298) hay un `PoC` (`Prove of Concept`), dándonos así un exploit en `C`, nos lo descargamos, lo pasamos a la máquina víctima y con `GCC` (el cual está instalado) lo compilamos. Nos dejará un archivo con el nombre `a.out`. Cuando lo ejecutemos (`./a.out`) nos dejará con una Shell como `root`.

Enhorabuena! Estamos como `root` de una manera muy fácil!
