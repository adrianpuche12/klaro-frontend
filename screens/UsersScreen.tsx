import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, useWindowDimensions,
} from 'react-native';
import { Button, TextInput, Snackbar, IconButton } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AppText from '../components/ui/AppText';
import { MODULES } from '../constants/permissionModules';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW, BREAKPOINT } from '../theme';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Store { id: number; name: string; active: boolean; }

interface RoleOption { id: number; name: string; level: number; canManageUsers: boolean; permissions: string[]; }

interface AppUser {
  id: number;
  fullName: string;
  username: string;
  status: string;
  storeId?: number;
  storeName?: string;
  roleId?: number;
  roleName?: string;
  accessibleStoreIds?: number[];
  createdAt: string;
}

interface UserForm {
  fullName: string;
  username: string;
  password: string;
  storeId: string;
  /** Role de la app (SPRINT-14) -- reemplaza el toggle user/admin de Keycloak
   * (que ahora es siempre "staff") y el businessRole libre de SPRINT-09. */
  roleId: string;
  storeIds: string[];
}

const EMPTY_FORM: UserForm = {
  fullName: '', username: '', password: '', storeId: '',
  roleId: '', storeIds: [],
};

const statusLabel = (s: string) => s === 'ACTIVE' ? 'Activo' : s === 'SUSPENDED' ? 'Suspendido' : 'Eliminado';
const statusColor = (s: string) => s === 'ACTIVE' ? COLOR.income : s === 'SUSPENDED' ? COLOR.expense : COLOR.inkDisabled;

// ─── UsersScreen ──────────────────────────────────────────────────────────────

