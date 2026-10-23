import time
from pynput.keyboard import Controller
import serial

# CONFIGURACIÓN: Asegúrate de que coincida con tu puerto COM
PUERTO = 'COM4'
BAUDIOS = 9600

keyboard = Controller()


def main():
  print(f'Iniciando receptor en el puerto {PUERTO}...')
  try:
    ser = serial.Serial(PUERTO, BAUDIOS, timeout=1)
    time.sleep(2)  # Estabilizar conexión
    print(
        '¡Conectado! Escuchando el puerto serie. Envía algo por Bluetooth al'
        ' ESP32...'
    )

    while True:
      if ser.in_waiting > 0:
        # 1. Leemos la línea cruda tal cual llega del ESP32
        linea_cruda = ser.readline()
        print(
            f'📦 [SERIAL CRUDO] Bytes recibidos del ESP32:'
            f' {repr(linea_cruda)}'
        )

        # 2. Intentamos decodificarla y limpiarla
        try:
          dato = linea_cruda.decode('utf-8', errors='ignore').strip()
          if dato:
            print(
                f'⌨️  [ACCIÓN] Carácter válido detectado: "{dato}" -> Enviando'
                ' al teclado...'
            )
            keyboard.press(dato)
            keyboard.release(dato)
          else:
            print('⚠️ [AVISO] La línea llegó vacía o con espacios en blanco.')
        except Exception as e:
          print(f'❌ [ERROR] No se pudo decodificar la línea: {e}')

      time.sleep(0.01)

  except serial.SerialException as e:
    print(f'❌ [ERROR SERIAL] No se pudo abrir el puerto {PUERTO}: {e}')
    print(
        'Verifica que el puerto sea correcto y no esté siendo usado por otro'
        ' programa.'
    )
  except KeyboardInterrupt:
    print('\n🛑 Programa finalizado por el usuario.')


if __name__ == '__main__':
  main()