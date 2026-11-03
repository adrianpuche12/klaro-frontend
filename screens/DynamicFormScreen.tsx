import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StatusBar,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import {
  TextInput,
  Button,
  RadioButton,
  Card,
  Title,
  HelperText,
  Chip,
  Portal,
  Dialog,
} from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { format } from 'date-fns';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import StoreSelector from '../components/StoreSelector';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { isPrivileged } from '../config/navConfig';
import { formatDateOnly } from '../utils/dateOnly';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatAmountInput } from '../utils/numberFormat';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, BREAKPOINT } from '../theme';
import { ImageService } from '../utils/ImageService';
import ImagePicker from '../components/ImagePicker';
import { useMoney } from '../context/TenantConfigContext';
import { apiErrorMessage, isForbidden, httpStatus, NO_PERMISSION_MESSAGE } from '../utils/apiError';
import { fetchStoreAssignment, resolveAssignedStore, type StoreAssignment } from '../utils/assignedStore';
import { filterAllowedStores } from '../utils/profileAccess';

const BACKEND_URL = `${REACT_APP_API_URL}/api/forms`;
const TRANSACTIONS_URL = `${REACT_APP_API_URL}/transactions`;
const API_TIMEOUT = 20000;

type FormType = 'transaction' | 'closing-deposits' | 'supplier-payments' | 'salary-payments' | 'gasto-admin';

const FORM_TYPE_OPTIONS: { value: FormType; label: string }[] = [
  { value: 'transaction',       label: 'Transacción' },
  { value: 'gasto-admin',       label: 'Gasto Administrativo' },
  { value: 'closing-deposits',  label: 'Depósito de Cierres' },
  { value: 'supplier-payments', label: 'Pago a Proveedores' },
  { value: 'salary-payments',   label: 'Salarios' },
];

/**
 * F-02 — qué puede registrar un cajero (staff sin canManageUsers, ver isPrivileged en
 * config/navConfig.ts). Criterio seguro mientras el negocio no defina otra cosa:
 *  - solo "Depósito de Cierres" (el depósito de la caja de SU local);
 *  - nada de Gasto Administrativo (se reparte entre TODOS los locales), Ingresos/Egresos
 *    sueltos, Salarios ni Pagos a Proveedores: son movimientos de gestión.
 *  - el local es el asignado en su perfil (misma regla que UserDashboard, P-01), sin
 *    selector; si no se puede confirmar, no se puede registrar.
 * No se inventa ningún permiso nuevo: para ampliar, agregar el tipo a esta lista.
 * El backend (/api/forms/*) hoy solo exige el módulo OPERATIONS y no valida tipo ni local.
 */
const CASHIER_FORM_TYPES: FormType[] = ['closing-deposits'];

