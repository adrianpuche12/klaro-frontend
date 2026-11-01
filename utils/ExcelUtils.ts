import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import { Platform, Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { format } from 'date-fns';
import { apiFetch } from './apiFetch';

interface Transaction {
  id?: number;
  type: string;
  amount: number;
  date: string;
  description?: string;
  supplier?: string;
  closingsCount?: number;
  periodStart?: string;
  periodEnd?: string;
  storeId?: number;
  store?: {
    id: number;
    name: string;
  };
}

export const TRANSACTION_LABELS: Record<string, string> = {
  'income': 'Ingreso',
  'expense': 'Egreso',
  'SALARY': 'Salario',
  'SUPPLIER': 'Proveedor',
  'CLOSING': 'Cierre',
};

export const TRANSACTION_TYPES: Record<string, string> = {
  'Ingreso': 'income',
  'Egreso': 'expense',
  'Salario': 'SALARY',
  'Proveedor': 'SUPPLIER',
  'Cierre': 'CLOSING',
};

export const TRANSACTION_TYPES_NORMALIZED: Record<string, string> = {
  'ingreso': 'income',
  'INGRESO': 'income',
  'Ingreso': 'income',
  'egreso': 'expense',
  'EGRESO': 'expense',
  'Egreso': 'expense',
  'cierre': 'CLOSING',
  'CIERRE': 'CLOSING',
  'Cierre': 'CLOSING',
  'proveedor': 'SUPPLIER',
  'PROVEEDOR': 'SUPPLIER',
  'Proveedor': 'SUPPLIER',
  'salario': 'SALARY',
  'SALARIO': 'SALARY',
  'Salario': 'SALARY',
};

export const IMPORT_TEMPLATE_HEADERS = [
  'Tipo', 'Monto', 'Fecha', 'Descripción', 'Local', 'Proveedor', 'CierresCantidad', 'PeriodoInicio', 'PeriodoFin'
];

const normalizeTransactionType = (type: string): string => {
  if (type in TRANSACTION_TYPES_NORMALIZED) {
    return TRANSACTION_TYPES_NORMALIZED[type];
  }
  
  const internalTypes = ['income', 'expense', 'CLOSING', 'SUPPLIER', 'SALARY'];
  if (internalTypes.includes(type)) {
    return type;
  }
  
  const normalizedType = Object.keys(TRANSACTION_TYPES_NORMALIZED).find(
    key => key.toLowerCase() === type.toLowerCase()
  );
  
  if (normalizedType) {
    return TRANSACTION_TYPES_NORMALIZED[normalizedType];
  }
  
  return type;
};

const normalizeAmount = (amount: unknown): number => {
  if (amount === null || amount === undefined) {
    return 0;
  }
  if (typeof amount === 'number') {
    return amount;
  }
  
  let amountStr = String(amount).trim();
  amountStr = amountStr.replace(/,/g, '');

  if (!amountStr.includes('.') && /^\d+$/.test(amountStr)) {
    return parseInt(amountStr, 10);
  }
  const parsed = parseFloat(amountStr);
  
  return isNaN(parsed) ? 0 : parsed;
};

// Función para exportar transacciones a Excel
export const exportToExcel = async (transactions: Transaction[], fileName?: string) => {
  try {
    const workbook = XLSX.utils.book_new();
    const formattedData = transactions.map(tx => {
      const storeName = tx.store?.name || 'No asignado';

      const typeLabel = tx.type in TRANSACTION_LABELS ? TRANSACTION_LABELS[tx.type] : tx.type;
      const formattedAmount = tx.amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      return {
        'Tipo': typeLabel,
        'Monto': formattedAmount,
        'Fecha': tx.date || '',
        'Descripción': tx.description || '',
        'Local': storeName,
        'Proveedor': tx.supplier || '',
        'Cantidad de Cierres': tx.closingsCount || '',
        'Periodo Desde': tx.periodStart || '',
        'Periodo Hasta': tx.periodEnd || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);

    const columnWidths = [
      { wch: 15 },  // Tipo
      { wch: 15 },  // Monto
      { wch: 12 },  // Fecha
      { wch: 30 },  // Descripción
      { wch: 15 },  // Local
      { wch: 20 },  // Proveedor
      { wch: 10 },  // Cantidad de Cierres
      { wch: 12 },  // Periodo Desde
      { wch: 12 },  // Periodo Hasta
    ];
    worksheet['!cols'] = columnWidths;

    const actualFileName = fileName || `Control de Gastos ${format(new Date(), 'MMMM yyyy')}`;
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transacciones');

    if (Platform.OS === 'web') {
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
      const buf = new ArrayBuffer(wbout.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < wbout.length; i++) {
        view[i] = wbout.charCodeAt(i) & 0xFF;
      }
      const blob = new Blob([buf], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${actualFileName}.xlsx`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      return { success: true, message: 'Archivo exportado con éxito' };
    } else {
      const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const filePath = `${FileSystem.documentDirectory}${actualFileName}.xlsx`;
      await FileSystem.writeAsStringAsync(filePath, wbout, {
        encoding: FileSystem.EncodingType.Base64
      });

      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Exportar Transacciones',
          UTI: 'com.microsoft.excel.xlsx'
        });
        return { success: true, message: 'Archivo exportado con éxito' };
      }
    }

    return { success: true, message: 'Exportación completada' };
  } catch (error: any) {
    console.error('Error al exportar Excel:', error);
    return { success: false, message: 'Error al exportar: ' + error.message };
  }
};

// Función para crear y descargar una plantilla de importación
export const createImportTemplate = async () => {
  try {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([IMPORT_TEMPLATE_HEADERS]);
    XLSX.utils.sheet_add_aoa(worksheet, [
      ['Ingreso', '1,000.00', '2023-01-01', 'Ejemplo de ingreso', 'Nombre del Local', '', '', '', ''],
      ['Egreso', '500.00', '2023-01-02', 'Ejemplo de egreso', 'Nombre del Local', '', '', '', ''],
      ['Cierre', '2,500.00', '2023-01-03', '', 'Nombre del Local', '', '5', '2023-01-01', '2023-01-15'],
      ['Proveedor', '1,200.00', '2023-01-04', '', 'Nombre del Local', 'Proveedor SA', '', '', ''],
      ['Salario', '800.00', '2023-01-05', 'Pago de salario', 'Nombre del Local', '', '', '', '']
    ], { origin: 1 });

    // Ajustar el ancho de las columnas
    worksheet['!cols'] = [
      { wch: 15 },  // Tipo
      { wch: 15 },  // Monto
      { wch: 12 },  // Fecha
      { wch: 30 },  // Descripción
      { wch: 15 },  // Local
      { wch: 15 },  // Proveedor
      { wch: 15 },  // CierresCantidad
      { wch: 15 },  // PeriodoInicio
      { wch: 15 },  // PeriodoFin
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');
    const fileName = `Plantilla_Importacion_${format(new Date(), 'yyyy-MM-dd')}`;

    if (Platform.OS === 'web') {
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
      const buf = new ArrayBuffer(wbout.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < wbout.length; i++) {
        view[i] = wbout.charCodeAt(i) & 0xFF;
      }
      const blob = new Blob([buf], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.xlsx`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      return { success: true, message: 'Plantilla creada con éxito' };
    } else {
      const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const filePath = `${FileSystem.documentDirectory}${fileName}.xlsx`;
      await FileSystem.writeAsStringAsync(filePath, wbout, {
        encoding: FileSystem.EncodingType.Base64
      });

      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Plantilla de Importación',
          UTI: 'com.microsoft.excel.xlsx'
        });
        return { success: true, message: 'Plantilla creada con éxito' };
      }
    }

    return { success: true, message: 'Plantilla creada con éxito' };
  } catch (error: any) {
    console.error('Error al crear plantilla:', error);
    return { success: false, message: 'Error al crear plantilla: ' + error.message };
  }
};

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Función para validar los datos importados
const validateImportData = (
  data: Record<string, unknown>[],
  activeStores: {id: number; name: string}[] = []
): ValidationResult => {
  if (!data || data.length === 0) {
    return { valid: false, errors: ['El archivo está vacío o no tiene datos'] };
  }

  const errors: string[] = [];
  const requiredColumns = ['Tipo', 'Monto', 'Fecha', 'Local'];
  const firstRow = data[0];
  for (const column of requiredColumns) {
    if (!(column in firstRow)) {
      errors.push(`Falta la columna requerida: ${column}`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  data.forEach((row, index) => {
    const rowNum = index + 1;
    const typeValue = row['Tipo'] as string | undefined;
    if (!typeValue) {
      errors.push(`Fila ${rowNum}: El tipo está vacío`);
    } else {
      const normalizedType = normalizeTransactionType(typeValue);
      if (!normalizedType || !['income', 'expense', 'CLOSING', 'SUPPLIER', 'SALARY'].includes(normalizedType)) {
        errors.push(`Fila ${rowNum}: El tipo "${typeValue}" no es reconocido. Valores aceptados: Ingreso, Egreso, Cierre, Proveedor, Salario`);
      }
    }
    const amount = row['Monto'];
    if (amount === undefined || amount === null || amount === '') {
      errors.push(`Fila ${rowNum}: El monto está vacío`);
    } else {
      try {
        const normalizedAmount = normalizeAmount(amount);
        if (normalizedAmount === 0 && String(amount).trim() !== '0') {
          errors.push(`Fila ${rowNum}: El monto "${amount}" no es un número válido`);
        }
      } catch (e) {
        errors.push(`Fila ${rowNum}: El monto "${amount}" no es un número válido`);
      }
    }
    const dateValue = row['Fecha'] as string | undefined;
    if (!dateValue) {
      errors.push(`Fila ${rowNum}: La fecha está vacía`);
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateValue)) {
        try {
          const date = new Date(dateValue);
          if (isNaN(date.getTime())) {
            errors.push(`Fila ${rowNum}: La fecha "${dateValue}" no tiene un formato válido. Use YYYY-MM-DD`);
          }
        } catch (e) {
          errors.push(`Fila ${rowNum}: La fecha "${dateValue}" no tiene un formato válido. Use YYYY-MM-DD`);
        }
      }
    }

    const localValue = row['Local'] as string | undefined;
    if (!localValue) {
      errors.push(`Fila ${rowNum}: El local está vacío`);
    } else if (activeStores.length > 0) {
      const normalizedLocal = String(localValue).trim().toLowerCase();
      const validNames = activeStores.map(s => s.name.toLowerCase());
      if (!validNames.includes(normalizedLocal)) {
        const storeList = activeStores.map(s => s.name).join(', ');
        errors.push(`Fila ${rowNum}: El local "${localValue}" no es válido. Locales disponibles: ${storeList}`);
      }
    }

    if (!typeValue) return;
    
    const normalizedType = normalizeTransactionType(typeValue);
    if (normalizedType === 'CLOSING') {
      const periodoInicio = row['PeriodoInicio'] as string | undefined;
      if (periodoInicio) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(periodoInicio)) {
          try {
            const date = new Date(periodoInicio);
            if (isNaN(date.getTime())) {
              errors.push(`Fila ${rowNum}: El periodo inicio "${periodoInicio}" no tiene un formato válido. Use YYYY-MM-DD`);
            }
          } catch (e) {
            errors.push(`Fila ${rowNum}: El periodo inicio "${periodoInicio}" no tiene un formato válido. Use YYYY-MM-DD`);
          }
        }
      }
      
      const periodoFin = row['PeriodoFin'] as string | undefined;
      if (periodoFin) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(periodoFin)) {
          try {
            const date = new Date(periodoFin);
            if (isNaN(date.getTime())) {
              errors.push(`Fila ${rowNum}: El periodo fin "${periodoFin}" no tiene un formato válido. Use YYYY-MM-DD`);
            }
          } catch (e) {
            errors.push(`Fila ${rowNum}: El periodo fin "${periodoFin}" no tiene un formato válido. Use YYYY-MM-DD`);
          }
        }
      }
      
      const cierresCount = row['CierresCantidad'];
      if (cierresCount !== undefined && cierresCount !== null && cierresCount !== '') {
        const cierresValue = String(cierresCount).trim();
        if (!/^\d+$/.test(cierresValue)) {
          errors.push(`Fila ${rowNum}: La cantidad de cierres "${cierresCount}" debe ser un número entero`);
        }
      }
    }
  });

  return { valid: errors.length === 0, errors };
};

