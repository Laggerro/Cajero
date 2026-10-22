# Tickets de bienvenida y rifa

El ticket es una bienvenida a Expo Tecno Contable ISD 2026. No imprime saldos ni operaciones. El numero correlativo del ticket identifica la participacion en la rifa y el DNI ingresado se imprime como identificacion. En el cajero aparece una confirmacion para verificar que el DNI sea verdadero antes de aceptar la impresion.

El servidor compara el DNI con `alumnos.json`: si esta registrado, agrega el nombre y apellido guardados alli; si no, imprime solamente el DNI. El navegador no puede enviar ni modificar el nombre del alumno.

## Requisitos e inicio

- Node.js instalado en la computadora del cajero.
- Impresora termica instalada en Windows y compartida como `POS-80-Series` (o el nombre exacto configurado en `NOMBRE_IMPRESORA`).
- Abrir el cajero desde XAMPP por HTTP, por ejemplo `http://localhost/Cajero/index.html`; no imprimir abriendo el archivo como `file:///...`.
- Con Apache activo, abrir una terminal en la carpeta del proyecto y ejecutar `npm start`. Dejar esa terminal abierta mientras se use el cajero.

El servicio no requiere paquetes externos. Se puede verificar con `npm test`.

La configuracion estetica se guarda en `cajero-config.json`, en la carpeta del proyecto. En la primera visita, si ese archivo aun no existe, se importa la configuracion que ya estuviera guardada en el navegador. Para mover el cajero a otra computadora, copia el proyecto junto con ese JSON; al iniciar Node y abrir la pagina desde `http://localhost`, las paginas cargan esa configuracion compartida. Si el servicio no esta iniciado o se abre con `file:///`, solo se aplicara la copia local del navegador y no se podran guardar cambios en el JSON.

Debe haber una sola instancia de `npm start` escuchando en el puerto `3037`. Si aparece `EADDRINUSE`, el servicio ya esta ejecutandose: volve a la terminal donde se inicio y presiona `Ctrl+C`, y luego inicia `npm start` una sola vez. Tambien reinicialo despues de actualizar el proyecto para que cargue las nuevas rutas y cambios.

Para ajustar el nombre de la impresora desde PowerShell:

```powershell
$env:NOMBRE_IMPRESORA = "Nombre compartido exacto"
npm start
```

Para autorizar otro origen web local:

```powershell
$env:EBANK_ALLOWED_ORIGINS = "http://localhost:8080"
npm start
```

## Uso

- Menu de alumno registrado: la tecla `C` (R3) inicia la confirmacion para imprimir nombre, DNI, fecha/hora y correlativo.
- Menu de visitante: la tecla `R` (R4) inicia la misma confirmacion; se imprime el DNI y, solo si coincide con un alumno registrado, su nombre.
- En la confirmacion, `W` (L4) acepta e imprime; `R` (R4) cancela y vuelve al menu.
- En Configuracion, la lista de tickets asignados permite reimprimir uno perdido con el mismo DNI y el mismo correlativo. Esta accion no libera el DNI ni reserva otro numero; solicita confirmacion antes de enviar una nueva copia a la impresora.

El servidor escucha solo en `127.0.0.1:3037`. Reserva el correlativo antes de enviar los datos a la impresora y serializa las reservas entre instancias del servicio. Cada DNI queda registrado junto a un unico correlativo; si se intenta imprimir otra vez, el cajero informa que el DNI ya fue utilizado y muestra el numero asignado. Esta proteccion tambien funciona con intentos simultaneos.

El cajero solo permite imprimir una vez el ticket original de cada DNI. La opcion de reimpresion de Configuracion vuelve a enviar los mismos datos y el mismo correlativo, por ejemplo si la persona pierde el papel. Por eso, una reimpresion genera otra copia fisica del mismo ticket, no una participacion nueva.

El numero correlativo y la lista de DNI asignados se guardan en `%LOCALAPPDATA%\eBANK\contador-tickets.json`, en la computadora donde se ejecuta Node.js. La configuracion visual se guarda en `cajero-config.json`, en la carpeta del proyecto. Si la impresion original falla, el numero y el DNI permanecen reservados: el servicio no puede saber con certeza si la impresora alcanzo a imprimir antes de reportar un error. Se puede usar la opcion de reimpresion para volver a intentar con ese mismo correlativo.

El contador y el registro de DNI se guardan en `%LOCALAPPDATA%\eBANK\contador-tickets.json`. No borres ni restaures ese archivo: es el registro persistente que evita repetir numeros o imprimir otro ticket para un DNI ya utilizado. Si el servicio se cierra mientras mantiene el bloqueo, detecta y libera el bloqueo abandonado al reiniciarse.
