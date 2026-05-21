import React, { useState, useRef } from 'react';
import {
  View, StyleSheet, KeyboardAvoidingView, Platform,
  StatusBar, ScrollView, TextInput as RNTextInput,
} from 'react-native';
import { TextInput, Button, Card, Title, HelperText, Avatar } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW } from '../theme';

const LoginScreen = () => {
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState('');
  const [secureTextEntry, setSecure]    = useState(true);

  const passwordRef = useRef<RNTextInput>(null);
  const { login } = useAuth();

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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLOR.brandTint} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Sección superior — logo + bienvenida */}
        <View style={styles.topSection}>
          <Avatar.Image
            size={110}
            source={require('../assets/images/icon.png')}
            style={styles.logo}
          />
          <Title style={styles.welcomeText}>Klaro</Title>
        </View>

        {/* Card del formulario */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.formWrapper}>
              <Title style={styles.cardTitle}>Iniciar sesión</Title>

              <View style={styles.inputContainer}>
                <TextInput
                  label="Usuario"
                  value={username}
                  onChangeText={setUsername}
                  mode="outlined"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  left={<TextInput.Icon icon="account" color={COLOR.brandDark} />}
                  outlineColor={COLOR.border2}
                  activeOutlineColor={COLOR.brand}
                  theme={{ colors: { primary: COLOR.brand } }}
                />
              </View>

              <View style={styles.inputContainer}>
                <TextInput
                  label="Contraseña"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={secureTextEntry}
                  mode="outlined"
                  style={styles.input}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  left={<TextInput.Icon icon="lock" color={COLOR.brandDark} />}
                  right={
                    <TextInput.Icon
                      icon={secureTextEntry ? 'eye' : 'eye-off'}
                      onPress={() => setSecure(v => !v)}
                      color={COLOR.brandDark}
                    />
                  }
                  outlineColor={COLOR.border2}
                  activeOutlineColor={COLOR.brand}
                  theme={{ colors: { primary: COLOR.brand } }}
                />
              </View>

              {error ? (
                <HelperText type="error" visible={!!error} style={styles.errorText}>
                  {error}
                </HelperText>
              ) : null}

              <Button
                mode="contained"
                onPress={handleLogin}
                style={styles.loginButton}
                contentStyle={styles.buttonContent}
                loading={isLoading}
                disabled={isLoading}
                labelStyle={styles.buttonText}
                buttonColor={COLOR.brand}
                textColor={COLOR.inkOnBrand}
              >
                {isLoading ? 'Iniciando…' : 'Iniciar sesión'}
              </Button>

              <Title style={styles.helperText}>
                ¿Olvidaste tu contraseña? Pedísela al encargado.
              </Title>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    backgroundColor: COLOR.bg,
  },
  topSection: {
    backgroundColor: COLOR.brandTint,
    paddingVertical: SPACE.s7,
    alignItems: 'center',
    borderBottomLeftRadius: RADIUS.r5,
    borderBottomRightRadius: RADIUS.r5,
    ...SHADOW.md,
  },
  logo: {
    backgroundColor: COLOR.surface,
    borderWidth: 2,
    borderColor: COLOR.surface,
    marginBottom: SPACE.s2,
  },
  welcomeText: {
    color: COLOR.brandDeep,
    fontSize: FONT_SIZE.display,
    fontWeight: FONT_WEIGHT.bold as any,
    marginTop: SPACE.s2,
  },
  card: {
    marginHorizontal: SPACE.s5,
    marginTop: -SPACE.s7,
    borderRadius: RADIUS.r4,
    elevation: 6,
    paddingVertical: SPACE.s2,
  },
  cardTitle: {
    textAlign: 'center',
    fontSize: FONT_SIZE.h2,
    marginBottom: SPACE.s5,
    color: COLOR.ink,
  },
  formWrapper: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  inputContainer: {
    marginBottom: SPACE.s4,
  },
  input: {
    backgroundColor: COLOR.surface,
  },
  errorText: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: SPACE.s2,
  },
  loginButton: {
    marginTop: SPACE.s2,
    marginBottom: SPACE.s4,
    borderRadius: RADIUS.full,
    elevation: 2,
  },
  buttonContent: {
    paddingVertical: SPACE.s2,
  },
  buttonText: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.bold as any,
  },
  helperText: {
    fontSize: FONT_SIZE.caption,
    color: COLOR.inkMute,
    textAlign: 'center',
    fontWeight: FONT_WEIGHT.regular as any,
    marginBottom: SPACE.s2,
  },
});

export default LoginScreen;
