// =============================================================================
// UsersScreen.tsx  ·  screens/UsersScreen.tsx
// Gestión de usuarios (admin + root). Lista, búsqueda, filtros, acciones, modal.
// Sin emojis, sin inline styles, sin hex. Conectá tu API real de usuarios.
// Acciones destructivas SIEMPRE con confirmación (usá tu ConfirmDialog).
// =============================================================================
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import axios from 'axios';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { REACT_APP_API_URL } from '../config';

type Role = 'root' | 'admin' | 'user';
type Estado = 'activo' | 'suspendido';
interface User { id: string; nombre: string; username: string; rol: Role; estado: Estado; local: string; }
type Filter = 'todos' | 'activos' | 'suspendidos';

interface Props {
  users: User[];
  isRoot: boolean;
  stores: string[];
  onBack: () => void;
  onCreate: (data: { nombre: string; username: string; password: string; rol: 'admin' | 'user'; local: string }) => void;
  onEdit: (id: string) => void;
  onResetPassword: (id: string) => void;
  onToggleSuspend: (id: string) => void;
  onDelete: (id: string) => void; // debe pedir confirmación antes de llamar
}

const ROLE_LABEL: Record<Role, string> = { root: 'root', admin: 'admin', user: 'cajero' };

function UsersView({ users, isRoot, stores, onBack, onCreate, onEdit, onResetPassword, onToggleSuspend, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [ctx, setCtx] = useState<User | null>(null);

  const visible = useMemo(() => users.filter(u => {
    const q = query.trim().toLowerCase();
    if (q && !(u.nombre.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))) return false;
    if (filter === 'activos') return u.estado === 'activo';
    if (filter === 'suspendidos') return u.estado === 'suspendido';
    return true;
  }), [users, query, filter]);

  const renderUser = ({ item }: { item: User }) => (
    <View style={styles.row}>
      <View style={styles.avatar}><Text style={styles.avatarTxt}>{item.nombre.charAt(0).toUpperCase()}</Text></View>
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{item.nombre}</Text>
          <RoleBadge role={item.rol} />
          {item.estado === 'suspendido' && <View style={styles.stSusp}><Text style={styles.stSuspTxt}>Suspendido</Text></View>}
        </View>
        <Text style={styles.username}>@{item.username}</Text>
        <View style={styles.storeRow}>
          <MaterialCommunityIcons name="store-outline" size={12} color={COLOR.inkMute} />
          <Text style={styles.storeTxt}>{item.local}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.dots} onPress={() => setCtx(item)}>
        <MaterialCommunityIcons name="dots-vertical" size={20} color={COLOR.inkMute} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.back} onPress={onBack}><MaterialCommunityIcons name="chevron-left" size={24} color={COLOR.ink} /></TouchableOpacity>
        <Text style={styles.title}>Usuarios del sistema</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setModalOpen(true)}>
          <MaterialCommunityIcons name="plus" size={16} color={COLOR.inkOnBrand} />
          <Text style={styles.newTxt}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={18} color={COLOR.inkMute} />
        <TextInput style={styles.searchInput} placeholder="Buscar usuario..." placeholderTextColor={COLOR.inkDisabled} value={query} onChangeText={setQuery} autoCorrect={false} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {([['todos', 'Todos'], ['activos', 'Activos'], ['suspendidos', 'Suspendidos']] as [Filter, string][]).map(([k, l]) => (
          <TouchableOpacity key={k} style={[styles.chip, filter === k && styles.chipOn]} onPress={() => setFilter(k)}>
            <Text style={[styles.chipTxt, filter === k && styles.chipTxtOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList data={visible} renderItem={renderUser} keyExtractor={u => u.id}
        ListEmptyComponent={<View style={styles.empty}><MaterialCommunityIcons name="account-search-outline" size={56} color={COLOR.inkMute} /><Text style={styles.emptyTxt}>Sin usuarios</Text></View>} />

      {/* Modal nuevo usuario */}
      <UserFormModal visible={modalOpen} stores={stores} onClose={() => setModalOpen(false)} onSubmit={(d) => { onCreate(d); setModalOpen(false); }} />

      {/* Bottom sheet de acciones */}
      <Modal transparent visible={!!ctx} animationType="slide" onRequestClose={() => setCtx(null)}>
        <View style={styles.sheetOv}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setCtx(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <CtxRow icon="pencil" color={COLOR.info} label="Editar usuario" onPress={() => { if (ctx) onEdit(ctx.id); setCtx(null); }} />
            <CtxRow icon="lock-reset" color={COLOR.warn} label="Resetear contraseña" onPress={() => { if (ctx) onResetPassword(ctx.id); setCtx(null); }} />
            <CtxRow icon={ctx?.estado === 'activo' ? 'account-off' : 'account-check'} color={COLOR.warn} label={ctx?.estado === 'activo' ? 'Suspender' : 'Activar'} onPress={() => { if (ctx) onToggleSuspend(ctx.id); setCtx(null); }} />
            {isRoot && <CtxRow icon="trash-can" color={COLOR.expense} label="Eliminar permanentemente" onPress={() => { if (ctx) onDelete(ctx.id); setCtx(null); }} />}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const boxStyle = role === 'root' ? styles.bRoot : role === 'admin' ? styles.bAdmin : styles.bUser;
  const txtStyle = role === 'root' ? styles.bRootTxt : role === 'admin' ? styles.bAdminTxt : styles.bUserTxt;
  return <View style={[styles.roleBadge, boxStyle]}><Text style={[styles.roleTxt, txtStyle]}>{ROLE_LABEL[role]}</Text></View>;
}
function CtxRow({ icon, color, label, onPress }: { icon: string; color: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.ctxRow} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <Text style={[styles.ctxTxt, color === COLOR.expense && { color: COLOR.expense }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function UserFormModal({ visible, stores, onClose, onSubmit }: { visible: boolean; stores: string[]; onClose: () => void; onSubmit: (d: any) => void; }) {
  const [nombre, setNombre] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<'admin' | 'user'>('user');
  const [local, setLocal] = useState(stores[0] ?? '');
  const valid = nombre && username && password;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOv}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Nuevo usuario</Text>
          <Field label="Nombre completo"><TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Ej: Ana Rodríguez" placeholderTextColor={COLOR.inkDisabled} /></Field>
          <Field label="Usuario"><TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="ana.rodriguez" placeholderTextColor={COLOR.inkDisabled} /></Field>
          <Field label="Contraseña"><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={COLOR.inkDisabled} /></Field>
          <Field label="Rol">
            <View style={styles.seg}>
              <TouchableOpacity style={[styles.segBtn, rol === 'user' && styles.segOn]} onPress={() => setRol('user')}><Text style={[styles.segTxt, rol === 'user' && styles.segTxtOn]}>Cajero</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.segBtn, rol === 'admin' && styles.segOn]} onPress={() => setRol('admin')}><Text style={[styles.segTxt, rol === 'admin' && styles.segTxtOn]}>Admin</Text></TouchableOpacity>
            </View>
          </Field>
          <Field label="Local asignado">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.localChips}>
              {stores.map(s => (
                <TouchableOpacity key={s} style={[styles.localChip, local === s && styles.localChipOn]} onPress={() => setLocal(s)}>
                  <Text style={[styles.localChipTxt, local === s && styles.localChipTxtOn]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Field>
          <View style={styles.fActions}>
            <TouchableOpacity style={styles.fCancel} onPress={onClose}><Text style={styles.fCancelTxt}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.fSave, !valid && styles.fSaveDis]} disabled={!valid} onPress={() => onSubmit({ nombre, username, password, rol, local })}><Text style={styles.fSaveTxt}>Crear usuario</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.fLabel}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg }, flex: { flex: 1 },
  appbar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, paddingHorizontal: SPACE.s3, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  back: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, height: CONTROL.buttonSmH, paddingHorizontal: SPACE.s3, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand },
  newTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },

  search: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, marginHorizontal: SPACE.s4, marginTop: SPACE.s3, height: 44, borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r2, backgroundColor: COLOR.surface, paddingHorizontal: SPACE.s3 },
  searchInput: { flex: 1, fontSize: FONT_SIZE.body, color: COLOR.ink },
  chips: { gap: SPACE.s2, paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s3 },
  chip: { height: CONTROL.chipH, paddingHorizontal: SPACE.s4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  chipTxt: { fontSize: FONT_SIZE.label, color: COLOR.ink2 }, chipTxtOn: { color: COLOR.inkOnBrand, fontWeight: FONT_WEIGHT.semibold },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s3, padding: SPACE.s4, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  avatar: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLOR.brandTint, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.brandDeep },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, flexWrap: 'wrap' },
  name: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },
  username: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, marginTop: 2 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, marginTop: 2 },
  storeTxt: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },
  dots: { padding: 4 },

  roleBadge: { paddingHorizontal: SPACE.s2, paddingVertical: 1, borderRadius: RADIUS.full, borderWidth: 1 },
  roleTxt: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium },
  bRoot: { backgroundColor: COLOR.expenseTint, borderColor: COLOR.expense }, bRootTxt: { color: COLOR.expense },
  bAdmin: { backgroundColor: COLOR.infoTint, borderColor: COLOR.info }, bAdminTxt: { color: COLOR.info },
  bUser: { backgroundColor: COLOR.brandTint, borderColor: COLOR.brand }, bUserTxt: { color: COLOR.brandDeep },
  stSusp: { backgroundColor: COLOR.surface2, paddingHorizontal: SPACE.s2, paddingVertical: 1, borderRadius: RADIUS.full },
  stSuspTxt: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold, color: COLOR.inkMute },

  empty: { paddingVertical: SPACE.s8, alignItems: 'center' },
  emptyTxt: { fontSize: FONT_SIZE.h3, color: COLOR.inkMute, marginTop: SPACE.s3 },

  sheetOv: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'COLOR.overlay' },
  sheet: { backgroundColor: COLOR.surface, borderTopLeftRadius: RADIUS.r4, borderTopRightRadius: RADIUS.r4, paddingBottom: SPACE.s5 },
  handle: { width: 40, height: 4, borderRadius: RADIUS.full, backgroundColor: COLOR.border2, alignSelf: 'center', marginTop: SPACE.s3, marginBottom: SPACE.s3 },
  ctxRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s4, paddingVertical: SPACE.s4, paddingHorizontal: SPACE.s4, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  ctxTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.medium, color: COLOR.ink },

  modalOv: { flex: 1, justifyContent: 'center', backgroundColor: 'COLOR.overlay', padding: SPACE.s4 },
  modal: { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, ...SHADOW.lg },
  modalTitle: { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink, marginBottom: SPACE.s4 },
  field: { marginBottom: SPACE.s3 },
  fLabel: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.medium, color: COLOR.ink2, marginBottom: SPACE.s1 },
  input: { height: CONTROL.inputH, borderWidth: 1, borderColor: COLOR.border2, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s3, fontSize: FONT_SIZE.body, color: COLOR.ink, backgroundColor: COLOR.surface },
  seg: { flexDirection: 'row', gap: SPACE.s2 },
  segBtn: { flex: 1, height: 44, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border2, backgroundColor: COLOR.surface, justifyContent: 'center', alignItems: 'center' },
  segOn: { backgroundColor: COLOR.brandTint, borderColor: COLOR.brand },
  segTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink2 }, segTxtOn: { color: COLOR.brandDeep },
  localChips: { gap: SPACE.s2 },
  localChip: { height: CONTROL.chipH, paddingHorizontal: SPACE.s3, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLOR.border, backgroundColor: COLOR.surface, justifyContent: 'center' },
  localChipOn: { backgroundColor: COLOR.brand, borderColor: COLOR.brand },
  localChipTxt: { fontSize: FONT_SIZE.label, color: COLOR.ink2 }, localChipTxtOn: { color: COLOR.inkOnBrand, fontWeight: FONT_WEIGHT.semibold },
  fActions: { flexDirection: 'row', gap: SPACE.s2, marginTop: SPACE.s5 },
  fCancel: { flex: 1, height: CONTROL.buttonH, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border2, backgroundColor: COLOR.surface, justifyContent: 'center', alignItems: 'center' },
  fCancelTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink2 },
  fSave: { flex: 1, height: CONTROL.buttonH, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand, justifyContent: 'center', alignItems: 'center' },
  fSaveDis: { opacity: 0.5 },
  fSaveTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },
});

