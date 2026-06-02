// =============================================================================
// TenantConfigScreen.tsx  ·  screens/TenantConfigScreen.tsx
// Configuración del negocio (solo root): empresa, zona horaria, impuestos.
// Sin emojis, sin inline styles, sin hex. Snackbar de éxito/error tras guardar.
// =============================================================================
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import axios from 'axios';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';
import { REACT_APP_API_URL } from '../config';

interface Tax { id: string; nombre: string; tasa: number; tipo: 'porcentaje' | 'fijo'; aplica: string; activo: boolean; }
interface Config { empresa: string; moneda: string; direccion: string; telefono: string; zona: string; impuestos: Tax[]; }

const ZONES = ['Tegucigalpa (GMT-6)', 'Guatemala', 'San Salvador', 'Managua', 'San José', 'Ciudad de México'];

interface Props { config: Config; onBack: () => void; onSave: (config: Config) => Promise<void>; }

function TenantConfigView({ config, onBack, onSave }: Props) {
  const [empresa, setEmpresa] = useState(config.empresa);
  const [moneda, setMoneda] = useState(config.moneda);
  const [direccion, setDireccion] = useState(config.direccion);
  const [telefono, setTelefono] = useState(config.telefono);
  const [zona, setZona] = useState(config.zona);
  const [impuestos, setImpuestos] = useState<Tax[]>(config.impuestos);
  const [taxModal, setTaxModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await onSave({ empresa, moneda, direccion, telefono, zona, impuestos }); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.back} onPress={onBack}><MaterialCommunityIcons name="chevron-left" size={24} color={COLOR.ink} /></TouchableOpacity>
        <Text style={styles.title}>Configuración del negocio</Text>
      </View>

      <ScrollView>
        <Text style={styles.section}>EMPRESA</Text>
        <View style={styles.body}>
          <Field label="Nombre de empresa" value={empresa} onChange={setEmpresa} />
          <Field label="Moneda" value={moneda} onChange={setMoneda} />
          <Field label="Dirección" value={direccion} onChange={setDireccion} />
          <Field label="Teléfono" value={telefono} onChange={setTelefono} keyboard="phone-pad" />
        </View>

        <Text style={styles.section}>ZONA HORARIA</Text>
        <View style={styles.body}>
          <View style={styles.tzGrid}>
            {ZONES.map(z => (
              <TouchableOpacity key={z} style={[styles.tzChip, zona === z && styles.tzChipOn]} onPress={() => setZona(z)}>
                <Text style={[styles.tzTxt, zona === z && styles.tzTxtOn]}>{z}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.section}>IMPUESTOS</Text>
        <View style={styles.body}>
          <TouchableOpacity style={styles.addTax} onPress={() => setTaxModal(true)}>
            <MaterialCommunityIcons name="plus" size={15} color={COLOR.info} />
            <Text style={styles.addTaxTxt}>Agregar impuesto</Text>
          </TouchableOpacity>
          {impuestos.map(t => (
            <View key={t.id} style={styles.taxRow}>
              <View style={styles.flex}>
                <Text style={styles.taxName}>{t.nombre}</Text>
                <Text style={styles.taxSub}>{t.tipo === 'porcentaje' ? `${t.tasa}%` : `L ${t.tasa}`} · Aplica a: {t.aplica} · <Text style={{ color: t.activo ? COLOR.income : COLOR.inkMute }}>{t.activo ? 'Activo' : 'Inactivo'}</Text></Text>
              </View>
              <TouchableOpacity style={styles.dots}><MaterialCommunityIcons name="dots-vertical" size={20} color={COLOR.inkMute} /></TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.saveWrap}>
          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveDis]} disabled={saving} onPress={save}>
            <Text style={styles.saveTxt}>{saving ? 'Guardando…' : 'Guardar cambios'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TaxModal visible={taxModal} onClose={() => setTaxModal(false)} onSubmit={(t) => { setImpuestos(prev => [...prev, { ...t, id: String(Date.now()), activo: true }]); setTaxModal(false); }} />
    </View>
  );
}

function Field({ label, value, onChange, keyboard }: { label: string; value: string; onChange: (v: string) => void; keyboard?: any }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fLabel}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboard} placeholderTextColor={COLOR.inkDisabled} />
    </View>
  );
}