// Función para procesar transacciones para importación
const processTransactionsForImport = (
  jsonData: Record<string, unknown>[],
  activeStores: {id: number; name: string}[] = []
): Record<string, unknown>[] => {
  return jsonData.map((row) => {
    const localName = String(row['Local'] || '').trim().toLowerCase();
    const matchedStore = activeStores.find(s => s.name.toLowerCase() === localName);
    const storeId = matchedStore?.id ?? activeStores[0]?.id ?? 1;

    const typeValue = row['Tipo'] as string || '';
    const typeKey = normalizeTransactionType(typeValue);
    const amount = normalizeAmount(row['Monto']);

    switch (typeKey) {
      case 'CLOSING':
        return {
          type: typeKey,
          amount: amount,
          date: row['Fecha'] || '',
          depositDate: row['Fecha'] || '',
          description: '',
          store: { id: storeId },
          username: "default_user",
          closingsCount: row['CierresCantidad'] ? parseInt(String(row['CierresCantidad']).trim()) : undefined,
          periodStart: row['PeriodoInicio'] || undefined,
          periodEnd: row['PeriodoFin'] || undefined
        };

      case 'SUPPLIER':
        return {
          type: typeKey,
          amount: amount,
          date: row['Fecha'] || '',
          paymentDate: row['Fecha'] || '',
          description: '',
          store: { id: storeId },
          username: "default_user",
          supplier: row['Proveedor'] || undefined
        };

      case 'SALARY':
        return {
          type: typeKey,
          amount: amount,
          date: row['Fecha'] || '',
          salaryDate: row['Fecha'] || '',
          description: row['Descripción'] || '',
          store: { id: storeId },
          username: "default_user"
        };

      case 'income':
      case 'expense':
      default:
        return {
          type: typeKey,
          amount: amount,
          date: row['Fecha'] || '',
          description: row['Descripción'] || '',
          store: { id: storeId }
        };
    }
  });
};

