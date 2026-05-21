import React, { useEffect, useState } from 'react';
import {
  View, ScrollView, StyleSheet, Text, Alert,
} from 'react-native';
import { TextInput, Button, HelperText, Divider } from 'react-native-paper';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { COLOR, SPACE, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW } from '../theme';

interface TenantConfig {
  companyName: string;
  currency: string;
  timezone: string;
  address: string;
  phone: string;
}

const TIMEZONES = [
  'America/Tegucigalpa',
  'America/Guatemala',
  'America/El_Salvador',
  'America/Managua',
  'America/Costa_Rica',
  'America/Panama',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Mexico_City',
  'America/New_York',
];

const TenantConfigScreen = () => {
  const [config, setConfig]     = useState<TenantConfig>({
    companyName: '',
    currency:    '',
    timezone:    '',
    address:     '',
    phone:       '',
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  useEffect(() => {
    axios.get(`${REACT_APP_API_URL}/api/v3/tenant/config`)
      .then(res => setConfig({
        companyName: res.data.companyName ?? '',
        currency:    res.data.currency    ?? '',
        timezone:    res.data.timezone    ?? '',
        address:     res.data.address     ?? '',
        phone:       res.data.phone       ?? '',
      }))
      .catch(() => setError('No se pudo cargar la configuración'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config.companyName.trim()) { setError('El nombre de la empresa es obligatorio'); return; }
    if (!config.currency.trim())    { setError('La moneda es obligatoria'); return; }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await axios.put(`${REACT_APP_API_URL}/api/v3/tenant/config`, config);
      setSuccess('Configuración guardada correctamente');
    } catch (e: any) {
      if (e?.response?.status === 403) setError('Solo el owner puede modificar la configuración');
      else setError('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    key: keyof TenantConfig,
    opts?: { placeholder?: string; hint?: string }
  ) => (
    <View style={styles.fieldWrap}>
      <TextInput
        label={label}
        value={config[key]}
        onChangeText={v => setConfig(prev => ({ ...prev, [key]: v }))}
        mode="outlined"
        style={styles.input}
        outlineColor={COLOR.border2}
        activeOutlineColor={COLOR.brand}
        placeholder={opts?.placeholder}
      />
      {opts?.hint && (
        <Text style={styles.hint}>{opts.hint}</Text>
      )}
    </View>
  );

  if (loading) return (
    <View style={styles.center}>
      <Text style={styles.loadingText}>Cargando configuración…</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      <Text style={styles.sectionTitle}>Empresa</Text>
      {field('Nombre de la empresa', 'companyName', { placeholder: 'Ej. Mi Empresa S.A.' })}
      {field('Moneda', 'currency', {
        placeholder: 'Ej. L, $, S/, COP',
        hint: 'Símbolo que se usa al mostrar montos en reportes y pantallas.',
      })}
      {field('Dirección', 'address', { placeholder: 'Ej. Col. Palmira, Tegucigalpa' })}
      {field('Teléfono', 'phone', { placeholder: 'Ej. +504 9999-9999' })}

      <Divider style={styles.divider} />

      <Text style={styles.sectionTitle}>Zona horaria</Text>
      <View style={styles.fieldWrap}>
        {TIMEZONES.map(tz => (
          <Button
            key={tz}
            mode={config.timezone === tz ? 'contained' : 'outlined'}
            onPress={() => setConfig(prev => ({ ...prev, timezone: tz }))}
            style={styles.tzBtn}
            labelStyle={styles.tzLabel}
            buttonColor={config.timezone === tz ? COLOR.brand : undefined}
            textColor={config.timezone === tz ? COLOR.inkOnBrand : COLOR.ink2}
            compact
          >
            {tz.replace('America/', '')}
          </Button>
        ))}
      </View>
      <Text style={styles.hint}>
        Zona horaria seleccionada: {config.timezone || '—'}
      </Text>

      <Divider style={styles.divider} />

      {error   ? <HelperText type="error"   visible style={styles.feedback}>{error}</HelperText>   : null}
      {success ? <HelperText type="info"    visible style={[styles.feedback, { color: COLOR.income }]}>{success}</HelperText> : null}

      <Button
        mode="contained"
        onPress={handleSave}
        loading={saving}
        disabled={saving}
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
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLOR.bg,
  },
  loadingText: {
    fontSize: FONT_SIZE.body,
    color: COLOR.inkMute,
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
  tzBtn: {
    marginBottom: SPACE.s2,
    borderRadius: RADIUS.r2,
    borderColor: COLOR.border2,
  },
  tzLabel: {
    fontSize: FONT_SIZE.label,
  },
  feedback: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: SPACE.s3,
  },
  saveBtn: {
    marginTop: SPACE.s2,
    borderRadius: RADIUS.full,
    ...SHADOW.sm,
  },
  saveBtnContent: {
    paddingVertical: SPACE.s2,
  },
  saveBtnLabel: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.bold as any,
  },
});

export default TenantConfigScreen;
