# Flujo de alta de usuarios

El servicio de usuarios solicita el registro de credenciales al servicio de
autenticación. Cuando el registro es válido, persiste el usuario con su
identificador y roles, publica el evento user.created e invalida el listado.