const DynamicFormScreen = () => {
  const { userName, roles, canManageUsers, fullAccess, allowedStoreIds } = useAuth();
  const isCashier = !isPrivileged({ roles, canManageUsers });
  const { stores, loadingStores, refreshStores } = useStore();
  const money = useMoney();
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;
  const [knownSuppliers, setKnownSuppliers] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'form' | 'historial'>('form');

  // ── F-02: local fijo del cajero ─────────────────────────────────────────────
  const [assignment, setAssignment] = useState<StoreAssignment | null>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<'loading' | 'ok' | 'notFound' | 'error'>('loading');
  const [assignmentAttempt, setAssignmentAttempt] = useState(0);
  useEffect(() => {
    if (!isCashier) return;
    if (!userName) { setAssignmentStatus('error'); return; }
    let cancelled = false;
    setAssignmentStatus('loading');
    fetchStoreAssignment(userName)
      .then(p => { if (!cancelled) { setAssignment(p); setAssignmentStatus('ok'); } })
      .catch(e => { if (!cancelled) setAssignmentStatus(httpStatus(e) === 404 ? 'notFound' : 'error'); });
    return () => { cancelled = true; };
  }, [isCashier, userName, assignmentAttempt]);
  const assignedStore = isCashier && assignmentStatus === 'ok' ? resolveAssignedStore(assignment, stores) : null;
  const cashierStoreError: string | null = !isCashier || assignmentStatus === 'loading' || loadingStores
    ? null
    : assignmentStatus === 'error'
      ? 'No pudimos confirmar en qué local trabajás. Revisá la conexión e intentá de nuevo.'
      : !assignedStore
        ? 'Tu usuario no tiene un local activo asignado. Pedí al administrador que te asigne uno.'
        : null;
  const retryAssignment = () => { refreshStores(); setAssignmentAttempt(a => a + 1); };
  const allowedFormTypes = isCashier
    ? FORM_TYPE_OPTIONS.filter(o => CASHIER_FORM_TYPES.includes(o.value))
    : FORM_TYPE_OPTIONS;

  // ── Historial de operaciones del usuario ────────────────────────────────────
  interface OperacionHistorial {
    id: number; type: string; amount: number; date: string;
    description: string; storeName: string; username: string;
  }
  const [historial, setHistorial]         = useState<OperacionHistorial[]>([]);
  const [histLoading, setHistLoading]     = useState(false);
  const [histPage, setHistPage]           = useState(0);
  const [histHasMore, setHistHasMore]     = useState(true);
  const [histError, setHistError]         = useState('');
  const HIST_SIZE = 20;

  // F-07: axios (token + refresco automático). Antes `fetch` sin chequear res.ok: un
  // objeto de error rompía `[...prev, ...data]` y el fallo quedaba en silencio.
  const loadHistorial = useCallback(async (reset = false) => {
    if (!userName || histLoading) return;
    setHistLoading(true);
    setHistError('');
    const page = reset ? 0 : histPage;
    try {
      const { data } = await axios.get<OperacionHistorial[]>(
        `${REACT_APP_API_URL}/api/operations/mine`,
        { params: { username: userName, page, size: HIST_SIZE }, timeout: API_TIMEOUT }
      );
      const rows = Array.isArray(data) ? data : [];
      setHistorial(prev => reset ? rows : [...prev, ...rows]);
      setHistPage(page + 1);
      setHistHasMore(rows.length === HIST_SIZE);
    } catch (e) {
      setHistError(isForbidden(e) ? NO_PERMISSION_MESSAGE : apiErrorMessage(e, 'No se pudo cargar tu historial.'));
    } finally { setHistLoading(false); }
  }, [userName, histPage, histLoading]);

  useEffect(() => {
    if (activeTab === 'historial' && historial.length === 0) {
      loadHistorial(true);
    }
  }, [activeTab]);

  const getCurrentFormattedDate = () => format(new Date(), 'yyyy-MM-dd');
  const parseDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  };

  interface StoreDistribucion {
    storeId: number;
    nombre: string;
    porcentaje: number;
  }

  interface FormDataType {
    type: string;
    amount: string;
    date: string;
    description: string;
    closingsCount: string;
    periodStart: string;
    periodEnd: string;
    storeId: number;
    supplier: string;
    imageUri: string;
    [key: string]: any;
  }

  interface SelectedImage {
    uri: string;
    name: string;
    type: string;
  }

  const [formData, setFormData] = useState<FormDataType>({
    type: '',
    amount: '',
    date: getCurrentFormattedDate(),
    description: '',
    closingsCount: '',
    periodStart: '',
    periodEnd: '',
    storeId: 0,
    supplier: '',
    imageUri: '',
  });

  // Locales activos (cargados desde /api/v2/stores/active)
  const [distribuciones, setDistribuciones] = useState<StoreDistribucion[]>([]);

  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [dateRangePickerVisible, setDateRangePickerVisible] = useState(false);
  const [selectedDateField, setSelectedDateField] = useState<'date' | ''>('');
  const [dateRange, setDateRange] = useState<{
    startDate: Date | undefined,
    endDate: Date | undefined,
  }>({
    startDate: undefined,
    endDate: undefined,
  });

  const [formType, setFormType] = useState<FormType | ''>('');
  const [showMessageCard, setShowMessageCard] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const slideAnim = useState(new Animated.Value(-100))[0];
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: boolean }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setFormData(prevData => ({ ...prevData, date: getCurrentFormattedDate() }));
  }, []);

  // F-02: el cajero tiene un solo tipo permitido → queda elegido; si por algún motivo
  // el tipo actual no está permitido, se descarta.
  useEffect(() => {
    if (!isCashier) return;
    if (formType && !CASHIER_FORM_TYPES.includes(formType)) setFormType('');
    if (!formType && CASHIER_FORM_TYPES.length === 1) setFormType(CASHIER_FORM_TYPES[0]);
  }, [isCashier, formType]);

  // F-02: el local del cajero es siempre el asignado (sin selector).
  useEffect(() => {
    if (isCashier) {
      setFormData(prev => ({ ...prev, storeId: assignedStore?.id ?? 0 }));
    }
  }, [isCashier, assignedStore?.id]);

  // Proveedores que esta empresa ya usó (para sugerir). Si el usuario no tiene permiso de operaciones, queda vacío.
  useEffect(() => {
    if (formType !== 'supplier-payments') return;
    const end = new Date();
    const start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    const iso = (d: Date) => format(d, 'yyyy-MM-dd');
    axios.get<{ supplier?: string | null }[]>(`${BACKEND_URL}/supplier-payments`, {
      params: { startDate: iso(start), endDate: iso(end) },
      timeout: API_TIMEOUT,
    })
      .then(({ data }) => {
        const rows = Array.isArray(data) ? data : [];
        const names = Array.from(new Set(rows.map(r => (r.supplier ?? '').trim()).filter(Boolean)));
        setKnownSuppliers(names.sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => setKnownSuppliers([]));
  }, [formType]);

  // Cargar locales activos y distribuir el porcentaje en partes iguales
  // F-18: si no se pueden cargar, el Gasto admin lo explica (antes "actual: 0%").
  const [distribStatus, setDistribStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const loadDistribuciones = useCallback(() => {
    setDistribStatus('loading');
    axios.get<{ id: number; name: string }[]>(`${REACT_APP_API_URL}/api/v2/stores/active`, { timeout: API_TIMEOUT })
      .then(({ data }) => {
        // P10: solo los locales permitidos para el usuario (root/legacy: todos).
        const active = filterAllowedStores(Array.isArray(data) ? data : [], { fullAccess, allowedStoreIds });
        const base     = active.length ? Math.floor(100 / active.length) : 0;
        const resto    = 100 - base * active.length;
        setDistribuciones(active.map((s, i) => ({
          storeId:    s.id,
          nombre:     s.name,
          porcentaje: i === 0 ? base + resto : base,
        })));
        setDistribStatus('ok');
      })
      .catch(() => setDistribStatus('error'));
  }, []);
  useEffect(() => { loadDistribuciones(); }, [loadDistribuciones]);

  // Establecer tipo automáticamente para gasto-admin
  useEffect(() => {
    if (formType === 'gasto-admin') {
      handleInputChange('type', 'expense');
    }
  }, [formType]);

  // F-13: el éxito se va a los 4 s; un error queda hasta que se lo toca (o 10 s), para
  // poder leerlo. Un mensaje nuevo cancela el temporizador del anterior.
  const showMessage = (type: 'success' | 'error', message: string) => {
    setMessage(message);
    setMessageType(type);
    setShowMessageCard(true);

    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => hideMessage(), type === 'success' ? 4000 : 10000);
  };

  const hideMessage = () => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowMessageCard(false));
  };

  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  const clearData = () => {
    const currentDate = getCurrentFormattedDate();
    handleInputChange('amount', '');
    handleInputChange('date', currentDate);
    handleInputChange('description', '');
    handleInputChange('type', formType === 'gasto-admin' ? 'expense' : '');
    handleInputChange('closingsCount', '');
    handleInputChange('periodStart', '');
    handleInputChange('periodEnd', '');
    // F-02: el cajero conserva su local fijo.
    handleInputChange('storeId', isCashier ? (assignedStore?.id ?? 0) : 0);
    handleInputChange('supplier', '');
    setSelectedImage(null);
    setDateRange({ startDate: undefined, endDate: undefined });
    // Resetear porcentajes a partes iguales
    if (distribuciones.length > 0) {
      const base  = Math.floor(100 / distribuciones.length);
      const resto = 100 - base * distribuciones.length;
      setDistribuciones(prev => prev.map((d, i) => ({
        ...d, porcentaje: i === 0 ? base + resto : base,
      })));
    }
  };

  const handleInputChange = (field: string, value: any) => {
    if (field === 'amount') {
      if (value) {
        const formattedValue = formatAmountInput(value);
        setFormData((prevData: FormDataType) => ({
          ...prevData,
          [field]: formattedValue,
        }));
      } else {
        setFormData((prevData: FormDataType) => ({
          ...prevData,
          [field]: '',
        }));
      }
    } else {
      setFormData((prevData: FormDataType) => ({
        ...prevData,
        [field]: value,
      }));
    }
    setErrors((prevErrors) => ({ ...prevErrors, [field]: false }));
  };

  const handleDateConfirm = (params: { date: Date | undefined }) => {
    if (params.date) {
      const formattedDate = format(params.date, 'yyyy-MM-dd');
      setFormData((prevData: FormDataType) => ({
        ...prevData,
        [selectedDateField]: formattedDate,
      }));
      setErrors((prevErrors) => ({ ...prevErrors, [selectedDateField]: false }));
    }
    setDatePickerVisible(false);
    setSelectedDateField('');
  };

  const handleDateRangeConfirm = ({
    startDate,
    endDate
  }: {
    startDate: Date | undefined,
    endDate: Date | undefined
  }) => {
    setDateRange({ startDate, endDate });

    if (startDate) {
      const formattedStartDate = format(startDate, 'yyyy-MM-dd');
      setFormData((prevData: FormDataType) => ({
        ...prevData,
        periodStart: formattedStartDate,
      }));
      setErrors((prevErrors) => ({ ...prevErrors, periodStart: false }));
    }

    if (endDate) {
      const formattedEndDate = format(endDate, 'yyyy-MM-dd');
      setFormData((prevData: FormDataType) => ({
        ...prevData,
        periodEnd: formattedEndDate,
      }));
      setErrors((prevErrors) => ({ ...prevErrors, periodEnd: false }));
    }

    setDateRangePickerVisible(false);
  };

  // F-01: antes solo se validaban Transacción (el tipo) y Gasto Administrativo; Depósitos,
  // Proveedores y Salarios salían con monto 0, sin local (storeId 0) y sin período.
  const validateForm = () => {
    const newErrors: { [key: string]: boolean } = {};
    const amount = parseFloat((formData.amount || '').replace(/,/g, ''));
    const needsStore = formType !== 'gasto-admin';

    if (formType === 'transaction' && !formData.type) newErrors.type = true;
    if (!(amount > 0)) newErrors.amount = true;
    if (!formData.date) newErrors.date = true;
    if (needsStore && !formData.storeId) newErrors.storeId = true;
    if (formType === 'supplier-payments' && !formData.supplier.trim()) newErrors.supplier = true;
    if (formType === 'salary-payments' && !formData.description.trim()) newErrors.description = true;
    if (formType === 'closing-deposits' && (!formData.periodStart || !formData.periodEnd)) {
      newErrors.periodStart = true;
      newErrors.periodEnd = true;
    }
    if (formType === 'gasto-admin') {
      if (!formData.description.trim()) newErrors.description = true;
      if (distribuciones.length === 0) newErrors.porcentajes = true;
      const totalPct = distribuciones.reduce((s, d) => s + d.porcentaje, 0);
      if (totalPct !== 100) newErrors.porcentajes = true;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!formType) {
      showMessage('error', 'Seleccioná un tipo de operación.');
      return;
    }

    // F-02: el cajero solo registra los tipos permitidos y en su local asignado.
    if (isCashier) {
      if (!CASHIER_FORM_TYPES.includes(formType)) {
        showMessage('error', 'No tenés permiso para registrar este tipo de operación.');
        return;
      }
      if (!assignedStore) {
        showMessage('error', cashierStoreError ?? 'No pudimos confirmar en qué local trabajás.');
        return;
      }
    }

    // F-16: nunca un usuario inventado ('default_user'): sin usuario no se envía.
    if (!userName) {
      showMessage('error', 'No pudimos identificar tu usuario. Cerrá sesión y volvé a entrar.');
      return;
    }

    const isValid = validateForm();
    if (!isValid) {
      showMessage('error', 'Completá los campos marcados en rojo.');
      return;
    }

    setIsSubmitting(true);

    // F-02: para el cajero el local sale siempre del perfil, no del estado del formulario.
    const storeId = isCashier && assignedStore ? assignedStore.id : formData.storeId;

    try {
      let imageUri = null;

      if (selectedImage) {
        // El backend exige el local del comprobante (valida acceso a ese local). El gasto
        // administrativo se reparte entre locales: se usa el primero de la distribución.
        const comprobanteStoreId = formType === 'gasto-admin' ? distribuciones[0]?.storeId : storeId;
        if (!comprobanteStoreId) {
          showMessage('error', 'Elegí un local antes de adjuntar el comprobante.');
          return;
        }
        const uploadResult = await ImageService.uploadImage(
          selectedImage.uri,
          selectedImage.name = ImageService.generateFileName('IMG'),
          comprobanteStoreId
        );
        
        if (uploadResult.success) {
          imageUri = uploadResult.imageUri;
        } else {
          showMessage('error', 'Error al subir imagen: ' + uploadResult.error);
          return;
        }
      }

      const url =
        formType === 'transaction'
          ? TRANSACTIONS_URL
          : formType === 'gasto-admin'
          ? `${BACKEND_URL}/gasto-admin`
          : `${BACKEND_URL}/${formType}`;

      const amountValue = formData.amount ? formData.amount.replace(/,/g, '') : '0';
      const amount = parseFloat(amountValue);

      const basePayload: any =
        formType === 'gasto-admin'
          ? {
              fecha: formData.date,
              monto: amount,
              descripcion: formData.description.trim(),
              tipo: 'expense',
              distribuciones: distribuciones.map(d => ({
                storeId:    d.storeId,
                porcentaje: d.porcentaje,
              })),
              imageUri: imageUri,
            }
          : {
              ...formData,
              storeId,
              amount,
              store: { id: storeId },
              // F-16: el usuario real de la sesión (antes caía a 'default_user').
              // Pendiente backend: tomar el autor del token y no del body.
              username: userName,
              date: formData.date,
              salaryDate: formData.date,
              paymentDate: formData.date,
              depositDate: formData.date,
              imageUri: imageUri,
            };

      // F-07: axios hereda el token y lo renueva solo ante un 401 (antes `fetch` con el
      // token del contexto: vencido → "Error al enviar el formulario").
      const { data: result } = await axios.post(url, basePayload, {
        headers: { Accept: 'application/json' },
        timeout: API_TIMEOUT,
      });

      // F-10: sin el "(ID: 123)" técnico.
      showMessage('success', formType === 'gasto-admin'
        ? (typeof result?.mensaje === 'string' && result.mensaje.trim() ? result.mensaje : 'Gasto administrativo registrado')
        : 'Operación registrada');
      // F-12: se conserva el tipo de operación para cargar la siguiente.
      clearData();
      setErrors({});
      // F-08: "Mi historial" se recarga la próxima vez que se abre la pestaña.
      setHistorial([]);
      setHistPage(0);
      setHistHasMore(true);
    } catch (error) {
      showMessage('error', apiErrorMessage(error, 'No se pudo registrar la operación. Intentá de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderImagePicker = () => (
    <ImagePicker
      onImageSelected={(image) => setSelectedImage(image)}
      initialImage={selectedImage}
      disabled={false}
    />
  );

  // Proveedores: texto libre de cada empresa. Se sugieren los que ya usó (últimos 12 meses), nunca una lista fija.
  const supplierSuggestions = knownSuppliers
    .filter(name => name.toLowerCase().includes(formData.supplier.trim().toLowerCase()) && name !== formData.supplier)
    .slice(0, 8);

  const renderSupplierList = () => (
    <View style={styles.supplierListContainer}>
      <TextInput
        label="Proveedor"
        value={formData.supplier}
        onChangeText={(text) => handleInputChange('supplier', text)}
        mode="outlined"
        style={styles.input}
        error={errors.supplier}
        left={<TextInput.Icon icon="truck-outline" color={COLOR.brandDark} />}
      />
      {errors.supplier && <HelperText type="error" visible>Indicá el proveedor</HelperText>}
      {supplierSuggestions.length > 0 && (
        <View style={styles.supplierChips}>
          {supplierSuggestions.map(name => (
            <Chip key={name} compact style={styles.supplierChip} onPress={() => handleInputChange('supplier', name)}>
              {name}
            </Chip>
          ))}
        </View>
      )}
    </View>
  );

  // F-02: el cajero ve su local fijo (sin selector); el resto elige con StoreSelector.
  // F-01: error visible bajo el local en todos los tipos.
  const renderStoreField = () => {
    if (!isCashier) {
      return (
        <>
          <StoreSelector
            selectedStore={formData.storeId}
            onStoreChange={(storeId) => handleInputChange('storeId', storeId)}
            style={styles.storeSelector}
          />
          {errors.storeId && <HelperText type="error" visible>Seleccioná un local</HelperText>}
        </>
      );
    }
    if (assignmentStatus === 'loading' || loadingStores) {
      return <ActivityIndicator size="small" color={COLOR.brand} style={{ marginVertical: SPACE.s3 }} />;
    }
    if (!assignedStore) {
      return (
        <View style={[styles.fixedStore, styles.fixedStoreError]}>
          <MaterialCommunityIcons name="store-alert-outline" size={20} color={COLOR.expense} />
          <Text style={styles.fixedStoreText}>{cashierStoreError}</Text>
          <Button compact mode="text" textColor={COLOR.expense} onPress={retryAssignment}>Reintentar</Button>
        </View>
      );
    }
    return (
      <View style={styles.fixedStore}>
        <MaterialCommunityIcons name="store-outline" size={20} color={COLOR.brandDark} />
        <Text style={styles.fixedStoreText}>
          Local: <Text style={{ fontWeight: FONT_WEIGHT.bold as any }}>{assignedStore.name}</Text>
        </Text>
      </View>
    );
  };

  const renderAmountError = () =>
    errors.amount ? <HelperText type="error" visible>El monto debe ser mayor a 0</HelperText> : null;

  const renderTransactionForm = () => (
    <>
      <Title style={styles.formSectionTitle}>Selecciona el tipo de transacción</Title>
      <RadioButton.Group
        onValueChange={(value) => handleInputChange('type', value)}
        value={formData.type}
      >
        <View style={styles.radioGroupContainer}>
          <RadioButton.Item
            label="Ingreso"
            value="income"
            style={styles.radioItem}
            labelStyle={styles.radioLabel}
            color={COLOR.brandDark}
          />
          <RadioButton.Item
            label="Egreso"
            value="expense"
            style={styles.radioItem}
            labelStyle={styles.radioLabel}
            color={COLOR.brandDark}
          />
        </View>
      </RadioButton.Group>
      {errors.type && (
        <HelperText type="error" visible>
          Debe seleccionar Ingreso o Egreso
        </HelperText>
      )}

      {renderStoreField()}

      <View style={styles.inputContainer}>
        <TextInput
          label="Monto"
          value={formData.amount}
          onChangeText={(value) => handleInputChange('amount', value)}
          keyboardType="decimal-pad"
          mode="outlined"
          style={styles.input}
          error={errors.amount}
          left={<TextInput.Icon icon="cash-multiple" color={COLOR.brandDark} />}
          outlineColor={COLOR.border2}
          activeOutlineColor={COLOR.brand}
          theme={{ colors: { primary: COLOR.brand } }}
        />
        {renderAmountError()}
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          label="Fecha"
          value={formData.date}
          mode="outlined"
          showSoftInputOnFocus={false}
          onFocus={() => {
            setSelectedDateField('date');
            setDatePickerVisible(true);
          }}
          style={styles.input}
          error={errors.date}
          left={<TextInput.Icon icon="calendar" color={COLOR.brandDark} />}
          outlineColor={COLOR.border2}
          activeOutlineColor={COLOR.brand}
          theme={{ colors: { primary: COLOR.brand } }}
        />
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          label="Descripción"
          value={formData.description}
          onChangeText={(value) => handleInputChange('description', value)}
          mode="outlined"
          style={styles.input}
          error={errors.description}
          left={<TextInput.Icon icon="text" color={COLOR.brandDark} />}
          outlineColor={COLOR.border2}
          activeOutlineColor={COLOR.brand}
          theme={{ colors: { primary: COLOR.brand } }}
        />
      </View>
      {renderImagePicker()}
    </>
  );

  const updatePorcentaje = (storeId: number, valor: number) => {
    setDistribuciones(prev => prev.map(d =>
      d.storeId === storeId ? { ...d, porcentaje: Math.max(0, Math.min(100, valor)) } : d
    ));
  };

  const dividirIgual = () => {
    if (!distribuciones.length) return;
    const base  = Math.floor(100 / distribuciones.length);
    const resto = 100 - base * distribuciones.length;
    setDistribuciones(prev => prev.map((d, i) => ({ ...d, porcentaje: i === 0 ? base + resto : base })));
  };

  const renderGastoAdminForm = () => {
    const montoNum   = parseFloat((formData.amount || '0').replace(/,/g, '')) || 0;
    const totalPct   = distribuciones.reduce((s, d) => s + d.porcentaje, 0);
    const pctValidos = totalPct === 100 && distribuciones.length > 0;

    // F-09: redondear cada parte a centavos y dejar el residuo en el último local, así la
    // suma da exactamente el total (antes 33.33 × 3 = 99.99). Es solo la vista previa: el
    // backend calcula su propio reparto (pendiente: que use la misma regla).
    const totalCents = Math.round(montoNum * 100);
    let assignedCents = 0;
    const partes = new Map<number, number>();
    distribuciones.forEach((d, i) => {
      const isLast = i === distribuciones.length - 1;
      const cents = isLast && pctValidos
        ? totalCents - assignedCents
        : Math.round((totalCents * d.porcentaje) / 100);
      assignedCents += cents;
      partes.set(d.storeId, cents / 100);
    });

    return (
      <>
        <View style={styles.inputContainer}>
          <TextInput
            label="Monto total"
            value={formData.amount}
            onChangeText={(v) => handleInputChange('amount', v)}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
            error={errors.amount}
            left={<TextInput.Icon icon="cash-multiple" color={COLOR.brandDark} />}
            outlineColor={COLOR.border2}
            activeOutlineColor={COLOR.brand}
            theme={{ colors: { primary: COLOR.brand } }}
            placeholder="Monto a dividir entre locales"
          />
          {errors.amount && <HelperText type="error" visible>El monto debe ser mayor a 0</HelperText>}
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            label="Fecha"
            value={formData.date}
            mode="outlined"
            showSoftInputOnFocus={false}
            onFocus={() => { setSelectedDateField('date'); setDatePickerVisible(true); }}
            style={styles.input}
            error={errors.date}
            left={<TextInput.Icon icon="calendar" color={COLOR.brandDark} />}
            outlineColor={COLOR.border2}
            activeOutlineColor={COLOR.brand}
            theme={{ colors: { primary: COLOR.brand } }}
          />
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            label="Descripción"
            value={formData.description}
            onChangeText={(v) => handleInputChange('description', v)}
            mode="outlined"
            style={styles.input}
            error={errors.description}
            left={<TextInput.Icon icon="text" color={COLOR.brandDark} />}
            outlineColor={COLOR.border2}
            activeOutlineColor={COLOR.brand}
            theme={{ colors: { primary: COLOR.brand } }}
          />
          {errors.description && <HelperText type="error" visible>La descripción es obligatoria</HelperText>}
        </View>

        {/* División dinámica por local */}
        <View style={styles.divisionContainer}>
          <Title style={styles.divisionTitle}>División entre locales</Title>

          <TouchableOpacity onPress={dividirIgual} style={styles.quickButton}>
            <Text style={styles.quickButtonText}>Dividir en partes iguales</Text>
          </TouchableOpacity>

          {distribuciones.map(d => (
            <View key={d.storeId} style={styles.localCard}>
              <Text style={styles.localName}>{d.nombre}</Text>
              <View style={styles.percentageContainer}>
                <TextInput
                  mode="outlined"
                  value={d.porcentaje.toString()}
                  onChangeText={(v) => updatePorcentaje(d.storeId, parseInt(v) || 0)}
                  keyboardType="numeric"
                  style={styles.percentageInput}
                  maxLength={3}
                  theme={{ colors: { primary: COLOR.brand } }}
                />
                <Text style={styles.percentageSymbol}>%</Text>
              </View>
              {montoNum > 0 && (
                <Text style={styles.localAmount}>
                  {money(partes.get(d.storeId) ?? 0)}
                </Text>
              )}
            </View>
          ))}

          <View style={styles.validationContainer}>
            {distribStatus === 'loading' ? (
              <ActivityIndicator size="small" color={COLOR.brand} />
            ) : distribStatus === 'error' ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.validationError}>
                  No se pudieron cargar los locales para repartir el gasto.
                </Text>
                <Button compact mode="text" textColor={COLOR.expense} onPress={loadDistribuciones}>Reintentar</Button>
              </View>
            ) : distribuciones.length === 0 ? (
              // F-18: explicar por qué no se puede repartir (antes "actual: 0%").
              <Text style={styles.validationError}>
                No hay locales activos para repartir el gasto. Activá o creá un local primero.
              </Text>
            ) : pctValidos ? (
              <Text style={styles.validationSuccess}>Porcentajes válidos: {totalPct}%</Text>
            ) : (
              <Text style={styles.validationError}>
                Los porcentajes deben sumar 100% (actual: {totalPct}%)
              </Text>
            )}
          </View>
        </View>

        {/* Vista previa */}
        {montoNum > 0 && formData.description && pctValidos && (
          <View style={styles.summaryContainer}>
            <Title style={styles.summaryTitle}>Vista previa</Title>
            <Text style={styles.summaryText}>
              <Text style={styles.summaryBold}>Se crearán {distribuciones.length} transacciones:</Text>
            </Text>
            {distribuciones.map(d => (
              <Text key={d.storeId} style={styles.summaryText}>
                • {d.nombre} ({d.porcentaje}%): {money(partes.get(d.storeId) ?? 0)}
              </Text>
            ))}
          </View>
        )}
        {renderImagePicker()}
      </>
    );
  };

  const renderFormFields = () => {
    switch (formType) {
      case 'transaction':
        return renderTransactionForm();
      case 'gasto-admin':
        return renderGastoAdminForm();
      case 'closing-deposits':
        return (
          <>
            {renderStoreField()}

            <View style={styles.inputContainer}>
              <TextInput
                label="Cantidad de cierres (opcional)"
                value={formData.closingsCount}
                onChangeText={(value) => handleInputChange('closingsCount', value)}
                keyboardType="numeric"
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="counter" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
              />
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                label="Monto"
                value={formData.amount}
                onChangeText={(value) => handleInputChange('amount', value)}
                keyboardType="decimal-pad"
                mode="outlined"
                style={styles.input}
                error={errors.amount}
                left={<TextInput.Icon icon="cash-multiple" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
              />
              {renderAmountError()}
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                label="Fecha de Depósito"
                value={formData.date ? format(parseDate(formData.date), 'yyyy-MM-dd') : ''}
                mode="outlined"
                onFocus={() => {
                  setSelectedDateField('date');
                  setDatePickerVisible(true);
                }}
                style={styles.input}
                error={errors.date}
                left={<TextInput.Icon icon="calendar" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
                showSoftInputOnFocus={false}
              />
              {errors.date && (
                <HelperText type="error" visible={true}>
                  La fecha de depósito es obligatoria
                </HelperText>
              )}
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                label="Periodo (Desde - Hasta)"
                value={formData.periodStart && formData.periodEnd ?
                  `${formData.periodStart} - ${formData.periodEnd}` :
                  ''}
                mode="outlined"
                showSoftInputOnFocus={false}
                onFocus={() => {
                  setDateRangePickerVisible(true);
                }}
                style={styles.input}
                error={errors.periodStart || errors.periodEnd}
                left={<TextInput.Icon icon="calendar-range" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
              />
              {(errors.periodStart || errors.periodEnd) && (
                <HelperText type="error" visible={true}>
                  Debe seleccionar el periodo completo
                </HelperText>
              )}
            </View>
            {renderImagePicker()}
          </>
        );
      case 'supplier-payments':
        return (
          <>
            <Title style={styles.formSectionTitle}>Proveedor</Title>
            {renderSupplierList()}

            {renderStoreField()}

            <View style={styles.inputContainer}>
              <TextInput
                label="Monto"
                value={formData.amount}
                onChangeText={(value) => handleInputChange('amount', value)}
                keyboardType="decimal-pad"
                mode="outlined"
                style={styles.input}
                error={errors.amount}
                left={<TextInput.Icon icon="cash-multiple" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
              />
              {renderAmountError()}
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                label="Fecha"
                value={formData.date}
                mode="outlined"
                showSoftInputOnFocus={false}
                onFocus={() => {
                  setSelectedDateField('date');
                  setDatePickerVisible(true);
                }}
                style={styles.input}
                error={errors.date}
                left={<TextInput.Icon icon="calendar" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
              />
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                label="Descripción"
                value={formData.description}
                onChangeText={(value) => handleInputChange('description', value)}
                mode="outlined"
                style={styles.input}
                error={errors.description}
                left={<TextInput.Icon icon="text" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
              />
            </View>
            {renderImagePicker()}
          </>
        );
      case 'salary-payments':
        return (
          <>
            {renderStoreField()}

            <View style={styles.inputContainer}>
              <TextInput
                label="Descripción"
                value={formData.description}
                onChangeText={(value) => handleInputChange('description', value)}
                mode="outlined"
                style={styles.input}
                error={errors.description}
                left={<TextInput.Icon icon="text" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
                placeholder="Ej.: quincena, nombre del empleado"
              />
              {errors.description && <HelperText type="error" visible>Indicá a qué corresponde el pago</HelperText>}
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                label="Monto"
                value={formData.amount}
                onChangeText={(value) => handleInputChange('amount', value)}
                keyboardType="decimal-pad"
                mode="outlined"
                style={styles.input}
                error={errors.amount}
                left={<TextInput.Icon icon="cash-multiple" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
              />
              {renderAmountError()}
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                label="Fecha"
                value={formData.date}
                mode="outlined"
                showSoftInputOnFocus={false}
                onFocus={() => {
                  setSelectedDateField('date');
                  setDatePickerVisible(true);
                }}
                style={styles.input}
                error={errors.date}
                left={<TextInput.Icon icon="calendar" color={COLOR.brandDark} />}
                outlineColor={COLOR.border2}
                activeOutlineColor={COLOR.brand}
                theme={{ colors: { primary: COLOR.brand } }}
              />
            </View>
            {renderImagePicker()}
          </>
        );
      default:
        return null;
    }
  };

  const TYPE_ICON: Record<string, string> = {
    CLOSING:  'bank-transfer',
    SUPPLIER: 'truck-delivery-outline',
    SALARY:   'account-cash-outline',
    income:   'arrow-down-circle-outline',
    expense:  'arrow-up-circle-outline',
    default:  'file-document-outline',
  };

  const TYPE_LABEL: Record<string, string> = {
    CLOSING:  'Cierre',
    SUPPLIER: 'Proveedor',
    SALARY:   'Salario',
    GASTO_ADMIN: 'Gasto administrativo',
    income:   'Ingreso',
    expense:  'Egreso',
  };

  const renderHistorial = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACE.s4, gap: SPACE.s2 }}>
      {/* F-08: el error se muestra (antes quedaba "No tenés operaciones" en silencio) */}
      {!!histError && !histLoading && (
        <View style={{ alignItems: 'center', paddingVertical: SPACE.s6 }}>
          <MaterialCommunityIcons
            name={histError === NO_PERMISSION_MESSAGE ? 'lock-outline' : 'alert-circle-outline'}
            size={36}
            color={COLOR.expense}
          />
          <Text style={{ color: COLOR.ink2, marginTop: SPACE.s2, fontSize: FONT_SIZE.body, textAlign: 'center' }}>
            {histError}
          </Text>
          <Button compact mode="text" textColor={COLOR.brandDark} onPress={() => loadHistorial(historial.length === 0)}>
            Reintentar
          </Button>
        </View>
      )}

      {historial.length === 0 && !histLoading && !histError && (
        <View style={{ alignItems: 'center', paddingVertical: SPACE.s8 }}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={40} color={COLOR.inkDisabled} />
          <Text style={{ color: COLOR.inkMute, marginTop: SPACE.s2, fontSize: FONT_SIZE.body }}>
            No tenés operaciones registradas aún.
          </Text>
        </View>
      )}

      {historial.map(op => {
        const isIncome = op.type === 'income' || op.type === 'CLOSING';
        return (
        <View key={`${op.type}-${op.id}`} style={histStyles.card}>
          <View style={histStyles.row}>
            <View style={histStyles.iconWrap}>
              <MaterialCommunityIcons
                name={TYPE_ICON[op.type] ?? TYPE_ICON.default}
                size={20}
                color={isIncome ? COLOR.income : COLOR.expense}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={histStyles.label}>
                {TYPE_LABEL[op.type] ?? op.type}
                {op.storeName ? ` · ${op.storeName}` : ''}
              </Text>
              {op.description ? (
                <Text style={histStyles.desc} numberOfLines={1}>{op.description}</Text>
              ) : null}
              <Text style={histStyles.date}>{op.date ? formatDateOnly(op.date) : ''}</Text>
            </View>
            <Text style={[histStyles.amount, { color: isIncome ? COLOR.income : COLOR.expense }]}>
              {isIncome ? '+' : '-'}{money(op.amount)}
            </Text>
          </View>
        </View>
        );
      })}

      {histHasMore && !histError && (
        <TouchableOpacity style={histStyles.loadMore} onPress={() => loadHistorial(false)} disabled={histLoading}>
          {histLoading
            ? <ActivityIndicator size="small" color={COLOR.brand} />
            : <Text style={histStyles.loadMoreText}>Cargar más</Text>
          }
        </TouchableOpacity>
      )}
      {!histHasMore && historial.length > 0 && (
        <Text style={histStyles.endText}>— Fin del historial —</Text>
      )}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLOR.brandTint} />

      {/* F-17: en celular la barra superior del panel ya dice "Operaciones". */}
      {isDesktop && (
        <View style={styles.topSection}>
          <Title style={styles.welcomeText}>Operaciones</Title>
        </View>
      )}

      {/* ── Tabs ── */}
      <View style={tabStyles.bar}>
        <TouchableOpacity
          style={[tabStyles.tab, activeTab === 'form' && tabStyles.tabActive]}
          onPress={() => setActiveTab('form')}
        >
          <MaterialCommunityIcons name="plus-circle-outline" size={16} color={activeTab === 'form' ? COLOR.brandDeep : COLOR.ink2} />
          <Text style={[tabStyles.tabText, activeTab === 'form' && tabStyles.tabTextActive]}>Nueva operación</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[tabStyles.tab, activeTab === 'historial' && tabStyles.tabActive]}
          onPress={() => setActiveTab('historial')}
        >
          <MaterialCommunityIcons name="history" size={16} color={activeTab === 'historial' ? COLOR.brandDeep : COLOR.ink2} />
          <Text style={[tabStyles.tabText, activeTab === 'historial' && tabStyles.tabTextActive]}>Mi historial</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'historial' ? renderHistorial() : (
      <ScrollView style={styles.scrollView}>
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.cardTitle}>Formulario de Operaciones</Title>

            {/* F-02: el cajero solo ve los tipos permitidos (con uno solo, no hay que elegir). */}
            {allowedFormTypes.length > 1 ? (
              <>
                <Title style={styles.formSectionTitle}>Seleccioná el tipo de operación</Title>
                <RadioButton.Group
                  onValueChange={(value: string) => {
                    if (allowedFormTypes.some(o => o.value === value)) {
                      setFormType(value as FormType);
                      setErrors({});
                    }
                  }}
                  value={formType}
                >
                  <View style={styles.operationTypeContainer}>
                    {allowedFormTypes.map(o => (
                      <RadioButton.Item
                        key={o.value}
                        label={o.label}
                        value={o.value}
                        style={styles.radioItem}
                        labelStyle={styles.radioLabel}
                        color={COLOR.brandDark}
                      />
                    ))}
                  </View>
                </RadioButton.Group>
              </>
            ) : (
              <Title style={styles.formSectionTitle}>{allowedFormTypes[0]?.label}</Title>
            )}

            {renderFormFields()}

            <View style={styles.buttonContainer}>
              {/* G-01: disabled junto a loading. F-11: color de marca y sin MAYÚSCULAS. */}
              <Button
                mode="contained"
                onPress={handleSubmit}
                disabled={isSubmitting || (isCashier && !assignedStore)}
                loading={isSubmitting}
                style={styles.submitButton}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonText}
                buttonColor={COLOR.brand}
                textColor={COLOR.inkOnBrand}
              >
                {isSubmitting ? 'Enviando…' : 'Enviar'}
              </Button>

              {/* F-11: acción secundaria (contorno) y con confirmación: antes borraba todo sin preguntar. */}
              <Button
                mode="outlined"
                onPress={() => setConfirmClear(true)}
                disabled={isSubmitting}
                style={styles.clearButton}
                contentStyle={styles.buttonContent}
                textColor={COLOR.ink2}
                icon="refresh"
              >
                Limpiar formulario
              </Button>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
      )}

      <DatePickerModal
        mode="single"
        visible={datePickerVisible}
        onDismiss={() => setDatePickerVisible(false)}
        onConfirm={handleDateConfirm}
        locale="es"
        date={formData.date ? parseDate(formData.date) : undefined}
        validRange={{ startDate: undefined, endDate: new Date() }}
      />

      <DatePickerModal
        mode="range"
        visible={dateRangePickerVisible}
        onDismiss={() => setDateRangePickerVisible(false)}
        onConfirm={handleDateRangeConfirm}
        locale="es"
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        // F-04: el período de un depósito no puede ser futuro.
        validRange={{ startDate: undefined, endDate: new Date() }}
      />

      {/* F-11 / G-02: confirmar antes de limpiar; el diálogo se cierra antes de ejecutar. */}
      <Portal>
        <Dialog visible={confirmClear} onDismiss={() => setConfirmClear(false)}>
          <Dialog.Title>¿Limpiar el formulario?</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: COLOR.ink2, fontSize: FONT_SIZE.body }}>
              Se borran los datos cargados. El tipo de operación se mantiene.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmClear(false)} textColor={COLOR.ink2}>Cancelar</Button>
            <Button
              onPress={() => { setConfirmClear(false); clearData(); setErrors({}); }}
              textColor={COLOR.expense}
            >
              Limpiar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* F-13: el aviso va abajo (no tapa las pestañas) y se cierra al tocarlo. */}
      {showMessageCard && (
        <Animated.View
          style={[
            styles.messageCard,
            {
              transform: [{ translateY: Animated.multiply(slideAnim, -1) }],
            },
          ]}
        >
          <TouchableOpacity activeOpacity={0.9} onPress={hideMessage} accessibilityRole="button" accessibilityLabel="Cerrar aviso">
            <Card style={messageType === 'success' ? styles.successCard : styles.errorCard}>
              <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s2 }}>
                <MaterialCommunityIcons
                  name={messageType === 'success' ? 'check-circle-outline' : 'alert-circle-outline'}
                  size={22}
                  color={COLOR.white}
                />
                <Text style={[styles.messageText, { flex: 1 }]}>{message}</Text>
                <MaterialCommunityIcons name="close" size={18} color={COLOR.white} />
              </Card.Content>
            </Card>
          </TouchableOpacity>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLOR.bg,
  },
  topSection: {
    backgroundColor: COLOR.brandTint,
    paddingVertical: SPACE.s3,
    alignItems: 'center',
  },
  welcomeText: {
    color: COLOR.brandDeep,
    fontSize: FONT_SIZE.display,
    fontWeight: FONT_WEIGHT.bold as any,
    marginTop: SPACE.s3,
  },
  scrollView: {
    flex: 1,
  },
  card: {
    marginHorizontal: SPACE.s5,
    marginBottom: SPACE.s5,
    borderRadius: RADIUS.r4,
    elevation: 6,
    paddingVertical: 5,
  },
  cardTitle: {
    textAlign: 'center',
    fontSize: FONT_SIZE.h2,
    marginBottom: SPACE.s5,
    color: COLOR.ink,
    fontWeight: FONT_WEIGHT.bold as any,
  },
  formSectionTitle: {
    fontSize: FONT_SIZE.h3,
    color: COLOR.ink2,
    textAlign: 'center',
    marginBottom: SPACE.s3,
  },
  operationTypeContainer: {
    marginBottom: SPACE.s4,
  },
  radioGroupContainer: {
    marginBottom: SPACE.s4,
  },
  radioItem: {
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
    paddingVertical: SPACE.s2,
  },
  radioLabel: {
    fontSize: FONT_SIZE.h3,
    color: COLOR.ink2,
  },
  supplierListContainer: {
    marginBottom: SPACE.s4,
  },
  supplierChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACE.s2,
  },
  supplierChip: {
    marginRight: SPACE.s2,
    marginBottom: SPACE.s2,
  },
  inputContainer: {
    marginBottom: SPACE.s3,
  },
  input: {
    backgroundColor: COLOR.surface,
  },
  buttonContainer: {
    marginTop: SPACE.s4,
  },
  submitButton: {
    marginBottom: SPACE.s4,
    borderRadius: RADIUS.full,
    elevation: 2,
    paddingVertical: 5,
  },
  clearButton: {
    borderRadius: RADIUS.full,
    elevation: 2,
    paddingVertical: 5,
  },
  buttonContent: {
    paddingVertical: SPACE.s2,
  },
  buttonText: {
    fontSize: FONT_SIZE.h3,
    fontWeight: FONT_WEIGHT.bold as any,
  },
  messageCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACE.s4,
    zIndex: 2,
  },
  // F-02: local fijo del cajero
  fixedStore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s2,
    marginBottom: SPACE.s4,
    paddingHorizontal: SPACE.s3,
    paddingVertical: SPACE.s3,
    borderRadius: RADIUS.r2,
    borderWidth: 1,
    borderColor: COLOR.border2,
    backgroundColor: COLOR.surface,
  },
  fixedStoreError: {
    borderColor: COLOR.expenseBorder,
    backgroundColor: COLOR.expenseTint,
  },
  fixedStoreText: {
    flex: 1,
    fontSize: FONT_SIZE.body,
    color: COLOR.ink,
  },
  successCard: {
    backgroundColor: COLOR.income,
  },
  errorCard: {
    backgroundColor: COLOR.expense,
  },
  messageText: {
    color: COLOR.white,
    textAlign: 'center',
  },
  storeSelector: {
    marginBottom: SPACE.s4,
    backgroundColor: COLOR.bgAlt,
    padding: SPACE.s3,
    borderRadius: RADIUS.r1,
  },
  divisionContainer: {
    backgroundColor: COLOR.surface,
    padding: SPACE.s4,
    borderRadius: RADIUS.r1,
    marginVertical: SPACE.s3,
    borderWidth: 1,
    borderColor: COLOR.brand,
  },
  divisionTitle: {
    fontSize: FONT_SIZE.h3,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.brandDark,
    marginBottom: SPACE.s4,
    textAlign: 'center',
  },
  quickButton: {
    backgroundColor: COLOR.infoTint,
    paddingVertical: 4,
    paddingHorizontal: SPACE.s3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLOR.brand,
  },
  quickButtonText: {
    fontSize: FONT_SIZE.caption,
    color: COLOR.info,
    fontWeight: FONT_WEIGHT.medium as any,
  },
  localCard: {
    flex: 1,
    backgroundColor: COLOR.bgAlt,
    padding: SPACE.s3,
    borderRadius: RADIUS.r1,
    borderWidth: 1,
    borderColor: COLOR.border,
    alignItems: 'center',
  },
  localName: {
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: SPACE.s2,
    color: COLOR.ink2,
    fontSize: FONT_SIZE.label,
  },
  percentageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.s2,
  },
  percentageInput: {
    width: 60,
    height: 40,
    backgroundColor: COLOR.surface,
    textAlign: 'center',
  },
  percentageSymbol: {
    fontSize: FONT_SIZE.h3,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink2,
    marginLeft: 4,
  },
  localAmount: {
    color: COLOR.info,
    fontWeight: FONT_WEIGHT.bold as any,
    fontSize: FONT_SIZE.h3,
  },
  validationContainer: {
    alignItems: 'center',
    paddingVertical: SPACE.s2,
  },
  validationSuccess: {
    color: COLOR.income,
    fontWeight: FONT_WEIGHT.bold as any,
    fontSize: FONT_SIZE.label,
  },
  validationError: {
    color: COLOR.expense,
    fontWeight: FONT_WEIGHT.bold as any,
    fontSize: FONT_SIZE.label,
  },
  summaryContainer: {
    backgroundColor: COLOR.infoTint,
    padding: SPACE.s4,
    borderRadius: RADIUS.r1,
    marginTop: SPACE.s4,
  },
  summaryTitle: {
    fontSize: FONT_SIZE.h3,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.info,
    marginBottom: SPACE.s3,
    textAlign: 'center',
  },
  summaryText: {
    fontSize: FONT_SIZE.label,
    color: COLOR.info,
    marginBottom: 5,
  },
  summaryBold: {
    fontWeight: FONT_WEIGHT.bold as any,
  },
});

