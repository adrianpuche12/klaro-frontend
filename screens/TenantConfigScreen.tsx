import React, { useEffect, useMemo, useState } from 'react';
import {
  View, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions,
} from 'react-native';
import { TextInput, Button, HelperText, Divider, ActivityIndicator } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { TIMEZONES } from '../constants/timezones';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW, CONTROL, BREAKPOINT } from '../theme';
import { useTenantConfig } from '../context/TenantConfigContext';

interface TenantConfig {
  companyName: string;
  currency: string;
  timezone: string;
  address: string;
  phone: string;
}

const EMPTY: TenantConfig = { companyName: '', currency: '', timezone: '', address: '', phone: '' };
const FIELDS = Object.keys(EMPTY) as (keyof TenantConfig)[];
const API = `${REACT_APP_API_URL}/api/v3/tenant/config`;

/**
 * C-08 (rev. 06): nombre legible de la zona a partir del identificador IANA
 * ("America/Argentina/Buenos_Aires" → "Buenos Aires"). La lista sale de
 * constants/timezones.ts, compartida con el alta de empresa (SPRINT-16).
 */
const tzLabel = (id: string) => (id.split('/').pop() ?? id).replace(/_/g, ' ');

const TenantConfigScreen = () => {
  const { refreshTenantConfig } = useTenantConfig();
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;

  const [config, setConfig]       = useState<TenantConfig>(EMPTY);
  // Últimos valores leídos/guardados en el servidor: sirve para saber si hay cambios (C-04).
  const [saved, setSaved]         = useState<TenantConfig>(EMPTY);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await axios.get(API, { timeout: 15000 });
      const c: TenantConfig = {
        companyName: data?.companyName ?? '',
        currency:    data?.currency    ?? '',
        timezone:    data?.timezone    ?? '',
        address:     data?.address     ?? '',
        phone:       data?.phone       ?? '',
      };
      setConfig(c);
      setSaved(c);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // C-04: hay cambios sin guardar si algún campo difiere de lo que tiene el servidor.
  const dirty = useMemo(() => FIELDS.some(k => config[k] !== saved[k]), [config, saved]);

  const update = (key: keyof TenantConfig, v: string) => {
    setConfig(prev => ({ ...prev, [key]: v }));
    setSuccess('');
    setError('');
  };

  const handleSave = async () => {
    if (saving) return;
    if (!config.companyName.trim()) { setError('El nombre de la empresa es obligatorio'); return; }
    if (!config.currency.trim())    { setError('La moneda es obligatoria'); return; }
    // La zona horaria es obligatoria para la empresa (SPRINT-16): no se guarda vacía.
    if (!config.timezone)           { setError('Elegí la zona horaria de la empresa'); return; }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body: TenantConfig = {
        ...config,
        companyName: config.companyName.trim(),
        currency:    config.currency.trim(),
      };
      await axios.put(API, body, { timeout: 15000 });
      setSaved(body);
      setConfig(body);
      await refreshTenantConfig();
      setSuccess('Configuración guardada');
    } catch (e: any) {
      // C-07: texto en castellano ("dueño", no "owner").
      if (e?.response?.status === 403) setError('Solo el dueño del negocio puede modificar la configuración');
      else setError(
        e?.response?.data?.error
          ?? (e?.response ? 'No se pudo guardar la configuración' : 'Sin conexión con el servidor'),
      );
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    key: keyof TenantConfig,
    opts?: { placeholder?: string; hint?: string; keyboard?: 'phone-pad' },
  ) => (
    <View style={styles.fieldWrap}>
      <TextInput
        label={label}
        value={config[key]}
        onChangeText={v => update(key, v)}
        mode="outlined"
        style={styles.input}
        outlineColor={COLOR.border2}
        activeOutlineColor={COLOR.brand}
        placeholder={opts?.placeholder}
        keyboardType={opts?.keyboard}
        disabled={saving}
      />
      {opts?.hint && (
        <Text style={styles.hint}>{opts.hint}</Text>
      )}
    </View>
  );

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator color={COLOR.brand} size="large" />
      <Text style={styles.loadingText}>Cargando configuración…</Text>
    </View>
  );

  // C-01: si no se pudo leer la configuración NO se muestra el formulario vacío:
  // guardarlo pisaría dirección, teléfono y zona horaria con vacío.
  if (loadError) return (
    <View style={styles.center}>
      <MaterialCommunityIcons name="cloud-off-outline" size={44} color={COLOR.inkDisabled} />
      <Text style={styles.errTitle}>No se pudo cargar la configuración</Text>
      <Text style={styles.errSub}>
        Para no borrar datos por error, el formulario se habilita cuando se puedan leer los valores actuales.
      </Text>
      <Button mode="contained" buttonColor={COLOR.brand} textColor={COLOR.inkOnBrand} onPress={load}>
        Reintentar
      </Button>
    </View>
  );

  const tzKnown = TIMEZONES.includes(config.timezone);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* C-08: título propio solo en escritorio (en celular ya lo muestra la barra superior). */}
      {isDesktop && <Text style={styles.title}>Configuración del negocio</Text>}

      <Text style={styles.sectionTitle}>Empresa</Text>
      {field('Nombre de la empresa', 'companyName', { placeholder: 'Ej. Mi Empresa S.A.' })}
      {field('Moneda', 'currency', {
        placeholder: 'Ej. L, $, S/, COP',
        hint: 'Símbolo que se usa al mostrar montos en reportes y pantallas.',
      })}
      {field('Dirección', 'address', { placeholder: 'Ej. Av. Principal 123, Ciudad' })}
      {field('Teléfono', 'phone', { placeholder: 'Ej. +00 0000-0000', keyboard: 'phone-pad' })}

      <Divider style={styles.divider} />

      <Text style={styles.sectionTitle}>Zona horaria</Text>
      {/* C-08: grilla de 2 columnas con nombres legibles (antes 12 botones a ancho completo). */}
      <View style={styles.tzGrid} accessibilityRole="radiogroup">
        {TIMEZONES.map(tz => {
          const on = config.timezone === tz;
          return (
            <TouchableOpacity
              key={tz}
              style={[styles.tzChip, on && styles.tzChipOn]}
              onPress={() => update('timezone', tz)}
              disabled={saving}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: saving }}
              accessibilityLabel={tz}
            >
              <Text style={[styles.tzText, on && styles.tzTextOn]} numberOfLines={1}>{tzLabel(tz)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>
        Zona horaria seleccionada: {config.timezone || '—'}
        {!!config.timezone && !tzKnown ? ' (no está en la lista)' : ''}
      </Text>

      <Divider style={styles.divider} />

      {!!error && <HelperText type="error" visible style={styles.feedback}>{error}</HelperText>}
      {/* C-04: el aviso de guardado desaparece en cuanto se vuelve a editar. */}
      {!!success && !dirty && (
        <View style={styles.okRow}>
          <MaterialCommunityIcons name="check-circle" size={18} color={COLOR.income} />
          <Text style={styles.okText}>{success}</Text>
        </View>
      )}
      {dirty && <Text style={styles.dirty}>Tenés cambios sin guardar</Text>}

      {/* G-01 + C-04: deshabilitado mientras guarda y cuando no hay cambios. */}
      <Button
        mode="contained"
        onPress={handleSave}
        loading={saving}
        disabled={saving || !dirty}
        style={styles.saveBtn}
        contentStyle={styles.saveBtnContent}
        buttonColor={COLOR.brand}
        textColor={COLOR.inkOnBrand}
        labelStyle={styles.saveBtnLabel}
      >
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </Button>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    padding: SPACE.s5,
    paddingBottom: SPACE.s8,
    backgroundColor: COLOR.bg,
    flexGrow: 1,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACE.s3,
    padding: SPACE.s6,
    backgroundColor: COLOR.bg,
  },
  loadingText: {
    fontSize: FONT_SIZE.body,
    color: COLOR.inkMute,
  },
  errTitle: {
    fontSize: FONT_SIZE.h3,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink,
    textAlign: 'center',
  },
  errSub: {
    fontSize: FONT_SIZE.label,
    color: COLOR.inkMute,
    textAlign: 'center',
    maxWidth: 360,
  },
  title: {
    fontSize: FONT_SIZE.h1,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink,
    marginBottom: SPACE.s4,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.h3,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink,
    marginBottom: SPACE.s3,
    marginTop: SPACE.s2,
  },
  fieldWrap: {
    marginBottom: SPACE.s4,
  },
  input: {
    backgroundColor: COLOR.surface,
  },
  hint: {
    fontSize: FONT_SIZE.caption,
    color: COLOR.inkMute,
    marginTop: SPACE.s1,
  },
  divider: {
    marginVertical: SPACE.s4,
    backgroundColor: COLOR.border,
  },
  tzGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.s2,
  },
  tzChip: {
    flexGrow: 1,
    flexBasis: '45%',
    height: CONTROL.buttonSmH,
    borderRadius: RADIUS.r2,
    borderWidth: 1,
    borderColor: COLOR.border2,
    backgroundColor: COLOR.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACE.s2,
  },
  tzChipOn: {
    backgroundColor: COLOR.brand,
    borderColor: COLOR.brandDark,
  },
  tzText: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.semibold as any,
    color: COLOR.ink2,
  },
  tzTextOn: {
    color: COLOR.inkOnBrand,
    fontWeight: FONT_WEIGHT.bold as any,
  },
  feedback: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: SPACE.s3,
  },
  okRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s2,
    marginBottom: SPACE.s3,
  },
  okText: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.income,
  },
  dirty: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.semibold as any,
    color: COLOR.warn,
    marginBottom: SPACE.s3,
  },
  saveBtn: {
    marginTop: SPACE.s2,
    borderRadius: RADIUS.full,
    ...SHADOW.sm,
  },
  saveBtnContent: {
    minHeight: 52,
  },
  saveBtnLabel: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.bold as any,
  },
});

export default TenantConfigScreen;
