// =============================================================================
// SplashScreen.tsx  ·  components/SplashScreen.tsx
// Pantalla de carga inicial mientras se verifica el token en AsyncStorage.
// Sin props. Sin emojis, sin inline styles, sin hex hardcodeados.
// =============================================================================
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS } from '../theme';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <MaterialCommunityIcons name="store-outline" size={36} color={COLOR.inkOnBrand} />
      </View>
      <Text style={styles.brand}>BELOPIA</Text>
      <Text style={styles.tagline}>Gestión de tu negocio</Text>
      <ActivityIndicator size="small" color={COLOR.brand} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLOR.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.r4,
    backgroundColor: COLOR.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brand: {
    fontSize: FONT_SIZE.h1,
    fontWeight: FONT_WEIGHT.bold,
    color: COLOR.ink,
    letterSpacing: 3,
    marginTop: SPACE.s3,
  },
  tagline: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.regular,
    color: COLOR.ink2,
    marginTop: SPACE.s2,
  },
  loader: {
    marginTop: SPACE.s7,
  },
});
