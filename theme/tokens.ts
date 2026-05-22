/**
 * DESIGN TOKENS — Klaro SaaS
 *
 * FUENTE DE VERDAD ÚNICA para toda la interfaz.
 * Cualquier cambio visual se hace aquí y se propaga automáticamente
 * a todos los componentes que importen desde este archivo.
 *
 * Reglas:
 *   - NUNCA escribir colores hex directamente en los componentes.
 *   - NUNCA hardcodear font sizes, spacing o radii.
 *   - Todo viene de aquí.
 */

// ─── COLORES ─────────────────────────────────────────────────────────────────
//
// Paleta cálida. Brand = dorado Klaro.
// Fondo warm-white en lugar de gris frío.

export const COLOR = {
  // ── Brand (amarillo PH) ───────────────────────────────────────────────────
  brand:         '#F5C430',  // dorado principal — identidad Klaro
  brandDark:     '#D4A520',  // versión oscura para estados presionados / hover
  brandDeep:     '#A68022',  // versión muy oscura para texto sobre brand
  brandTint:     '#FEF6D8',  // fondo amarillo muy suave (badges, highlights)
  brandTint2:    '#FAE598',  // fondo amarillo medio (chips activos)

  // ── Fondos ────────────────────────────────────────────────────────────────
  bg:            '#F8F6F2',  // fondo principal de la app (warm white)
  bgAlt:         '#F1EDE6',  // fondo alternativo ligeramente más oscuro
  surface:       '#FFFFFF',  // superficie de cards, modales, inputs
  surface2:      '#F4F0E8',  // superficie secundaria (headers de tabla)
  overlay:       'rgba(0,0,0,0.50)',  // fondo de modales y drawers

  // ── Bordes ────────────────────────────────────────────────────────────────
  border:        '#E8E3DA',  // borde sutil (separadores, inputs)
  border2:       '#D7D1C5',  // borde más visible (cards, secciones)
  borderFocus:   '#F5C430',  // borde de input con foco (= brand)

  // ── Texto ─────────────────────────────────────────────────────────────────
  ink:           '#1F1B16',  // texto principal — negro cálido
  ink2:          '#4A4338',  // texto secundario (subtítulos, metadata)
  inkMute:       '#7A715F',  // texto apagado (placeholders, hints)
  inkDisabled:   '#B8B0A0',  // texto deshabilitado
  inkOnBrand:    '#1F1B16',  // texto sobre fondo brand (no blanco — evita bajo contraste)

  // ── Semánticos ────────────────────────────────────────────────────────────
  income:        '#2E7D4F',  // verde — ingresos, stock OK, activo
  incomeTint:    '#E4F3EA',  // fondo verde suave
  incomeBorder:  '#A8D8BA',  // borde verde

  expense:       '#C0392B',  // rojo — egresos, errores, eliminar
  expenseTint:   '#FBEAE8',  // fondo rojo suave
  expenseBorder: '#F0A9A3',  // borde rojo

  info:          '#1E6BB5',  // azul — información, links, reasignar
  infoTint:      '#E3EEF8',  // fondo azul suave
  infoBorder:    '#9DC0E8',  // borde azul

  warn:          '#C07A20',  // naranja — advertencias, stock bajo
  warnTint:      '#FEF3E0',  // fondo naranja suave
  warnBorder:    '#F0C070',  // borde naranja

  // ── Semánticos de UI ──────────────────────────────────────────────────────
  catGuide:      '#E8E3DA',  // alias de border, para guías de jerarquía en CategoryTree
  movementSale:  '#6B46C1',  // violeta — movimientos tipo VENTA en historial de inventario

  // ── Sistema ───────────────────────────────────────────────────────────────
  white:         '#FFFFFF',
  black:         '#000000',
  transparent:   'transparent',
} as const;

// ─── TIPOGRAFÍA ───────────────────────────────────────────────────────────────
//
// Fuentes: Plus Jakarta Sans (UI) + JetBrains Mono (montos y códigos).
// Si las fuentes custom no cargan, el sistema cae al fallback del sistema.

export const FONT_FAMILY = {
  sans:        'PlusJakartaSans-Regular',
  sansMedium:  'PlusJakartaSans-Medium',
  sansSemi:    'PlusJakartaSans-SemiBold',
  sansBold:    'PlusJakartaSans-Bold',
  sansExtra:   'PlusJakartaSans-ExtraBold',
  mono:        'JetBrainsMono-Regular',
  monoBold:    'JetBrainsMono-Bold',

  // Fallbacks del sistema (mientras cargan las fuentes custom)
  sansSystem:  'System',
  monoSystem:  'Courier',
} as const;

export const FONT_SIZE = {
  display: 28,   // pantallas hero / títulos de sección
  h1:      22,   // encabezados principales
  h2:      18,   // encabezados secundarios
  h3:      16,   // subtítulos
  body:    15,   // texto de cuerpo
  label:   13,   // labels de campo, badges
  caption: 11,   // textos auxiliares, timestamps

  // Montos (siempre con font mono)
  amount:     22,  // monto normal (filas de lista)
  amountHero: 32,  // monto destacado (balance principal)
  amountXL:   40,  // monto muy grande (total de cierre)
} as const;

export const FONT_WEIGHT = {
  regular:   '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
  black:     '900',
} as const;

