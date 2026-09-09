import React, { useState, useRef, useEffect } from 'react';
import {
  View, Image, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  Animated, useWindowDimensions, TextInput as RNTextInput,
} from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';
import { useAuth } from '../context/AuthContext';
import AppText from '../components/ui/AppText';

const LoginScreen = () => {
  const [username, setUsername]       = useState('');
  const [password, setPassword]       = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState('');
  const [secureTextEntry, setSecure]  = useState(true);

  const passwordRef = useRef<RNTextInput>(null);
  const { login } = useAuth();

  const { width } = useWindowDimensions();
  const wide = width >= 600;

  // FadeIn del mensaje de error (200ms)
  const errOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(errOpacity, { toValue: error ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [error, errOpacity]);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Por favor completá todos los campos');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const success = await login(username.trim(), password.trim());
      if (!success) setError('Usuario o contraseña incorrectos');
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) setError('Usuario o contraseña incorrectos');
      else if (status >= 500) setError('El servidor no responde, intentá más tarde');
      else setError('Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const disabled = isLoading || !username || !password;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Branding */}
        <View style={styles.branding}>
          <Image
            source={require('../assets/images/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <AppText variant="title" style={styles.brand}>BELOPIA</AppText>
          <AppText variant="label" color={COLOR.ink2} style={styles.tagline}>Gestión de tu negocio</AppText>
        </View>

        {/* Card del formulario */}
        <View style={[styles.card, wide && styles.cardWide]}>
          <AppText variant="subtitle" color={COLOR.ink}>Iniciar sesión</AppText>
          <AppText variant="label" color={COLOR.ink2} style={styles.subtitleSpacing}>
            Ingresá con tu cuenta de trabajo
          </AppText>

          <View style={styles.form}>
            <TextInput
              mode="outlined"
              label="Usuario"
              value={username}
              onChangeText={setUsername}
              placeholder="nombre.apellido"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!isLoading}
              outlineColor={COLOR.border2}
              activeOutlineColor={COLOR.brand}
              style={[styles.input, isLoading && styles.inputDisabled]}
              left={<TextInput.Icon icon="account-outline" size={20} />}
            />

            <TextInput
              ref={passwordRef}
              mode="outlined"
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={secureTextEntry}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
              onSubmitEditing={handleLogin}
              returnKeyType="go"
              outlineColor={error ? COLOR.expense : COLOR.border2}
              activeOutlineColor={error ? COLOR.expense : COLOR.brand}
              style={[styles.input, styles.inputSpaced, isLoading && styles.inputDisabled]}
              left={<TextInput.Icon icon="lock-outline" size={20} />}
              right={
                <TextInput.Icon
                  icon={secureTextEntry ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  onPress={() => setSecure(v => !v)}
                />
              }
            />

            {!!error && (
              <Animated.View style={[styles.errorBox, { opacity: errOpacity }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLOR.expense} />
                <AppText variant="label" color={COLOR.expense} style={styles.errorTxt}>{error}</AppText>
              </Animated.View>
            )}

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={isLoading}
              disabled={disabled}
              buttonColor={COLOR.brand}
              textColor={COLOR.inkOnBrand}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              {isLoading ? 'Iniciando…' : 'Ingresar'}
            </Button>

            <AppText variant="caption" centered style={styles.helperText}>
              ¿Olvidaste tu contraseña? Pedísela al encargado.
            </AppText>
          </View>
        </View>

        <AppText variant="caption" centered style={styles.footer}>Versión 1.0.0 · Belopia</AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLOR.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACE.s4, paddingVertical: SPACE.s6 },
  scrollWide: { paddingHorizontal: SPACE.s6 },

  branding: { alignItems: 'center' },
  logo: { width: 72, height: 72, borderRadius: RADIUS.r4 },
  brand: { letterSpacing: 2, marginTop: SPACE.s3 },
  tagline: { marginTop: SPACE.s1 },

  card: {
    width: '100%', marginTop: SPACE.s6, backgroundColor: COLOR.surface,
    borderRadius: RADIUS.r4, padding: SPACE.s5, borderWidth: 1, borderColor: COLOR.border, ...SHADOW.md,
  },
  cardWide: { maxWidth: 420, alignSelf: 'center' },

  subtitleSpacing: { marginTop: SPACE.s1 },
  form: { marginTop: SPACE.s5 },

  input: { backgroundColor: COLOR.surface },
  inputSpaced: { marginTop: SPACE.s3 },
  inputDisabled: { opacity: 0.7 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, marginTop: SPACE.s3,
    backgroundColor: COLOR.expenseTint, borderWidth: 1, borderColor: COLOR.expense,
    borderRadius: RADIUS.r2, padding: SPACE.s3,
  },
  errorTxt: { flex: 1 },

  button: { marginTop: SPACE.s4, borderRadius: RADIUS.r2 },
  buttonContent: { height: CONTROL.buttonH },
  buttonLabel: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any },

  helperText: { marginTop: SPACE.s3 },
  footer: { marginTop: SPACE.s6 },
});

export default LoginScreen;
