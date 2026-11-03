import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  type ViewStyle,
  Image,
} from 'react-native';
import { Card } from 'react-native-paper';
import { Title } from 'react-native-paper';
import { ThemedView } from '../components/ThemedView';
import { ThemedText } from '../components/ThemedText';
import { Button, TextInput, Snackbar, IconButton, SegmentedButtons } from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { format, parseISO } from 'date-fns';
import ExcelManager from '../components/ExcelManager';
import { formatAmountInput } from '../utils/numberFormat';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW } from '../theme';
import { useMoney, useTenantConfig } from '../context/TenantConfigContext';
import { formatTime } from '../utils/format';
import { formatDateOnly, hasTime, daysInRange } from '../utils/dateOnly';
import { apiErrorMessage, httpStatus, isForbidden, NO_PERMISSION_MESSAGE } from '../utils/apiError';
import { getComprobanteUrl } from '../utils/ImageService';
import { useAuth } from '../context/AuthContext';
import { filterAllowedStores } from '../utils/profileAccess';

/*
 * Revisión 06 — Operaciones (pantalla "Finanzas").
 * O-01: todas las llamadas usan axios. AuthContext deja el token en axios.defaults y un
 * interceptor lo renueva ante un 401 y reintenta el pedido; `apiFetch` solo copiaba el
 * header (sin refresco), así que con el token vencido la pantalla quedaba vacía.
 * Un 403 se muestra como "No tenés permiso" (no como lista vacía): el menú habilita
 * Finanzas con TRANSACTIONS/SALARY_PAYMENTS/SUPPLIER_PAYMENTS, pero /api/operations/*
 * exige OPERATIONS — decisión de negocio pendiente, no se resuelve acá.
 */
const API_TIMEOUT = 20000;

const TRANSACTION_LABELS: Record<Transaction['type'], string> = {
  income: 'Ingreso',
  expense: 'Egreso',
  SALARY: 'Salario',
  SUPPLIER: 'Proveedor',
  CLOSING: 'Cierre',
  GASTO_ADMIN: 'Gasto Administrativo',
  gasto_admin: 'Gasto Administrativo',
};

// Actualizamos la interfaz para incluir los nuevos tipos
interface Transaction {
  id: number;
  type: 'CLOSING' | 'SUPPLIER' | 'SALARY' | 'GASTO_ADMIN' | 'income' | 'expense' | 'gasto_admin';
  amount: number;
  date?: string;
  description?: string;
  closingsCount?: number;
  periodStart?: string;
  periodEnd?: string;
  supplier?: string;
  depositDate?: string;
  paymentDate?: string;
  salaryDate?: string;
  storeId?: number;
  storeName?: string;
  store?: {
    id: number;
    name: string;
  };
  // Nuevo campo para la URL de la imagen
  imageUri?: string;
  /** Autor de la operación (AllOperationsDTO.username). Se reenvía tal cual al editar (O-03). */
  username?: string;
}


// O-06: antes 5 por página → decenas de páginas.
const ITEMS_PER_PAGE = 25;

const INCOME_TYPES_ALL: Transaction['type'][] = ['income', 'CLOSING'];
const EXPENSE_TYPES_ALL: Transaction['type'][] = ['expense', 'SALARY', 'SUPPLIER', 'GASTO_ADMIN', 'gasto_admin'];

// O-15: se borró CollapsibleBalanceCard (sin uso). BalanceCard sí se usa en los filtros;
// formateaba con "L" fijo (formatCurrency) → ahora usa la moneda de la empresa.
const BalanceCard = ({ transactions }: { transactions: Transaction[] }) => {
  const money = useMoney();
  const ingresos = transactions
    .filter(tx => INCOME_TYPES_ALL.includes(tx.type))
    .reduce((sum, tx) => sum + tx.amount, 0);
  const egresos = transactions
    .filter(tx => EXPENSE_TYPES_ALL.includes(tx.type))
    .reduce((sum, tx) => sum + tx.amount, 0);
  const total = ingresos - egresos;

  return (
    <Card style={styles.balanceCard}>
      <Card.Content>
        <Title style={styles.balanceTitle}>Balance General</Title>
        <View style={styles.balanceRow}>
          <MaterialCommunityIcons name="arrow-down-bold-circle-outline" size={20} color={COLOR.income} />
          <Text style={styles.balanceLabel}>Ingresos:</Text>
          <Text style={styles.balanceValue}>{money(ingresos)}</Text>
        </View>
        <View style={styles.balanceRow}>
          <MaterialCommunityIcons name="arrow-up-bold-circle-outline" size={20} color={COLOR.expense} />
          <Text style={styles.balanceLabel}>Egresos:</Text>
          <Text style={styles.balanceValue}>{money(egresos)}</Text>
        </View>
        <View style={styles.balanceRow}>
          <MaterialCommunityIcons name="calculator-variant" size={20} color={COLOR.info} />
          <Text style={styles.balanceLabel}>Total:</Text>
          <Text style={[styles.balanceValue, { fontWeight: 'bold' }]}>{money(total)}</Text>
        </View>
      </Card.Content>
    </Card>
  );
};

// ─── KPI Row (4 cards: Balance · Ingresos · Egresos · Promedio) ───────────────
// O-09: el promedio diario dividía siempre por 30. Ahora usa los días del rango filtrado
// (ambos extremos incluidos); sin rango, los días entre la primera y la última operación.
const KpiRow = ({ transactions, startDate, endDate }: {
  transactions: Transaction[];
  startDate?: Date;
  endDate?: Date;
}) => {
  const money = useMoney();
  const incomeTxs  = transactions.filter(tx => INCOME_TYPES_ALL.includes(tx.type));
  const expenseTxs = transactions.filter(tx => EXPENSE_TYPES_ALL.includes(tx.type));
  const totalIncome  = incomeTxs.reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = expenseTxs.reduce((s, tx) => s + tx.amount, 0);
  const balance      = totalIncome - totalExpense;

  const hasRange = !!(startDate && endDate);
  let days = 1;
  if (startDate && endDate) {
    days = daysInRange(startDate, endDate);
  } else {
    const ts = transactions
      .map(tx => (tx.date ? parseISO(tx.date.split('T')[0]).getTime() : NaN))
      .filter(t => !isNaN(t));
    if (ts.length > 0) days = daysInRange(new Date(Math.min(...ts)), new Date(Math.max(...ts)));
  }
  const promedio  = balance / days;
  const daysLabel = `${days} ${days === 1 ? 'día' : 'días'}`;
  const L = (v: number) => money(Math.abs(v));

  return (
    <View style={styles.kpiRow}>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiCardLabel}>BALANCE DEL PERIODO</Text>
        <Text style={[styles.kpiCardValue, { color: balance >= 0 ? COLOR.income : COLOR.expense }]}>
          {balance >= 0 ? '+' : '-'}{L(balance)}
        </Text>
        <Text style={styles.kpiCardSub}>{hasRange ? daysLabel : 'Todo el historial'}</Text>
      </View>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiCardLabel}>INGRESOS · {incomeTxs.length} MOV.</Text>
        <Text style={[styles.kpiCardValue, { color: COLOR.income }]}>+{L(totalIncome)}</Text>
        <Text style={styles.kpiCardSub}> </Text>
      </View>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiCardLabel}>EGRESOS · {expenseTxs.length} MOV.</Text>
        <Text style={[styles.kpiCardValue, { color: COLOR.expense }]}>-{L(totalExpense)}</Text>
        <Text style={styles.kpiCardSub}> </Text>
      </View>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiCardLabel}>PROMEDIO DIARIO</Text>
        <Text style={styles.kpiCardValue}>{promedio < 0 ? '-' : ''}{L(promedio)}</Text>
        <Text style={styles.kpiCardSub}>Balance neto / {daysLabel}</Text>
      </View>
    </View>
  );
};