export const LINE_HEIGHT = {
  tight:   1.1,
  normal:  1.4,
  relaxed: 1.6,
} as const;

// ─── ESPACIADO ────────────────────────────────────────────────────────────────
//
// Escala de 4pt. Todos los márgenes, paddings y gaps usan estos valores.
// s1=4, s2=8, s3=12, s4=16, s5=24, s6=32, s7=48, s8=64

export const SPACE = {
  s1:  4,
  s2:  8,
  s3:  12,
  s4:  16,
  s5:  24,
  s6:  32,
  s7:  48,
  s8:  64,
  s9:  80,
  s10: 96,
} as const;

// ─── RADIOS DE BORDE ─────────────────────────────────────────────────────────

export const RADIUS = {
  r1:   6,    // inputs, chips pequeños
  r2:   10,   // botones, cards pequeñas
  r3:   14,   // cards normales
  r4:   20,   // cards grandes, modales
  r5:   28,   // bottom sheets
  full: 999,  // círculos, pills
} as const;

// ─── SOMBRAS ─────────────────────────────────────────────────────────────────
//
// Tres niveles: sutil (cards), media (dropdowns), fuerte (modales).

export const SHADOW = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: COLOR.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: COLOR.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: COLOR.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 14,
  },
} as const;

// ─── CONTROLES ────────────────────────────────────────────────────────────────
//
// Alturas estándar de elementos interactivos.
// Los botones y inputs NUNCA deben estar por debajo de estos valores.

export const CONTROL = {
  buttonH:      56,  // altura de botón principal (área de toque mínima)
  buttonSmH:    40,  // altura de botón secundario / compacto
  inputH:       52,  // altura de input de texto
  amountInputH: 64,  // altura de input de monto (más grande — dato crítico)
  iconBtnH:     40,  // botón solo icono (circular)
  tabBarH:      64,  // barra de tabs inferior
  appBarH:      56,  // barra superior (header)
  chipH:        32,  // chips y badges interactivos
} as const;

// ─── Z-INDEX ──────────────────────────────────────────────────────────────────
//
// Capas de la interfaz. Siempre referenciar desde aquí.

export const Z = {
  base:        0,
  content:     1,
  sticky:      10,
  appBar:      20,
  fab:         30,
  drawer:      40,
  bottomSheet: 50,
  modal:       60,
  toast:       100,
} as const;

// ─── ANIMACIONES ─────────────────────────────────────────────────────────────
//
// Duraciones en milisegundos para transiciones y feedback.

export const MOTION = {
  fast:   120,  // feedback inmediato (press, toggle)
  base:   200,  // transiciones estándar
  slow:   320,  // animaciones de entrada (modales, drawers)
  xslow:  500,  // animaciones complejas
} as const;

// ─── BREAKPOINTS ─────────────────────────────────────────────────────────────

export const BREAKPOINT = {
  mobile:  0,    // <600px — móvil
  tablet:  600,  // 600–899px — tablet / landscape
  desktop: 900,  // ≥900px — desktop
} as const;

// ─── PAPEL (React Native Paper MD3 Theme) ────────────────────────────────────
//
// Mapeo de los tokens de color al esquema MD3 de react-native-paper.
// Permite usar componentes de Paper (Button, TextInput, etc) con nuestros colores.

export const PAPER_THEME = {
  colors: {
    primary:          COLOR.brand,
    onPrimary:        COLOR.inkOnBrand,
    primaryContainer: COLOR.brandTint,
    onPrimaryContainer: COLOR.brandDeep,

    secondary:        COLOR.ink2,
    onSecondary:      COLOR.white,
    secondaryContainer: COLOR.surface2,
    onSecondaryContainer: COLOR.ink,

    background:       COLOR.bg,
    onBackground:     COLOR.ink,

    surface:          COLOR.surface,
    onSurface:        COLOR.ink,
    surfaceVariant:   COLOR.surface2,
    onSurfaceVariant: COLOR.ink2,

    outline:          COLOR.border2,
    outlineVariant:   COLOR.border,

    error:            COLOR.expense,
    onError:          COLOR.white,
    errorContainer:   COLOR.expenseTint,
    onErrorContainer: COLOR.expense,

    elevation: {
      level0: COLOR.transparent,
      level1: COLOR.surface,
      level2: COLOR.surface,
      level3: COLOR.surface,
      level4: COLOR.surface,
      level5: COLOR.surface,
    },
  },
} as const;

// ─── ESTILOS COMUNES REUTILIZABLES ────────────────────────────────────────────
//
// Bloques de estilo frecuentes predefinidos.
// Importar directamente en StyleSheet.create().

export const STYLE = {
  // Row horizontal centrado
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  // Centrado absoluto
  centered: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  // Card base
  card: {
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.r3,
    borderWidth: 1,
    borderColor: COLOR.border,
    ...SHADOW.sm,
  },
  // Input base
  input: {
    backgroundColor: COLOR.surface,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: RADIUS.r2,
    height: CONTROL.inputH,
    paddingHorizontal: SPACE.s4,
    color: COLOR.ink,
    fontSize: FONT_SIZE.body,
  },
  // Separador horizontal
  divider: {
    height: 1,
    backgroundColor: COLOR.border,
  },
} as const;
