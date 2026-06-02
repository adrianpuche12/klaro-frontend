// =============================================================================
// StoresScreen.tsx  ·  screens/StoresScreen.tsx
// Gestión de locales (solo root). Lista + modal nuevo/editar.
// Sin emojis, sin inline styles, sin hex. Conectá tu API real de locales.
// =============================================================================
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import axios from 'axios';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';
import { REACT_APP_API_URL } from '../config';
import { useStore } from '../context/StoreContext';

interface Store { id: string; nombre: string; direccion: string; telefono: string; activo: boolean; empleados: number; }

interface Props {
  stores: Store[];
  onBack: () => void;
  onSave: (store: Partial<Store> & { nombre: string }) => void;
}

function StoresView({ stores, onBack, onSave }: Props) {
  const [editing, setEditing] = useState<Store | 'new' | null>(null);

  const renderStore = ({ item }: { item: Store }) => (
    <TouchableOpacity style={styles.row} onPress={() => setEditing(item)}>
      <View style={styles.ico}><MaterialCommunityIcons name="store-outline" size={24} color={COLOR.info} /></View>
      <View style={styles.flex}>
        <Text style={styles.name}>{item.nombre}</Text>
        <View style={styles.meta}>
          <View style={[styles.stBadge, item.activo ? styles.stActive : styles.stInactive]}>
            <Text style={[styles.stTxt, item.activo ? styles.stActiveTxt : styles.stInactiveTxt]}>{item.activo ? 'Activo' : 'Inactivo'}</Text>
          </View>
          <Text style={styles.metaTxt}>· {item.empleados} {item.empleados === 1 ? 'empleado' : 'empleados'}</Text>
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={COLOR.inkMute} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.back} onPress={onBack}><MaterialCommunityIcons name="chevron-left" size={24} color={COLOR.ink} /></TouchableOpacity>
        <Text style={styles.title}>Locales</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setEditing('new')}>
          <MaterialCommunityIcons name="plus" size={16} color={COLOR.inkOnBrand} />
          <Text style={styles.newTxt}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <FlatList data={stores} renderItem={renderStore} keyExtractor={s => s.id}
        ListEmptyComponent={<View style={styles.empty}><MaterialCommunityIcons name="store-search-outline" size={56} color={COLOR.inkMute} /><Text style={styles.emptyTxt}>Sin locales</Text></View>} />

      <StoreModal
        store={editing === 'new' ? null : editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(d) => { onSave(d); setEditing(null); }}
      />
    </View>
  );
}

function StoreModal({ store, visible, onClose, onSubmit }: { store: Store | null; visible: boolean; onClose: () => void; onSubmit: (d: any) => void; }) {
  const [nombre, setNombre] = useState(store?.nombre ?? '');
  const [direccion, setDireccion] = useState(store?.direccion ?? '');
  const [telefono, setTelefono] = useState(store?.telefono ?? '');
  const [activo, setActivo] = useState(store?.activo ?? true);
  React.useEffect(() => {
    if (visible) { setNombre(store?.nombre ?? ''); setDireccion(store?.direccion ?? ''); setTelefono(store?.telefono ?? ''); setActivo(store?.activo ?? true); }
  }, [visible, store]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOv}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{store ? 'Editar local' : 'Nuevo local'}</Text>
          <View style={styles.field}><Text style={styles.fLabel}>Nombre del local</Text><TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Ej: Sucursal Centro" placeholderTextColor={COLOR.inkDisabled} /></View>
          <View style={styles.field}><Text style={styles.fLabel}>Dirección</Text><TextInput style={styles.input} value={direccion} onChangeText={setDireccion} placeholder="Calle / barrio / ciudad" placeholderTextColor={COLOR.inkDisabled} /></View>
          <View style={styles.field}><Text style={styles.fLabel}>Teléfono</Text><TextInput style={styles.input} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="+504 0000-0000" placeholderTextColor={COLOR.inkDisabled} /></View>
          <View style={styles.field}>
            <Text style={styles.fLabel}>Estado</Text>
            <View style={styles.seg}>
              <TouchableOpacity style={[styles.segBtn, activo && styles.segOn]} onPress={() => setActivo(true)}><Text style={[styles.segTxt, activo && styles.segTxtOn]}>Activo</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.segBtn, !activo && styles.segOn]} onPress={() => setActivo(false)}><Text style={[styles.segTxt, !activo && styles.segTxtOn]}>Inactivo</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.fActions}>
            <TouchableOpacity style={styles.fCancel} onPress={onClose}><Text style={styles.fCancelTxt}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.fSave, !nombre && styles.fSaveDis]} disabled={!nombre} onPress={() => onSubmit({ id: store?.id, nombre, direccion, telefono, activo })}><Text style={styles.fSaveTxt}>Guardar</Text></TouchableOpacity>
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
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, height: CONTROL.buttonSmH, paddingHorizontal: SPACE.s3, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand },
  newTxt: { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },

  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, padding: SPACE.s4, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  ico: { width: 40, height: 40, borderRadius: RADIUS.r2, backgroundColor: COLOR.infoTint, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.semibold, color: COLOR.ink },
  meta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, marginTop: 3 },
  metaTxt: { fontSize: FONT_SIZE.caption, color: COLOR.inkMute },
  stBadge: { paddingHorizontal: SPACE.s2, paddingVertical: 1, borderRadius: RADIUS.full },
  stActive: { backgroundColor: COLOR.incomeTint }, stInactive: { backgroundColor: COLOR.surface2 },
  stTxt: { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.semibold },
  stActiveTxt: { color: COLOR.income }, stInactiveTxt: { color: COLOR.inkMute },

  empty: { paddingVertical: SPACE.s8, alignItems: 'center' },
  emptyTxt: { fontSize: FONT_SIZE.h3, color: COLOR.inkMute, marginTop: SPACE.s3 },

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
  fActions: { flexDirection: 'row', gap: SPACE.s2, marginTop: SPACE.s5 },
  fCancel: { flex: 1, height: CONTROL.buttonH, borderRadius: RADIUS.r2, borderWidth: 1, borderColor: COLOR.border2, backgroundColor: COLOR.surface, justifyContent: 'center', alignItems: 'center' },
  fCancelTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink2 },
  fSave: { flex: 1, height: CONTROL.buttonH, borderRadius: RADIUS.r2, backgroundColor: COLOR.brand, justifyContent: 'center', alignItems: 'center' },
  fSaveDis: { opacity: 0.5 },
  fSaveTxt: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold, color: COLOR.inkOnBrand },
});

// ─── Connected wrapper ────────────────────────────────────────────────────────
export default function StoresScreen() {
  const { stores: ctxStores, refreshStores } = useStore();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStores = async () => {
    try {
      const { data } = await axios.get(`${REACT_APP_API_URL}/api/v2/stores`);
      setStores((data ?? []).map((s: any) => ({
        id: String(s.id), nombre: s.name, direccion: s.address ?? '', telefono: s.phone ?? '',
        activo: s.active !== false, empleados: s.employeeCount ?? 0,
      })));
    } catch (e) { console.error('[StoresScreen]', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStores(); }, []);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLOR.bg }}><ActivityIndicator size="large" color={COLOR.brand} /></View>;

  return (
    <StoresView stores={stores} onBack={() => {}}
      onSave={async (d) => {
        if (d.id) await axios.put(`${REACT_APP_API_URL}/api/v2/stores/${d.id}`, d);
        else await axios.post(`${REACT_APP_API_URL}/api/v2/stores`, d);
        fetchStores(); refreshStores();
      }}
    />
  );
}
