import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { RadioButton, Text, ActivityIndicator } from 'react-native-paper';
import { useStore } from '../context/StoreContext';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT } from '../theme';

interface StoreSelectorProps {
  selectedStore: number | null | undefined;
  onStoreChange: (storeId: number) => void;
  style?: any;
}

/**
 * N-08: usa los locales de StoreContext (una sola fuente de verdad) en vez de
 * pedirlos de nuevo, y tolera selectedStore nulo (antes explotaba en toString()).
 */
const StoreSelector: React.FC<StoreSelectorProps> = ({ selectedStore, onStoreChange, style }) => {
  const { stores, loadingStores } = useStore();
  const loading = loadingStores;

  // Auto-seleccionar el primero si no hay ninguno seleccionado
  useEffect(() => {
    if (!selectedStore && stores.length > 0) onStoreChange(stores[0].id);
  }, [selectedStore, stores]);

  if (loading) {
    return <ActivityIndicator size="small" color={COLOR.brand} style={{ marginVertical: SPACE.s3 }} />;
  }

  if (stores.length === 0) {
    return <Text style={styles.empty}>No hay locales activos disponibles.</Text>;
  }

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>Seleccionar local:</Text>
      <RadioButton.Group
        onValueChange={(value) => onStoreChange(Number(value))}
        value={String(selectedStore ?? '')}
      >
        {stores.map(store => (
          <RadioButton.Item
            key={store.id}
            label={store.name}
            value={store.id.toString()}
            style={styles.radioItem}
            labelStyle={styles.radioLabel}
            color={COLOR.brandDark}
          />
        ))}
      </RadioButton.Group>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACE.s2,
  },
  label: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.semibold as any,
    color: COLOR.ink2,
    marginBottom: SPACE.s2,
  },
  radioItem: {
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
    paddingVertical: SPACE.s2,
  },
  radioLabel: {
    fontSize: FONT_SIZE.body,
    color: COLOR.ink,
  },
  empty: {
    fontSize: FONT_SIZE.label,
    color: COLOR.inkMute,
    marginVertical: SPACE.s3,
    textAlign: 'center',
  },
});

export default StoreSelector;