// ─── Connected wrapper ────────────────────────────────────────────────────────
export default function UsersScreen() {
  const { roles } = useAuth();
  const { stores: storeList } = useStore();
  const isRoot = roles.includes('root');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get(`${REACT_APP_API_URL}/api/v2/users`);
      setUsers((data ?? []).map((u: any) => ({
        id: String(u.id ?? u.keycloakId),
        nombre: u.fullName ?? u.nombre ?? u.username,
        username: u.username,
        rol: u.role ?? u.rol ?? 'user',
        estado: u.active === false ? 'suspendido' : 'activo',
        local: u.storeName ?? storeList.find(s => s.id === u.storeId)?.name ?? '—',
      })));
    } catch (e) { console.error('[UsersScreen]', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOR.bg }}><ActivityIndicator size="large" color={COLOR.brand} /></View>;

  return (
    <UsersView
      users={users} isRoot={isRoot}
      stores={storeList.map(s => s.name)}
      onBack={() => {}}
      onCreate={async (d) => { await axios.post(`${REACT_APP_API_URL}/api/v2/users`, d); fetchUsers(); }}
      onEdit={() => {}}
      onResetPassword={async (id) => { await axios.put(`${REACT_APP_API_URL}/api/v2/users/${id}/reset-password`); }}
      onToggleSuspend={async (id) => { await axios.put(`${REACT_APP_API_URL}/api/v2/users/${id}/toggle`); fetchUsers(); }}
      onDelete={async (id) => { await axios.delete(`${REACT_APP_API_URL}/api/v2/users/${id}`); fetchUsers(); }}
    />
  );
}
