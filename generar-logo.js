const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generarLogoRaw() {
  const inputPath = path.join(__dirname, 'logo.svg');
  const outputPath = path.join(__dirname, 'logo.raw');

  // 30 mm a 203 DPI son exactamente 240 píxeles
  const maxSize = 240;

  // Procesamos el SVG manteniendo la proporción y limitándolo a un máximo de 240x240 px (~30x30mm)
  const { data, info } = await sharp(inputPath)
    .resize({ 
      width: maxSize, 
      height: maxSize, 
      fit: 'inside',          // Mantiene la proporción sin deformar
      withoutEnlargement: true 
    })
    .threshold(128)           // Blanco y negro puro para impresión térmica
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const bytesPerLine = Math.ceil(width / 8);

  // Encabezado ESC/POS raster: GS v 0 0 xL xH yL yH
  const header = Buffer.from([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerLine & 0xff,
    (bytesPerLine >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff
  ]);

  // Convertir los píxeles a mapa de bits para la impresora
  const imageBuffer = Buffer.alloc(bytesPerLine * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIndex = y * bytesPerLine + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8);
      const pixelValue = data[y * width + x]; // 0 = negro, 255 = blanco

      // Si el píxel es oscuro, encendemos el bit
      if (pixelValue < 128) {
        imageBuffer[byteIndex] |= (1 << bitIndex);
      }
    }
  }

  const finalBuffer = Buffer.concat([header, imageBuffer]);
  fs.writeFileSync(outputPath, finalBuffer);
  console.log(`✅ Archivo logo.raw generado con éxito (${width}x${height} px, aprox. 30x30mm).`);
}

generarLogoRaw().catch(console.error);