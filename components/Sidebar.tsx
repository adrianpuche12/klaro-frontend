import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Modal, useWindowDimensions, Animated, Platform, Pressable,
} from 'react-native';
import { IconButton } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { useUIPreferences } from '../context/UIPreferencesContext';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW, BREAKPOINT } from '../theme';
import { menuFor, SidebarScreen } from '../config/navConfig';
import { BRAND_NAME } from '../constants/brand';
import ConfirmDialog from './ConfirmDialog';

export type { SidebarScreen } from '../config/navConfig';

// Tooltip custom liviano — no requiere Paper Provider
const SidebarTooltip = ({ label, children }: { label: string; children: React.ReactNode }) => {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        onHoverIn={() => setVisible(true)}
        onHoverOut={() => setVisible(false)}
        onPress={() => setVisible(false)}
      >
        {children}
      </Pressable>
      {visible && (
        <View style={tooltipStyles.box} pointerEvents="none">
          <Text style={tooltipStyles.text}>{label}</Text>
        </View>
      )}
    </View>
  );
};

const tooltipStyles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 64,
    top: '50%' as any,
    transform: [{ translateY: -12 }],
    backgroundColor: COLOR.ink,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.r1,
    zIndex: 999,
    minWidth: 80,
  },
  text: {
    color: COLOR.white,
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.medium as any,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
});

const SIDEBAR_W_EXPANDED  = 260;
const SIDEBAR_W_COLLAPSED = 88;
const ANIM_DURATION       = 250;

/** N-03: confirmar antes de cerrar sesión (un toque accidental sacaba al usuario). */
const LogoutConfirm = ({ visible, onConfirm, onCancel }: {
  visible: boolean; onConfirm: () => void; onCancel: () => void;
}) => (
  <ConfirmDialog
    visible={visible}
    title="¿Cerrar sesión?"
    message="Se va a cerrar tu sesión en este dispositivo."
    confirmLabel="Cerrar sesión"
    onConfirm={onConfirm}
    onCancel={onCancel}
  />
);

// ─── Sidebar desktop colapsable ───────────────────────────────────────────────

