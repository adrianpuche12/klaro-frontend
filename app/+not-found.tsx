import { Link, Stack } from 'expo-router';
import { View, Image, StyleSheet } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { COLOR, FONT_SIZE, FONT_WEIGHT, SPACE } from '../theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Página no encontrada' }} />
      <View style={styles.root}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Esta pantalla no existe</Text>
        <Text style={styles.sub}>O fue movida. Volvé al inicio y reintentá.</Text>
        <Link href="/" asChild>
          <Button
            mode="contained"
            buttonColor={COLOR.brand}
            textColor={COLOR.inkOnBrand}
            style={styles.button}
          >
            Volver al inicio
          </Button>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.bg,
    padding: SPACE.s5,
  },
  logo: {
    width: 72,
    height: 72,
    marginBottom: SPACE.s6,
  },
  title: {
    fontSize: FONT_SIZE.h1,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink,
    textAlign: 'center',
    marginBottom: SPACE.s2,
  },
  sub: {
    fontSize: FONT_SIZE.body,
    color: COLOR.inkMute,
    textAlign: 'center',
  },
  button: {
    marginTop: SPACE.s6,
    borderRadius: 30,
  },
});
