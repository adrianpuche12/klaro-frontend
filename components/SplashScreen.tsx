import React from 'react';
import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { COLOR, SPACE, RADIUS } from '../theme';
import AppText from './ui/AppText';

export const SplashScreen = () => (
  <View style={styles.container}>
    <Image
      source={require('../assets/images/icon.png')}
      style={styles.logo}
      resizeMode="contain"
    />
    <AppText variant="title" style={styles.brand}>BELOPIA</AppText>
    <AppText variant="label" color={COLOR.ink2} style={styles.tagline}>Gestión de tu negocio</AppText>
    <ActivityIndicator size="small" color={COLOR.brand} style={styles.spinner} />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.bg, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 88, height: 88, borderRadius: RADIUS.r4 },
  brand: { letterSpacing: 3, marginTop: SPACE.s3 },
  tagline: { marginTop: SPACE.s2 },
  spinner: { marginTop: SPACE.s7 },
});
