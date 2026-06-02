// =============================================================================
// DynamicFormScreen.tsx  ·  screens/DynamicFormScreen.tsx
// Formulario unificado: cierre de caja / pago a proveedor / salario / gasto admin.
// El tipo llega por parámetro de navegación (`tipo`).
// Sin emojis, sin inline styles, sin hex. Conectá tu API real de registro.
// =============================================================================
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL } from '../theme';

export type FormTipo = 'cierre' | 'proveedor' | 'salario' | 'gasto';

const TITLES: Record<FormTipo, string> = {
  cierre: 'Cierre de caja', proveedor: 'Pago a proveedor', salario: 'Salario', gasto: 'Gasto administrativo',
};

interface Props {
  tipo: FormTipo;
  currencyPrefix: string;       // del TenantConfig, p. ej. "L"
  empleados?: { id: string; nombre: string }[]; // para tipo salario
  onBack: () => void;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  onPickPhoto: () => Promise<string | null>; // abre cámara/galería, devuelve uri
}

export function DynamicFormView({ tipo, currencyPrefix, empleados = [], onBack, onSubmit, onPickPhoto }: Props) {
  const [monto, setMonto] = useState('');
  const [efectivo, setEfectivo] = useState('');     // cierre
  const [proveedor, setProveedor] = useState('');   // proveedor
  const [empleado, setEmpleado] = useState(empleados[0]?.id ?? ''); // salario
  const [periodo, setPeriodo] = useState('');       // salario
  const [categoria, setCategoria] = useState('');   // gasto
  const [descripcion, setDescripcion] = useState('');
  const [notas, setNotas] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tarjeta = useMemo(() => {
    const t = parseFloat(monto || '0') - parseFloat(efectivo || '0');
    return isNaN(t) ? 0 : Math.max(0, t);
  }, [monto, efectivo]);

  // Validación de obligatorios por tipo
  const valid = useMemo(() => {
    if (!monto) return false;
    if (tipo === 'proveedor') return !!proveedor;
    if (tipo === 'salario') return !!empleado;
    if (tipo === 'gasto') return !!descripcion;
    return true;
  }, [tipo, monto, proveedor, empleado, descripcion]);

  const pick = async () => { const uri = await onPickPhoto(); if (uri) setPhoto(uri); };

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({ tipo, monto: parseFloat(monto || '0'), efectivo: parseFloat(efectivo || '0'), tarjeta, proveedor, empleado, periodo, categoria, descripcion, notas, photo });
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.back} onPress={onBack}><MaterialCommunityIcons name="chevron-left" size={24} color={COLOR.ink} /></TouchableOpacity>
        <Text style={styles.title}>{TITLES[tipo]}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>INFORMACIÓN</Text>

        {/* Monto grande (común) */}
        <Text style={styles.label}>{tipo === 'cierre' ? 'Monto total' : 'Monto'}</Text>
        <View style={styles.amountWrap}>
          <Text style={styles.amountPrefix}>{currencyPrefix}</Text>
          <TextInput style={styles.amount} value={monto} onChangeText={setMonto} keyboardType="numeric" placeholder="0.00" placeholderTextColor={COLOR.inkDisabled} textAlign="center" />
        </View>

        {/* Campos por tipo */}
        {tipo === 'cierre' && (
          <>
            <Field label="Monto en efectivo"><TextInput style={styles.input} value={efectivo} onChangeText={setEfectivo} keyboardType="numeric" placeholder="0.00" placeholderTextColor={COLOR.inkDisabled} /></Field>
            <Field label="Monto en tarjeta (calculado)"><View style={[styles.input, styles.readonly]}><Text style={styles.readonlyTxt}>{currencyPrefix} {tarjeta.toLocaleString('es-HN', { minimumFractionDigits: 2 })}</Text></View></Field>
          </>
        )}
        {tipo === 'proveedor' && (
          <>
            <Field label="Proveedor"><TextInput style={styles.input} value={proveedor} onChangeText={setProveedor} placeholder="Nombre del proveedor" placeholderTextColor={COLOR.inkDisabled} /></Field>
            <Field label="Descripción"><TextInput style={styles.input} value={descripcion} onChangeText={setDescripcion} placeholder="Concepto del pago" placeholderTextColor={COLOR.inkDisabled} /></Field>
          </>
        )}
        {tipo === 'salario' && (
          <>
            <Field label="Empleado">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.empChips}>
                {empleados.map(e => (
                  <TouchableOpacity key={e.id} style={[styles.empChip, empleado === e.id && styles.empChipOn]} onPress={() => setEmpleado(e.id)}>
                    <Text style={[styles.empChipTxt, empleado === e.id && styles.empChipTxtOn]}>{e.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Field>
            <Field label="Período"><TextInput style={styles.input} value={periodo} onChangeText={setPeriodo} placeholder="Ej: Quincena junio" placeholderTextColor={COLOR.inkDisabled} /></Field>
          </>
        )}
        {tipo === 'gasto' && (
          <>
            <Field label="Descripción"><TextInput style={styles.input} value={descripcion} onChangeText={setDescripcion} placeholder="Concepto del gasto" placeholderTextColor={COLOR.inkDisabled} /></Field>
            <Field label="Categoría (opcional)"><TextInput style={styles.input} value={categoria} onChangeText={setCategoria} placeholder="Servicios, mantenimiento…" placeholderTextColor={COLOR.inkDisabled} /></Field>
          </>
        )}

        {tipo === 'cierre' && <Field label="Notas (opcional)"><TextInput style={styles.input} value={notas} onChangeText={setNotas} placeholder="Observaciones del turno…" placeholderTextColor={COLOR.inkDisabled} /></Field>}

        {/* Comprobante (todos menos cierre lo destacan; se permite en todos) */}
        <Text style={styles.section}>COMPROBANTE (OPCIONAL)</Text>
        {photo ? (
          <View style={styles.thumbWrap}>
            <Image source={{ uri: photo }} style={styles.thumb} />
            <TouchableOpacity style={styles.thumbX} onPress={() => setPhoto(null)}><MaterialCommunityIcons name="close" size={16} color={COLOR.white} /></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.photoDrop} onPress={pick}>
            <MaterialCommunityIcons name="camera-outline" size={48} color={COLOR.inkMute} />
            <Text style={styles.photoTxt}>Tocá para agregar foto</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.submit, (!valid || saving) && styles.submitDis]} disabled={!valid || saving} onPress={submit}>
          <Text style={styles.submitTxt}>{saving ? 'Registrando…' : 'Registrar'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg },
  appbar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, paddingHorizontal: SPACE.s3, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  back: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },

  body: { padding: SPACE.s4, paddingBottom: SPACE.s8, maxWidth: 600, width: '100%', alignSelf: 'center' },
  section: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.inkMute, letterSpacing: 0.5, marginTop: SPACE.s5, marginBottom: SPACE.s3, borderBottomWidth: 1, borderBottomColor: COLOR.border, paddingBottom: SPACE.s2 },
  field: { marginBottom: SPACE.s3 },
  label: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.medium, color: COLOR.ink2, marginBottom: SPACE.s2 },

  amountWrap: { flexDirection: 'row', alignItems: 'center', height: 64, borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r2, backgroundColor: COLOR.surface, paddingHorizontal: SPACE.s4, marginBottom: SPACE.s3 },
  amountPrefix: { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkMute, fontFamily: 'JetBrainsMono' },
  amount: { flex: 1, height: '100%', fontFamily: 'JetBrainsMono', fontSize: 32, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },

  input: { height: CONTROL.inputH, borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s3, fontSize: FONT_SIZE.body, color: COLOR.ink, backgroundColor: COLOR.surface },
  readonly: { justifyContent: 'center', backgroundColor: COLOR.surface2 },
  readonlyTxt: { fontFamily: 'JetBrainsMono', fontSize: FONT_SIZE.body, color: COLOR.ink2 },

  empChips: { gap: SPACE.s2 },
  empChip: { height: CONTROL.chipH, paddingHorizontal: SPACE.s3, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface, justifyContent: 'center' },
  empChipOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  empChipTxt: { fontSize: FONT_SIZE.label, color: COLOR.ink2 }, empChipTxtOn: { color: COLOR.inkOnBrand, fontWeight: FONT_WEIGHT.semibold },

  photoDrop: { borderWidth: 2, borderColor: COLOR.border2, borderStyle: 'dashed', borderRadius: RADIUS.r3, backgroundColor: COLOR.surface, padding: SPACE.s6, alignItems: 'center' },
  photoTxt: { fontSize: FONT_SIZE.label, color: COLOR.inkMute, marginTop: SPACE.s2 },
  thumbWrap: { position: 'relative', alignSelf: 'flex-start' },
  thumb: { width: 120, height: 120, borderRadius: RADIUS.r3, backgroundColor: COLOR.surface2 },
  thumbX: { position: 'absolute', top: -8, right: -8, width: 28, height: 28, borderRadius: RADIUS.full, backgroundColor: COLOR.expense, justifyContent: 'center', alignItems: 'center' },

  submit: { height: CONTROL.buttonH, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand, justifyContent: 'center', alignItems: 'center', marginTop: SPACE.s6 },
  submitDis: { opacity: 0.5 },
  submitTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },
});

// ─── Connected wrapper ────────────────────────────────────────────────────────
export default function DynamicFormScreen() {
  return (
    <DynamicFormView
      tipo="cierre"
      currencyPrefix="L"
      onBack={() => {}}
      onSubmit={async () => {}}
      onPickPhoto={async () => null}
    />
  );
}
