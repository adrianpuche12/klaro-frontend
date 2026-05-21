import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { 
  Button, 
  Card, 
  Title, 
  Text, 
  Portal, 
  IconButton, 
  Dialog, 
  Paragraph,
  Provider as PaperProvider 
} from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { exportToExcel, createImportTemplate, importFromExcel, TRANSACTION_LABELS } from '../utils/ExcelUtils';
import { COLOR } from '../theme';
import { REACT_APP_API_URL } from '../config';

interface ExcelManagerProps {
  visible: boolean;
  onDismiss: () => void;
  transactions: any[];
  onImportSuccess?: () => void;
}

const ExcelManager: React.FC<ExcelManagerProps> = ({
  visible,
  onDismiss,
  transactions,
  onImportSuccess
}) => {
  const [activeStores, setActiveStores] = useState<{id: number; name: string}[]>([]);
  useEffect(() => {
    fetch(`${REACT_APP_API_URL}/api/v2/stores/active`)
      .then(r => r.json())
      .then(setActiveStores)
      .catch(() => {});
  }, []);

  // Estados para la selección de fechas de exportación
  const [dateRange, setDateRange] = useState<{
    startDate: Date | undefined;
    endDate: Date | undefined;
  }>({
    startDate: undefined,
    endDate: undefined,
  });
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  
  // Estados para mostrar diferentes etapas del proceso
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [showResult, setShowResult] = useState(false);
  
  // Estados para mostrar documentación o guías
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [filteredCount, setFilteredCount] = useState(transactions.length);
  useEffect(() => {
    let count = transactions.length;
    
    if (dateRange.startDate && dateRange.endDate) {
      const startDateStr = format(dateRange.startDate, 'yyyy-MM-dd');
      const endDateStr = format(dateRange.endDate, 'yyyy-MM-dd');
      
      count = transactions.filter(tx => {
        const txDate = tx.date?.split('T')[0] || '';
        return txDate >= startDateStr && txDate <= endDateStr;
      }).length;
    }
    
    setFilteredCount(count);
  }, [dateRange, transactions]);

  // Función para exportar transacciones
  const handleExport = async () => {
    setLoading(true);
    
    let dataToExport = [...transactions];
    
    if (dateRange.startDate && dateRange.endDate) {
      const startDateStr = format(dateRange.startDate, 'yyyy-MM-dd');
      const endDateStr = format(dateRange.endDate, 'yyyy-MM-dd');
      
      dataToExport = transactions.filter(tx => {
        const txDate = tx.date?.split('T')[0] || '';
        return txDate >= startDateStr && txDate <= endDateStr;
      });
    }
    
    let fileName;
  
    if (dateRange.startDate && dateRange.endDate) {
      if (dateRange.startDate.getMonth() !== dateRange.endDate.getMonth() || 
          dateRange.startDate.getFullYear() !== dateRange.endDate.getFullYear()) {
        const startMonth = format(dateRange.startDate, 'MMM', { locale: es });
        const endMonth = format(dateRange.endDate, 'MMM', { locale: es });
        const startDay = format(dateRange.startDate, 'd');
        const endDay = format(dateRange.endDate, 'd');
        const year = format(dateRange.endDate, 'yyyy');
        
        fileName = `Control de Gastos Del ${startDay} ${startMonth} al ${endDay} ${endMonth} ${year}`;
      } 
      else if (dateRange.startDate.getDate() !== dateRange.endDate.getDate()) {
        const month = format(dateRange.startDate, 'MMMM', { locale: es });
        const startDay = format(dateRange.startDate, 'd');
        const endDay = format(dateRange.endDate, 'd');
        const year = format(dateRange.endDate, 'yyyy');
        
        fileName = `Control de Gastos Del ${startDay} al ${endDay} ${month} ${year}`;
      }
      else {
        const month = format(dateRange.startDate, 'MMMM', { locale: es });
        const day = format(dateRange.startDate, 'd');
        const year = format(dateRange.startDate, 'yyyy');
        
        fileName = `Control de Gastos Día ${day} ${month} ${year}`;
      }
      
      fileName = fileName.replace(/\b\w+\b/g, function(txt) {
        if (txt.length > 2 && !['del', 'al'].includes(txt.toLowerCase())) {
          return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
        }
        return txt;
      });
      
    } else {
      const currentMonth = format(new Date(), 'MMMM yyyy', { locale: es });
      fileName = `Control de Gastos ${currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1)}`;
    }
    
    const exportResult = await exportToExcel(dataToExport, fileName);
    setResult(exportResult);
    setShowResult(true);
    setLoading(false);
  };

  const handleDownloadTemplate = async () => {
    setLoading(true);
    const templateResult = await createImportTemplate();
    setResult(templateResult);
    setShowResult(true);
    setLoading(false);
  };

  // Función para importar desde Excel
  const handleImport = async () => {
    setLoading(true);
    const importResult = await importFromExcel(REACT_APP_API_URL, activeStores);
    setResult(importResult);
    setShowResult(true);
    setLoading(false);
    if (importResult.success && onImportSuccess) {
      onImportSuccess();
    }
  };

  // Manejador para la selección de rango de fechas
  const onConfirmDateRange = ({
    startDate,
    endDate,
  }: {
    startDate: Date | undefined;
    endDate: Date | undefined;
  }) => {
    setDateRange({ startDate, endDate });
    setDatePickerVisible(false);
  };

  // Limpiar el rango de fechas
  const clearDateRange = () => {
    setDateRange({ startDate: undefined, endDate: undefined });
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <PaperProvider>
        <View style={styles.modalContainer}>
          <Card style={styles.card}>
            <IconButton
              icon="close"
              size={24}
              onPress={onDismiss}
              style={styles.closeButton}
            />
            
            <Title style={styles.title}>Gestión de Excel</Title>
            
            <ScrollView style={styles.content}>
              {/* Sección de Exportación */}
              <Card style={styles.section}>
                <Card.Content>
                  <Title style={styles.sectionTitle}>Exportar a Excel</Title>
                  <Paragraph style={styles.paragraph}>
                    Exporta las transacciones actuales a un archivo Excel.
                  </Paragraph>
                  
                  <View style={styles.dateRangeContainer}>
                    <Text style={styles.dateRangeLabel}>Filtrar por rango de fechas (opcional):</Text>
                    <Button
                      mode="outlined"
                      onPress={() => setDatePickerVisible(true)}
                      style={styles.dateButton}
                      icon="calendar-range"
                    >
                      {dateRange.startDate && dateRange.endDate
                        ? `${format(dateRange.startDate, 'dd/MM/yyyy')} - ${format(dateRange.endDate, 'dd/MM/yyyy')}`
                        : 'Seleccionar fechas'}
                    </Button>
                    
                    {dateRange.startDate && dateRange.endDate && (
                      <Button
                        mode="text"
                        onPress={clearDateRange}
                        style={styles.clearButton}
                      >
                        Limpiar filtro
                      </Button>
                    )}
                  </View>
                  
                  <Button
                    mode="contained"
                    onPress={handleExport}
                    style={styles.actionButton}
                    icon="microsoft-excel"
                    disabled={loading}
                  >
                    Exportar {filteredCount} transacciones
                  </Button>
                </Card.Content>
              </Card>
              
              {/* Sección de Importación */}
              <Card style={styles.section}>
                <Card.Content>
                  <Title style={styles.sectionTitle}>Importar desde Excel</Title>
                  <Paragraph style={styles.paragraph}>
                    Importa transacciones desde un archivo Excel. Asegúrate de usar el formato correcto.
                  </Paragraph>
                  
                  <Button
                    mode="contained"
                    onPress={handleDownloadTemplate}
                    style={[styles.actionButton, { marginBottom: 10 }]}
                    icon="file-download"
                    disabled={loading}
                  >
                    Descargar Plantilla
                  </Button>
                  
                  <Button
                    mode="contained"
                    onPress={handleImport}
                    style={styles.actionButton}
                    icon="file-upload"
                    disabled={loading}
                  >
                    Importar Archivo
                  </Button>
                </Card.Content>
              </Card>
              
              {/* Sección de Documentación */}
              <Card style={styles.section}>
                <Card.Content>
                  <Title style={styles.sectionTitle}>Documentación</Title>
                  <Paragraph style={styles.paragraph}>
                    Consulta la documentación sobre el formato de archivo esperado para importaciones.
                  </Paragraph>
                  
                  <Button
                    mode="outlined"
                    onPress={() => setShowDocumentation(true)}
                    style={styles.actionButton}
                    icon="information"
                  >
                    Ver Documentación
                  </Button>
                </Card.Content>
              </Card>
            </ScrollView>
          </Card>
          
          {/* Indicador de carga */}
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLOR.brand} />
              <Text style={styles.loadingText}>Procesando...</Text>
            </View>
          )}
          
          {/* Diálogo de resultados */}
          <Portal>
            <Dialog
              visible={showResult}
              onDismiss={() => setShowResult(false)}
            >
              <Dialog.Title>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons
                    name={result?.success ? 'check-circle-outline' : 'close-circle-outline'}
                    size={22}
                    color={result?.success ? COLOR.income : COLOR.expense}
                  />
                  {result?.success ? 'Éxito' : 'Error'}
                </View>
              </Dialog.Title>
              <Dialog.Content>
                <Paragraph>{result?.message}</Paragraph>
                {result?.details?.errors && result.details.errors.length > 0 && (
                  <View style={styles.errorsList}>
                    <Text style={styles.errorTitle}>Detalles de errores:</Text>
                    {result.details.errors.map((error: string, index: number) => (
                      <Text key={index} style={styles.errorItem}>• {error}</Text>
                    ))}
                  </View>
                )}
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setShowResult(false)}>Cerrar</Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
          
          {/* Diálogo de documentación */}
          <Portal>
            <Dialog
              visible={showDocumentation}
              onDismiss={() => setShowDocumentation(false)}
              style={styles.documentationDialog}
            >
              <Dialog.Title>Formato de Archivo para Importación</Dialog.Title>
              <Dialog.ScrollArea style={styles.scrollArea}>
                <ScrollView>
                  <Text style={styles.docTitle}>Requisitos del archivo:</Text>
                  <Text style={styles.docText}>• El archivo debe ser formato Excel (.xlsx)</Text>
                  <Text style={styles.docText}>• Debe contener las siguientes columnas:</Text>
                  <View style={styles.tableHeader}>
                    <Text style={styles.tableHeaderCell}>Columna</Text>
                    <Text style={styles.tableHeaderCell}>Formato</Text>
                    <Text style={styles.tableHeaderCell}>Ejemplo</Text>
                  </View>
                  
                  {/* Fila Tipo */}
                  <View style={styles.tableRow}>
                    <Text style={styles.tableCell}>Tipo</Text>
                    <Text style={styles.tableCell}>Texto: "Ingreso", "Egreso", "Cierre", "Salario" o "Proveedor"</Text>
                    <Text style={styles.tableCell}>Cierre</Text>
                  </View>
                  
                  {/* Fila Monto */}
                  <View style={styles.tableRow}>
                    <Text style={styles.tableCell}>Monto</Text>
                    <Text style={styles.tableCell}>Número con formato 1,234.56</Text>
                    <Text style={styles.tableCell}>1,250.50</Text>
                  </View>
                  
                  {/* Fila Fecha */}
                  <View style={styles.tableRow}>
                    <Text style={styles.tableCell}>Fecha</Text>
                    <Text style={styles.tableCell}>YYYY-MM-DD</Text>
                    <Text style={styles.tableCell}>2023-12-31</Text>
                  </View>
                  
                  {/* Fila Descripción */}
                  <View style={styles.tableRow}>
                    <Text style={styles.tableCell}>Descripción</Text>
                    <Text style={styles.tableCell}>Texto (opcional)</Text>
                    <Text style={styles.tableCell}>Pago proveedores</Text>
                  </View>
                  
                  {/* Fila Local */}
                  <View style={styles.tableRow}>
                    <Text style={styles.tableCell}>Local</Text>
                    <Text style={styles.tableCell}>Texto: "Danli" o "El Paraiso"</Text>
                    <Text style={styles.tableCell}>Danli</Text>
                  </View>
                  
                  {/* Nueva fila para Proveedor */}
                  <View style={styles.tableRow}>
                    <Text style={styles.tableCell}>Proveedor</Text>
                    <Text style={styles.tableCell}>Texto (opcional, para tipo Proveedor)</Text>
                    <Text style={styles.tableCell}>Pollo Rey</Text>
                  </View>
                  
                  {/* Nueva fila para CierresCantidad */}
                  <View style={styles.tableRow}>
                    <Text style={styles.tableCell}>CierresCantidad</Text>
                    <Text style={styles.tableCell}>Número (opcional, para tipo Cierre)</Text>
                    <Text style={styles.tableCell}>5</Text>
                  </View>
                  
                  {/* Nueva fila para PeriodoInicio */}
                  <View style={styles.tableRow}>
                    <Text style={styles.tableCell}>PeriodoInicio</Text>
                    <Text style={styles.tableCell}>YYYY-MM-DD (opcional, para tipo Cierre)</Text>
                    <Text style={styles.tableCell}>2023-01-01</Text>
                  </View>
                  
                  {/* Nueva fila para PeriodoFin */}
                  <View style={styles.tableRow}>
                    <Text style={styles.tableCell}>PeriodoFin</Text>
                    <Text style={styles.tableCell}>YYYY-MM-DD (opcional, para tipo Cierre)</Text>
                    <Text style={styles.tableCell}>2023-01-15</Text>
                  </View>
                  
                  <Text style={[styles.docTitle, {marginTop: 20}]}>Campos por tipo de operación:</Text>
                  
                  <Text style={styles.docSubtitle}>Para tipo "Ingreso" o "Egreso":</Text>
                  <Text style={styles.docText}>• Tipo, Monto, Fecha, Descripción, Local</Text>
                  
                  <Text style={styles.docSubtitle}>Para tipo "Cierre":</Text>
                  <Text style={styles.docText}>• Tipo, Monto, Fecha, Local, CierresCantidad, PeriodoInicio, PeriodoFin</Text>
                  
                  <Text style={styles.docSubtitle}>Para tipo "Proveedor":</Text>
                  <Text style={styles.docText}>• Tipo, Monto, Fecha, Local, Proveedor</Text>
                  
                  <Text style={styles.docSubtitle}>Para tipo "Salario":</Text>
                  <Text style={styles.docText}>• Tipo, Monto, Fecha, Descripción, Local</Text>
                  
                  <Text style={[styles.docTitle, {marginTop: 20}]}>Recomendaciones:</Text>
                  <Text style={styles.docText}>• Descarga la plantilla para asegurar el formato correcto</Text>
                  <Text style={styles.docText}>• Evita cambiar el orden o nombre de las columnas</Text>
                  <Text style={styles.docText}>• Verifica que las fechas estén en formato YYYY-MM-DD</Text>
                  <Text style={styles.docText}>• Los montos pueden incluir comas como separadores de miles</Text>
                </ScrollView>
              </Dialog.ScrollArea>
              <Dialog.Actions>
                <Button onPress={() => setShowDocumentation(false)}>Cerrar</Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
          
          {/* Selector de rango de fechas */}
          <DatePickerModal
            locale="es"
            mode="range"
            visible={datePickerVisible}
            onDismiss={() => setDatePickerVisible(false)}
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onConfirm={onConfirmDateRange}
          />
        </View>
      </PaperProvider>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    borderRadius: 8,
    padding: 10,
  },
  closeButton: {
    position: 'absolute',
    right: 5,
    top: 5,
    zIndex: 1,
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginVertical: 15,
    color: '#333',
  },
  content: {
    flexGrow: 1,
  },
  section: {
    marginBottom: 15,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 10,
    color: '#444',
  },
  paragraph: {
    marginBottom: 15,
    color: '#666',
  },
  dateRangeContainer: {
    marginBottom: 15,
  },
  dateRangeLabel: {
    fontSize: 14,
    marginBottom: 8,
    color: '#555',
  },
  dateButton: {
    marginBottom: 5,
  },
  clearButton: {
    alignSelf: 'flex-end',
  },
  actionButton: {
    borderRadius: 30,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  loadingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
  },
  documentationDialog: {
    maxWidth: 500,
    alignSelf: 'center',
  },
  scrollArea: {
    maxHeight: 400,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginVertical: 10,
    color: '#444',
  },
  docSubtitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
    color: '#555',
  },
  docText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#555',
    lineHeight: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 8,
    marginTop: 10,
  },
  tableHeaderCell: {
    flex: 1,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#444',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  tableCell: {
    flex: 1,
    textAlign: 'center',
    color: '#555',
  },
  errorsList: {
    marginTop: 10,
    backgroundColor: '#f8f8f8',
    padding: 10,
    borderRadius: 5,
  },
  errorTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#d32f2f',
  },
  errorItem: {
    fontSize: 12,
    marginBottom: 3,
    color: '#555',
  },
});

export default ExcelManager;