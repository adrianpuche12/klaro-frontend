// =============================================================================
// LoginScreen.tsx  ·  screens/LoginScreen.tsx
// Primera pantalla cuando no hay token válido. Rediseño visual completo.
// LÓGICA PRESERVADA: login/loading/error de useAuth(); la navegación la maneja
// _layout.tsx, NO esta pantalla. Sin emojis, sin inline styles, sin hex.
// =============================================================================
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, ScrollView,
  Platform, useWindowDimensions, Animated,
} from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, CONTROL, SHADOW } from '../theme';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  // ---- LÓGICA A PRESERVAR (no cambiar) ----
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    await login(username, password);
    // La navegación la maneja _layout.tsx, no LoginScreen
  };
  // ------------------------------------------

  const isLoading = loading;
  const { width } = useWindowDimensions();
  const isWide = width >= 600;

  // FadeIn del error (0 -> 1 en 200ms)
  const errOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (error) {
      errOpacity.setValue(0);
      Animated.timing(errOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [error, errOpacity]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---- Branding ---- */}
        <View style={styles.brandBlock}>
          <View style={styles.logo}>
            <MaterialCommunityIcons name="store-outline" size={32} color={COLOR.ink} />
          </View>
          <Text style={styles.brandName}>BELOPIA</Text>
          <Text style={styles.tagline}>Gestión de tu negocio</Text>
        </View>

        {/* ---- Card del formulario ---- */}
        <View style={[styles.card, isWide && styles.cardWide]}>
          <View style={styles.formHead}>
            <Text style={styles.formTitle}>Iniciar sesión</Text>
            <Text style={styles.formSub}>Ingresá con tu cuenta de trabajo</Text>
          </View>

          <TextInput
            mode="outlined"
            label="Usuario"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!isLoading}
            left={<TextInput.Icon icon={() => <MaterialCommunityIcons name="account-outline" size={20} color={COLOR.inkMute} />} />}
            outlineColor={COLOR.border2}
            activeOutlineColor={COLOR.brand}
            style={[styles.input, isLoading && styles.inputDisabled]}
          />

          <TextInput
            mode="outlined"
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            editable={!isLoading}
            onSubmitEditing={handleLogin}
            returnKeyType="go"
            left={<TextInput.Icon icon={() => <MaterialCommunityIcons name="lock-outline" size={20} color={COLOR.inkMute} />} />}
            right={
              <TextInput.Icon
                icon={() => <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLOR.inkMute} />}
                onPress={() => setShowPassword(v => !v)}
              />
            }
            outlineColor={error ? COLOR.expense : COLOR.border2}
            activeOutlineColor={error ? COLOR.expense : COLOR.brand}
            style={[styles.input, styles.inputSpaced, isLoading && styles.inputDisabled]}
          />

          {error ? (
            <Animated.View style={[styles.errorBox, { opacity: errOpacity }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLOR.expense} />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          ) : null}

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading || !username || !password}
            buttonColor={COLOR.brand}
            textColor={COLOR.inkOnBrand}
            contentStyle={styles.btnContent}
            style={styles.btn}
            labelStyle={styles.btnLabel}
          >
            Ingresar
          </Button>
        </View>

        <Text style={styles.footer}>Versión 1.0.0 · Belopia</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLOR.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACE.s4,
    paddingVertical: SPACE.s6,
  },
  scrollWide: { paddingHorizontal: SPACE.s6, alignItems: 'center' },

  brandBlock: { alignItems: 'center', marginBottom: SPACE.s6 },
  logo: {
    width: 64, height: 64, borderRadius: RADIUS.r3,
    backgroundColor: COLOR.brand, justifyContent: 'center', alignItems: 'center',
  },
  brandName: {
    fontSize: FONT_SIZE.h1, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink,
    letterSpacing: 2, marginTop: SPACE.s3,
  },
  tagline: { fontSize: FONT_SIZE.label, color: COLOR.ink2, marginTop: SPACE.s1 },

  card: {
    width: '100%',
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.r4,
    padding: SPACE.s5,
    borderWidth: 1,
    borderColor: COLOR.border,
    ...SHADOW.md,
  },
  cardWide: { maxWidth: 420 },

  formHead: { marginBottom: SPACE.s5 },
  formTitle: { fontSize: FONT_SIZE.h2, fontWeight: FONT_WEIGHT.bold, color: COLOR.ink },
  formSub: { fontSize: FONT_SIZE.label, color: COLOR.ink2, marginTop: SPACE.s1 },

  input: { backgroundColor: COLOR.surface },
  inputSpaced: { marginTop: SPACE.s3 },
  inputDisabled: { opacity: 0.7 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.s2,
    marginTop: SPACE.s3, padding: SPACE.s3,
    backgroundColor: COLOR.expenseTint,
    borderWidth: 1, borderColor: COLOR.expense, borderRadius: RADIUS.r2,
  },
  errorText: { flex: 1, fontSize: FONT_SIZE.label, color: COLOR.expense },

  btn: { marginTop: SPACE.s4, borderRadius: RADIUS.r2 },
  btnContent: { height: CONTROL.buttonH },
  btnLabel: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold },

  footer: {
    fontSize: FONT_SIZE.caption, color: COLOR.inkMute,
    textAlign: 'center', marginTop: SPACE.s6,
  },
});