// Procesa transacciones especiales (envía a diferentes endpoints)
const processSpecialTransactions = async (
  transactions: Record<string, unknown>[],
  apiUrl: string
): Promise<{ imported: number, errors: string[] }> => {
  let imported = 0;
  const errors: string[] = [];

  for (const transaction of transactions) {
    try {
      let endpoint = '';
      const transactionType = transaction.type as string;

      if (transactionType === 'income' || transactionType === 'expense') {
        endpoint = `${apiUrl}/transactions`;
      } else if (transactionType === 'CLOSING') {
        endpoint = `${apiUrl}/api/forms/closing-deposits`;
      } else if (transactionType === 'SUPPLIER') {
        endpoint = `${apiUrl}/api/forms/supplier-payments`;
      } else if (transactionType === 'SALARY') {
        endpoint = `${apiUrl}/api/forms/salary-payments`;
      } else {
        errors.push(`Tipo desconocido: ${transactionType}`);
        continue;
      }

      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transaction),
      });

      if (response.ok) {
        imported++;
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Error desconocido' }));
        const errorMessage = typeof errorData === 'object' && errorData !== null && 'message' in errorData 
          ? String(errorData.message) 
          : 'Error desconocido';
        const displayType = transactionType in TRANSACTION_LABELS ? TRANSACTION_LABELS[transactionType] : transactionType;
        errors.push(`Error en ${displayType}: ${errorMessage}`);
      }
    } catch (error: any) {
      const displayType = transaction.type && typeof transaction.type === 'string' && transaction.type in TRANSACTION_LABELS 
        ? TRANSACTION_LABELS[transaction.type] 
        : String(transaction.type);
      errors.push(`Error al procesar ${displayType}: ${error.message}`);
    }
  }

  return { imported, errors };
};

