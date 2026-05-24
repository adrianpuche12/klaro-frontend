import React, { useState, useEffect, useCallback } from 'react';
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
  Image,
  ActivityIndicator,
} from 'react-native';
import {
  TextInput,
  Button,
  RadioButton,
  Card,
  Title,
  Avatar,
  HelperText
} from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { format } from 'date-fns';
import ResponsiveButton from '../components/ui/responsiveButton';
import { REACT_APP_API_URL } from '../config';
import StoreSelector from '../components/StoreSelector';
import { useAuth } from '../context/AuthContext';
import { formatHnl, formatDate } from '../utils/format';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { formatAmountInput, parseFormattedNumber } from '../utils/numberFormat';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW } from '../theme';
import { ImageService } from '../utils/ImageService';
import ImagePicker from '../components/ImagePicker';

const BACKEND_URL = `${REACT_APP_API_URL}/api/forms`;
const TRANSACTIONS_URL = `${REACT_APP_API_URL}/transactions`;

const DynamicFormScreen = () => {
  const { userName, accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'form' | 'historial'>('form');

  // ── Historial de operaciones del usuario ────────────────────────────────────
  interface OperacionHistorial {
    id: number; type: string; amount: number; date: string;
    description: string; storeName: string; username: string;
  }
  const [historial, setHistorial]         = useState<OperacionHistorial[]>([]);
  const [histLoading, setHistLoading]     = useState(false);
  const [histPage, setHistPage]           = useState(0);
  const [histHasMore, setHistHasMore]     = useState(true);
  const HIST_SIZE = 20;

  const loadHistorial = useCallback(async (reset = false) => {
    if (!userName || histLoading) return;
    setHistLoading(true);
    const page = reset ? 0 : histPage;
    try {
      const res = await fetch(
        `${REACT_APP_API_URL}/api/operations/mine?username=${userName}&page=${page}&size=${HIST_SIZE}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data: OperacionHistorial[] = await res.json();
      setHistorial(prev => reset ? data : [...prev, ...data]);
      setHistPage(page + 1);
      setHistHasMore(data.length === HIST_SIZE);
    } catch { /* silencioso */ }
    finally { setHistLoading(false); }
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

  const [formType, setFormType] = useState<'transaction' | 'closing-deposits' | 'supplier-payments' | 'salary-payments' | 'gasto-admin' | ''>('');
  const [showMessageCard, setShowMessageCard] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const slideAnim = useState(new Animated.Value(-100))[0];
  const [errors, setErrors] = useState<{ [key: string]: boolean }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFormData(prevData => ({ ...prevData, date: getCurrentFormattedDate() }));
  }, []);

  // Cargar locales activos y distribuir el porcentaje en partes iguales
  useEffect(() => {
    const STORES_URL = `${REACT_APP_API_URL}/api/v2/stores/active`;
    fetch(STORES_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.json())
      .then((stores: { id: number; name: string }[]) => {
        if (!stores.length) return;
        const base     = Math.floor(100 / stores.length);
        const resto    = 100 - base * stores.length;
        setDistribuciones(stores.map((s, i) => ({
          storeId:    s.id,
          nombre:     s.name,
          porcentaje: i === 0 ? base + resto : base,
        })));
      })
      .catch(() => {});
  }, []);

  // Establecer tipo automáticamente para gasto-admin
  useEffect(() => {
    if (formType === 'gasto-admin') {
      handleInputChange('type', 'expense');
    }
  }, [formType]);

  const showMessage = (type: 'success' | 'error', message: string) => {
    setMessage(message);
    setMessageType(type);
    setShowMessageCard(true);

    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    setTimeout(() => hideMessage(), 3000);
  };

  const hideMessage = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowMessageCard(false));
  };

  const clearData = () => {
    const currentDate = getCurrentFormattedDate();
    handleInputChange('amount', '');
    handleInputChange('date', currentDate);
    handleInputChange('description', '');
    handleInputChange('type', '');
    handleInputChange('closingsCount', '');
    handleInputChange('periodStart', '');
    handleInputChange('periodEnd', '');
    handleInputChange('storeId', 0);
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

  const validateForm = () => {
    const newErrors: { [key: string]: boolean } = {};

    // Validación para transacciones
    if (formType === 'transaction' && !formData.type) {
      newErrors.type = true;
    }

    // Validación para gastos administrativos
    if (formType === 'gasto-admin') {
      if (!formData.amount || parseFloat(formData.amount.replace(/,/g, '')) <= 0) newErrors.amount = true;
      if (!formData.description.trim()) newErrors.description = true;
      if (!formData.date) newErrors.date = true;
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
      showMessage('error', 'Por favor, seleccione un tipo de operación.');
      return;
    }

    const isValid = validateForm();
    if (!isValid) {
      showMessage('error', 'Por favor complete todos los campos requeridos');
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUri = null;

      if (selectedImage) {
        const uploadResult = await ImageService.uploadImage(
          selectedImage.uri,
          selectedImage.name = ImageService.generateFileName('IMG'),
          'comprobantes'
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
              amount,
              store: { id: formData.storeId },
              username: userName ?? 'default_user',
              date: formData.date,
              salaryDate: formData.date,
              paymentDate: formData.date,
              depositDate: formData.date,
              imageUri: imageUri,
            };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(basePayload),
      });

      if (response.ok) {
        if (formType === 'gasto-admin') {
          const result = await response.json();
          showMessage('success', `${result.mensaje} (ID: ${result.gastoAdminId})`);
        } else {
          showMessage('success', 'Datos enviados correctamente');
        }
        clearData();
        setFormType('');
        setErrors({});
      } else {
        const error = await response.json();
        showMessage('error', error.message || 'Error al enviar el formulario');
      }
    } catch (error) {
      showMessage('error', 'No se pudo conectar con el servidor');
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

  const renderSupplierList = () => {
    const suppliers = ['Pollo Rey', 'Pollo Cortijo', 'Pago a Proveedor de Frescos'];
    return (
      <View style={styles.supplierListContainer}>
        {suppliers.map((supplier) => (
          <RadioButton.Item
            key={supplier}
            label={supplier}
            value={supplier}
            status={formData.supplier === supplier ? 'checked' : 'unchecked'}
            onPress={() => handleInputChange('supplier', supplier)}
            style={styles.radioItem}
            labelStyle={styles.radioLabel}
            color={COLOR.brandDark}
          />
        ))}
      </View>
    );
  };

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

      <StoreSelector
        selectedStore={formData.storeId}
        onStoreChange={(storeId) => handleInputChange('storeId', storeId)}
        style={styles.storeSelector}
      />

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
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          label="Fecha"
          value={formData.date}
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
    const pctValidos = totalPct === 100;

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
                  L {((montoNum * d.porcentaje) / 100).toFixed(2)}
                </Text>
              )}
            </View>
          ))}

          <View style={styles.validationContainer}>
            {pctValidos ? (
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
                • {d.nombre} ({d.porcentaje}%): L {((montoNum * d.porcentaje) / 100).toFixed(2)}
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
            <StoreSelector
              selectedStore={formData.storeId}
              onStoreChange={(storeId) => handleInputChange('storeId', storeId)}
              style={styles.storeSelector}
            />

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
            <Title style={styles.formSectionTitle}>Selecciona un proveedor</Title>
            {renderSupplierList()}

            <StoreSelector
              selectedStore={formData.storeId}
              onStoreChange={(storeId) => handleInputChange('storeId', storeId)}
              style={styles.storeSelector}
            />

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
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                label="Fecha"
                value={formData.date}
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
            <StoreSelector
              selectedStore={formData.storeId}
              onStoreChange={(storeId) => handleInputChange('storeId', storeId)}
              style={styles.storeSelector}
            />

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
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                label="Fecha"
                value={formData.date}
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
    income:   'Ingreso',
    expense:  'Egreso',
  };

  const renderHistorial = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACE.s4, gap: SPACE.s2 }}>
      {historial.length === 0 && !histLoading && (
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
              <Text style={histStyles.date}>{op.date ? formatDate(op.date) : ''}</Text>
            </View>
            <Text style={[histStyles.amount, { color: isIncome ? COLOR.income : COLOR.expense }]}>
              {isIncome ? '+' : '-'}{formatHnl(op.amount)}
            </Text>
          </View>
        </View>
        );
      })}

      {histHasMore && (
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

      <View style={styles.topSection}>
        <Title style={styles.welcomeText}>Operaciones</Title>
      </View>

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

            <Title style={styles.formSectionTitle}>Seleccione tipo de operación</Title>
            
            <RadioButton.Group
              onValueChange={(value: any) => setFormType(value)}
              value={formType}
            >
              <View style={styles.operationTypeContainer}>
                <RadioButton.Item
                  label="Transacción"
                  value="transaction"
                  style={styles.radioItem}
                  labelStyle={styles.radioLabel}
                  color={COLOR.brandDark}
                />
                <RadioButton.Item
                  label="Gasto Administrativo"
                  value="gasto-admin"
                  style={styles.radioItem}
                  labelStyle={styles.radioLabel}
                  color={COLOR.brandDark}
                />
                <RadioButton.Item
                  label="Depósito de Cierres"
                  value="closing-deposits"
                  style={styles.radioItem}
                  labelStyle={styles.radioLabel}
                  color={COLOR.brandDark}
                />
                <RadioButton.Item
                  label="Pago a Proveedores"
                  value="supplier-payments"
                  style={styles.radioItem}
                  labelStyle={styles.radioLabel}
                  color={COLOR.brandDark}
                />
                <RadioButton.Item
                  label="Salarios"
                  value="salary-payments"
                  style={styles.radioItem}
                  labelStyle={styles.radioLabel}
                  color={COLOR.brandDark}
                />
              </View>
            </RadioButton.Group>

            {renderFormFields()}
            
            <View style={styles.buttonContainer}>
              <Button
                mode="contained"
                onPress={handleSubmit}
                disabled={isSubmitting}
                loading={isSubmitting}
                style={styles.submitButton}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonText}
                buttonColor={COLOR.info}
              >
                {isSubmitting ? 'ENVIANDO...' : 'ENVIAR'}
              </Button>

              <Button
                mode="contained"
                onPress={clearData}
                style={styles.clearButton}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonText}
                buttonColor={COLOR.warn}
              icon="refresh"
              >
                LIMPIAR FORMULARIO
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
      />

      {showMessageCard && (
        <Animated.View
          style={[
            styles.messageCard,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Card style={messageType === 'success' ? styles.successCard : styles.errorCard}>
            <Card.Content>
              <Title style={styles.messageText}>{message}</Title>
            </Card.Content>
          </Card>
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
    top: 0,
    left: 0,
    right: 0,
    padding: SPACE.s4,
    zIndex: 2,
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