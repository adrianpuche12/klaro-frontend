import React from 'react';
import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { COLOR } from '../theme';

export const SplashScreen = () => (
  <View style={styles.root}>
    <Image
      source={require('../assets/images/icon.png')}
      style={styles.logo}
      resizeMode="contain"
    />
    <ActivityIndicator size="large" color={COLOR.brandDeep} style={styles.spinner} />
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR.brandTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: 24,
  },
  spinner: {
    marginTop: 8,
  },
});