const CompactDateFilters = ({
  startDate,
  endDate,
  selectedStore,
  setStartDate,
  setEndDate,
  setSelectedStore,
  fetchData,
  setDatePickerOpen,
  setSelectedDateInput,
  onExcelPress,
  showAdminExpenses,
  onToggleAdminExpenses,
  activeStores,
}: {
  startDate?: Date;
  endDate?: Date;
  selectedStore: number | null;
  setStartDate: (date?: Date) => void;
  setEndDate: (date?: Date) => void;
  setSelectedStore: (storeId: number | null) => void;
  fetchData: (start?: Date, end?: Date, storeId?: number | null) => void;
  setDatePickerOpen: (open: boolean) => void;
  setSelectedDateInput: (input: 'start' | 'end') => void;
  onExcelPress: () => void;
  showAdminExpenses: boolean;
  onToggleAdminExpenses: () => void;
  activeStores: {id: number; name: string}[];
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const isLargeScreen = screenWidth >= 768;
  const formatDate = (date?: Date | string) => {
    if (!date) return '';
    try {
      if (typeof date === 'string') {
        return format(parseISO(date), 'yyyy-MM-dd');
      }
      return format(date, 'yyyy-MM-dd');
    } catch (error) {
      console.error('Error al formatear la fecha:', error, date);
      return String(date);
    }
  };

  return (
    <View style={styles.compactFiltersContainer}>
      <View style={isLargeScreen ? styles.filtersRowWeb : undefined}>
        <View style={isLargeScreen ? styles.inputGroupWeb : styles.compactDateInputs}>
          {/* Fechas */}
          <TextInput
            label="Desde"
            value={formatDate(startDate)}
            mode="outlined"
            dense
            style={styles.compactDateInput}
            onFocus={() => {
              setSelectedDateInput('start');
              setDatePickerOpen(true);
            }}
            left={<TextInput.Icon icon="calendar" color={COLOR.brandDark} size={20} />}
            outlineColor={COLOR.border2}
            activeOutlineColor={COLOR.brand}
            theme={{ colors: { primary: COLOR.brand } }}
          />
          <TextInput
            label="Hasta"
            value={formatDate(endDate)}
            mode="outlined"
            dense
            style={styles.compactDateInput}
            onFocus={() => {
              setSelectedDateInput('end');
              setDatePickerOpen(true);
            }}
            left={<TextInput.Icon icon="calendar" color={COLOR.brandDark} size={20} />}
            outlineColor={COLOR.border2}
            activeOutlineColor={COLOR.brand}
            theme={{ colors: { primary: COLOR.brand } }}
          />
        </View>

        {/* Selector de tienda — dinámico desde /api/v2/stores/active */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4, paddingVertical: 4 }}>
          <TouchableOpacity
            style={[storeChipStyle.chip, selectedStore === null && storeChipStyle.active]}
            onPress={() => setSelectedStore(null)}
          >
            <Text style={[storeChipStyle.text, selectedStore === null && storeChipStyle.activeText]}>Todos</Text>
          </TouchableOpacity>
          {activeStores.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[storeChipStyle.chip, selectedStore === s.id && storeChipStyle.active]}
              onPress={() => setSelectedStore(s.id)}
            >
              <Text style={[storeChipStyle.text, selectedStore === s.id && storeChipStyle.activeText]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Botones — grid 2 columnas para que no se corten en mobile */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4, marginTop: 4 }}>
          <Button
            mode={showAdminExpenses ? "contained" : "outlined"}
            compact
            onPress={onToggleAdminExpenses}
            style={{ flex: 1, minWidth: '45%' }}
            icon="bank"
            buttonColor={showAdminExpenses ? COLOR.warn : COLOR.transparent}
            textColor={showAdminExpenses ? COLOR.white : COLOR.warn}
          >
            G. Admin
          </Button>
          <Button
            mode="contained"
            compact
            onPress={() => fetchData(startDate, endDate, selectedStore)}
            style={{ flex: 1, minWidth: '45%' }}
            icon="refresh"
            buttonColor={COLOR.info}
          >
            Actualizar
          </Button>
          <Button
            mode="contained"
            compact
            onPress={onExcelPress}
            style={{ flex: 1, minWidth: '45%' }}
            icon="microsoft-excel"
            buttonColor={COLOR.income}
          >
            Excel
          </Button>
          {(startDate || endDate || selectedStore || showAdminExpenses) && (
            <Button
              mode="outlined"
              compact
              onPress={() => {
                setStartDate(undefined);
                setEndDate(undefined);
                setSelectedStore(null);
                if (showAdminExpenses) onToggleAdminExpenses();
              }}
              style={{ flex: 1, minWidth: '45%' }}
              textColor={COLOR.brandDark}
            >
              Limpiar
            </Button>
          )}
        </View>
      </View>
    </View>
  );
};