// Función para manejar datos Excel analizados
const handleParsedExcelData = async (
  jsonData: Record<string, unknown>[],
  apiUrl: string,
  activeStores: {id: number; name: string}[] = []
) => {
  const validation = validateImportData(jsonData, activeStores);

  if (!validation.valid) {
    return {
      success: false,
      message: 'El archivo contiene errores de formato',
      details: { errors: validation.errors }
    };
  }

  const transactions = processTransactionsForImport(jsonData, activeStores);
  const result = await processSpecialTransactions(transactions, apiUrl);

  if (result.imported === transactions.length) {
    return {
      success: true,
      message: `Importación exitosa: ${result.imported} transacciones importadas`
    };
  } else if (result.imported > 0) {
    return {
      success: true,
      message: `Importación parcial: ${result.imported} de ${transactions.length} transacciones importadas`,
      details: { errors: result.errors }
    };
  } else {
    return {
      success: false,
      message: 'No se pudo importar ninguna transacción',
      details: { errors: result.errors }
    };
  }
};

// Función principal para importar desde Excel
export const importFromExcel = async (
  apiUrl: string,
  activeStores: {id: number; name: string}[] = []
) => {
  try {
    if (Platform.OS === 'web') {
      return new Promise<{ success: boolean, message: string, details?: any }>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx, .xls';
        
        input.oncancel = () => {
          resolve({ success: false, message: 'No se seleccionó ningún archivo' });
        };
        
        window.addEventListener('focus', function onFocus() {
          setTimeout(() => {
            if (!input.files || input.files.length === 0) {
              window.removeEventListener('focus', onFocus);
              resolve({ success: false, message: 'No se seleccionó ningún archivo' });
            }
          }, 300);
        }, { once: true });
        
        input.addEventListener('change', async (e) => {
          const target = e.target as HTMLInputElement;
          if (!target.files || target.files.length === 0) {
            resolve({ success: false, message: 'No se seleccionó ningún archivo' });
            return;
          }

          const file = target.files[0];
          try {
            const reader = new FileReader();
            reader.onload = async (event) => {
              try {
                if (!event.target || !event.target.result) {
                  resolve({
                    success: false,
                    message: 'Error al leer el archivo: No se pudo cargar el contenido'
                  });
                  return;
                }
                
                const data = event.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

                const result = await handleParsedExcelData(jsonData, apiUrl, activeStores);
                resolve(result);
              } catch (error: any) {
                resolve({
                  success: false,
                  message: 'Error al procesar el archivo: ' + error.message
                });
              }
            };
            
            reader.onerror = (error) => {
              resolve({
                success: false,
                message: 'Error al leer el archivo: ' + (error ? error.toString() : 'Error desconocido')
              });
            };
            
            reader.readAsBinaryString(file);
          } catch (error: any) {
            resolve({
              success: false,
              message: 'Error al leer el archivo: ' + error.message
            });
          }
        });

        input.click();
      });
    } else {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        copyToCacheDirectory: true
      });

      if (result.canceled) {
        return { success: false, message: 'Importación cancelada por el usuario' };
      }

      const filePath = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64
      });

      const workbook = XLSX.read(fileContent, { type: 'base64' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

      return await handleParsedExcelData(jsonData, apiUrl, activeStores);
    }
  } catch (error: any) {
    console.error('Error en importación:', error);
    return { success: false, message: 'Error en la importación: ' + error.message };
  }
};