const SidebarDesktop = ({ active, onSelect }: {
  active: SidebarScreen;
  onSelect: (s: SidebarScreen) => void;
}) => {
  const { logout, roles, canManageUsers, permissions, fullAccess, userName } = useAuth();
  const { sidebarCollapsed, toggleSidebar } = useUIPreferences();
  // Menú según rol/Role asignado: misma regla que valida AdminDashboard (config/navConfig.ts).
  const menu = menuFor({ roles, canManageUsers, permissions, fullAccess });
  const [askLogout, setAskLogout] = useState(false);

  // Animación de ancho
  const animW = useRef(new Animated.Value(
    sidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED
  )).current;

  useEffect(() => {
    Animated.timing(animW, {
      toValue: sidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED,
      duration: ANIM_DURATION,
      useNativeDriver: false,
    }).start();
  }, [sidebarCollapsed]);

  // Atajo Ctrl+B / Cmd+B (solo web)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSidebar]);

  return (
    <Animated.View style={[styles.sidebar, { width: animW }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
        />
        {!sidebarCollapsed && (
          <View style={styles.brandText}>
            <Text style={styles.brandName} numberOfLines={1}>{BRAND_NAME}</Text>
            <Text style={styles.brandSub}>{userName ?? 'Sistema de gestión'}</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.togglePin}
          onPress={toggleSidebar}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
        >
          <MaterialCommunityIcons
            name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'}
            size={16}
            color={COLOR.ink2}
          />
        </TouchableOpacity>
      </View>

      {/* ── Menú ── */}
      <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
        {menu.map(item => {
          const isActive = active === item.key;
          if (sidebarCollapsed) {
            return (
              <SidebarTooltip key={item.key} label={item.label}>
                <TouchableOpacity
                  style={[styles.menuItemCollapsed, isActive && styles.menuItemActive]}
                  onPress={() => onSelect(item.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: isActive }}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={20}
                    color={isActive ? COLOR.brandDeep : COLOR.ink2}
                  />
                  {isActive && <View style={styles.activeBar} />}
                </TouchableOpacity>
              </SidebarTooltip>
            );
          }
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={() => onSelect(item.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <MaterialCommunityIcons
                name={item.icon}
                size={20}
                color={isActive ? COLOR.brandDeep : COLOR.ink2}
              />
              <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                {item.label}
              </Text>
              {isActive && <View style={styles.activeBar} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Logout ── */}
      <TouchableOpacity
        style={[styles.logoutBtn, sidebarCollapsed && styles.logoutBtnCollapsed]}
        onPress={() => setAskLogout(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
      >
        <MaterialCommunityIcons name="logout" size={18} color={COLOR.expense} />
        {!sidebarCollapsed && (
          <Text style={styles.logoutLabel}>Cerrar sesión</Text>
        )}
      </TouchableOpacity>
      <LogoutConfirm
        visible={askLogout}
        onConfirm={() => { setAskLogout(false); logout(); }}
        onCancel={() => setAskLogout(false)}
      />
    </Animated.View>
  );
};

// ─── Sidebar mobile (drawer modal — igual que antes) ─────────────────────────

const SidebarMobile = ({ active, onSelect, visible, onClose }: {
  active: SidebarScreen;
  onSelect: (s: SidebarScreen) => void;
  visible: boolean;
  onClose: () => void;
}) => {
  const { logout, roles, canManageUsers, permissions, fullAccess, userName } = useAuth();
  // Menú según rol/Role asignado: misma regla que valida AdminDashboard (config/navConfig.ts).
  const menu = menuFor({ roles, canManageUsers, permissions, fullAccess });
  const [askLogout, setAskLogout] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sidebar, { width: SIDEBAR_W_EXPANDED }]}>

          <View style={styles.header}>
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.logo}
            />
            <View style={styles.brandText}>
              <Text style={styles.brandName}>{BRAND_NAME}</Text>
              <Text style={styles.brandSub}>{userName ?? 'Sistema de gestión'}</Text>
            </View>
            <IconButton icon="close" size={20} iconColor={COLOR.ink2} onPress={onClose} style={{ margin: 0 }} accessibilityLabel="Cerrar menú" />
          </View>

          <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
            {menu.map(item => {
              const isActive = active === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  onPress={() => { onSelect(item.key); onClose(); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={20}
                    color={isActive ? COLOR.brandDeep : COLOR.ink2}
                  />
                  <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                    {item.label}
                  </Text>
                  {isActive && <View style={styles.activeBar} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => setAskLogout(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="logout" size={18} color={COLOR.expense} />
            <Text style={styles.logoutLabel}>Cerrar sesión</Text>
          </TouchableOpacity>
          <LogoutConfirm
            visible={askLogout}
            onConfirm={() => { setAskLogout(false); onClose(); logout(); }}
            onCancel={() => setAskLogout(false)}
          />
        </View>
        <TouchableOpacity style={styles.overlayBg} onPress={onClose} />
      </View>
    </Modal>
  );
};

// ─── Sidebar público ──────────────────────────────────────────────────────────

interface Props {
  active: SidebarScreen;
  onSelect: (screen: SidebarScreen) => void;
  visible: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<Props> = ({ active, onSelect, visible, onClose }) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT.desktop;

  if (isDesktop) {
    return <SidebarDesktop active={active} onSelect={onSelect} />;
  }

  return (
    <SidebarMobile
      active={active}
      onSelect={onSelect}
      visible={visible}
      onClose={onClose}
    />
  );
};

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay:   { flex: 1, flexDirection: 'row' },
  overlayBg: { flex: 1, backgroundColor: COLOR.overlay },

  sidebar: {
    backgroundColor: COLOR.surface,
    borderRightWidth: 1,
    borderRightColor: COLOR.border,
    flexDirection: 'column',
    overflow: 'hidden',
    ...SHADOW.md,
  },

  // Fondo neutro, no dorado: un header sólido en COLOR.brand cubre un área
  // grande y siempre visible en cada pantalla -- rompe la regla 60-30-10. El
  // logo (con borde brandDeep) ya aporta el acento dorado que necesita.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.s3,
    backgroundColor: COLOR.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
    gap: SPACE.s2,
    position: 'relative',
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    borderWidth: 2,
    borderColor: COLOR.brandDeep,
    flexShrink: 0,
  },
  brandText: { flex: 1, overflow: 'hidden', paddingRight: 32 },
  brandName: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink,
  },
  brandSub: {
    fontSize: FONT_SIZE.caption,
    color: COLOR.ink2,
    marginTop: 1,
  },

  // Pin toggle cuando colapsado
  togglePin: {
    position: 'absolute',
    right: 6,
    top: '50%' as any,
    marginTop: -13, // mitad del alto: centrado real (N-06)
    width: 26,
    height: 26,
    borderRadius: RADIUS.full,
    backgroundColor: COLOR.surface,
    borderWidth: 1,
    borderColor: COLOR.border2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...SHADOW.sm,
  },

  // Menú
  menuScroll: { flex: 1, paddingTop: SPACE.s2 },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s4,
    paddingVertical: SPACE.s3,
    marginHorizontal: SPACE.s2,
    borderRadius: RADIUS.r2,
    marginBottom: 2,
    gap: SPACE.s3,
    position: 'relative',
  },
  menuItemCollapsed: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.s3,
    marginHorizontal: SPACE.s2,
    borderRadius: RADIUS.r2,
    marginBottom: 2,
    position: 'relative',
  },
  menuItemActive:  { backgroundColor: COLOR.brandTint },
  menuLabel: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.medium as any,
    color: COLOR.ink2,
    flex: 1,
  },
  menuLabelActive: {
    color: COLOR.ink,
    fontWeight: FONT_WEIGHT.semibold as any,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    backgroundColor: COLOR.brand,
    borderRadius: RADIUS.full,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s2,
    padding: SPACE.s4,
    borderTopWidth: 1,
    borderTopColor: COLOR.border,
  },
  logoutBtnCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: SPACE.s2,
  },
  logoutLabel: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.semibold as any,
    color: COLOR.expense,
  },
});

export default Sidebar;
