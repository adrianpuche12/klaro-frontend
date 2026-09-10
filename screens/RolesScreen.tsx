import React, { useState, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, Switch, useWindowDimensions,
} from 'react-native';
import { TextInput, Button, Snackbar } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import ConfirmDialog from '../components/ConfirmDialog';
import AppText from '../components/ui/AppText';
import { MODULES } from '../constants/permissionModules';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW, BREAKPOINT } from '../theme';

// =============================================================================
// RolesScreen.tsx — gestión de Roles, exclusiva de root.
// Regla 60-30-10: fondos COLOR.bg/surface (60%), texto+bordes neutros (30%),
// COLOR.brand SOLO en el botón primario, el foco de inputs y el track del switch.
// Los chips activos usan brandTint + borde brand (NO relleno sólido) para no
// inundar la pantalla de dorado cuando un Role tiene 6+ módulos.
// =============================================================================

interface Role {
  id: number;
  name: string;
  level: number;
  canManageUsers: boolean;
  permissions: string[];
  createdAt: string;
}

// CATALOG no tiene chip propio: InventoryScreen es una única pantalla que
// necesita INVENTORY (stock) y CATALOG (categorías/productos) juntos -- no hay
// forma de usar una sin la otra hoy. Marcar "Inventario" habilita ambos módulos
// en el backend para evitar Roles a medio andar (categorías tirando 403 aunque
// el stock cargue bien).
const CHIP_MODULES = MODULES.filter(m => m.value !== 'CATALOG');
const TOTAL_PERMS = MODULES.length;

