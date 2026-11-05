import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Button } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../theme';
import { useMoney } from '../../context/TenantConfigContext';

export interface CartItem { productId: number; productName: string; price: number; qty: number; subtotal: number; }

interface Props {
  cart: CartItem[];
  subtotal: number;
  /** Impuestos de la cotización del backend (0 si la empresa no tiene). */
  tax: number;
  total: number;
  /** Se está pidiendo la cotización al backend: no se confirma hasta tenerla. */
  quoting: boolean;
  /** Sin cotización (sin red o error): el total es la suma local, puede faltar algún impuesto. */
  estimated: boolean;
  itemCount: number;
  onRemove: (id: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  submitting: boolean;
  /** true = columna lateral (desktop). false = panel inferior desplegable (celular/tablet). */
  full: boolean;
}

/**
 * Ticket del POS — extraído de POSScreen.tsx (Revisión 02).
 * P-05: en pantallas < 900 px antes NO se listaban los productos (solo el total) y
 * el cajero solo podía "Cancelar venta" completa. Ahora el panel inferior se
 * despliega para ver y quitar productos uno por uno.
 * Los montos usan useMoney() (moneda de la empresa), nunca un símbolo fijo.
 */
export default function Ticket({ cart, subtotal, tax, total, quoting, estimated, itemCount, onRemove, onClear, onSubmit, submitting, full }: Props) {
  const money = useMoney();
  const [open, setOpen] = useState(false);
  const showList = full || open;

  return (
    <View style={[s.root, full && s.rootFull]}>
      <TouchableOpacity
        style={s.head}
        disabled={full || cart.length === 0}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole={full ? undefined : 'button'}
        accessibilityLabel={full ? undefined : open ? 'Ocultar productos de la venta' : 'Ver productos de la venta'}
        accessibilityState={full ? undefined : { expanded: open }}
      >
        <Text style={s.title}>Venta actual</Text>
        {itemCount > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}</Text>
          </View>
        )}
        {!full && cart.length > 0 && (
          <MaterialCommunityIcons name={open ? 'chevron-down' : 'chevron-up'} size={22} color={COLOR.ink2} style={s.chev} />
        )}
      </TouchableOpacity>

      {showList && (
        cart.length === 0
          ? (full ? <View style={s.empty}><Text style={s.emptyText}>La venta actual está vacía.</Text></View> : null)
          : (
            <ScrollView style={full ? s.listFull : s.listCompact}>
              {cart.map((item) => (
                <View key={item.productId} style={s.item}>
                  <View style={s.itemMain}>
                    <Text style={s.itemName} numberOfLines={1}>{item.productName}</Text>
                    <Text style={s.itemCode}>{item.qty} × {money(item.price)}</Text>
                  </View>
                  <Text style={s.itemSub}>{money(item.subtotal)}</Text>
                  <TouchableOpacity
                    onPress={() => onRemove(item.productId)}
                    style={s.deleteBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${item.productName}`}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLOR.expense} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )
      )}

      <View style={s.totals}>
        {full && (
          <View style={s.totalLine}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalLabel}>{money(subtotal)}</Text>
          </View>
        )}
        {full && tax > 0 && (
          <View style={s.totalLine}>
            <Text style={s.totalLabel}>Impuestos</Text>
            <Text style={s.totalLabel}>{money(tax)}</Text>
          </View>
        )}
        <View style={[s.totalLine, full && s.totalFinal]}>
          <Text style={s.totalLabelFinal}>TOTAL</Text>
          <Text style={s.totalAmount}>{money(total)}</Text>
        </View>
        {cart.length > 0 && (quoting || estimated) && (
          <Text style={s.quoteNote} accessibilityLiveRegion="polite">
            {quoting ? "Calculando el total…" : "Total estimado: el definitivo se calcula al confirmar."}
          </Text>
        )}
      </View>

      <View style={s.actions}>
        <Button
          mode="contained"
          onPress={onSubmit}
          loading={submitting}
          disabled={cart.length === 0 || submitting || quoting}
          buttonColor={COLOR.brand}
          textColor={COLOR.inkOnBrand}
          style={s.btn}
          contentStyle={s.btnContent}
          labelStyle={s.btnLabel}
        >
          Confirmar venta
        </Button>
        {cart.length > 0 && (
          <Button mode="outlined" onPress={onClear} disabled={submitting} style={s.btn} contentStyle={s.btnContent} textColor={COLOR.ink2}>
            Cancelar venta
          </Button>
        )}
      </View>

      {full && cart.length > 0 && (
        <View style={s.audit}>
          <Text style={s.auditText}>El sistema calcula precios, impuestos y totales automáticamente. Al confirmar se descuenta el stock.</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:            { padding: SPACE.s3 },
  quoteNote:       { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, textAlign: "right", marginTop: SPACE.s1 },
  rootFull:        { flex: 1 },
  head:            { flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, marginBottom: SPACE.s2, minHeight: 32 },
  title:           { fontSize: FONT_SIZE.h3, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  badge:           { backgroundColor: COLOR.brandTint, borderRadius: RADIUS.r2, paddingHorizontal: SPACE.s2, paddingVertical: SPACE.s1 },
  badgeText:       { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.brandDeep },
  chev:            { marginLeft: 'auto' },
  empty:           { padding: SPACE.s4, borderRadius: RADIUS.r3, backgroundColor: COLOR.bg, alignItems: 'center' },
  emptyText:       { color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any, fontSize: FONT_SIZE.label },
  listFull:        { flex: 1 },
  listCompact:     { maxHeight: 220 },
  item:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLOR.border, gap: SPACE.s2, minHeight: 48 },
  itemMain:        { flex: 1, minWidth: 0 },
  itemName:        { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  itemCode:        { fontSize: FONT_SIZE.caption, color: COLOR.inkMute, fontWeight: FONT_WEIGHT.medium as any },
  itemSub:         { fontSize: FONT_SIZE.label, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, minWidth: 76, textAlign: 'right' },
  deleteBtn:       { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  totals:          { paddingTop: SPACE.s2, gap: SPACE.s1, borderTopWidth: 1, borderTopColor: COLOR.border, marginTop: SPACE.s2 },
  totalLine:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalFinal:      { borderTopWidth: 1, borderTopColor: COLOR.border, paddingTop: SPACE.s2, marginTop: SPACE.s1 },
  totalLabel:      { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.inkMute },
  totalLabelFinal: { fontSize: FONT_SIZE.body, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink },
  totalAmount:     { fontSize: FONT_SIZE.amountHero - 10, fontWeight: FONT_WEIGHT.bold as any, color: COLOR.ink, letterSpacing: -1 },
  actions:         { marginTop: SPACE.s2, gap: SPACE.s2 },
  btn:             { borderRadius: RADIUS.r2 },
  btnContent:      { minHeight: 48 },
  btnLabel:        { fontWeight: FONT_WEIGHT.black as any },
  audit:           { marginTop: SPACE.s2, backgroundColor: COLOR.brandTint, borderWidth: 1, borderColor: COLOR.brandTint2, borderRadius: RADIUS.r3, padding: SPACE.s2 },
  auditText:       { fontSize: FONT_SIZE.caption, fontWeight: FONT_WEIGHT.medium as any, color: COLOR.ink2 },
});