function TaxModal({ visible, onClose, onSubmit }: { visible: boolean; onClose: () => void; onSubmit: (t: any) => void; }) {
  const [nombre, setNombre] = useState('');
  const [tasa, setTasa] = useState('');
  const [tipo, setTipo] = useState<'porcentaje' | 'fijo'>('porcentaje');
  const [aplica, setAplica] = useState('Todo');
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOv}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Nuevo impuesto</Text>
          <View style={styles.field}><Text style={styles.fLabel}>Nombre</Text><TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="ISV, IVA, IGV" placeholderTextColor={COLOR.inkDisabled} /></View>
          <View style={styles.field}><Text style={styles.fLabel}>Tasa</Text><TextInput style={styles.input} value={tasa} onChangeText={setTasa} keyboardType="numeric" placeholder="15.00" placeholderTextColor={COLOR.inkDisabled} /></View>
          <View style={styles.field}>
            <Text style={styles.fLabel}>Tipo</Text>
            <View style={styles.seg}>
              <TouchableOpacity style={[styles.segBtn, tipo === 'porcentaje' && styles.segOn]} onPress={() => setTipo('porcentaje')}><Text style={[styles.segTxt, tipo === 'porcentaje' && styles.segTxtOn]}>Porcentaje</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.segBtn, tipo === 'fijo' && styles.segOn]} onPress={() => setTipo('fijo')}><Text style={[styles.segTxt, tipo === 'fijo' && styles.segTxtOn]}>Monto fijo</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.fLabel}>Aplica a</Text>
            <View style={styles.seg}>
              {['Todo', 'Categoría', 'Producto'].map(a => (
                <TouchableOpacity key={a} style={[styles.segBtn, aplica === a && styles.segOn]} onPress={() => setAplica(a)}><Text style={[styles.segTxt, aplica === a && styles.segTxtOn]}>{a}</Text></TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.fActions}>
            <TouchableOpacity style={styles.fCancel} onPress={onClose}><Text style={styles.fCancelTxt}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.fSave, !(nombre && tasa) && styles.fSaveDis]} disabled={!(nombre && tasa)} onPress={() => onSubmit({ nombre, tasa: parseFloat(tasa || '0'), tipo, aplica })}><Text style={styles.fSaveTxt}>Guardar</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg }, flex: { flex: 1 },
  appbar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, paddingHorizontal: SPACE.s3, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  back: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },

  section: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.inkMute, letterSpacing: 0.5, paddingHorizontal: SPACE.s4, paddingBottom: SPACE.s2, marginTop: SPACE.s5, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  body: { paddingHorizontal: SPACE.s4, paddingTop: SPACE.s3 },
  field: { marginBottom: SPACE.s3 },
  fLabel: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.medium, color: COLOR.ink2, marginBottom: SPACE.s1 },
  input: { height: CONTROL.inputH, borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s3, fontSize: FONT_SIZE.body, color: COLOR.ink, backgroundColor: COLOR.surface },

  tzGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2 },
  tzChip: { width: '48%', height: 40, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r2, backgroundColor: COLOR.surface, justifyContent: 'center', alignItems: 'center' },
  tzChipOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  tzTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2 }, tzTxtOn: { color: COLOR.inkOnBrand },

  addTax: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, alignSelf: 'flex-start', height: CONTROL.buttonSmH, paddingHorizontal: SPACE.s3, borderWidth: 1, borderColor: COLOR.info, borderRadius: RADIUS.r2, marginBottom: SPACE.s3 },
  addTaxTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.info },
  taxRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, padding: SPACE.s3, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r2, marginBottom: SPACE.s2 },
  taxName: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },
  taxSub: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 2 },
  dots: { padding: 4 },

  saveWrap: { padding: SPACE.s5 },
  saveBtn: { height: CONTROL.buttonH, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand, justifyContent: 'center', alignItems: 'center' },
  saveDis: { opacity: 0.6 },
  saveTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },

  modalOv: { flex: 1, justifyContent: 'center', backgroundColor: 'COLOR.overlay', padding: SPACE.s4 },
  modal: { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, ...SHADOW.lg },
  modalTitle: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, marginBottom: SPACE.s4 },
  seg: { flexDirection: 'row', gap: SPACE.s2 },
  segBtn: { flex: 1, height: 44, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border2, backgroundColor: COLOR.surface, justifyContent: 'center', alignItems: 'center' },
  segOn: { backgroundColor: COLOR.brandTint, borderColor: COLOR.brand },
  segTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2 }, segTxtOn: { color: COLOR.brandDeep },
  fActions: { flexDirection: 'row', gap: SPACE.s2, marginTop: SPACE.s5 },
  fCancel: { flex: 1, height: CONTROL.buttonH, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border2, backgroundColor: COLOR.surface, justifyContent: 'center', alignItems: 'center' },
  fCancelTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink2 },
  fSave: { flex: 1, height: CONTROL.buttonH, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand, justifyContent: 'center', alignItems: 'center' },
  fSaveDis: { opacity: 0.5 },
  fSaveTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },
});

// ─── Connected wrapper ────────────────────────────────────────────────────────
const EMPTY_CONFIG: Config = { empresa: '', moneda: 'L', direccion: '', telefono: '', zona: 'Tegucigalpa (GMT-6)', impuestos: [] };

export default function TenantConfigScreen() {
  const [config, setConfig] = useState<Config>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${REACT_APP_API_URL}/api/v3/tenant/config`)
      .then(r => setConfig({
        empresa: r.data.companyName ?? '',
        moneda:  r.data.currency    ?? 'L',
        direccion: r.data.address   ?? '',
        telefono: r.data.phone      ?? '',
        zona:    r.data.timezone    ?? 'Tegucigalpa (GMT-6)',
        impuestos: [],
      }))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOR.bg }}><ActivityIndicator size="large" color={COLOR.brand} /></View>;

  return (
    <TenantConfigView config={config} onBack={() => {}}
      onSave={async (cfg) => {
        await axios.put(`${REACT_APP_API_URL}/api/v3/tenant/config`, {
          companyName: cfg.empresa, currency: cfg.moneda,
          address: cfg.direccion, phone: cfg.telefono, timezone: cfg.zona,
        });
      }}
    />
  );
}
