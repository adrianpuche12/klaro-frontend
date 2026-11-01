import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Modal, Pressable } from 'react-native';
import { Button, TextInput, Snackbar } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import ConfirmDialog from '../components/ConfirmDialog';
import AppText from '../components/ui/AppText';
import { TIMEZONES } from '../constants/timezones';
import { useAuth } from '../context/AuthContext';
import { COLOR, SPACE, RADIUS } from '../theme';

/**
 * Empresas — pantalla del administrador de plataforma (SPRINT-16).
 * Lista, alta (empresa + configuración + dueño en un paso) y suspensión/reactivación.
 * La plataforma nunca ve datos de negocio de las empresas: el backend (RLS) solo le muestra
 * las tablas tenants y tenant_config.
 */

interface Company {
  id: number;
  slug: string;
  name: string;
  plan: string;
  active: boolean;
  createdAt: string | null;
}

interface CompanyForm {
  name: string;
  slug: string;
  plan: string;
  currency: string;
  timezone: string;
  address: string;
  phone: string;
  rootUsername: string;
  rootFullName: string;
  rootPassword: string;
}

const EMPTY_FORM: CompanyForm = {
  name: '', slug: '', plan: 'starter', currency: '', timezone: '',
  address: '', phone: '', rootUsername: '', rootFullName: '', rootPassword: '',
};
const PLANS = ['starter', 'pro', 'business'];
const API = `${REACT_APP_API_URL}/api/v3/tenants`;

/** "Panadería del Sol" -> "panaderia-del-sol" */
function toSlug(value: string): string {
  return value
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

function errorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data) return data;
  return data?.error || data?.message || fallback;
}

function validate(f: CompanyForm): string | null {
  if (!f.name.trim()) return 'Ingresá el nombre de la empresa';
  if (!/^[a-z0-9-]{3,50}$/.test(f.slug)) return 'El identificador debe tener entre 3 y 50 letras minúsculas, números o guiones';
  if (!/^[A-Za-z]{3}$/.test(f.currency.trim())) return 'La moneda debe ser un código de 3 letras (ej. USD, HNL, ARS)';
  if (!f.timezone) return 'Elegí la zona horaria';
  if (!f.rootUsername.trim()) return 'Ingresá el usuario del dueño';
  if (!f.rootFullName.trim()) return 'Ingresá el nombre del dueño';
  if (f.rootPassword.length < 8) return 'La contraseña del dueño debe tener al menos 8 caracteres';
  return null;
}