export default function UsersScreen() {
  const API = REACT_APP_API_URL;
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;
  const { roles } = useAuth();
  const isRoot = roles.includes('root');

  const [users, setUsers]           = useState<AppUser[]>([]);
  const [stores, setStores]         = useState<Store[]>([]);
  const [rolesList, setRolesList]   = useState<RoleOption[]>([]);
  const [loading, setLoading]       = useState(false);
  const [snackbar, setSnackbar]     = useState('');

  // Modal crear usuario
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm]               = useState<UserForm>(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Modal reasignar local
  const [reassignModal, setReassignModal]   = useState<AppUser | null>(null);
  const [reassignStoreId, setReassignStoreId] = useState('');
  const [reassigning, setReassigning]       = useState(false);

  // Modal reset password
  const [resetModal, setResetModal]   = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting]     = useState(false);
  const [showNewPwd, setShowNewPwd]   = useState(false);

  // Modal cambiar Role + locales accesibles (SPRINT-14)
  const [accessModal, setAccessModal]       = useState<AppUser | null>(null);
  const [accessRoleId, setAccessRoleId]     = useState('');
  const [accessStoreIds, setAccessStoreIds] = useState<string[]>([]);
  const [savingAccess, setSavingAccess]     = useState(false);

  // ConfirmDialog
  const [confirmDlg, setConfirmDlg] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const askConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmDlg({ title, message, onConfirm });

  // ── Cargar datos ───────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    // Carga independiente: si una falla, las demás igual cargan para el formulario
    const [usersRes, storesRes, rolesRes] = await Promise.allSettled([
      axios.get<AppUser[]>(`${API}/api/v2/users`),
      axios.get<Store[]>(`${API}/api/v2/stores/active`),
      axios.get<RoleOption[]>(`${API}/api/v2/roles`),
    ]);
    if (usersRes.status === 'fulfilled')  setUsers(usersRes.value.data);
    else setSnackbar('Error al cargar usuarios');
    if (storesRes.status === 'fulfilled') setStores(storesRes.value.data);
    else setSnackbar('Error al cargar locales');
    if (rolesRes.status === 'fulfilled')  setRolesList(rolesRes.value.data);
    // Si roles falla, no bloqueamos la pantalla -- el picker queda vacío
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Crear usuario ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    // storeId (local principal) ya no es obligatorio — un perfil de solo lectura
    // (contador, socio) puede no tener local principal fijo, ver storeIds.
    if (!form.fullName.trim() || !form.username.trim() || !form.password) {
      setSnackbar('Completá todos los campos'); return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/api/v2/users`, {
        fullName: form.fullName.trim(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        storeId:  form.storeId ? Number(form.storeId) : null,
        roleId:   form.roleId ? Number(form.roleId) : null,
        storeIds: form.storeIds.map(Number),
      });
      setSnackbar('Usuario creado correctamente');
      setCreateModal(false);
      setForm(EMPTY_FORM);
      loadAll();
    } catch (e: any) {
      setSnackbar(e.response?.data?.error || 'Error al crear usuario');
    } finally { setSaving(false); }
  };

  // ── Suspender / Activar ────────────────────────────────────────────────────

  const handleSuspend = (user: AppUser) => {
    askConfirm(
      'Suspender usuario',
      `¿Suspender a "${user.fullName}"? No podrá iniciar sesión hasta que se reactive.`,
      async () => {
        try {
          await axios.put(`${API}/api/v2/users/${user.id}/suspend`);
          setSnackbar(`${user.fullName} suspendido`);
          loadAll();
        } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error'); }
        finally { setConfirmDlg(null); }
      }
    );
  };

  const handleActivate = (user: AppUser) => {
    askConfirm(
      'Activar usuario',
      `¿Reactivar el acceso de "${user.fullName}"?`,
      async () => {
        try {
          await axios.put(`${API}/api/v2/users/${user.id}/activate`);
          setSnackbar(`${user.fullName} activado`);
          loadAll();
        } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error'); }
        finally { setConfirmDlg(null); }
      }
    );
  };

  // ── Reasignar local ────────────────────────────────────────────────────────

  const handleReassign = async () => {
    if (!reassignModal || !reassignStoreId) { setSnackbar('Seleccioná un local'); return; }
    setReassigning(true);
    try {
      await axios.put(`${API}/api/v2/users/${reassignModal.id}/reassign`, { storeId: Number(reassignStoreId) });
      setSnackbar('Local reasignado correctamente');
      setReassignModal(null);
      setReassignStoreId('');
      loadAll();
    } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error'); }
    finally { setReassigning(false); }
  };

  // ── Reset password ─────────────────────────────────────────────────────────

  const handleResetPassword = async () => {
    if (!resetModal || !newPassword) { setSnackbar('Ingresá la nueva contraseña'); return; }
    setResetting(true);
    try {
      await axios.put(`${API}/api/v2/users/${resetModal.id}/reset-password`, { password: newPassword });
      setSnackbar('Contraseña actualizada correctamente');
      setResetModal(null);
      setNewPassword('');
    } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error'); }
    finally { setResetting(false); }
  };

  // ── Cambiar Role + locales accesibles (SPRINT-14) ────────────────────────

  const openAccess = (user: AppUser) => {
    setAccessModal(user);
    setAccessRoleId(user.roleId ? String(user.roleId) : '');
    setAccessStoreIds((user.accessibleStoreIds ?? []).map(String));
  };

  const handleSaveAccess = async () => {
    if (!accessModal) return;
    setSavingAccess(true);
    try {
      await axios.put(`${API}/api/v2/users/${accessModal.id}/role`, {
        roleId: accessRoleId ? Number(accessRoleId) : null,
      });
      await axios.put(`${API}/api/v2/users/${accessModal.id}/store-access`, {
        storeIds: accessStoreIds.map(Number),
      });
      setSnackbar('Permisos actualizados correctamente');
      setAccessModal(null);
      loadAll();
    } catch (e: any) {
      setSnackbar(e.response?.data?.error || 'Error al actualizar permisos');
    } finally { setSavingAccess(false); }
  };

  // ── Eliminar ───────────────────────────────────────────────────────────────

  const handleDelete = (user: AppUser) => {
    askConfirm(
      'Eliminar usuario',
      `¿Eliminar a "${user.fullName}"? No podrá volver a iniciar sesión.`,
      async () => {
        try {
          await axios.delete(`${API}/api/v2/users/${user.id}`);
          setSnackbar('Usuario eliminado');
          loadAll();
        } catch (e: any) { setSnackbar(e.response?.data?.error || 'Error al eliminar'); }
        finally { setConfirmDlg(null); }
      }
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons name="account-multiple-outline" size={22} color={COLOR.ink} />
          <AppText variant="title">Usuarios</AppText>
        </View>
        <Button mode="contained" onPress={() => setCreateModal(true)} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ borderRadius: 10 }}>
          + Nuevo usuario
        </Button>
      </View>

      {/* Tabla */}
      {loading ? (
        <ActivityIndicator size="large" color={COLOR.brand} style={{ marginTop: 40 }} />
      ) : users.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="account-outline" size={48} color={COLOR.inkDisabled} />
          <AppText variant="title">No hay usuarios creados aún.</AppText>
          <AppText variant="description">Creá el primer usuario con el botón de arriba.</AppText>
        </View>
      ) : (
        <ScrollView>
          {/* Header tabla */}
          {isDesktop && (
            <View style={[styles.row, styles.rowHeader]}>
              <Text style={[styles.cell, styles.cellName, styles.colHeader]}>Nombre</Text>
              <Text style={[styles.cell, styles.cellUser, styles.colHeader]}>Usuario</Text>
              <Text style={[styles.cell, styles.cellStore, styles.colHeader]}>Local</Text>
              <Text style={[styles.cell, styles.cellRole, styles.colHeader]}>Role</Text>
              <Text style={[styles.cell, styles.cellStatus, styles.colHeader]}>Estado</Text>
              <Text style={[styles.cell, styles.cellActions, styles.colHeader]}>Acciones</Text>
            </View>
          )}

          {users.map(user => (
            <View key={user.id} style={[styles.row, user.status !== 'ACTIVE' && styles.rowSuspended]}>
              {/* Nombre */}
              <View style={[styles.cell, styles.cellName]}>
                <Text style={styles.userName}>{user.fullName}</Text>
                {!isDesktop && <Text style={styles.userMeta}>@{user.username} · {user.storeName || user.roleName || 'Sin local principal'}</Text>}
              </View>

              {/* Usuario (solo desktop) */}
              {isDesktop && <Text style={[styles.cell, styles.cellUser, styles.metaText]}>@{user.username}</Text>}

              {/* Local (solo desktop) */}
              {isDesktop && <Text style={[styles.cell, styles.cellStore, styles.metaText]}>{user.storeName || '—'}</Text>}

              {/* Role (solo desktop) */}
              {isDesktop && <Text style={[styles.cell, styles.cellRole, styles.metaText]}>{user.roleName || '—'}</Text>}

              {/* Estado */}
              <View style={[styles.cell, styles.cellStatus]}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(user.status) + '18', borderColor: statusColor(user.status) + '44' }]}>
                  <Text style={[styles.statusText, { color: statusColor(user.status) }]}>
                    {statusLabel(user.status)}
                  </Text>
                </View>
              </View>

              {/* Acciones */}
              <View style={[styles.cell, styles.cellActions]}>
                {user.status === 'ACTIVE'
                  ? <IconButton icon="pause-circle" size={20} iconColor={COLOR.warn} onPress={() => handleSuspend(user)} style={{ margin: 0 }} />
                  : user.status === 'SUSPENDED'
                  ? <IconButton icon="play-circle" size={20} iconColor={COLOR.income} onPress={() => handleActivate(user)} style={{ margin: 0 }} />
                  : null}
                <IconButton icon="store-edit" size={20} iconColor={COLOR.info} onPress={() => { setReassignModal(user); setReassignStoreId(user.storeId ? String(user.storeId) : ''); }} style={{ margin: 0 }} />
                <IconButton icon="shield-account" size={20} iconColor={COLOR.brand} onPress={() => openAccess(user)} style={{ margin: 0 }} />
                <IconButton icon="lock-reset" size={20} iconColor={COLOR.ink2} onPress={() => { setResetModal(user); setNewPassword(''); }} style={{ margin: 0 }} />
                {user.status !== 'DELETED' && (
                  <IconButton icon="delete" size={20} iconColor={COLOR.expense} onPress={() => handleDelete(user)} style={{ margin: 0 }} />
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Modal crear usuario ── */}
      <Modal visible={createModal} transparent animationType="fade" onRequestClose={() => setCreateModal(false)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <View style={[styles.modal, { width: '100%', maxWidth: 440 }]}>
              <AppText style={styles.modalTitle} variant="title">Nuevo usuario</AppText>

              <TextInput label="Nombre completo *" value={form.fullName} onChangeText={v => setForm({ ...form, fullName: v })} mode="outlined" style={styles.input} />
              <TextInput label="Username *" value={form.username} onChangeText={v => setForm({ ...form, username: v.toLowerCase().replace(/\s+/g, '.') })} mode="outlined" style={styles.input} autoCapitalize="none" />
              <TextInput
                label="Contraseña *" value={form.password}
                onChangeText={v => setForm({ ...form, password: v })}
                mode="outlined" style={styles.input}
                secureTextEntry={!showPassword}
                right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(v => !v)} />}
              />

              {/* Selector de local principal — opcional desde SPRINT-09 (un perfil
                  de solo lectura como contador/socio puede no tener uno fijo) */}
              <AppText style={styles.fieldLabel} variant="label">Local principal</AppText>
              <View style={styles.storeSelector}>
                {stores.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.storeChip, form.storeId === String(s.id) && styles.storeChipActive]}
                    onPress={() => setForm({ ...form, storeId: form.storeId === String(s.id) ? '' : String(s.id) })}
                  >
                    <Text style={[styles.storeChipText, form.storeId === String(s.id) && styles.storeChipTextActive]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Role (SPRINT-14) — root define los Roles disponibles y sus módulos
                  desde la pantalla de Roles; acá solo se elige cuál asignar. */}
              <AppText style={styles.fieldLabel} variant="label">Role (opcional)</AppText>
              <View style={styles.storeSelector}>
                {rolesList.length === 0 && (
                  <AppText variant="caption">Todavía no hay Roles creados — pedile a root que cree uno.</AppText>
                )}
                {rolesList.map(r => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.storeChip, form.roleId === String(r.id) && styles.storeChipActive]}
                    onPress={() => setForm({ ...form, roleId: form.roleId === String(r.id) ? '' : String(r.id) })}
                  >
                    <Text style={[styles.storeChipText, form.roleId === String(r.id) && styles.storeChipTextActive]}>
                      {r.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <AppText style={styles.fieldLabel} variant="label">Locales accesibles (opcional)</AppText>
              <View style={styles.storeSelector}>
                {stores.map(s => {
                  const active = form.storeIds.includes(String(s.id));
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.storeChip, active && styles.storeChipActive]}
                      onPress={() => setForm({
                        ...form,
                        storeIds: active
                          ? form.storeIds.filter(id => id !== String(s.id))
                          : [...form.storeIds, String(s.id)],
                      })}
                    >
                      <Text style={[styles.storeChipText, active && styles.storeChipTextActive]}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {form.roleId ? (
                <AppText variant="caption" style={styles.roleNote}>
                  Si no marcás locales accesibles, este usuario no va a poder ver nada hasta que se los asignes desde la fila de la tabla.
                </AppText>
              ) : (
                <AppText variant="caption" style={styles.roleNote}>
                  Sin Role asignado, este usuario tiene acceso total (igual que las cuentas creadas antes de este sistema). Solo root puede crear así.
                </AppText>
              )}

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => { setCreateModal(false); setForm(EMPTY_FORM); }} style={{ flex: 1 }}>Cancelar</Button>
                <Button mode="contained" onPress={handleCreate} loading={saving} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Crear usuario</Button>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Modal reasignar local ── */}
      <Modal visible={!!reassignModal} transparent animationType="fade" onRequestClose={() => setReassignModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <AppText style={styles.modalTitle} variant="title">Reasignar local</AppText>
            <AppText style={styles.modalSub} variant="subtitle">{reassignModal?.fullName}</AppText>
            <AppText style={styles.fieldLabel} variant="label">Seleccioná el nuevo local:</AppText>
            <View style={styles.storeSelector}>
              {stores.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.storeChip, reassignStoreId === String(s.id) && styles.storeChipActive]}
                  onPress={() => setReassignStoreId(String(s.id))}
                >
                  <Text style={[styles.storeChipText, reassignStoreId === String(s.id) && styles.storeChipTextActive]}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setReassignModal(null)} style={{ flex: 1 }}>Cancelar</Button>
              <Button mode="contained" onPress={handleReassign} loading={reassigning} buttonColor={COLOR.info} textColor={COLOR.white} style={{ flex: 1 }}>Reasignar</Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal reset password ── */}
      <Modal visible={!!resetModal} transparent animationType="fade" onRequestClose={() => setResetModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <AppText style={styles.modalTitle} variant="title">Cambiar contraseña</AppText>
            <AppText style={styles.modalSub} variant="subtitle">{resetModal?.fullName} (@{resetModal?.username})</AppText>
            <TextInput
              label="Nueva contraseña *" value={newPassword}
              onChangeText={setNewPassword}
              mode="outlined" style={[styles.input, { marginTop: 12 }]}
              secureTextEntry={!showNewPwd}
              right={<TextInput.Icon icon={showNewPwd ? 'eye-off' : 'eye'} onPress={() => setShowNewPwd(v => !v)} />}
            />
            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setResetModal(null)} style={{ flex: 1 }}>Cancelar</Button>
              <Button mode="contained" onPress={handleResetPassword} loading={resetting} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal cambiar Role + locales accesibles (SPRINT-14) ── */}
      <Modal visible={!!accessModal} transparent animationType="fade" onRequestClose={() => setAccessModal(null)}>
        <View style={styles.overlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <View style={[styles.modal, { width: '100%', maxWidth: 440 }]}>
              <AppText style={styles.modalTitle} variant="title">Permisos de acceso</AppText>
              <AppText style={styles.modalSub} variant="subtitle">{accessModal?.fullName}</AppText>

              <AppText style={styles.fieldLabel} variant="label">Role</AppText>
              <View style={styles.storeSelector}>
                {rolesList.map(r => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.storeChip, accessRoleId === String(r.id) && styles.storeChipActive]}
                    onPress={() => setAccessRoleId(accessRoleId === String(r.id) ? '' : String(r.id))}
                  >
                    <Text style={[styles.storeChipText, accessRoleId === String(r.id) && styles.storeChipTextActive]}>{r.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <AppText style={styles.fieldLabel} variant="label">Locales accesibles</AppText>
              <View style={styles.storeSelector}>
                {stores.map(s => {
                  const active = accessStoreIds.includes(String(s.id));
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.storeChip, active && styles.storeChipActive]}
                      onPress={() => setAccessStoreIds(active
                        ? accessStoreIds.filter(id => id !== String(s.id))
                        : [...accessStoreIds, String(s.id)])}
                    >
                      <Text style={[styles.storeChipText, active && styles.storeChipTextActive]}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {accessRoleId && accessStoreIds.length === 0 && (
                <AppText variant="caption" style={styles.roleNote}>
                  Sin locales asignados, este usuario no va a poder ver ninguna pantalla restringida por local.
                </AppText>
              )}

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => setAccessModal(null)} style={{ flex: 1 }}>Cancelar</Button>
                <Button mode="contained" onPress={handleSaveAccess} loading={savingAccess} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!confirmDlg}
        title={confirmDlg?.title ?? ''}
        message={confirmDlg?.message ?? ''}
        confirmLabel="Sí, confirmar"
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

  empty:          { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACE.s2, padding: SPACE.s8 },

  rowHeader:      { backgroundColor: COLOR.surface2, borderBottomWidth: 2, borderBottomColor: COLOR.border },
  row:            { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border, paddingHorizontal: SPACE.s1, minHeight: 56 },
  rowSuspended:   { opacity: 0.6, backgroundColor: COLOR.bgAlt },
  cell:           { paddingHorizontal: SPACE.s2, paddingVertical: SPACE.s2 },
  cellName:       { flex: 1 },
  cellUser:       { width: 140 },
  cellStore:      { width: 110 },
  cellRole:       { width: 110 },
  cellStatus:     { width: 110 },
  cellActions:    { flexDirection: 'row', alignItems: 'center', width: 160 },
  colHeader:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.inkMute } as any,

  userName:       { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  userMeta:       { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any, marginTop: 2 },
  metaText:       { fontSize: FONT_SIZE.label, color: COLOR.ink2, fontWeight: FONT_WEIGHT.medium as any },

  statusBadge:    { borderRadius: RADIUS.r1, paddingHorizontal: SPACE.s2, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  statusText:     { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any },

  overlay:        { flex: 1, backgroundColor: COLOR.overlay, justifyContent: 'center', alignItems: 'center' },
  modal:          { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, width: '92%', maxWidth: 440, gap: SPACE.s1 },
  modalTitle:     { marginBottom: SPACE.s1 },
  modalSub:       { marginBottom: SPACE.s2 },
  modalActions:   { flexDirection: 'row', gap: SPACE.s2, marginTop: SPACE.s3 },
  input:          { marginBottom: SPACE.s2 },
  fieldLabel:     { marginBottom: SPACE.s2, marginTop: SPACE.s1 },

  storeSelector:  { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2, marginBottom: SPACE.s3 },
  storeChip:      { paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s2, borderRadius: RADIUS.full, backgroundColor: COLOR.bg, borderWidth: 1, borderColor: COLOR.border },
  storeChipActive:{ backgroundColor: COLOR.brand, borderColor: COLOR.brandDark },
  storeChipText:  { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
  storeChipTextActive: { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },

  roleNote:       { backgroundColor: COLOR.bgAlt, borderRadius: RADIUS.r2, padding: SPACE.s2, marginBottom: SPACE.s1 },
});
