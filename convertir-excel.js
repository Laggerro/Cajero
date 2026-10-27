const fs = require('fs');
const XLSX = require('xlsx');

function excelAJson(rutaExcel, rutaOutputJson) {
  // 1. Leer el archivo Excel
  const workbook = XLSX.readFile(rutaExcel);
  const sheetName = workbook.SheetNames[0]; // Lee la primera hoja
  const sheet = workbook.Sheets[sheetName];

  // 2. Convertir la hoja a objetos JSON
  const data = XLSX.utils.sheet_to_json(sheet);

  // 3. Mapear y formatear según tu estructura deseada
  const resultado = data.map(row => {
    // Formatear DNI a String sin decimales
    let dni = row['Doc.Nro'] ? String(row['Doc.Nro']).trim() : '';

    return {
      dni: dni,
      nombre: row['Nombre'] ? String(row['Nombre']).trim() : '',
      apellido: row['Apellido'] ? String(row['Apellido']).trim() : '',
      curso: row['Curso'] ? String(row['Curso']).trim() : ''
    };
  });

  // 4. Guardar el archivo JSON
  fs.writeFileSync(rutaOutputJson, JSON.stringify(resultado, null, 2), 'utf-8');
  console.log(`¡Proceso completado! Se guardaron ${resultado.length} registros en: ${rutaOutputJson}`);
}

// Ejecutar para tu archivo actual
excelAJson('DatosPersonales - padres.xlsx', 'padres.json');