const AdminScreen = () => {
  const money = useMoney();
  const { currency } = useTenantConfig();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedDateInput, setSelectedDateInput] = useState<'start' | 'end'>('start');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStore, setSelectedStore] = useState<number | null>(null);
  const [showAdminExpenses, setShowAdminExpenses] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Estados para el modal de edición
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [datePickerEditVisible, setDatePickerEditVisible] = useState(false);
  const [dateEditField, setDateEditField] = useState<'date' | 'periodStart' | 'periodEnd'>('date');

  // Estado para gestión de Excel
  const [showExcelManager, setShowExcelManager] = useState(false);

  // Estado para visor de comprobante
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // Campos para editar
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newClosingsCount, setNewClosingsCount] = useState('');
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newStoreId, setNewStoreId] = useState<number | null>(null);

  // Snackbar
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Estados para la eliminación (modal)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  // G-01: `loading` de Paper no deshabilita el botón → se usa junto a `disabled`.
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // O-07: error de carga visible (antes solo console.error → lista vacía y KPIs en 0).
  // `loadError` bloquea la lista; `partialError` avisa que falta una parte (ej. 403 en
  // /api/operations/all pero /transactions respondió).
  const [loadError, setLoadError] = useState('');
  const [partialError, setPartialError] = useState('');

  const showSnackbar = (msg: string) => { setSnackbarMessage(msg); setSnackbarVisible(true); };

  // El bucket de comprobantes es privado: se pide una URL firmada (5 min) al abrirlo.
  // `imageUri` puede ser la clave nueva o la URL pública vieja; el backend acepta las dos.
  const openComprobante = async (imageUri: string) => {
    try {
      setViewingImage(await getComprobanteUrl(imageUri));
    } catch (e) {
      showSnackbar(httpStatus(e) === 404
        ? 'No se encontró el comprobante.'
        : apiErrorMessage(e, 'No se pudo abrir el comprobante.'));
    }
  };

  const { width: screenWidth } = useWindowDimensions();
  const isLargeScreen = screenWidth >= 768;

  // Stores activos — cargados dinámicamente desde /api/v2/stores/active
  // P10: solo los locales permitidos para el usuario (root/legacy: todos).
  const { fullAccess, allowedStoreIds } = useAuth();
  const [activeStores, setActiveStores] = useState<{id: number; name: string}[]>([]);
  useEffect(() => {
    axios.get<{ id: number; name: string }[]>(`${REACT_APP_API_URL}/api/v2/stores/active`, { timeout: API_TIMEOUT })
      .then(r => setActiveStores(filterAllowedStores(Array.isArray(r.data) ? r.data : [], { fullAccess, allowedStoreIds })))
      .catch(() => setActiveStores([])); // los nombres de local caen al storeName de cada fila
  }, []);

  // Manejador para éxito de importación desde Excel
  const handleImportSuccess = () => {
    if (showAdminExpenses) {
      fetchAdminExpenses(startDate, endDate, selectedStore);
    } else {
      fetchData(startDate, endDate, selectedStore);
    }
    setSnackbarMessage('Operaciones importadas correctamente');
    setSnackbarVisible(true);
  };

  // Función para alternar el filtro de gastos administrativos
  const handleToggleAdminExpenses = () => {
    const newShowAdmin = !showAdminExpenses;
    setShowAdminExpenses(newShowAdmin);
    if (newShowAdmin) {
      fetchAdminExpenses(startDate, endDate, selectedStore);
    } else {
      fetchData(startDate, endDate, selectedStore);
    }
  };

  // Función para obtener solo gastos administrativos
  const fetchAdminExpenses = async (start?: Date, end?: Date, storeId?: number | null) => {
    setLoading(true);
    try {
      let url = `${REACT_APP_API_URL}/api/operations/admin-expenses`;
      const queryParams = [];

      if (start && end) {
        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');
        queryParams.push(`startDate=${startStr}`);
        queryParams.push(`endDate=${endStr}`);
      }

      if (storeId) {
        queryParams.push(`storeId=${storeId}`);
      }

      if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`;
      }

      setPartialError('');
      const { data } = await axios.get<Transaction[]>(url, { timeout: API_TIMEOUT });
      setTransactions(Array.isArray(data) ? data : []);
      setLoadError('');
      setCurrentPage(1);
    } catch (err) {
      console.error('Error al cargar los gastos administrativos:', err);
      setTransactions([]);
      setLoadError(isForbidden(err)
        ? NO_PERMISSION_MESSAGE
        : apiErrorMessage(err, 'No se pudieron cargar los gastos administrativos.'));
    } finally {
      setLoading(false);
    }
  };

  // Función para obtener datos de dos endpoints y unificarlos.
  const fetchData = async (start?: Date, end?: Date, storeId?: number | null) => {
    setLoading(true);
    try {
      // Se obtienen las operaciones desde el endpoint de operaciones.
      let urlOperations = `${REACT_APP_API_URL}/api/operations/all`;
      const queryParams = [];

      if (start && end) {
        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');
        queryParams.push(`startDate=${startStr}`);
        queryParams.push(`endDate=${endStr}`);
      }

      if (storeId) {
        queryParams.push(`storeId=${storeId}`);
      }

      if (queryParams.length > 0) {
        urlOperations += `?${queryParams.join('&')}`;
      }

      let urlTransactions = `${REACT_APP_API_URL}/transactions`;
      if (storeId) {
        urlTransactions = `${REACT_APP_API_URL}/api/transactions/store/${storeId}`;
      }

      // Los dos pedidos son independientes: si uno falla (ej. 403 por falta del módulo
      // OPERATIONS) se muestra el otro y se avisa qué parte falta.
      const [opsResult, transResult] = await Promise.allSettled([
        axios.get<Transaction[]>(urlOperations, { timeout: API_TIMEOUT }),
        axios.get<Transaction[]>(urlTransactions, { timeout: API_TIMEOUT }),
      ]);

      let operationsData: Transaction[] = [];

      if (opsResult.status === 'fulfilled') {
        operationsData = Array.isArray(opsResult.value.data) ? opsResult.value.data : [];
        operationsData = operationsData.map(op => {
          const newOp = { ...op };

          if (op.type === 'CLOSING' && op.depositDate) {
            newOp.date = op.depositDate;
          } else if (op.type === 'SUPPLIER' && op.paymentDate) {
            newOp.date = op.paymentDate;
          } else if (op.type === 'SALARY' && op.salaryDate) {
            newOp.date = op.salaryDate;
          }
          return newOp;
        });
      }

      let transactionsData: Transaction[] = [];

      if (transResult.status === 'fulfilled') {
        transactionsData = Array.isArray(transResult.value.data) ? transResult.value.data : [];

        if (start && end) {
          const startDateStr = format(start, 'yyyy-MM-dd');
          const endDateStr = format(end, 'yyyy-MM-dd');

          transactionsData = transactionsData.filter(tx => {
            if (!tx.date) return false;

            try {
              const txDateStr = typeof tx.date === 'string'
                ? tx.date.split('T')[0]
                : format(new Date(tx.date), 'yyyy-MM-dd');

              return txDateStr >= startDateStr && txDateStr <= endDateStr;
            } catch (error) {
              console.warn('Error al procesar fecha:', tx.date, error);
              return false;
            }
          });
        }
      }
      // Se unen ambos arreglos
      const merged = [...operationsData, ...transactionsData];
      const sortedTransactions = merged.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);

        return dateB.getTime() - dateA.getTime();
      });

      setTransactions(sortedTransactions);
      setCurrentPage(1);

      const opsErr = opsResult.status === 'rejected' ? opsResult.reason : null;
      const transErr = transResult.status === 'rejected' ? transResult.reason : null;
      if (opsErr && transErr) {
        // Nada se pudo leer: no mostrar "No hay transacciones" ni KPIs en 0.
        setLoadError(isForbidden(opsErr) && isForbidden(transErr)
          ? NO_PERMISSION_MESSAGE
          : apiErrorMessage(opsErr, 'No se pudieron cargar las operaciones.'));
        setPartialError('');
      } else if (opsErr || transErr) {
        setLoadError('');
        const missing = opsErr
          ? 'depósitos de cierre, pagos a proveedores, salarios y gastos administrativos'
          : 'ingresos y egresos sueltos';
        const err = opsErr ?? transErr;
        setPartialError(isForbidden(err)
          ? `No tenés permiso para ver ${missing}. Los totales no los incluyen.`
          : `No se pudieron cargar ${missing}. Los totales no los incluyen.`);
      } else {
        setLoadError('');
        setPartialError('');
      }
    } catch (err) {
      console.error('Error al cargar las transacciones:', err);
      setTransactions([]);
      setLoadError(apiErrorMessage(err, 'No se pudieron cargar las operaciones.'));
    } finally {
      setLoading(false);
    }
  };

  const reload = () => {
    if (showAdminExpenses) {
      fetchAdminExpenses(startDate, endDate, selectedStore);
    } else {
      fetchData(startDate, endDate, selectedStore);
    }
  };

  // O-04: el filtro por fecha solo se aplica con Desde y Hasta. Con una sola, se avisa
  // en vez de ignorarla en silencio; con el rango invertido, también.
  const rangeHint = startDate && !endDate
    ? 'Elegí también la fecha "Hasta" para filtrar por período.'
    : !startDate && endDate
      ? 'Elegí también la fecha "Desde" para filtrar por período.'
      : startDate && endDate && startDate.getTime() > endDate.getTime()
        ? 'La fecha "Desde" es posterior a "Hasta": no hay operaciones en ese rango.'
        : '';

  useFocusEffect(
    useCallback(() => {
      if (showAdminExpenses) {
        fetchAdminExpenses(startDate, endDate, selectedStore);
      } else {
        fetchData(startDate, endDate, selectedStore);
      }
    }, [startDate, endDate, selectedStore, showAdminExpenses])
  );

  const onDismissDatePicker = () => {
    setDatePickerOpen(false);
  };

  const onConfirmDate = ({ date }: { date: Date | undefined }) => {
    setDatePickerOpen(false);
    if (date) {
      if (selectedDateInput === 'start') {
        setStartDate(date);
      } else {
        setEndDate(date);
      }
    }
  };

  const onConfirmEditDate = ({ date }: { date: Date | undefined }) => {
    if (!date) return;

    const formattedDate = format(date, 'yyyy-MM-dd');

    if (dateEditField === 'date') {
      setNewDate(formattedDate);
    } else if (dateEditField === 'periodStart') {
      setNewPeriodStart(formattedDate);
    } else if (dateEditField === 'periodEnd') {
      setNewPeriodEnd(formattedDate);
    }

    setDatePickerEditVisible(false);
  };

  const formatDate = (date?: Date | string) => {
    if (!date) return '';
    try {
      if (typeof date === 'string') {
        return format(parseISO(date), 'yyyy-MM-dd');
      }
      return format(date, 'yyyy-MM-dd');
    } catch (error) {
      console.error('Error al formatear la fecha:', error, date);
      return String(date);
    }
  };

  // Filtro por tipo de transacción
  const INCOME_TYPES = ['income', 'CLOSING'];
  const EXPENSE_TYPES = ['expense', 'SALARY', 'SUPPLIER', 'GASTO_ADMIN', 'gasto_admin'];
  const filteredByType = typeFilter === 'all'
    ? transactions
    : typeFilter === 'income'
      ? transactions.filter(tx => INCOME_TYPES.includes(tx.type))
      : transactions.filter(tx => EXPENSE_TYPES.includes(tx.type));

  // Conteos para badges en las tabs
  const incomeCount  = transactions.filter(tx => INCOME_TYPES.includes(tx.type)).length;
  const expenseCount = transactions.filter(tx => EXPENSE_TYPES.includes(tx.type)).length;
  const allCount     = transactions.length;

  // Paginación
  const totalPages = Math.ceil(filteredByType.length / ITEMS_PER_PAGE);
  const paginatedTransactions = filteredByType.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const maxPagesToShow = screenWidth < 768 ? 5 : screenWidth < 1024 ? 10 : 20;
  let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
  let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
  if (endPage - startPage + 1 < maxPagesToShow) {
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }
  const pageNumbers: number[] = [];
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  // ----------------------- PROCESO DE ELIMINACIÓN -----------------------
  const handleDelete = (transaction: Transaction) => {
    setTransactionToDelete(transaction);
    setShowDeleteConfirmation(true);
  };

  const confirmDelete = async () => {
    const target = transactionToDelete;
    if (!target || deleting) return;
    // G-02: cerrar el diálogo ANTES de ejecutar (un doble toque ya no dispara dos DELETE).
    setShowDeleteConfirmation(false);
    setTransactionToDelete(null);
    setDeleting(true);
    try {
      let url = '';
      if (target.type === 'income' || target.type === 'expense' || target.type === 'gasto_admin') {
        url = `${REACT_APP_API_URL}/transactions/${target.id}`;
      } else {
        url = `${REACT_APP_API_URL}/api/operations/${target.type}/${target.id}`;
      }
      await axios.delete(url, { timeout: API_TIMEOUT });
      showSnackbar('La operación se eliminó correctamente.');
      reload();
    } catch (error) {
      console.error('Error al eliminar la transacción:', error);
      // O-08: Alert.alert no se ve en la web → Snackbar.
      showSnackbar(apiErrorMessage(error, 'No se pudo eliminar la operación.'));
    } finally {
      setDeleting(false);
    }
  };
  // -----------------------------------------------------------------------

  // Función para editar: se llenan los campos del modal
  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setNewAmount(transaction.amount.toString());

    let dateValue = '';
    if (transaction.type === 'CLOSING' || transaction.type === 'SALARY') {
      dateValue = transaction.date || '';
    } else if (transaction.type === 'SUPPLIER') {
      dateValue = transaction.date || '';
    } else {
      dateValue = transaction.date || '';
    }

    setNewDate(dateValue);
    setNewDescription(transaction.description ?? '');
    setNewClosingsCount(
      transaction.closingsCount !== undefined ? transaction.closingsCount.toString() : ''
    );
    setNewPeriodStart(transaction.periodStart ?? '');
    setNewPeriodEnd(transaction.periodEnd ?? '');
    setNewSupplier(transaction.supplier ?? '');
    // O-02: precargar el local de la operación (antes null → había que re-elegirlo, y en
    // Gasto Administrativo, que no tiene selector, guardar era imposible).
    setNewStoreId(transaction.store?.id ?? transaction.storeId ?? null);
    setEditError('');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingTransaction || savingEdit) return;
    const parsedAmount = parseFloat(newAmount.replace(/,/g, ''));
    // O-20: el monto tiene que ser mayor a 0.
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setEditError('Ingresá un monto mayor a 0.');
      return;
    }
    // O-02: Gasto Administrativo se reparte entre locales y no tiene selector de local.
    if (newStoreId === null && editingTransaction.type !== 'GASTO_ADMIN') {
      setEditError('Seleccioná un local.');
      return;
    }

    // O-03: antes se mandaba username "default_user" y el autor original se perdía.
    // Se reenvía el autor que vino en la fila: el backend (FormsService.updateClosingDeposit)
    // copia `username` sin chequear null en los Cierres, así que omitirlo lo borraría.
    // Lo correcto (pendiente de backend) es que el autor no se pueda cambiar al editar.
    const originalAuthor = editingTransaction.username || undefined;

    let updatedTransaction = {};

    if (editingTransaction.type === 'CLOSING') {
      updatedTransaction = {
        amount: parsedAmount,
        username: originalAuthor,
        closingsCount: newClosingsCount ? parseInt(newClosingsCount) : undefined,
        periodStart: newPeriodStart || undefined,
        periodEnd: newPeriodEnd || undefined,
        depositDate: newDate || undefined,
        storeId: newStoreId
      };
    } else if (editingTransaction.type === 'SUPPLIER') {
      updatedTransaction = {
        amount: parsedAmount,
        username: originalAuthor,
        supplier: newSupplier || undefined,
        paymentDate: newDate || undefined,
        storeId: newStoreId,
        description: newDescription || undefined
      };
    } else if (editingTransaction.type === 'SALARY') {
      updatedTransaction = {
        amount: parsedAmount,
        description: newDescription || undefined,
        username: originalAuthor,
        salaryDate: newDate || undefined,
        storeId: newStoreId
      };
    } else {
      updatedTransaction = {
        type: editingTransaction.type,
        amount: parsedAmount,
        date: newDate || undefined,
        description: newDescription || undefined,
        store: { id: newStoreId }
      };
    }

    setEditError('');
    setSavingEdit(true);
    try {
      // O-14: sin console.log del payload.
      let url = '';
      if (editingTransaction.type === 'income' || editingTransaction.type === 'expense' || editingTransaction.type === 'gasto_admin') {
        url = `${REACT_APP_API_URL}/transactions/${editingTransaction.id}`;
      } else {
        url = `${REACT_APP_API_URL}/api/operations/${editingTransaction.type}/${editingTransaction.id}`;
      }

      await axios.put(url, updatedTransaction, { timeout: API_TIMEOUT });

      showSnackbar('La operación se actualizó correctamente.');
      setEditModalVisible(false);
      setEditingTransaction(null);
      reload();
    } catch (error) {
      console.error('Error al actualizar la transacción:', error);
      // O-08: en la web Alert.alert no muestra nada. El modal queda abierto (no se pierde
      // lo editado) y el error se muestra dentro de él: un Snackbar quedaría tapado.
      setEditError(apiErrorMessage(error, 'No se pudo actualizar la operación.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    if (savingEdit) return;
    setEditModalVisible(false);
    setEditingTransaction(null);
  };

  // Render del modal de edición para cada tipo
  // Render del modal de edición para cada tipo
const renderEditFields = () => {
  if (!editingTransaction) return null;

  const storeSelector = (
    <View style={styles.modalInputContainer}>
      <Text style={styles.modalInputLabel}>Local:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
        {activeStores.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[storeChipStyle.chip, newStoreId === s.id && storeChipStyle.active]}
            onPress={() => setNewStoreId(s.id)}
          >
            <Text style={[storeChipStyle.text, newStoreId === s.id && storeChipStyle.activeText]}>{s.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  switch (editingTransaction.type) {
    case 'CLOSING':
      return (
        <>
          {storeSelector}
          <TextInput
            label="Monto"
            value={newAmount}
            onChangeText={(value) => {
              const formattedValue = formatAmountInput(value);
              setNewAmount(formattedValue);
            }}
            keyboardType="numeric"
            style={styles.modalInput}
          />
          <TextInput
            label="Fecha de Depósito"
            value={newDate}
            style={styles.modalInput}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }}
            right={<TextInput.Icon icon="calendar" onPress={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }} />}
          />
          <TextInput
            label="Periodo Desde"
            value={newPeriodStart}
            style={styles.modalInput}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setDateEditField('periodStart');
              setDatePickerEditVisible(true);
            }}
            right={<TextInput.Icon icon="calendar" onPress={() => {
              setDateEditField('periodStart');
              setDatePickerEditVisible(true);
            }} />}
          />
          <TextInput
            label="Periodo Hasta"
            value={newPeriodEnd}
            style={styles.modalInput}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setDateEditField('periodEnd');
              setDatePickerEditVisible(true);
            }}
            right={<TextInput.Icon icon="calendar" onPress={() => {
              setDateEditField('periodEnd');
              setDatePickerEditVisible(true);
            }} />}
          />
        </>
      );
    case 'SUPPLIER':
      return (
        <>
          {storeSelector}
          <TextInput
            label="Monto"
            value={newAmount}
            onChangeText={(value) => {
              const formattedValue = formatAmountInput(value);
              setNewAmount(formattedValue);
            }}
            keyboardType="numeric"
            style={styles.modalInput}
          />
          <TextInput
            label="Fecha de Pago"
            value={newDate}
            style={styles.modalInput}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }}
            right={<TextInput.Icon icon="calendar" onPress={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }} />}
          />
          <TextInput
            label="Proveedor"
            value={newSupplier}
            onChangeText={setNewSupplier}
            style={styles.modalInput}
          />
          <TextInput
            label="Descripción"
            value={newDescription}
            onChangeText={setNewDescription}
            style={styles.modalInput}
          />
        </>
      );
    case 'SALARY':
      return (
        <>
          {storeSelector}
          <TextInput
            label="Monto"
            value={newAmount}
            onChangeText={(value) => {
              const formattedValue = formatAmountInput(value);
              setNewAmount(formattedValue);
            }}
            keyboardType="numeric"
            style={styles.modalInput}
          />
          <TextInput
            label="Fecha de Salario"
            value={newDate}
            style={styles.modalInput}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }}
            right={<TextInput.Icon icon="calendar" onPress={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }} />}
          />
          <TextInput
            label="Descripción"
            value={newDescription}
            onChangeText={setNewDescription}
            style={styles.modalInput}
          />
        </>
      );
    case 'GASTO_ADMIN':
      return (
        <>
          <TextInput
            label="Monto"
            value={newAmount}
            onChangeText={(value) => {
              const formattedValue = formatAmountInput(value);
              setNewAmount(formattedValue);
            }}
            keyboardType="numeric"
            style={styles.modalInput}
          />
          <TextInput
            label="Fecha"
            value={newDate}
            style={styles.modalInput}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }}
            right={<TextInput.Icon icon="calendar" onPress={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }} />}
          />
          <TextInput
            label="Descripción"
            value={newDescription}
            onChangeText={setNewDescription}
            style={styles.modalInput}
          />
        </>
      );
    case 'gasto_admin':
      return (
        <>
          {storeSelector}
          <TextInput
            label="Monto"
            value={newAmount}
            onChangeText={(value) => {
              const formattedValue = formatAmountInput(value);
              setNewAmount(formattedValue);
            }}
            keyboardType="numeric"
            style={styles.modalInput}
          />
          <TextInput
            label="Fecha"
            value={newDate}
            style={styles.modalInput}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }}
            right={<TextInput.Icon icon="calendar" onPress={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }} />}
          />
          <TextInput
            label="Descripción"
            value={newDescription}
            onChangeText={setNewDescription}
            style={styles.modalInput}
          />
        </>
      );
    case 'income':
    case 'expense':
      return (
        <>
          {storeSelector}
          
          {/* Selector de tipo específico para ingresos/egresos */}
          <View style={styles.modalInputContainer}>
            <Text style={styles.modalInputLabel}>Tipo de transacción:</Text>
            <SegmentedButtons
              value={editingTransaction.type}
              onValueChange={(value: string) => {
                // Solo permitimos 'income' o 'expense'
                if (value === 'income' || value === 'expense') {
                  setEditingTransaction({
                    ...editingTransaction,
                    type: value as 'income' | 'expense'
                  });
                }
              }}
              buttons={[
                { value: 'income', label: 'Ingreso' },
                { value: 'expense', label: 'Egreso' },
              ]}
              style={styles.storeSelector}
            />
          </View>
          
          <TextInput
            label="Monto"
            value={newAmount}
            onChangeText={(value) => {
              const formattedValue = formatAmountInput(value);
              setNewAmount(formattedValue);
            }}
            keyboardType="numeric"
            style={styles.modalInput}
          />
          <TextInput
            label="Fecha"
            value={newDate}
            style={styles.modalInput}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }}
            right={<TextInput.Icon icon="calendar" onPress={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }} />}
          />
          <TextInput
            label="Descripción"
            value={newDescription}
            onChangeText={setNewDescription}
            style={styles.modalInput}
          />
        </>
      );
    default:
      return (
        <>
          {storeSelector}
          <TextInput
            label="Monto"
            value={newAmount}
            onChangeText={(value) => {
              const formattedValue = formatAmountInput(value);
              setNewAmount(formattedValue);
            }}
            keyboardType="numeric"
            style={styles.modalInput}
          />
          <TextInput
            label="Fecha"
            value={newDate}
            style={styles.modalInput}
            showSoftInputOnFocus={false}
            onFocus={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }}
            right={<TextInput.Icon icon="calendar" onPress={() => {
              setDateEditField('date');
              setDatePickerEditVisible(true);
            }} />}
          />
          <TextInput
            label="Descripción"
            value={newDescription}
            onChangeText={setNewDescription}
            style={styles.modalInput}
          />
        </>
      );
  }
}

// Esta función puede ir en tu archivo de utils o en el mismo componente
const buildImageUrl = (imagePath: string | undefined): string | null => {
  if (!imagePath) return null;
  
  // Si ya es una URL completa (http o https)
  if (/^https?:\/\//i.test(imagePath)) {
    return imagePath;
  }
  
  // Si es una ruta relativa (comienza con /)
  if (imagePath.startsWith('/')) {
    return `${REACT_APP_API_URL}${imagePath}`;
  }
  
  // Para rutas relativas sin /
  return `${REACT_APP_API_URL}/${imagePath}`;
};

  const renderTransaction = (item: Transaction, index: number) => {
    const isIncome = INCOME_TYPES.includes(item.type);

    const typeIconMap: Record<string, string> = {
      CLOSING:    'home',
      income:     'arrow-down-circle',
      SUPPLIER:   'truck-delivery',
      SALARY:     'account-cash',
      GASTO_ADMIN:'bank',
      expense:    'arrow-up-circle',
      gasto_admin:'bank',
    };
    const txIcon = typeIconMap[item.type] ?? 'help-circle';
    const txColor = isIncome ? COLOR.income : COLOR.expense;
    const txBg    = isIncome ? COLOR.incomeTint : COLOR.expenseTint;

    // O-11: el Salario usaba depositDate (siempre vacío) en vez de salaryDate.
    const dateToShow = item.type === 'CLOSING' && item.depositDate ? item.depositDate
      : item.type === 'SUPPLIER' && item.paymentDate ? item.paymentDate
      : item.type === 'SALARY'   && item.salaryDate ? item.salaryDate
      : item.date;

    // Fechas con utils (locale de la app, sin corrimiento UTC en fechas "solo día").
    const fmtDate = (d?: string) => formatDateOnly(d);
    // O-12: las operaciones guardan solo el día → sin "T" no se inventa "00:00".
    const fmtTime = (d?: string) => (d && hasTime(d) ? formatTime(d) : '');

    const storeIdResolved = item.store?.id ?? item.storeId;
    const storeName =
      item.store?.name ||
      item.storeName ||
      activeStores.find(s => s.id === storeIdResolved)?.name ||
      '—';

    const metaParts = [
      item.closingsCount ? `${item.closingsCount} cierres` : null,
      item.periodStart ? `Periodo ${fmtDate(item.periodStart)}` : null,
      item.supplier || null,
      item.description || null,
    ].filter(Boolean);

    const amtStr = money(item.amount);
    const imageUri = item.imageUri || (item as any).image_uri;

    return (
      <View key={`tx-${item.id}-${index}`} style={styles.txRow}>
        {/* Icono */}
        <View style={[styles.txIconWrap, { backgroundColor: txBg }]}>
          <MaterialCommunityIcons name={txIcon} size={20} color={txColor} />
        </View>

        {/* Nombre + badge + metadata */}
        <View style={styles.txMain}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Text style={styles.txName}>{TRANSACTION_LABELS[item.type] ?? item.type}</Text>
            {/* O-10: el badge repetía el tipo ("Cierre [Cierre]"). En celular, donde no
                hay columna Local, muestra el local. */}
            {!isLargeScreen && storeName !== '—' && (
              <View style={[styles.txBadge, { backgroundColor: txBg }]}>
                <Text style={[styles.txBadgeText, { color: txColor }]} numberOfLines={1}>{storeName}</Text>
              </View>
            )}
          </View>
          {metaParts.length > 0 && (
            <Text style={styles.txMeta} numberOfLines={1}>{metaParts.join(' · ')}</Text>
          )}
        </View>

        {/* Local (solo desktop) */}
        {isLargeScreen && (
          <Text style={styles.txStore} numberOfLines={1}>{storeName}</Text>
        )}

        {/* Fecha */}
        <View style={styles.txDateWrap}>
          <Text style={styles.txDate}>{fmtDate(dateToShow)}</Text>
          {fmtTime(dateToShow) ? <Text style={styles.txTime}>{fmtTime(dateToShow)}</Text> : null}
        </View>

        {/* Monto */}
        <View style={styles.txAmtWrap}>
          <Text style={[styles.txAmt, { color: txColor }]}>
            {isIncome ? '+' : '-'}{amtStr}
          </Text>
          {currency ? <Text style={styles.txAmtLabel}>{currency}</Text> : null}
        </View>

        {/* Acciones */}
        <View style={{ flexDirection: 'row' }}>
          {imageUri && (
            <IconButton
              icon="camera"
              size={18}
              iconColor={COLOR.income}
              onPress={() => openComprobante(imageUri)}
              accessibilityLabel="Ver comprobante"
            />
          )}
          <IconButton icon="pencil" size={18} onPress={() => handleEdit(item)} iconColor={COLOR.info} accessibilityLabel="Editar" />
          <IconButton icon="delete" size={18} onPress={() => handleDelete(item)} iconColor={COLOR.expense} disabled={deleting} accessibilityLabel="Eliminar" />
        </View>
      </View>
    );
  };

  const renderPagination = () => (
    <View style={styles.paginationContainer}>
      <TouchableOpacity
        onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
        disabled={currentPage === 1}
        style={[styles.paginationButton, currentPage === 1 && styles.disabledButton]}
      >
        <MaterialCommunityIcons
          name="chevron-left"
          size={24}
          color={currentPage === 1 ? COLOR.inkDisabled : COLOR.info}
        />
      </TouchableOpacity>
      {pageNumbers.map((page) => (
        <TouchableOpacity
          key={page}
          onPress={() => setCurrentPage(page)}
          style={[styles.paginationButton, currentPage === page && styles.activeButton]}
        >
          <Text style={[styles.paginationText, currentPage === page && styles.activeText]}>
            {page}
          </Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
        disabled={currentPage === totalPages}
        style={[styles.paginationButton, currentPage === totalPages && styles.disabledButton]}
      >
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={currentPage === totalPages ? COLOR.inkDisabled : COLOR.info}
        />
      </TouchableOpacity>
    </View>
  );

  // Estilos locales para el header (inputs de fecha y balance)
  const headerContainerStyle = [
    styles.headerContainer,
    isLargeScreen
      ? ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } as ViewStyle)
      : ({ flexDirection: 'column' } as ViewStyle),
  ];
  const dateInputsContainerStyle = [
    styles.dateInputsContainer,
    isLargeScreen
      ? ({ flexDirection: 'row', width: '50%', justifyContent: 'space-between' } as ViewStyle)
      : {},
  ];
  const dateInputStyle: ViewStyle[] = [
    styles.dateInput,
    isLargeScreen ? { flex: 0.48 } : {}
  ];

  return (
    <ThemedView style={styles.container}>

      {/* ── CABECERA MOBILE: siempre visible ── */}
      {!isLargeScreen && (
        <View style={{ backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border }}>
          {/* Fila: título + botón colapsar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
            <ThemedText style={[styles.title, { marginBottom: 0 }]}>Operaciones</ThemedText>
            <Button
              mode="outlined"
              onPress={() => setFiltersExpanded(v => !v)}
              textColor={COLOR.ink2}
              style={{ borderColor: COLOR.border, minWidth: 0 }}
              labelStyle={{ fontSize: 12 }}
              icon={filtersExpanded ? 'chevron-up' : 'chevron-down'}
              contentStyle={{ flexDirection: 'row-reverse' }}
            >
              {filtersExpanded ? 'Cerrar' : 'Filtros'}
            </Button>
          </View>

          {/* Filtro tipo: siempre visible */}
          <View style={{ flexDirection: 'row', marginHorizontal: 12, marginBottom: 8, borderRadius: RADIUS.r2, overflow: 'hidden', borderWidth: 1, borderColor: COLOR.border }}>
            {([
              { key: 'all',     label: 'Todos',    count: allCount },
              { key: 'income',  label: 'Ingresos', count: incomeCount },
              { key: 'expense', label: 'Egresos',  count: expenseCount },
            ] as const).map(({ key, label, count }) => (
              <TouchableOpacity
                key={key}
                onPress={() => { setTypeFilter(key); setCurrentPage(1); }}
                style={[styles.tabBtn, typeFilter === key && styles.tabBtnActive]}
              >
                <Text style={[styles.tabBtnText, typeFilter === key && styles.tabBtnTextActive]}>
                  {label}
                </Text>
                <Text style={[styles.tabBtnCount, typeFilter === key && styles.tabBtnCountActive]}>
                  {count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Filtros colapsables con scroll */}
          {filtersExpanded && (
            <ScrollView
              style={{ maxHeight: 320 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.mobileControlsContainer}>
                <CompactDateFilters
                  startDate={startDate}
                  endDate={endDate}
                  selectedStore={selectedStore}
                  setStartDate={setStartDate}
                  setEndDate={setEndDate}
                  setSelectedStore={setSelectedStore}
                  fetchData={fetchData}
                  setDatePickerOpen={setDatePickerOpen}
                  setSelectedDateInput={setSelectedDateInput}
                  onExcelPress={() => setShowExcelManager(true)}
                  showAdminExpenses={showAdminExpenses}
                  onToggleAdminExpenses={handleToggleAdminExpenses}
                  activeStores={activeStores}
                />
                <BalanceCard transactions={filteredByType} />
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* ── DESKTOP ── */}
      {isLargeScreen && (
        <View style={{ backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border }}>
          {/* Fila: título + filtro tipo + botón colapsar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 }}>
            <ThemedText style={[styles.title, { marginBottom: 0 }]}>Todas las Operaciones.</ThemedText>

            {/* Filtro Todos/Ingresos/Egresos */}
            <View style={{ flexDirection: 'row', borderRadius: RADIUS.r2, overflow: 'hidden', borderWidth: 1, borderColor: COLOR.border }}>
              {([
                { key: 'all',     label: 'Todos',    count: allCount },
                { key: 'income',  label: 'Ingresos', count: incomeCount },
                { key: 'expense', label: 'Egresos',  count: expenseCount },
              ] as const).map(({ key, label, count }) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => { setTypeFilter(key); setCurrentPage(1); }}
                  style={[styles.tabBtn, typeFilter === key && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabBtnText, typeFilter === key && styles.tabBtnTextActive]}>
                    {label}
                  </Text>
                  <Text style={[styles.tabBtnCount, typeFilter === key && styles.tabBtnCountActive]}>
                    {count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              mode="outlined"
              onPress={() => setFiltersExpanded(v => !v)}
              textColor={COLOR.ink2}
              style={{ borderColor: COLOR.border }}
              labelStyle={{ fontSize: 13 }}
              icon={filtersExpanded ? 'chevron-up' : 'chevron-down'}
              contentStyle={{ flexDirection: 'row-reverse' }}
            >
              {filtersExpanded ? 'Cerrar' : 'Filtros'}
            </Button>
          </View>

          {/* Filtros colapsables */}
          {filtersExpanded && (
            <View style={styles.controlsContainer}>
              <CompactDateFilters
                startDate={startDate}
                endDate={endDate}
                selectedStore={selectedStore}
                setStartDate={setStartDate}
                setEndDate={setEndDate}
                setSelectedStore={setSelectedStore}
                fetchData={fetchData}
                setDatePickerOpen={setDatePickerOpen}
                setSelectedDateInput={setSelectedDateInput}
                onExcelPress={() => setShowExcelManager(true)}
                showAdminExpenses={showAdminExpenses}
                onToggleAdminExpenses={handleToggleAdminExpenses}
                activeStores={activeStores}
              />
              <BalanceCard transactions={filteredByType} />
            </View>
          )}
        </View>
      )}

      {/* O-04: aviso de rango incompleto o invertido */}
      {!!rangeHint && (
        <View style={[styles.banner, styles.bannerWarn]}>
          <MaterialCommunityIcons name="calendar-alert" size={18} color={COLOR.warn} />
          <Text style={styles.bannerText}>{rangeHint}</Text>
        </View>
      )}

      {/* O-07: error de carga visible, con Reintentar (403 → "No tenés permiso") */}
      {!loading && !!loadError && (
        <View style={[styles.banner, styles.bannerError]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLOR.expense} />
          <Text style={styles.bannerText}>{loadError}</Text>
          <Button compact mode="text" textColor={COLOR.expense} onPress={reload}>Reintentar</Button>
        </View>
      )}
      {!loading && !loadError && !!partialError && (
        <View style={[styles.banner, styles.bannerWarn]}>
          <MaterialCommunityIcons name="lock-outline" size={18} color={COLOR.warn} />
          <Text style={styles.bannerText}>{partialError}</Text>
          <Button compact mode="text" textColor={COLOR.warn} onPress={reload}>Reintentar</Button>
        </View>
      )}

      {/* ── KPI stats row ── (sin datos leídos no se muestran KPIs en 0) */}
      {!loading && !loadError && (
        <KpiRow transactions={transactions} startDate={startDate} endDate={endDate} />
      )}

      {/* ── Tabla header (solo desktop) ── */}
      {!loading && !loadError && isLargeScreen && (
        <View style={styles.txTableHeader}>
          <View style={{ width: 40 }} />
          <Text style={[styles.txTableHeaderText, { flex: 2 }]}>OPERACIÓN</Text>
          <Text style={[styles.txTableHeaderText, { flex: 1 }]}>LOCAL</Text>
          <Text style={[styles.txTableHeaderText, { flex: 1, textAlign: 'right' }]}>FECHA</Text>
          <Text style={[styles.txTableHeaderText, { flex: 1, textAlign: 'right' }]}>MONTO</Text>
          <View style={{ width: 80 }} />
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLOR.brand} />
          <ThemedText style={styles.loadingText}>
            Cargando datos desde la base de datos...
          </ThemedText>
        </View>
      ) : loadError ? null : (
        <ScrollView style={styles.scrollView}>
          {paginatedTransactions.length === 0 ? (
            <ThemedText style={styles.noDataText}>No hay operaciones para mostrar</ThemedText>
          ) : (
            <>
              {paginatedTransactions.map((item, index) => renderTransaction(item, index))}
            </>
          )}
        </ScrollView>
      )}

      {!loading && !loadError && totalPages > 1 && (
        <View style={styles.fixedPaginationContainer}>{renderPagination()}</View>
      )}

      <DatePickerModal
        locale="es"
        mode="single"
        visible={datePickerOpen}
        onDismiss={onDismissDatePicker}
        date={selectedDateInput === 'start' ? startDate : endDate}
        onConfirm={onConfirmDate}
      />

      {/* Modal para editar la transacción */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelEdit}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ThemedText style={styles.modalTitle}>Editar Transacción</ThemedText>
            <TextInput
              label="Tipo"
              value={
                editingTransaction && editingTransaction.type
                  ? TRANSACTION_LABELS[editingTransaction.type]
                  : ''
              }
              disabled
              style={styles.modalInput}
            />
            {renderEditFields()}
            {!!editError && (
              <View style={[styles.banner, styles.bannerError, { marginHorizontal: 0 }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLOR.expense} />
                <Text style={styles.bannerText}>{editError}</Text>
              </View>
            )}
            <View style={styles.modalButtonContainer}>
              <Button onPress={handleCancelEdit} mode="outlined" style={styles.modalButton} disabled={savingEdit}>
                Cancelar
              </Button>
              {/* G-01: loading + disabled → un doble toque no manda dos PUT */}
              <Button
                onPress={handleSaveEdit}
                mode="contained"
                style={styles.modalButton}
                loading={savingEdit}
                disabled={savingEdit}
              >
                Guardar
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de confirmación para eliminación */}
      <Modal
        visible={showDeleteConfirmation}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDeleteConfirmation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ThemedText style={styles.modalTitle}>Confirmar Eliminación</ThemedText>
            <Text style={styles.confirmationText}>
              ¿Estás seguro de que deseas eliminar esta transacción?
            </Text>
            <View style={styles.modalButtonContainer}>
              <Button onPress={() => setShowDeleteConfirmation(false)} mode="outlined" style={styles.modalButton}>
                Cancelar
              </Button>
              {/* G-01/G-02: confirmDelete cierra el diálogo antes de ejecutar */}
              <Button
                onPress={confirmDelete}
                mode="contained"
                style={styles.modalButton}
                buttonColor={COLOR.expense}
                loading={deleting}
                disabled={deleting}
              >
                Eliminar
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de gestión de Excel */}
      <ExcelManager
        visible={showExcelManager}
        onDismiss={() => setShowExcelManager(false)}
        transactions={transactions}
        onImportSuccess={handleImportSuccess}
      />

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={styles.snackbar}
      >
        {snackbarMessage}
      </Snackbar>

      {/* ── Modal visor de comprobante ── */}
      <Modal
        visible={!!viewingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setViewingImage(null)}
        >
          {viewingImage && (
            <Image
              source={{ uri: viewingImage }}
              style={{ width: '90%', height: '75%', resizeMode: 'contain', borderRadius: 8 }}
            />
          )}
          <Text style={{ color: COLOR.surface, marginTop: 16, fontSize: 13, opacity: 0.7 }}>
            Tocá para cerrar
          </Text>
        </TouchableOpacity>
      </Modal>
      <DatePickerModal
        locale="es"
        mode="single"
        visible={datePickerEditVisible}
        onDismiss={() => setDatePickerEditVisible(false)}
        date={(() => {
          try {
            if (dateEditField === 'date' && newDate) {
              return parseISO(newDate);
            } else if (dateEditField === 'periodStart' && newPeriodStart) {
              return parseISO(newPeriodStart);
            } else if (dateEditField === 'periodEnd' && newPeriodEnd) {
              return parseISO(newPeriodEnd);
            }
            return new Date();
          } catch (error) {
            console.error('Error parsing date:', error);
            return new Date();
          }
        })()}
        onConfirm={onConfirmEditDate}
      />
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
    backgroundColor: COLOR.bg,
  },
  title: {
    fontSize: FONT_SIZE.h1,
    fontWeight: FONT_WEIGHT.bold as any,
    marginVertical: SPACE.s3,
    textAlign: 'center',
    color: COLOR.ink,
  },
  // Estilos para la vista de escritorio (originales)
  headerContainer: {
    padding: SPACE.s4,
    marginTop: -10,
  },
  dateInputsContainer: {
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.r2,
    padding: SPACE.s4,
    elevation: 3,
    marginBottom: SPACE.s4,
  },
  dateInput: {
    backgroundColor: COLOR.surface,
    marginBottom: SPACE.s3,
    flex: 1,
    marginHorizontal: 5,
  },
  refreshButton: {
    borderRadius: RADIUS.full,
    marginTop: 5,
    marginBottom: 10,
    elevation: 2,
    marginRight: SPACE.s2,
  },
  clearButton: {
    marginTop: 5,
    borderColor: COLOR.brand,
    marginRight: SPACE.s2,
  },
  excelButton: {
    borderRadius: RADIUS.full,
    marginTop: 5,
    marginBottom: 10,
    elevation: 2,
  },

  // Estilos para la vista móvil (nuevos, compactos)
  controlsContainer: {
    padding: SPACE.s3,
    marginBottom: 5,
  },
  mobileControlsContainer: {
    padding: SPACE.s3,
    marginBottom: 5,
  },
  compactFiltersContainer: {
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.r2,
    padding: SPACE.s3,
    elevation: 3,
    marginBottom: SPACE.s3,
  },
  compactDateInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACE.s2,
  },
  compactDateInput: {
    flex: 1,
    marginHorizontal: 4,
    height: 50,
    backgroundColor: COLOR.surface,
    fontSize: FONT_SIZE.body,
    minWidth: 130,
  },
  compactButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compactClearButton: {
    flex: 1,
    marginRight: 5,
    borderColor: COLOR.brand,
    height: 36,
  },
  compactRefreshButton: {
    flex: 1,
    marginLeft: 5,
    marginRight: 5,
    borderRadius: RADIUS.full,
    height: 36,
  },
  compactExcelButton: {
    flex: 1,
    marginLeft: 5,
    borderRadius: RADIUS.full,
    height: 36,
  },
  compactAdminButton: {
    flex: 1,
    marginLeft: 5,
    marginRight: 5,
    borderRadius: RADIUS.full,
    height: 36,
    borderColor: COLOR.warn,
  },

  // Estilos para la selección de local
  storeFilterContainer: {
    marginBottom: SPACE.s3,
  },
  storeFilterCompact: {
    marginBottom: SPACE.s2,
  },
  filtersContainer: {
    width: '100%',
  },
  storeFilterWeb: {
    flex: 2,
    marginHorizontal: 10,
  },
  filtersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.s2,
  },
  filtersRowWeb: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: SPACE.s3,
  },
  inputGroupWeb: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 3,
    gap: SPACE.s3,
  },
  buttonGroupWeb: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 2,
    gap: SPACE.s3,
  },
  dateFiltersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACE.s3,
  },
  filterLabel: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: 5,
    color: COLOR.ink2,
  },
  storeSelector: {
    marginBottom: 5,
  },
  storeSelectorCompact: {
    transform: [{ scale: 0.95 }],
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },

  // Estilos para el BalanceCard colapsable
  balanceCard: {
    borderRadius: RADIUS.r2,
    elevation: 3,
    marginBottom: SPACE.s3,
    overflow: 'hidden',
    backgroundColor: COLOR.surface,
  },
  balanceHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.s4,
    paddingVertical: SPACE.s2,
    backgroundColor: COLOR.surface2,
  },
  balanceContentContainer: {
    overflow: 'hidden',
    paddingHorizontal: SPACE.s4,
  },
  balanceTitle: {
    fontSize: FONT_SIZE.h2,
    color: COLOR.ink,
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: 5,
    textAlign: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: SPACE.s3,
    paddingVertical: 5,
  },
  balanceLabel: {
    fontSize: FONT_SIZE.h3,
    color: COLOR.ink,
    marginLeft: SPACE.s2,
    flex: 1,
  },
  balanceValue: {
    fontSize: FONT_SIZE.h3,
    color: COLOR.ink,
    fontWeight: FONT_WEIGHT.medium as any,
  },

  // Estilos para la lista de transacciones
  scrollView: {
    padding: 0,
    flex: 1,
  },
  transactionCard: {
    marginBottom: SPACE.s4,
    borderRadius: RADIUS.r2,
    elevation: 3,
    backgroundColor: COLOR.surface,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.s3,
    paddingBottom: SPACE.s3,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
  },
  transactionTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionType: {
    fontSize: FONT_SIZE.h3,
    fontWeight: FONT_WEIGHT.bold as any,
    marginLeft: SPACE.s2,
  },
  transactionAmount: {
    fontSize: FONT_SIZE.h2,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink,
  },
  transactionDetails: {
    marginBottom: SPACE.s4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: FONT_SIZE.label,
    color: COLOR.ink2,
    marginLeft: SPACE.s2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACE.s3,
  },
  editButton: {
    flex: 1,
    marginRight: 5,
    borderRadius: RADIUS.full,
  },
  deleteButton: {
    flex: 1,
    marginLeft: 5,
    borderRadius: RADIUS.full,
  },

  // Estilos para el modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLOR.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.r4,
    padding: SPACE.s5,
    elevation: 5,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: FONT_SIZE.h1,
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: SPACE.s4,
    textAlign: 'center',
    color: COLOR.ink,
  },
  modalInput: {
    marginBottom: SPACE.s3,
    backgroundColor: COLOR.surface,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACE.s4,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: RADIUS.full,
  },
  modalInputContainer: {
    marginBottom: SPACE.s3,
  },
  modalInputLabel: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: 5,
    color: COLOR.ink2,
  },

  // Estilos para la paginación
  fixedPaginationContainer: {
    paddingVertical: SPACE.s3,
    backgroundColor: COLOR.bg,
    borderTopWidth: 1,
    borderTopColor: COLOR.border,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  paginationButton: {
    marginHorizontal: 3,
    minWidth: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.r4,
    backgroundColor: COLOR.surface,
    borderWidth: 1,
    borderColor: COLOR.border2,
    elevation: 2,
  },
  paginationText: {
    fontSize: FONT_SIZE.h3,
    color: COLOR.ink2,
  },
  activeButton: {
    backgroundColor: COLOR.info,
    borderColor: COLOR.info,
  },
  activeText: {
    color: COLOR.white,
    fontWeight: FONT_WEIGHT.bold as any,
  },
  disabledButton: {
    opacity: 0.5,
  },

  // Otros estilos
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACE.s5,
  },
  loadingText: {
    marginTop: SPACE.s4,
    fontSize: FONT_SIZE.h3,
    color: COLOR.brand,
    textAlign: 'center',
  },
  noDataText: {
    fontSize: FONT_SIZE.h2,
    textAlign: 'center',
    marginVertical: 40,
    color: COLOR.inkMute,
  },
  confirmationText: {
    fontSize: FONT_SIZE.h3,
    textAlign: 'center',
    marginBottom: SPACE.s5,
    color: COLOR.ink2,
    lineHeight: 24,
  },
  snackbar: {
    backgroundColor: COLOR.ink,
    borderRadius: RADIUS.r2,
  },
  imageContainer: {
    marginTop: SPACE.s3,
    paddingTop: SPACE.s3,
    borderTopWidth: 1,
    borderTopColor: COLOR.border,
  },
  imageLabel: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: 5,
    color: COLOR.brandDeep,
  },
  transactionImage: {
    width: '100%',
    height: 200,
    borderRadius: RADIUS.r1,
    resizeMode: 'contain',
    backgroundColor: COLOR.bg,
    borderWidth: 1,
    borderColor: COLOR.border,
  },

  // ── KPI Row ───────────────────────────────────────────────────────────────
  kpiRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s3, padding: SPACE.s4, backgroundColor: COLOR.bg },
  kpiCard:        { flex: 1, minWidth: 140, backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border, padding: SPACE.s4, gap: 4, ...SHADOW.sm },
  kpiCardLabel:   { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute, letterSpacing: 0.4 },
  kpiCardValue:   { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, letterSpacing: -0.5 },
  kpiCardSub:     { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },

  // ── Filter tabs con conteo ─────────────────────────────────────────────────
  tabBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: SPACE.s2, backgroundColor: COLOR.bgAlt },
  tabBtnActive:     { backgroundColor: COLOR.surface },
  tabBtnText:       { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkMute },
  tabBtnTextActive: { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },
  tabBtnCount:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.inkDisabled },
  tabBtnCountActive:{ color: COLOR.ink2 },

  // ── Tabla header ──────────────────────────────────────────────────────────
  txTableHeader:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s2, backgroundColor: COLOR.surface2, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  txTableHeaderText: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.inkMute, letterSpacing: 0.5 },

  // ── Transaction rows ──────────────────────────────────────────────────────
  txRow:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s3, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  txIconWrap:  { width: 40, height: 40, borderRadius: RADIUS.full, justifyContent: 'center', alignItems: 'center' },
  txMain:      { flex: 2, gap: 2 },
  txName:      { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink },
  txBadge:     { paddingHorizontal: SPACE.s2, paddingVertical: 2, borderRadius: RADIUS.full },
  txBadgeText: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold as any },
  txMeta:      { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 1 },
  txStore:     { flex: 1, fontSize: FONT_SIZE.label, color: COLOR.ink2, fontWeight: FONT_WEIGHT.medium as any },
  txDateWrap:  { alignItems: 'flex-end', minWidth: 80 },
  txDate:      { fontSize: FONT_SIZE.label, color: COLOR.ink },
  txTime:      { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },
  txAmtWrap:   { alignItems: 'flex-end', minWidth: 90 },
  txAmt:       { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold as any, letterSpacing: -0.3 },
  txAmtLabel:  { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.semibold as any },
  // O-04 / O-07: avisos arriba de la lista
  banner:      {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.s2,
    marginHorizontal: SPACE.s3, marginTop: SPACE.s2, paddingHorizontal: SPACE.s3, paddingVertical: SPACE.s2,
    borderRadius: RADIUS.r2, borderWidth: 1,
  },
  bannerError: { backgroundColor: COLOR.expenseTint, borderColor: COLOR.expenseBorder },
  bannerWarn:  { backgroundColor: COLOR.warnTint, borderColor: COLOR.warnBorder },
  bannerText:  { flex: 1, fontSize: FONT_SIZE.label, color: COLOR.ink },
});

const storeChipStyle = StyleSheet.create({
  chip:       { paddingHorizontal: SPACE.s3, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLOR.bg, borderWidth: 1, borderColor: COLOR.border },
  active:     { backgroundColor: COLOR.brand, borderColor: COLOR.brandDark },
  text:       { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
  activeText: { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },
});

export default AdminScreen;