export default function RolesScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Role | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [snack, setSnack] = useState<{ msg: string; error?: boolean } | null>(null);

  // form
  const [name, setName] = useState('');
  const [level, setLevel] = useState('1');
  const [canManage, setCanManage] = useState(false);
  const [mods, setMods] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get<Role[]>(`${REACT_APP_API_URL}/api/v2/roles`);
      setRoles(res.data);
    } catch {
      setSnack({ msg: 'Error al cargar Roles', error: true });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openForm = (role: Role | null) => {
    setEditing(role);
    setName(role?.name ?? '');
    setLevel(String(role?.level ?? 1));
    setCanManage(role?.canManageUsers ?? false);
    setMods(role ? CHIP_MODULES.filter(m => role.permissions.includes(m.value)).map(m => m.value) : []);
    setFormOpen(true);
  };

  const toggleMod = (value: string) => {
    // El chip "Inventario" habilita INVENTORY + CATALOG juntos en el backend
    const linked = value === 'INVENTORY' ? ['INVENTORY', 'CATALOG'] : [value];
    setMods(prev =>
      prev.includes(value)
        ? prev.filter(p => !linked.includes(p))
        : [...new Set([...prev, ...linked])]
    );
  };

  const handleSave = async () => {
    const lvl = parseInt(level, 10);
    if (!name.trim() || !(lvl > 0)) {
      setSnack({ msg: 'Completá el nombre y un nivel válido (mayor a 0)', error: true });
      return; // el modal NO cierra
    }
    const body = { name: name.trim(), level: lvl, canManageUsers: canManage, permissions: mods };
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${REACT_APP_API_URL}/api/v2/roles/${editing.id}`, body);
        setSnack({ msg: 'Role actualizado correctamente' });
      } else {
        await axios.post(`${REACT_APP_API_URL}/api/v2/roles`, body);
        setSnack({ msg: 'Role creado correctamente' });
      }
      setFormOpen(false);
      await load();
    } catch (e: any) {
      // Nombre duplicado u otro rechazo: mostramos el error del backend tal cual
      setSnack({ msg: e.response?.data?.error || 'Error al guardar el Role', error: true });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const role = deleting;
    try {
      await axios.delete(`${REACT_APP_API_URL}/api/v2/roles/${role.id}`);
      setSnack({ msg: 'Role eliminado' });
      await load();
    } catch (e: any) {
      // Role con usuarios asignados: el mensaje viene del backend, no lo reescribimos
      setSnack({ msg: e.response?.data?.error || 'Error al eliminar', error: true });
    } finally { setDeleting(null); }
  };

  const Actions = ({ role }: { role: Role }) => (
    <View style={styles.acts}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => openForm(role)} accessibilityLabel="Editar Role">
        <MaterialCommunityIcons name="pencil" size={20} color={COLOR.info} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleting(role)} accessibilityLabel="Eliminar Role">
        <MaterialCommunityIcons name="delete" size={20} color={COLOR.expense} />
      </TouchableOpacity>
    </View>
  );

  const renderDesktopRow = ({ item }: { item: Role }) => {
    const pct = Math.round(item.permissions.length / TOTAL_PERMS * 100);
    return (
      <View style={styles.tr}>
        <AppText variant="label" style={[styles.cellName, styles.colName]}>{item.name}</AppText>
        <View style={styles.colLevel}><View style={styles.lvlBadge}><AppText variant="label" color={COLOR.ink2}>{item.level}</AppText></View></View>
        <View style={styles.colManage}>
          <View style={[styles.pill, item.canManageUsers ? styles.pillYes : styles.pillNo]}>
            <MaterialCommunityIcons name={item.canManageUsers ? 'check' : 'minus'} size={12} color={item.canManageUsers ? COLOR.income : COLOR.inkMute} />
            <AppText variant="caption" color={item.canManageUsers ? COLOR.income : COLOR.inkMute} style={styles.pillTxt}>{item.canManageUsers ? 'Sí' : 'No'}</AppText>
          </View>
        </View>
        <View style={styles.colMods}>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
          <AppText variant="caption">{item.permissions.length} de {TOTAL_PERMS}</AppText>
        </View>
        <View style={styles.colActions}><Actions role={item} /></View>
      </View>
    );
  };

  const renderCard = ({ item }: { item: Role }) => {
    const bits = [`Nivel ${item.level}`, item.canManageUsers ? 'Gestiona usuarios' : 'No gestiona usuarios', `${item.permissions.length} módulos`];
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <AppText variant="subtitle" color={COLOR.ink} style={styles.cardName}>{item.name}</AppText>
          <Actions role={item} />
        </View>
        <AppText variant="caption">{bits.join(' · ')}</AppText>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons name="badge-account-outline" size={22} color={COLOR.ink} />
          <AppText variant="title" style={styles.h1}>Roles</AppText>
          <Button
            mode="contained" onPress={() => openForm(null)}
            buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand}
            icon="plus" style={styles.newBtn} labelStyle={styles.newLbl}
          >
            Nuevo Role
          </Button>
        </View>
        <AppText variant="description" style={styles.intro}>
          Definí acá los perfiles de tu equipo — nombre, nivel jerárquico y qué módulos puede usar
          cada uno. Después, en "Usuarios", le asignás un Role y los locales donde va a trabajar cada persona.
        </AppText>
      </View>

      {/* Lista */}
      {loading ? (
        <ActivityIndicator size="large" color={COLOR.brand} style={styles.loader} />
      ) : roles.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="badge-account-outline" size={48} color={COLOR.inkDisabled} />
          <AppText variant="description" centered style={styles.emptyTxt}>Todavía no creaste ningún Role.{'\n'}Creá el primero con el botón de arriba.</AppText>
        </View>
      ) : isDesktop ? (
        <View style={styles.table}>
          <View style={styles.thead}>
            <AppText variant="caption" style={[styles.th, styles.colName]}>Nombre</AppText>
            <AppText variant="caption" style={[styles.th, styles.colLevel, styles.thCenter]}>Nivel</AppText>
            <AppText variant="caption" style={[styles.th, styles.colManage]}>Gestiona usuarios</AppText>
            <AppText variant="caption" style={[styles.th, styles.colMods]}>Módulos</AppText>
            <AppText variant="caption" style={[styles.th, styles.colActions, styles.thRight]}>Acciones</AppText>
          </View>
          <FlatList data={roles} renderItem={renderDesktopRow} keyExtractor={r => String(r.id)} />
        </View>
      ) : (
        <FlatList data={roles} renderItem={renderCard} keyExtractor={r => String(r.id)} contentContainerStyle={styles.cards} />
      )}

      {/* Modal crear/editar */}
      <Modal transparent visible={formOpen} animationType="fade" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.ov}>
          <ScrollView contentContainerStyle={styles.ovScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modal}>
              <AppText variant="title" style={styles.modalTitle}>{editing ? 'Editar Role' : 'Nuevo Role'}</AppText>
              <View style={styles.sep} />

              <TextInput
                mode="outlined" label="Nombre *" value={name} onChangeText={setName}
                placeholder="Ej. Encargado de Sucursal"
                outlineColor={COLOR.border2} activeOutlineColor={COLOR.brand} style={styles.input}
              />

              <TextInput
                mode="outlined" label="Nivel jerárquico *" value={level}
                onChangeText={v => setLevel(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                outlineColor={COLOR.border2} activeOutlineColor={COLOR.brand} style={styles.inputSpaced}
              />
              <AppText variant="caption" style={styles.help}>
                Un Role solo puede crear/gestionar usuarios de Roles con nivel mayor al suyo (nunca su
                propio nivel ni uno menor). Root es siempre nivel 0, no aparece acá.
              </AppText>

              {/* Switch destacado */}
              <View style={styles.swBlock}>
                <View style={styles.flex}>
                  <AppText variant="label" color={COLOR.ink} style={styles.swTitle}>Puede gestionar usuarios</AppText>
                  <AppText variant="caption" style={styles.swDesc}>Crear, suspender, eliminar usuarios de Roles con nivel mayor</AppText>
                </View>
                <Switch
                  value={canManage} onValueChange={setCanManage}
                  trackColor={{ false: COLOR.border2, true: COLOR.brandTint2 }}
                  thumbColor={canManage ? COLOR.brand : undefined}
                />
              </View>

              {/* Chips de módulos */}
              <AppText variant="label" style={styles.fieldLbl}>Módulos habilitados</AppText>
              <View style={styles.chips}>
                {CHIP_MODULES.map(m => {
                  const on = mods.includes(m.value);
                  return (
                    <TouchableOpacity key={m.value} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleMod(m.value)}>
                      <AppText variant="label" color={on ? COLOR.ink : COLOR.ink2} style={on ? styles.chipTxtOn : undefined}>{m.label}</AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.footer}>
                <Button mode="outlined" onPress={() => setFormOpen(false)} textColor={COLOR.ink2}
                  style={styles.fBtn} contentStyle={styles.fBtnContent}>Cancelar</Button>
                <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving}
                  buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand}
                  style={styles.fBtn} contentStyle={styles.fBtnContent}>Guardar</Button>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!deleting}
        title="Eliminar Role"
        message={`¿Eliminar "${deleting?.name}"? Si hay usuarios con este Role asignado, primero tenés que reasignarlos.`}
        confirmLabel="Sí, eliminar"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />

      <Snackbar
        visible={!!snack} onDismiss={() => setSnack(null)} duration={3200}
        style={snack?.error ? styles.snackErr : styles.snackOk}
      >
        {snack?.msg ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg }, flex: { flex: 1 },

  head: { paddingHorizontal: SPACE.s5, paddingTop: SPACE.s5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3 },
  h1: { marginRight: 'auto' },
  newBtn: { borderRadius: RADIUS.r2 },
  newLbl: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any },
  intro: { maxWidth: 620, marginTop: SPACE.s3, paddingBottom: SPACE.s5 },

  loader: { marginTop: SPACE.s7 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOR.surface, borderTopWidth: 1, borderTopColor: COLOR.border, paddingVertical: SPACE.s7, paddingHorizontal: SPACE.s5 },
  emptyTxt: { lineHeight: 24, marginTop: SPACE.s3 },

  // tabla desktop
  table: { flex: 1, borderTopWidth: 1, borderTopColor: COLOR.border },
  thead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingVertical: SPACE.s3, paddingHorizontal: SPACE.s5, backgroundColor: COLOR.surface2, borderBottomWidth: 2, borderBottomColor: COLOR.border },
  th: { letterSpacing: 0.8, textTransform: 'uppercase' },
  thCenter: { textAlign: 'center' }, thRight: { textAlign: 'right' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, minHeight: 56, paddingVertical: SPACE.s3, paddingHorizontal: SPACE.s5, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  colName: { flex: 1.5 }, colLevel: { flex: 0.6 }, colManage: { flex: 1.1 }, colMods: { flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: SPACE.s2 }, colActions: { flex: 0.8 },
  cellName: { fontWeight: FONT_WEIGHT.bold as any },

  lvlBadge: { width: 26, height: 26, borderRadius: RADIUS.full, backgroundColor: COLOR.surface2, borderWidth: 1, borderColor: COLOR.border, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },

  pill: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, alignSelf: 'flex-start', height: 24, paddingHorizontal: SPACE.s3, borderRadius: RADIUS.full },
  pillYes: { backgroundColor: COLOR.incomeTint }, pillNo: { backgroundColor: COLOR.surface2 },
  pillTxt: { fontWeight: FONT_WEIGHT.bold as any },

  bar: { flex: 1, maxWidth: 72, height: 6, borderRadius: RADIUS.full, backgroundColor: COLOR.surface2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLOR.ink2, borderRadius: RADIUS.full },

  acts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE.s2 },
  iconBtn: { width: 36, height: 36, borderRadius: RADIUS.r1, justifyContent: 'center', alignItems: 'center' },

  // cards mobile
  cards: { padding: SPACE.s4, gap: SPACE.s3 },
  card: { backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border, borderRadius: RADIUS.r3, padding: SPACE.s4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2 },
  cardName: { flex: 1 },

  // modal
  ov: { flex: 1, backgroundColor: COLOR.overlay, justifyContent: 'center' },
  ovScroll: { flexGrow: 1, justifyContent: 'center', padding: SPACE.s4 },
  modal: { width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, ...SHADOW.md },
  modalTitle: { marginBottom: 0 },
  sep: { height: 1, backgroundColor: COLOR.border, marginVertical: SPACE.s4 },

  input: { backgroundColor: COLOR.surface },
  inputSpaced: { backgroundColor: COLOR.surface, marginTop: SPACE.s4 },
  help: { lineHeight: 17, marginTop: SPACE.s2 },

  swBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s3, backgroundColor: COLOR.surface2, borderRadius: RADIUS.r2, paddingVertical: SPACE.s3, paddingHorizontal: SPACE.s4, marginTop: SPACE.s4 },
  swTitle: { fontWeight: FONT_WEIGHT.semibold as any },
  swDesc: { lineHeight: 16, marginTop: 3 },

  fieldLbl: { marginTop: SPACE.s4, marginBottom: SPACE.s2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2 },
  chip: { borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.bg, borderRadius: RADIUS.full, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s2 },
  chipOn: { borderWidth: 1.5, borderColor: COLOR.brand, backgroundColor: COLOR.brandTint },
  chipTxtOn: { fontWeight: FONT_WEIGHT.bold as any },

  footer: { flexDirection: 'row', gap: SPACE.s2, marginTop: SPACE.s5 },
  fBtn: { flex: 1, borderRadius: RADIUS.r2 },
  fBtnContent: { height: CONTROL.buttonH },

  snackOk: { backgroundColor: COLOR.income },
  snackErr: { backgroundColor: COLOR.expense },
});
