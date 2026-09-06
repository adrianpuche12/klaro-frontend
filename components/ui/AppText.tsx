import React from 'react';
import { Text, TextProps } from 'react-native';
import { COLOR, FONT_SIZE, FONT_WEIGHT } from '../../theme';

/**
 * Un solo componente de texto parametrizable por `variant`, en vez de un
 * <Text style={{...}}> distinto reinventado en cada pantalla (título, subtítulo,
 * descripción, label, caption). Ver "05. Estandares de Codigo Frontend (React)"
 * en el vault de Belopia — obligatorio para texto nuevo desde 07-Sep-2026.
 */
export type AppTextVariant =
  | 'display'      // hero de pantalla (raro, casi siempre 'title' alcanza)
  | 'title'        // título de sección/modal
  | 'subtitle'     // subtítulo, nombre secundario debajo de un título
  | 'body'         // texto de cuerpo normal
  | 'description'  // texto de cuerpo secundario/apagado (ayuda, notas)
  | 'label'        // labels de campo, encabezados de tabla
  | 'caption';      // texto auxiliar chico (timestamps, ayuda breve)

const VARIANT_STYLE: Record<AppTextVariant, { fontSize: number; fontWeight: string; color: string }> = {
  display:     { fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.black,     color: COLOR.ink },
  title:       { fontSize: FONT_SIZE.h1,      fontWeight: FONT_WEIGHT.bold,      color: COLOR.ink },
  subtitle:    { fontSize: FONT_SIZE.h2,      fontWeight: FONT_WEIGHT.semibold,  color: COLOR.ink2 },
  body:        { fontSize: FONT_SIZE.body,    fontWeight: FONT_WEIGHT.regular,   color: COLOR.ink },
  description: { fontSize: FONT_SIZE.body,    fontWeight: FONT_WEIGHT.regular,   color: COLOR.inkMute },
  label:       { fontSize: FONT_SIZE.label,   fontWeight: FONT_WEIGHT.semibold,  color: COLOR.inkMute },
  caption:     { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium,    color: COLOR.inkMute },
};

interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
  /** Sobreescribe el color del token de la variante (ej. un título en rojo de error). */
  color?: string;
  centered?: boolean;
  children: React.ReactNode;
}

const AppText: React.FC<AppTextProps> = ({
  variant = 'body', color, centered, style, children, ...rest
}) => {
  const v = VARIANT_STYLE[variant];
  return (
    <Text
      style={[
        { fontSize: v.fontSize, fontWeight: v.fontWeight as any, color: color ?? v.color },
        centered && { textAlign: 'center' as const },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
};

export default AppText;
