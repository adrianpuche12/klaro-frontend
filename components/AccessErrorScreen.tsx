import React from 'react';
import { View, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE } from '../theme';
import AppText from './ui/AppText';
import AppButton from './ui/AppButton';

/**
 * "No pudimos cargar tus permisos" (falla cerrada, propuesta 2026-11-03 Seguridad).
 * Se muestra cuando el perfil de acceso no se pudo cargar: el usuario no ve ningún
 * menú hasta que reintente y cargue bien. No es lo mismo que "Sin módulos asignados"
 * (el perfil cargó y no tiene permisos), que muestra cada panel.
 */
export const AccessErrorScreen = ({ retrying, onRetry, onLogout }: {
  retrying: boolean;
  onRetry: () => void;
  onLogout: () => void;
}) => (
  <View style={styles.container}>
    <MaterialCommunityIcons name="shield-alert-outline" size={48} color={COLOR.warn} />
    <AppText variant="title" centered style={styles.title}>No pudimos cargar tus permisos</AppText>
    <AppText variant="description" centered style={styles.text}>
      Revisá la conexión e intentá de nuevo. Hasta que se carguen, no se muestra ninguna sección.
    </AppText>
    <View style={styles.actions}>
      <AppButton label="Reintentar" onPress={onRetry} loading={retrying} fullWidth />
      <AppButton label="Cerrar sesión" onPress={onLogout} variant="ghost" disabled={retrying} fullWidth />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg, justifyContent: 'center', alignItems: 'center', padding: SPACE.s5 },
  title: { marginTop: SPACE.s3 },
  text: { marginTop: SPACE.s2, maxWidth: 360 },
  actions: { marginTop: SPACE.s5, gap: SPACE.s2, width: '100%', maxWidth: 280 },
});
