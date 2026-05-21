import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Button, TextInput, Snackbar, IconButton } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import ConfirmDialog from '../components/ConfirmDialog';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW } from '../theme';
import { useStore } from '../context/StoreContext';

interface Store {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
}

interface StoreForm {
  name: string;
  address: string;
  phone: string;
}

const EMPTY_FORM: StoreForm = { name: '', address: '', phone: '' };

const StoresScreen = () => {
  const { refreshStores: refreshContext } = useStore();
  const [stores, setStores]             = useState<Store[]>([]);
  const [loading, setLoading]           = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [form, setForm]                 = useState<StoreForm>(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [snackbar, setSnackbar]         = useState('');
  const [confirmDlg, setConfirmDlg]     = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const askConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmDlg({ title, message, onConfirm });

  const API = `${REACT_APP_API_URL}/api/v2/stores`;

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get<Store[]>(API);
      setStores(res.data);
    } catch {
      setSnackbar('Error al cargar los locales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStores(); }, [loadStores]);

  const openCreate = () => {
    setEditingStore(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (store: Store) => {
    setEditingStore(store);
    setForm({ name: store.name, address: store.address ?? '', phone: store.phone ?? '' });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setSnackbar('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      if (editingStore) {
        await axios.put(`${API}/${editingStore.id}`, form);
        setSnackbar('Local actualizado');
      } else {
        await axios.post(API, form);
        setSnackbar('Local creado');
      }
      setModalVisible(false);
      loadStores();
      refreshContext();
    } catch {
      setSnackbar('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (store: Store) => {
    const accion = store.active ? 'desactivar' : 'activar';
    askConfirm(
      `${store.active ? 'Desactivar' : 'Activar'} local`,
      `¿Querés ${accion} el local "${store.name}"?`,
      async () => {
        try {
          await axios.put(`${API}/${store.id}/toggle`);
          setSnackbar(`Local ${store.active ? 'desactivado' : 'activado'}`);
          loadStores();
          refreshContext();
        } catch { setSnackbar('Error al cambiar estado'); }
        finally { setConfirmDlg(null); }
      }
    );
  };

  const handleDelete = (store: Store) => {
    askConfirm(
      'Eliminar local',
      `¿Eliminar "${store.name}"? Esta acción no se puede deshacer.`,
      async () => {
        try {
          await axios.delete(`${API}/${store.id}`);
          setSnackbar('Local eliminado');
          loadStores();
          refreshContext();
        } catch (e: any) {
          setSnackbar(e.response?.data?.error || 'No se puede eliminar — tiene historial de operaciones');
        } finally { setConfirmDlg(null); }
      }
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Locales</Text>
        <Button mode="contained" onPress={openCreate} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand}>
          + Nuevo Local
        </Button>
      </View>

      {/* Lista */}
      {loading ? (
        <ActivityIndicator size="large" color={COLOR.brand} style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {stores.length === 0 ? (
            <Text style={styles.empty}>No hay locales registrados.</Text>
          ) : (
            stores.map(store => (
              <View key={store.id} style={styles.card}>
                <View style={styles.cardInfo}>
                  <View style={styles.cardRow}>
                    <Text style={styles.storeName}>{store.name}</Text>
                    <View style={[styles.badge, store.active ? styles.badgeActive : styles.badgeInactive]}>
                      <Text style={[styles.badgeText, { color: store.active ? COLOR.income : COLOR.expense }]}>
                        {store.active ? 'Activo' : 'Inactivo'}
                      </Text>
                    </View>
                  </View>
                  {store.address ? (
                    <View style={styles.storeDetailRow}>
                      <MaterialCommunityIcons name="map-marker-outline" size={13} color={COLOR.inkMute} />
                      <Text style={styles.storeDetail}>{store.address}</Text>
                    </View>
                  ) : null}
                  {store.phone ? (
                    <View style={styles.storeDetailRow}>
                      <MaterialCommunityIcons name="phone-outline" size={13} color={COLOR.inkMute} />
                      <Text style={styles.storeDetail}>{store.phone}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.cardActions}>
                  {/* Editar */}
                  <IconButton
                    icon="pencil"
                    size={22}
                    iconColor={COLOR.ink2}
                    onPress={() => openEdit(store)}
                  />
                  {/* Activar / Desactivar */}
                  <IconButton
                    icon={store.active ? 'toggle-switch' : 'toggle-switch-off'}
                    size={22}
                    iconColor={store.active ? '#168542' : '#b8c0cc'}
                    onPress={() => handleToggle(store)}
                  />
                  {/* Eliminar */}
                  <IconButton
                    icon="trash-can"
                    size={22}
                    iconColor={COLOR.expense}
                    onPress={() => handleDelete(store)}
                  />
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Modal crear/editar */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editingStore ? 'Editar Local' : 'Nuevo Local'}</Text>

            <TextInput label="Nombre *" value={form.name} onChangeText={v => setForm({ ...form, name: v })} style={styles.input} mode="outlined" />
            <TextInput label="Dirección" value={form.address} onChangeText={v => setForm({ ...form, address: v })} style={styles.input} mode="outlined" />
            <TextInput label="Teléfono" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} style={styles.input} mode="outlined" keyboardType="phone-pad" />

            <View style={styles.modalActions}>
              <Button mode="outlined" onPress={() => setModalVisible(false)} style={{ flex: 1 }}>Cancelar</Button>
              <Button mode="contained" onPress={handleSave} loading={saving} buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} style={{ flex: 1 }}>Guardar</Button>
            </View>
          </View>
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
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={2500}>{snackbar}</Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLOR.bg },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.s4, backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  title:        { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  loader:       { marginTop: 40 },
  list:         { padding: SPACE.s4, gap: SPACE.s3 },
  empty:        { textAlign: 'center', marginTop: 40, color: COLOR.inkMute, fontSize: FONT_SIZE.body },
  card:         { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.r3, padding: SPACE.s4, borderWidth: 1, borderColor: COLOR.border, ...SHADOW.sm },
  cardInfo:     { flex: 1 },
  cardRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, marginBottom: SPACE.s1 },
  storeName:    { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  storeDetail:     { fontSize: FONT_SIZE.label, color: COLOR.inkMute, marginLeft: 4 },
  storeDetailRow:  { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  badge:        { borderRadius: RADIUS.r1, paddingHorizontal: SPACE.s2, paddingVertical: 2 },
  badgeActive:  { backgroundColor: COLOR.incomeTint },
  badgeInactive:{ backgroundColor: COLOR.expenseTint },
  badgeText:    { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any },
  cardActions:  { flexDirection: 'row', alignItems: 'center' },
  overlay:      { flex: 1, backgroundColor: COLOR.overlay, justifyContent: 'center', alignItems: 'center' },
  modal:        { backgroundColor: COLOR.surface, borderRadius: RADIUS.r4, padding: SPACE.s5, width: '90%', maxWidth: 440 },
  modalTitle:   { fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, marginBottom: SPACE.s4 },
  input:        { marginBottom: SPACE.s3 },
  modalActions: { flexDirection: 'row', gap: SPACE.s3, marginTop: SPACE.s2 },
});

export default StoresScreen;
