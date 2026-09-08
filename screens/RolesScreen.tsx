import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, useWindowDimensions, Switch,
} from 'react-native';
import { Button, TextInput, Snackbar, IconButton } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import ConfirmDialog from '../components/ConfirmDialog';
import AppText from '../components/ui/AppText';
import { MODULES } from '../constants/permissionModules';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, BREAKPOINT } from '../theme';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Role {
  id: number;
  name: string;
  level: number;
  canManageUsers: boolean;
  permissions: string[];
  createdAt: string;
}

interface RoleForm {
  name: string;
  level: string;
  canManageUsers: boolean;
  permissions: string[];
}

const EMPTY_FORM: RoleForm = { name: '', level: '1', canManageUsers: false, permissions: [] };

// ─── RolesScreen (solo root, SPRINT-14) ────────────────────────────────────────

export default function RolesScreen() {
  const API = REACT_APP_API_URL;
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;

  const [rolesList, setRolesList] = useState<Role[]>([]);
  const [loading, setLoading]     = useState(false);
  const [snackbar, setSnackbar]   = useState('');

  // Modal crear/editar
  const [formModal, setFormModal] = useState<'create' | Role | null>(null);
  const [form, setForm]           = useState<RoleForm>(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const [confirmDlg, setConfirmDlg] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const askConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmDlg({ title, message, onConfirm });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get<Role[]>(`${API}/api/v2/roles`);
      setRolesList(res.data);
    } catch {
      setSnackbar('Error al cargar Roles');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Crear / Editar ─────────────────────────────────────────────────────────

  const openCreate = () => { setForm(EMPTY_FORM); setFormModal('create'); };
  const openEdit = (role: Role) => {
    setForm({
      name: role.name,
      level: String(role.level),
      canManageUsers: role.canManageUsers,
      permissions: role.permissions,
    });
    setFormModal(role);
  };

  const handleSave = async () => {
    const level = Number(form.level);
    if (!form.name.trim() || !level || level < 1) {
      setSnackbar('Completá el nombre y un nivel válido (mayor a 0)'); return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      level,
      canManageUsers: form.canManageUsers,
      permissions: form.permissions,
    };
    try {
      if (formModal === 'create') {
        await axios.post(`${API}/api/v2/roles`, body);
        setSnackbar('Role creado correctamente');
      } else if (formModal) {
        await axios.put(`${API}/api/v2/roles/${formModal.id}`, body);
        setSnackbar('Role actualizado correctamente');
      }
      setFormModal(null);
      loadAll();
    } catch (e: any) {
      setSnackbar(e.response?.data?.error || 'Error al guardar el Role');
    } finally { setSaving(false); }
  };

  // ── Eliminar ───────────────────────────────────────────────────────────────

  const handleDelete = (role: Role) => {
    askConfirm(
      'Eliminar Role',
      `¿Eliminar "${role.name}"? Si hay usuarios con este Role asignado, primero tenés que reasignarlos.`,
      async () => {
        try {
          await axios.delete(`${API}/api/v2/roles/${role.id}`);
          setSnackbar('Role eliminado');
          loadAll();
        } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al eliminar'); }
        finally { setConfirmDlg(null); }
      }
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons name="badge-account-outline" size={22} color={COLOR.ink} />
          <AppText variant="title">Roles</AppText>
        </View>
        <Button mode="contained" onPress={openCreate} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ borderRadius: 10 }}>
          + Nuevo Role
        </Button>
      </View>

      <AppText variant="description" style={styles.introNote}>
        Definí acá los perfiles de tu equipo — nombre, nivel jerárquico y qué módulos puede usar cada uno.
        Después, en "Usuarios", le asignás un Role y los locales donde va a trabajar cada persona.
      </AppText>

      {loading ? (
        <ActivityIndicator size="large" color={COLOR.brand} style={{ marginTop: 40 }} />
      ) : rolesList.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="badge-account-outline" size={48} color={COLOR.inkDisabled} />
          <AppText variant="title">Todavía no creaste ningún Role.</AppText>
          <AppText variant="description">Creá el primero con el botón de arriba.</AppText>
        </View>
      ) : (
        <ScrollView>
          {isDesktop && (
            <View style={[styles.row, styles.rowHeader]}>
              <Text style={[styles.cell, styles.cellName, styles.colHeader]}>Nombre</Text>
              <Text style={[styles.cell, styles.cellLevel, styles.colHeader]}>Nivel</Text>
              <Text style={[styles.cell, styles.cellManage, styles.colHeader]}>Gestiona usuarios</Text>
              <Text style={[styles.cell, styles.cellModules, styles.colHeader]}>Módulos</Text>
              <Text style={[styles.cell, styles.cellActions, styles.colHeader]}>Acciones</Text>
            </View>
          )}

          {rolesList.map(role => (
            <View key={role.id} style={styles.row}>
              <View style={[styles.cell, styles.cellName]}>
                <Text style={styles.roleName}>{role.name}</Text>
                {!isDesktop && (
                  <Text style={styles.roleMeta}>
                    Nivel {role.level} · {role.canManageUsers ? 'Gestiona usuarios' : 'No gestiona usuarios'} · {role.permissions.length} módulos
                  </Text>
                )}
              </View>

              {isDesktop && <Text style={[styles.cell, styles.cellLevel, styles.metaText]}>{role.level}</Text>}

              {isDesktop && (
                <View style={[styles.cell, styles.cellManage]}>
                  <View style={[styles.badge, { backgroundColor: (role.canManageUsers ? COLOR.income : COLOR.inkDisabled) + '18', borderColor: (role.canManageUsers ? COLOR.income : COLOR.inkDisabled) + '44' }]}>
                    <Text style={[styles.badgeText, { color: role.canManageUsers ? COLOR.income : COLOR.inkMute }]}>
                      {role.canManageUsers ? 'Sí' : 'No'}
                    </Text>
                  </View>
                </View>
              )}

              {isDesktop && <Text style={[styles.cell, styles.cellModules, styles.metaText]}>{role.permissions.length} de {MODULES.length}</Text>}

              <View style={[styles.cell, styles.cellActions]}>
                <IconButton icon="pencil" size={20} iconColor={COLOR.info} onPress={() => openEdit(role)} style={{ margin: 0 }} />
                <IconButton icon="delete" size={20} iconColor={COLOR.expense} onPress={() => handleDelete(role)} style={{ margin: 0 }} />
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Modal crear/editar Role ── */}
      <Modal visible={!!formModal} transparent animationType="fade" onRequestClose={() => setFormModal(null)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <View style={[styles.modal, { width: '100%', maxWidth: 440 }]}>
              <AppText style={styles.modalTitle} variant="title">
                {formModal === 'create' ? 'Nuevo Role' : 'Editar Role'}
              </AppText>

              <TextInput
                label="Nombre *" value={form.name}
                onChangeText={v => setForm({ ...form, name: v })}
                mode="outlined" style={styles.input}
                placeholder="Ej. Encargado de Sucursal, Cajero, Contador"
              />

              <TextInput
                label="Nivel jerárquico *" value={form.level}
                onChangeText={v => setForm({ ...form, level: v.replace(/[^0-9]/g, '') })}
                mode="outlined" style={styles.input}
                keyboardType="numeric"
              />
              <AppText variant="caption" style={styles.helperText}>
                Un Role solo puede crear/gestionar usuarios de Roles con nivel mayor al suyo (nunca su propio nivel ni uno menor). Root es siempre nivel 0, no aparece acá.
              </AppText>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">Puede gestionar usuarios</AppText>
                  <AppText variant="caption">Crear, suspender, eliminar usuarios de Roles con nivel mayor</AppText>
                </View>
                <Switch
                  value={form.canManageUsers}
                  onValueChange={v => setForm({ ...form, canManageUsers: v })}
                  trackColor={{ false: COLOR.border2, true: COLOR.brandTint2 }}
                  thumbColor={form.canManageUsers ? COLOR.brand : undefined}
                />
              </View>

              <AppText style={styles.fieldLabel} variant="label">Módulos habilitados</AppText>
              <View style={styles.moduleSelector}>
                {/* CATALOG no tiene chip propio: InventoryScreen es una única pantalla
                    que necesita INVENTORY (stock) y CATALOG (categorías/productos) juntos
                    -- no hay forma de usar una sin la otra hoy. Marcar "Inventario" habilita
                    ambos módulos en el backend para evitar Roles a medio andar (categorías
                    tirando 403 aunque el stock cargue bien). */}
                {MODULES.filter(m => m.value !== 'CATALOG').map(m => {
                  const active = form.permissions.includes(m.value);
                  const linked = m.value === 'INVENTORY' ? ['INVENTORY', 'CATALOG'] : [m.value];
                  return (
                    <TouchableOpacity
                      key={m.value}
                      style={[styles.moduleChip, active && styles.moduleChipActive]}
                      onPress={() => setForm({
                        ...form,
                        permissions: active
                          ? form.permissions.filter(p => !linked.includes(p))
                          : [...new Set([...form.permissions, ...linked])],
                      })}
                    >
                      <Text style={[styles.moduleChipText, active && styles.moduleChipTextActive]}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => setFormModal(null)} style={{ flex: 1 }}>Cancelar</Button>
                <Button mode="contained" onPress={handleSave} loading={saving} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!confirmDlg}
        title={confirmDlg?.title ?? ''}
        message={confirmDlg?.message ?? ''}
        confirmLabel="Sí, eliminar"
        onConfirm={() => confirmDlg?.onConfirm()}
        onCancel={() => setConfirmDlg(null)}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={3000}>{snackbar}</Snackbar>
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: COLOR.bg },

  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.s2, padding: SPACE.s4, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2 },
  introNote:      { paddingHorizontal: SPACE.s4, paddingTop: SPACE.s3 },

  empty:          { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACE.s2, padding: SPACE.s8 },

  rowHeader:      { backgroundColor: COLOR.surface2, borderBottomWidth: 2, borderBottomColor: COLOR.border },
  row:            { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border, paddingHorizontal: SPACE.s1, minHeight: 56 },
  cell:           { paddingHorizontal: SPACE.s2, paddingVertical: SPACE.s2 },
  cellName:       { flex: 1 },
  cellLevel:      { width: 70 },
  cellManage:     { width: 150 },
  cellModules:    { width: 110 },
  cellActions:    { flexDirection: 'row', alignItems: 'center', width: 100 },
  colHeader:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.inkMute } as any,

  roleName:       { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  roleMeta:       { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any, marginTop: 2 },
  metaText:       { fontSize: FONT_SIZE.label, color: COLOR.ink2, fontWeight: FONT_WEIGHT.medium as any },

  badge:          { borderRadius: RADIUS.r1, paddingHorizontal: SPACE.s2, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  badgeText:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any },

  overlay:        { flex: 1, backgroundColor: COLOR.overlay, justifyContent: 'center', alignItems: 'center' },
  modal:          { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, width: '92%', maxWidth: 440, gap: SPACE.s1 },
  modalTitle:     { marginBottom: SPACE.s1 },
  modalActions:   { flexDirection: 'row', gap: SPACE.s2, marginTop: SPACE.s3 },
  input:          { marginBottom: SPACE.s2 },
  fieldLabel:     { marginBottom: SPACE.s2, marginTop: SPACE.s1 },
  helperText:     { marginTop: -SPACE.s1, marginBottom: SPACE.s2 },

  switchRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, paddingVertical: SPACE.s2, marginBottom: SPACE.s1 },

  moduleSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2, marginBottom: SPACE.s3 },
  moduleChip:      { paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s2, borderRadius: RADIUS.full, backgroundColor: COLOR.bg, borderWidth: 1, borderColor: COLOR.border },
  moduleChipActive:{ backgroundColor: COLOR.brand, borderColor: COLOR.brandDark },
  moduleChipText:  { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
  moduleChipTextActive: { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },
});
