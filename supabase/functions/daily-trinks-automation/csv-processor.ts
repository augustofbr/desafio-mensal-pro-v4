
import { parse } from "https://deno.land/std@0.170.0/encoding/csv.ts";

/**
 * Process CSV data from Trinks
 */
export async function processCsvData(csvContent: string) {
  // Split by rows and find the starting point for actual data
  const rows = csvContent.split('\n');
  let headerRowIndex = -1;
  
  // Find the header row which contains "Atendimento/Venda" as the first column
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].includes("Atendimento/Venda")) {
      headerRowIndex = i;
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    throw new Error("Could not find header row in CSV");
  }
  
  // Extract the header and data rows
  const csvData = rows.slice(headerRowIndex).join('\n');
  
  // Parse CSV data
  const records = await parse(csvData, {
    separator: ';',
    skipFirstRow: false,
  });
  
  // Extract header and data
  const headers = records[0];
  const dataRows = records.slice(1);
  
  // Find the index of each column we need
  const dateIndex = headers.indexOf('Atendimento/Venda');
  const professionalIndex = headers.indexOf('Profissional');
  const serviceIndex = headers.indexOf('Serviço/Produto/Pacote');
  const categoryIndex = headers.indexOf('Categoria');
  const clientIndex = headers.indexOf('Cliente');
  const valueIndex = headers.indexOf('Valor');
  
  // Extract and format the needed fields
  return dataRows.map((record: string[]) => {
    // Parse date to standardized format (YYYY-MM-DD)
    const dateParts = record[dateIndex].split('/');
    const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
    
    return {
      service_date: formattedDate,
      professional: record[professionalIndex],
      service_name: record[serviceIndex],
      category: record[categoryIndex],
      client_name: record[clientIndex],
      value: parseFloat(record[valueIndex].replace(',', '.')) || 0
    };
  });
}
