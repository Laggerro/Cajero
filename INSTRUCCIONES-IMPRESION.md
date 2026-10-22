# Tickets de bienvenida y rifa

El ticket es una bienvenida a Expo Tecno Contable ISD 2026. No imprime saldos ni operaciones. El numero correlativo del ticket identifica la participacion en la rifa y el DNI ingresado se imprime como identificacion. En el cajero aparece una confirmacion para verificar que el DNI sea verdadero antes de aceptar la impresion.

El servidor compara el DNI con `alumnos.json`: si esta registrado, agrega el nombre y apellido guardados alli; si no, imprime solamente el DNI. El navegador no puede enviar ni modificar el nombre del alumno.

## Requisitos e inicio

- Node.js instalado en la computadora del cajero.
- Impresora termica instalada en Windows y compartida como `POS-80-Series` (o el nombre exacto configurado en `NOMBRE_IMPRESORA`).
- Abrir el cajero desde XAMPP por HTTP, por ejemplo `http://localhost/Cajero/index.html`; no imprimir abriendo el archivo como `file:///...`.
- Con Apache activo, abrir una terminal en la carpeta del proyecto y ejecutar `npm start`. Dejar esa terminal abierta mientras se use el cajero.

El servicio no requiere paquetes externos. Se puede verificar con `npm test`.

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

El servidor escucha solo en `127.0.0.1:3037`. Reserva el correlativo antes de enviar los datos a la impresora y serializa las reservas entre instancias del servicio. Cada DNI queda registrado junto a un unico correlativo; si se intenta imprimir otra vez, el cajero informa que el DNI ya fue utilizado y muestra el numero asignado. Esta proteccion tambien funciona con intentos simultaneos.

Por seguridad, un DNI y el numero que se le reservo no se liberan aunque la impresion falle: el servicio no puede saber con certeza si una impresora llego a imprimir antes de reportar un error. Puede haber saltos en la numeracion; el DNI no podra obtener un segundo ticket.

El contador y el registro de DNI se guardan en `%LOCALAPPDATA%\eBANK\contador-tickets.json`. No borres ni restaures ese archivo: es el registro persistente que evita repetir numeros o imprimir otro ticket para un DNI ya utilizado. Si el servicio se cierra mientras mantiene el bloqueo, detecta y libera el bloqueo abandonado al reiniciarse.
