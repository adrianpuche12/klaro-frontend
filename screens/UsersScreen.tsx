import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, useWindowDimensions, KeyboardAvoidingView, Platform,
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
  /** US-04: confirmación de la contraseña (no se envía al backend). */
  password2: string;
  storeId: string;
  /** Role de la app (SPRINT-14) -- reemplaza el toggle user/admin de Keycloak
   * (que ahora es siempre "staff") y el businessRole libre de SPRINT-09. */
  roleId: string;
  storeIds: string[];
}

const EMPTY_FORM: UserForm = {
  fullName: '', username: '', password: '', password2: '', storeId: '',
  roleId: '', storeIds: [],
};

/**
 * US-04 (rev. 06): validación mínima de contraseña en el frontend. La política real la
 * aplica Keycloak al crear/resetear; esto solo evita las obvias ("1", "123") y los errores
 * de tipeo. Nunca se muestra ni se loguea la contraseña.
 */
const MIN_PASSWORD = 8;
const passwordProblem = (p: string, p2: string): string | null => {
  if (p.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
  if (p !== p2) return 'Las contraseñas no coinciden';
  return null;
};

/** Mensaje del backend si lo hay; 403 = la cascada de niveles lo rechazó; sin respuesta = conexión. */
const apiError = (e: any, fallback: string): string => {
  if (e?.response?.status === 403) return 'No tenés permiso para gestionar este usuario';
  return e?.response?.data?.error ?? (e?.response ? fallback : 'Sin conexión con el servidor');
};

/** US-01: sin Role asignado = acceso total (cuenta del dueño o legacy). Solo root la gestiona. */
const roleLabel = (u: AppUser) => u.roleName || 'Acceso total';

// US-06: un estado desconocido se muestra tal cual, no como "Eliminado".
const statusLabel = (s: string) =>
  s === 'ACTIVE' ? 'Activo' : s === 'SUSPENDED' ? 'Suspendido' : s === 'DELETED' ? 'Eliminado' : s;
const statusColor = (s: string) => s === 'ACTIVE' ? COLOR.income : s === 'SUSPENDED' ? COLOR.expense : COLOR.inkDisabled;

// ─── UsersScreen ──────────────────────────────────────────────────────────────

export default function UsersScreen() {
  const API = REACT_APP_API_URL;
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;
  const { roles, userName } = useAuth();
  const isRoot = roles.includes('root');

  const [users, setUsers]           = useState<AppUser[]>([]);
  const [stores, setStores]         = useState<Store[]>([]);
  const [rolesList, setRolesList]   = useState<RoleOption[]>([]);
  const [rolesError, setRolesError] = useState(false);
  const [loading, setLoading]       = useState(false);
  // US-13: un error de carga no es lo mismo que "no hay usuarios".
  const [usersError, setUsersError] = useState('');
  const [snackbar, setSnackbar]     = useState('');
  // US-07: búsqueda por nombre, usuario o local.
  const [query, setQuery]           = useState('');

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
  const [newPassword2, setNewPassword2] = useState('');
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
    setUsersError('');
    // Carga independiente: si una falla, las demás igual cargan para el formulario
    const [usersRes, storesRes, rolesRes] = await Promise.allSettled([
      axios.get<AppUser[]>(`${API}/api/v2/users`),
      axios.get<Store[]>(`${API}/api/v2/stores/active`),
      axios.get<RoleOption[]>(`${API}/api/v2/roles`),
    ]);
    if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data);
    else setUsersError(apiError(usersRes.reason, 'No se pudieron cargar los usuarios'));
    if (storesRes.status === 'fulfilled') setStores(storesRes.value.data);
    else setSnackbar('Error al cargar locales');
    if (rolesRes.status === 'fulfilled') { setRolesList(rolesRes.value.data); setRolesError(false); }
    else { setRolesList([]); setRolesError(true); }
    // Si roles falla, no bloqueamos la pantalla -- el picker queda vacío y,
    // para un no-root, las acciones quedan ocultas (ver canManage).
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── US-01: sobre quién puede actuar el usuario logueado ───────────────────
  //
  // Mismo criterio que el backend (RoleService.assertCanManage, cascada de SPRINT-14):
  //  - nadie actúa sobre sí mismo desde acá (ni suspenderse, ni borrarse, ni resetearse);
  //  - root actúa sobre cualquiera;
  //  - un no-root solo sobre usuarios cuyo Role tenga nivel estrictamente mayor al suyo.
  //    GET /api/v2/roles ya devuelve, para un no-root, SOLO esos Roles: si el Role del
  //    usuario está en la lista, es gestionable. Sin Role (acceso total) = solo root.
  // Si los Roles no cargaron, un no-root no ve acciones (falla cerrado).
  const manageableRoleIds = useMemo(() => new Set(rolesList.map(r => r.id)), [rolesList]);
  const isSelf = (u: AppUser) => !!userName && u.username.toLowerCase() === userName.toLowerCase();
  const canManage = (u: AppUser) => {
    if (isSelf(u)) return false;
    if (isRoot) return true;
    return u.roleId != null && manageableRoleIds.has(u.roleId);
  };

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.fullName.toLowerCase().includes(q)
      || u.username.toLowerCase().includes(q)
      || (u.storeName ?? '').toLowerCase().includes(q));
  }, [users, query]);

  const closeCreate = () => { setCreateModal(false); setForm(EMPTY_FORM); setShowPassword(false); };
  const closeReset  = () => { setResetModal(null); setNewPassword(''); setNewPassword2(''); setShowNewPwd(false); };

  // ── Crear usuario ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    // US-03 / G-01: un segundo toque mientras guarda no crea otro usuario.
    if (saving) return;
    // storeId (local principal) ya no es obligatorio — un perfil de solo lectura
    // (contador, socio) puede no tener local principal fijo, ver storeIds.
    if (!form.fullName.trim() || !form.username.trim() || !form.password) {
      setSnackbar('Completá todos los campos'); return;
    }
    const pwdProblem = passwordProblem(form.password, form.password2); // US-04
    if (pwdProblem) { setSnackbar(pwdProblem); return; }
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
      closeCreate();
      loadAll();
    } catch (e: any) {
      setSnackbar(apiError(e, 'Error al crear usuario'));
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
        } catch (e: any) { setSnackbar(apiError(e, 'No se pudo suspender el usuario')); }
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
        } catch (e: any) { setSnackbar(apiError(e, 'No se pudo activar el usuario')); }
      }
    );
  };

  // ── Reasignar local ────────────────────────────────────────────────────────

  const handleReassign = async () => {
    if (reassigning) return; // G-01
    if (!reassignModal || !reassignStoreId) { setSnackbar('Seleccioná un local'); return; }
    setReassigning(true);
    try {
      await axios.put(`${API}/api/v2/users/${reassignModal.id}/reassign`, { storeId: Number(reassignStoreId) });
      setSnackbar('Local reasignado correctamente');
      setReassignModal(null);
      setReassignStoreId('');
      loadAll();
    } catch (e: any) { setSnackbar(apiError(e, 'No se pudo reasignar el local')); }
    finally { setReassigning(false); }
  };

  // ── Reset password ─────────────────────────────────────────────────────────

  const handleResetPassword = async () => {
    if (resetting) return; // G-01
    if (!resetModal || !newPassword) { setSnackbar('Ingresá la nueva contraseña'); return; }
    const pwdProblem = passwordProblem(newPassword, newPassword2); // US-04
    if (pwdProblem) { setSnackbar(pwdProblem); return; }
    setResetting(true);
    try {
      await axios.put(`${API}/api/v2/users/${resetModal.id}/reset-password`, { password: newPassword });
      setSnackbar('Contraseña actualizada correctamente');
      closeReset();
    } catch (e: any) { setSnackbar(apiError(e, 'No se pudo cambiar la contraseña')); }
    finally { setResetting(false); }
  };

  // ── Cambiar Role + locales accesibles (SPRINT-14) ────────────────────────

  const openAccess = (user: AppUser) => {
    setAccessModal(user);
    setAccessRoleId(user.roleId ? String(user.roleId) : '');
    setAccessStoreIds((user.accessibleStoreIds ?? []).map(String));
  };

  const handleSaveAccess = async () => {
    if (!accessModal || savingAccess) return; // G-01
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
      setSnackbar(apiError(e, 'Error al actualizar permisos'));
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
        } catch (e: any) {
          // US-11: sugerir la alternativa en vez de un "Error" genérico.
          setSnackbar(apiError(e, 'No se pudo eliminar el usuario. Podés suspenderlo en su lugar.'));
        }
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

      {/* US-07: búsqueda */}
      {!loading && !usersError && users.length > 0 && (
        <View style={styles.searchWrap}>
          <TextInput
            mode="outlined"
            dense
            placeholder="Buscar por nombre, usuario o local"
            value={query}
            onChangeText={setQuery}
            left={<TextInput.Icon icon="magnify" />}
            right={query ? <TextInput.Icon icon="close" onPress={() => setQuery('')} accessibilityLabel="Borrar búsqueda" /> : undefined}
            style={styles.searchInput}
            autoCapitalize="none"
          />
        </View>
      )}
      {!isRoot && rolesError && !usersError && (
        <AppText variant="caption" style={styles.rolesWarn}>
          No se pudieron cargar los Roles: las acciones sobre los usuarios quedan ocultas hasta que se recargue.
        </AppText>
      )}

      {/* Tabla */}
      {loading ? (
        <ActivityIndicator size="large" color={COLOR.brand} style={{ marginTop: 40 }} />
      ) : usersError ? (
        // US-13: error de carga con reintento, no el estado vacío.
        <View style={styles.empty}>
          <MaterialCommunityIcons name="cloud-off-outline" size={48} color={COLOR.inkDisabled} />
          <AppText variant="title">No se pudieron cargar los usuarios</AppText>
          <AppText variant="description">{usersError}</AppText>
          <Button mode="contained" onPress={loadAll} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand}>Reintentar</Button>
        </View>
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

          {visibleUsers.length === 0 && (
            <Text style={styles.noResults}>Ningún usuario coincide con "{query.trim()}".</Text>
          )}

          {visibleUsers.map(user => {
            const self = isSelf(user);
            const manageable = canManage(user);
            return (
            <View key={user.id} style={[styles.row, !isDesktop && styles.rowMobile, user.status !== 'ACTIVE' && styles.rowSuspended]}>
              {/* Nombre */}
              <View style={[styles.cell, styles.cellName]}>
                <Text style={styles.userName}>
                  {user.fullName}
                  {self && <Text style={styles.selfTag}> (vos)</Text>}
                </Text>
                {/* US-01: en celular también se ve el Role (antes solo si no tenía local). */}
                {!isDesktop && (
                  <Text style={styles.userMeta}>
                    @{user.username} · {user.storeName || 'Sin local principal'} · {roleLabel(user)}
                  </Text>
                )}
              </View>

              {/* Usuario (solo desktop) */}
              {isDesktop && <Text style={[styles.cell, styles.cellUser, styles.metaText]}>@{user.username}</Text>}

              {/* Local (solo desktop) */}
              {isDesktop && <Text style={[styles.cell, styles.cellStore, styles.metaText]}>{user.storeName || '—'}</Text>}

              {/* Role (solo desktop) */}
              {isDesktop && <Text style={[styles.cell, styles.cellRole, styles.metaText]}>{roleLabel(user)}</Text>}

              {/* Estado */}
              <View style={[styles.cell, styles.cellStatus]}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(user.status) + '18', borderColor: statusColor(user.status) + '44' }]}>
                  <Text style={[styles.statusText, { color: statusColor(user.status) }]}>
                    {statusLabel(user.status)}
                  </Text>
                </View>
              </View>

              {/* Acciones — US-01: solo sobre usuarios que el logueado puede gestionar.
                  US-08: en celular van en una segunda línea para no apretar el nombre. */}
              {manageable ? (
                <View style={[styles.cell, isDesktop ? styles.cellActions : styles.cellActionsMobile]}>
                  {user.status === 'ACTIVE'
                    ? <IconButton icon="pause-circle" size={20} iconColor={COLOR.warn} onPress={() => handleSuspend(user)} style={{ margin: 0 }} accessibilityLabel={`Suspender a ${user.fullName}`} />
                    : user.status === 'SUSPENDED'
                    ? <IconButton icon="play-circle" size={20} iconColor={COLOR.income} onPress={() => handleActivate(user)} style={{ margin: 0 }} accessibilityLabel={`Activar a ${user.fullName}`} />
                    : null}
                  <IconButton icon="store-edit" size={20} iconColor={COLOR.info} onPress={() => { setReassignModal(user); setReassignStoreId(user.storeId ? String(user.storeId) : ''); }} style={{ margin: 0 }} accessibilityLabel={`Cambiar local de ${user.fullName}`} />
                  <IconButton icon="shield-account" size={20} iconColor={COLOR.brand} onPress={() => openAccess(user)} style={{ margin: 0 }} accessibilityLabel={`Permisos de ${user.fullName}`} />
                  <IconButton icon="lock-reset" size={20} iconColor={COLOR.ink2} onPress={() => { setResetModal(user); setNewPassword(''); setNewPassword2(''); }} style={{ margin: 0 }} accessibilityLabel={`Cambiar contraseña de ${user.fullName}`} />
                  {user.status !== 'DELETED' && (
                    <IconButton icon="delete" size={20} iconColor={COLOR.expense} onPress={() => handleDelete(user)} style={{ margin: 0 }} accessibilityLabel={`Eliminar a ${user.fullName}`} />
                  )}
                </View>
              ) : isDesktop ? (
                <Text style={[styles.cell, styles.cellActions, styles.metaText]}>—</Text>
              ) : null}
            </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Modal crear usuario ── */}
      <Modal visible={createModal} transparent animationType="fade" onRequestClose={() => { if (!saving) closeCreate(); }}>
        {/* G-04: el teclado no tapa la contraseña en el celular. */}
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }} keyboardShouldPersistTaps="handled">
            <View style={[styles.modal, { width: '100%', maxWidth: 440 }]}>
              <AppText style={styles.modalTitle} variant="title">Nuevo usuario</AppText>

              <TextInput label="Nombre completo *" value={form.fullName} onChangeText={v => setForm({ ...form, fullName: v })} mode="outlined" style={styles.input} />
              {/* US-09: etiqueta en castellano. */}
              <TextInput label="Usuario (para iniciar sesión) *" value={form.username} onChangeText={v => setForm({ ...form, username: v.toLowerCase().replace(/\s+/g, '.') })} mode="outlined" style={styles.input} autoCapitalize="none" />
              <TextInput
                label="Contraseña *" value={form.password}
                onChangeText={v => setForm({ ...form, password: v })}
                mode="outlined" style={styles.input}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(v => !v)} />}
              />
              <TextInput
                label="Repetir contraseña *" value={form.password2}
                onChangeText={v => setForm({ ...form, password2: v })}
                mode="outlined" style={styles.input}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <AppText variant="caption" style={styles.pwdHint}>Mínimo {MIN_PASSWORD} caracteres.</AppText>

              {/* Selector de local principal — opcional desde SPRINT-09 (un perfil
                  de solo lectura como contador/socio puede no tener uno fijo) */}
              <AppText style={styles.fieldLabel} variant="label">Local principal</AppText>
              {stores.length === 0 && (
                // US-12: explicar por qué el selector está vacío.
                <AppText variant="caption" style={styles.roleNote}>No hay locales activos cargados. Podés crearlos desde Locales.</AppText>
              )}
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
                <Button mode="outlined" onPress={closeCreate} disabled={saving} style={{ flex: 1 }}>Cancelar</Button>
                {/* G-01 / US-03: loading no deshabilita en Paper; va junto a disabled. */}
                <Button mode="contained" onPress={handleCreate} loading={saving} disabled={saving} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Crear usuario</Button>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal reasignar local ── */}
      <Modal visible={!!reassignModal} transparent animationType="fade" onRequestClose={() => { if (!reassigning) setReassignModal(null); }}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <AppText style={styles.modalTitle} variant="title">Reasignar local</AppText>
            <AppText style={styles.modalSub} variant="subtitle">{reassignModal?.fullName}</AppText>
            {/* US-05: el backend hoy no lo impide (ver reporte); avisar antes de mover. */}
            <AppText variant="caption" style={styles.roleNote}>
              Si tiene un turno abierto, primero debe cerrarlo: el punto de venta cambia de local al reasignarlo.
            </AppText>
            <AppText style={styles.fieldLabel} variant="label">Seleccioná el nuevo local:</AppText>
            {stores.length === 0 && (
              <AppText variant="caption" style={styles.roleNote}>No hay locales activos cargados. Podés crearlos desde Locales.</AppText>
            )}
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
              <Button mode="outlined" onPress={() => setReassignModal(null)} disabled={reassigning} style={{ flex: 1 }}>Cancelar</Button>
              <Button mode="contained" onPress={handleReassign} loading={reassigning} disabled={reassigning || !reassignStoreId} buttonColor={COLOR.info} textColor={COLOR.white} style={{ flex: 1 }}>Reasignar</Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal reset password ── */}
      <Modal visible={!!resetModal} transparent animationType="fade" onRequestClose={() => { if (!resetting) closeReset(); }}>
        {/* G-04: el teclado no tapa los campos de contraseña. */}
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modal}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <AppText style={styles.modalTitle} variant="title">Cambiar contraseña</AppText>
              <AppText style={styles.modalSub} variant="subtitle">{resetModal?.fullName} (@{resetModal?.username})</AppText>
              <TextInput
                label="Nueva contraseña *" value={newPassword}
                onChangeText={setNewPassword}
                mode="outlined" style={[styles.input, { marginTop: 12 }]}
                secureTextEntry={!showNewPwd}
                autoCapitalize="none"
                autoComplete="new-password"
                right={<TextInput.Icon icon={showNewPwd ? 'eye-off' : 'eye'} onPress={() => setShowNewPwd(v => !v)} />}
              />
              {/* US-04: confirmación obligatoria. */}
              <TextInput
                label="Repetir contraseña *" value={newPassword2}
                onChangeText={setNewPassword2}
                mode="outlined" style={styles.input}
                secureTextEntry={!showNewPwd}
                autoCapitalize="none"
                autoComplete="new-password"
              />
              <AppText variant="caption" style={styles.pwdHint}>Mínimo {MIN_PASSWORD} caracteres.</AppText>
              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={closeReset} disabled={resetting} style={{ flex: 1 }}>Cancelar</Button>
                <Button mode="contained" onPress={handleResetPassword} loading={resetting} disabled={resetting} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
                <Button mode="outlined" onPress={() => setAccessModal(null)} disabled={savingAccess} style={{ flex: 1 }}>Cancelar</Button>
                <Button mode="contained" onPress={handleSaveAccess} loading={savingAccess} disabled={savingAccess} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
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
        // G-02 / US-02: cerrar el diálogo antes de ejecutar; un doble toque no repite la acción.
        onConfirm={() => { const fn = confirmDlg?.onConfirm; setConfirmDlg(null); fn?.(); }}
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
  // US-08: en celular la fila hace wrap y las acciones bajan a una segunda línea a ancho completo.
  rowMobile:      { flexWrap: 'wrap', paddingVertical: SPACE.s1 },
  cellActionsMobile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', width: '100%', paddingTop: 0 },
  selfTag:        { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.inkMute },
  noResults:      { textAlign: 'center', padding: SPACE.s5, color: COLOR.inkMute, fontSize: FONT_SIZE.label },
  searchWrap:     { paddingHorizontal: SPACE.s4, paddingTop: SPACE.s3, paddingBottom: SPACE.s2 },
  searchInput:    { backgroundColor: COLOR.surface },
  rolesWarn:      { marginHorizontal: SPACE.s4, marginBottom: SPACE.s2, color: COLOR.warn },
  pwdHint:        { marginTop: -SPACE.s1, marginBottom: SPACE.s2, color: COLOR.inkMute },
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
  // Tint + borde, no relleno sólido: este chip también se usa en "Locales
  // accesibles" (selección múltiple) -- varios podrían quedar activos a la
  // vez, y el dorado sólido repetido rompería la regla 60-30-10.
  storeChipActive:{ backgroundColor: COLOR.brandTint, borderWidth: 1.5, borderColor: COLOR.brand },
  storeChipText:  { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold as any, color: COLOR.ink2 },
  storeChipTextActive: { color: COLOR.ink, fontWeight: FONT_WEIGHT.bold as any },

  roleNote:       { backgroundColor: COLOR.bgAlt, borderRadius: RADIUS.r2, padding: SPACE.s2, marginBottom: SPACE.s1 },
});