const tabStyles = StyleSheet.create({
  bar:          { flexDirection: 'row', backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  tab:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s1, paddingVertical: SPACE.s3 },
  tabActive:    { borderBottomWidth: 2, borderBottomColor: COLOR.brand },
  tabText:      { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.ink2 },
  tabTextActive:{ color: COLOR.brandDeep, fontWeight: FONT_WEIGHT.bold as any },
});

const histStyles = StyleSheet.create({
  card:         { backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, borderWidth: 1, borderColor: COLOR.border, padding: SPACE.s3 },
  row:          { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3 },
  iconWrap:     { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: COLOR.bgAlt, justifyContent: 'center', alignItems: 'center' },
  label:        { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  desc:         { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 1 },
  date:         { fontSize: FONT_SIZE.caption, color: COLOR.inkDisabled, marginTop: 1 },
  amount:       { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any },
  loadMore:     { padding: SPACE.s3, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border, alignItems: 'center', backgroundColor: COLOR.surface },
  loadMoreText: { fontSize: FONT_SIZE.label, color: COLOR.ink2, fontWeight: FONT_WEIGHT.semibold as any },
  endText:      { textAlign: 'center', color: COLOR.inkDisabled, fontSize: FONT_SIZE.caption, paddingVertical: SPACE.s3 },
});

export default DynamicFormScreen;