export default function PlatformCompaniesScreen() {
  const { logout, userName } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState('');
  const [confirmDlg, setConfirmDlg] = useState<{ title: string; message: string; label: string; onConfirm: () => void } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get<Company[]>(API);
      setCompanies([...res.data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      setSnackbar(errorMessage(e, 'No se pudieron cargar las empresas'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeCount = useMemo(() => companies.filter(c => c.active).length, [companies]);

  const setField = (key: keyof CompanyForm, value: string) => {
    setFormError(null);
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'name' && !slugTouched) next.slug = toSlug(value);
      return next;
    });
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setFormError(null);
    setModalVisible(true);
  };

  const create = async () => {
    const invalid = validate(form);
    if (invalid) { setFormError(invalid); return; }
    setSaving(true);
    try {
      const res = await axios.post(API, {
        ...form,
        name: form.name.trim(),
        currency: form.currency.trim().toUpperCase(),
        rootUsername: form.rootUsername.trim().toLowerCase(),
        rootFullName: form.rootFullName.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
      });
      setModalVisible(false);
      setSnackbar(`Empresa creada. El dueño entra con el usuario "${res.data?.rootUsername ?? form.rootUsername}".`);
      load();
    } catch (e) {
      setFormError(errorMessage(e, 'No se pudo crear la empresa'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (c: Company) => {
    setConfirmDlg({
      title: c.active ? 'Suspender empresa' : 'Reactivar empresa',
      message: c.active
        ? `Los usuarios de "${c.name}" no van a poder operar hasta que la reactives. Sus datos no se borran.`
        : `Los usuarios de "${c.name}" van a poder volver a operar.`,
      label: c.active ? 'Suspender' : 'Reactivar',
      onConfirm: async () => {
        setConfirmDlg(null);
        try {
          await axios.put(`${API}/${c.id}/toggle`);
          setSnackbar(c.active ? `"${c.name}" quedó suspendida` : `"${c.name}" quedó activa`);
          load();
        } catch (e) {
          setSnackbar(errorMessage(e, 'No se pudo cambiar el estado'));
        }
      },
    });
  };

  return (
    <View style={styles.page}>
      {/* Encabezado */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="caption" color={COLOR.ink2}>ADMINISTRACIÓN DE PLATAFORMA</AppText>
          <AppText variant="title">Empresas</AppText>
          <AppText variant="description">
            {companies.length} empresas · {activeCount} activas. Desde acá no se ven datos de negocio de ninguna empresa.
          </AppText>
        </View>
        <View style={styles.headerActions}>
          <Button mode="contained" icon="plus" buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} onPress={openCreate}>
            Nueva empresa
          </Button>
          <Button mode="outlined" icon="logout" textColor={COLOR.ink} onPress={logout} accessibilityLabel={`Cerrar sesión de ${userName ?? ''}`}>
            Salir
          </Button>
        </View>
      </View>

      {/* Lista */}
      {loading && companies.length === 0 ? (
        <ActivityIndicator color={COLOR.brand} style={{ marginTop: SPACE.s6 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {companies.length === 0 && (
            <AppText variant="description" centered>Todavía no hay empresas.</AppText>
          )}
          {companies.map(c => (
            <View key={c.id} style={styles.card}>
              <View style={styles.cardMain}>
                <View style={styles.cardTitleRow}>
                  <AppText variant="subtitle">{c.name}</AppText>
                  <View style={[styles.badge, c.active ? styles.badgeOn : styles.badgeOff]}>
                    <AppText variant="caption" color={c.active ? COLOR.income : COLOR.expense}>
                      {c.active ? 'Activa' : 'Suspendida'}
                    </AppText>
                  </View>
                </View>
                <AppText variant="caption" color={COLOR.inkMute}>
                  {c.slug} · plan {c.plan} · id {c.id}
                  {c.createdAt ? ` · alta ${new Date(c.createdAt).toLocaleDateString()}` : ''}
                </AppText>
              </View>
              <Button
                mode="outlined"
                compact
                textColor={c.active ? COLOR.expense : COLOR.income}
                onPress={() => toggle(c)}
              >
                {c.active ? 'Suspender' : 'Reactivar'}
              </Button>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Alta */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <AppText variant="title">Nueva empresa</AppText>
              <Pressable onPress={() => setModalVisible(false)} accessibilityLabel="Cerrar">
                <MaterialCommunityIcons name="close" size={22} color={COLOR.ink2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <AppText variant="label">Empresa</AppText>
              <TextInput mode="outlined" label="Nombre *" value={form.name} onChangeText={v => setField('name', v)} />
              <TextInput
                mode="outlined" label="Identificador (slug) *" value={form.slug} autoCapitalize="none"
                onChangeText={v => { setSlugTouched(true); setField('slug', v.toLowerCase()); }}
              />
              <AppText variant="caption" color={COLOR.inkMute}>Se usa internamente (archivos, soporte). Minúsculas, números y guiones.</AppText>
              <View style={styles.chips}>
                {PLANS.map(p => (
                  <Pressable key={p} onPress={() => setField('plan', p)} style={[styles.chip, form.plan === p && styles.chipOn]}>
                    <AppText variant="caption" color={COLOR.ink}>{p}</AppText>
                  </Pressable>
                ))}
              </View>

              <AppText variant="label" style={styles.group}>Configuración</AppText>
              <TextInput
                mode="outlined" label="Moneda (código de 3 letras) *" value={form.currency} autoCapitalize="characters" maxLength={3}
                onChangeText={v => setField('currency', v.toUpperCase())}
              />
              <AppText variant="caption" color={COLOR.ink2}>Zona horaria *</AppText>
              <View style={styles.chips}>
                {TIMEZONES.map(tz => (
                  <Pressable key={tz} onPress={() => setField('timezone', tz)} style={[styles.chip, form.timezone === tz && styles.chipOn]}>
                    <AppText variant="caption" color={COLOR.ink}>{tz.replace('America/', '').replace('Argentina/', '').replace('_', ' ')}</AppText>
                  </Pressable>
                ))}
              </View>
              <TextInput mode="outlined" label="Dirección" value={form.address} onChangeText={v => setField('address', v)} />
              <TextInput mode="outlined" label="Teléfono" value={form.phone} onChangeText={v => setField('phone', v)} />

              <AppText variant="label" style={styles.group}>Dueño (usuario root)</AppText>
              <TextInput mode="outlined" label="Usuario *" value={form.rootUsername} autoCapitalize="none" onChangeText={v => setField('rootUsername', v)} />
              <TextInput mode="outlined" label="Nombre completo *" value={form.rootFullName} onChangeText={v => setField('rootFullName', v)} />
              <TextInput mode="outlined" label="Contraseña inicial *" value={form.rootPassword} secureTextEntry onChangeText={v => setField('rootPassword', v)} />
              <AppText variant="caption" color={COLOR.inkMute}>Mínimo 8 caracteres. Compartila con el dueño por un canal seguro.</AppText>

            </ScrollView>
            {/* El error va fuera del scroll, junto a los botones: siempre visible. */}
            {formError && (
              <View style={styles.error} accessibilityLiveRegion="polite">
                <AppText variant="caption" color={COLOR.expense}>{formError}</AppText>
              </View>
            )}
            <View style={styles.modalActions}>
              <Button mode="outlined" textColor={COLOR.ink} onPress={() => setModalVisible(false)} disabled={saving}>Cancelar</Button>
              <Button mode="contained" buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} onPress={create} loading={saving} disabled={saving}>
                Crear empresa
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!confirmDlg}
        title={confirmDlg?.title ?? ''}
        message={confirmDlg?.message ?? ''}
        confirmLabel={confirmDlg?.label}
        onConfirm={() => confirmDlg?.onConfirm()}
        onCancel={() => setConfirmDlg(null)}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={4000}>{snackbar}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.bg, padding: SPACE.s5 },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: SPACE.s4, marginBottom: SPACE.s5 },
  headerText: { flex: 1, minWidth: 260, gap: SPACE.s1 },
  headerActions: { flexDirection: 'row', gap: SPACE.s2 },
  list: { gap: SPACE.s3, paddingBottom: SPACE.s7 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.s4,
    backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r3, padding: SPACE.s4,
  },
  cardMain: { flex: 1, gap: SPACE.s1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, flexWrap: 'wrap' },
  badge: { borderRadius: RADIUS.full, paddingHorizontal: SPACE.s2, paddingVertical: 2, borderWidth: 1 },
  badgeOn: { backgroundColor: COLOR.incomeTint, borderColor: COLOR.incomeBorder },
  badgeOff: { backgroundColor: COLOR.surface2, borderColor: COLOR.border2 },
  overlay: { flex: 1, backgroundColor: COLOR.overlay, justifyContent: 'center', alignItems: 'center', padding: SPACE.s4 },
  modal: { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, width: '100%', maxWidth: 560, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.s5, paddingBottom: SPACE.s3 },
  modalBody: { paddingHorizontal: SPACE.s5, paddingBottom: SPACE.s4, gap: SPACE.s2 },
  group: { marginTop: SPACE.s4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2 },
  chip: { borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.full, paddingHorizontal: SPACE.s3, paddingVertical: SPACE.s1 },
  chipOn: { borderColor: COLOR.brand, backgroundColor: COLOR.brandTint },
  error: { marginHorizontal: SPACE.s5, marginBottom: SPACE.s3, padding: SPACE.s3, borderRadius: RADIUS.r2, backgroundColor: COLOR.surface2 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACE.s2, padding: SPACE.s4, borderTopWidth: 1, borderTopColor: COLOR.border },
});
