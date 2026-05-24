import React from 'react';
import { View, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { Surface, Text, IconButton } from 'react-native-paper';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOW, BREAKPOINT } from '../theme';

interface Transaction {
  id: number;
  type: 'income' | 'expense' | 'CLOSING' | 'SUPPLIER' | 'SALARY';
  amount: number | string;
  date?: string;
  description?: string;
  storeId?: number;
  storeName?: string;
}

interface BalanceSummaryProps {
  transactions: Transaction[];
  storeName?: string | null;
}

const BalanceSummary: React.FC<BalanceSummaryProps> = ({ transactions, storeName }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINT.desktop;

  const balance = transactions.reduce((acc, curr) => {
    const amount = parseFloat(curr.amount.toString());
    if (curr.type === 'income' || curr.type === 'CLOSING') {
      acc.incomes += amount;
      acc.total += amount;
    } else if (curr.type === 'expense' || curr.type === 'SUPPLIER' || curr.type === 'SALARY') {
      acc.expenses += amount;
      acc.total -= amount;
    }
    return acc;
  }, { total: 0, incomes: 0, expenses: 0 });

  return (
    <View style={styles.wrapper}>
      <Surface
        style={[
          styles.container,
          isMobile ? styles.mobileContainer : styles.desktopContainer,
        ]}
        elevation={4}
      >
        <View style={styles.content}>
          <Text style={[styles.title, isMobile && styles.mobileTitle]}>
            {storeName ? `Balance de ${storeName}` : 'Balance General'}
          </Text>

          <View style={styles.row}>
            <IconButton icon="trending-up" size={16} iconColor={COLOR.income} style={styles.icon} />
            <Text style={styles.label}>Ingresos</Text>
            <Text style={styles.incomeValue}>
              L{balance.incomes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={styles.row}>
            <IconButton icon="trending-down" size={16} iconColor={COLOR.expense} style={styles.icon} />
            <Text style={styles.label}>Egresos</Text>
            <Text style={styles.expenseValue}>
              L{balance.expenses.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={[styles.row, styles.totalRow]}>
            <IconButton
              icon="currency-usd"
              size={16}
              iconColor={balance.total >= 0 ? COLOR.income : COLOR.expense}
              style={styles.icon}
            />
            <Text style={[styles.label, styles.totalLabel]}>Total</Text>
            <Text style={[styles.totalValue, { color: balance.total >= 0 ? COLOR.income : COLOR.expense }]}>
              L{balance.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>
      </Surface>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    width: '100%',
    marginVertical: SPACE.s4,
  },
  container: {
    backgroundColor: COLOR.surface,
    borderRadius: RADIUS.r3,
    ...Platform.select({
      ios: {
        shadowColor: COLOR.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: { elevation: 5 },
      default: { elevation: 4 },
    }),
  },
  mobileContainer: {
    width: '90%',
    maxWidth: 400,
  },
  desktopContainer: {
    width: '50%',
    maxWidth: 500,
    minWidth: 400,
  },
  content: {
    padding: SPACE.s4,
  },
  title: {
    fontSize: FONT_SIZE.h3,
    fontWeight: FONT_WEIGHT.bold as any,
    color: COLOR.ink,
    textAlign: 'center',
    marginBottom: SPACE.s3,
  },
  mobileTitle: {
    fontSize: FONT_SIZE.body,
    marginBottom: SPACE.s2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.s1,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLOR.border,
    marginTop: SPACE.s1,
    paddingTop: SPACE.s2,
  },
  icon: {
    margin: 0,
    padding: 0,
  },
  label: {
    flex: 1,
    fontSize: FONT_SIZE.label,
    color: COLOR.inkMute,
    marginLeft: SPACE.s1,
  },
  totalLabel: {
    fontWeight: FONT_WEIGHT.medium as any,
  },
  incomeValue: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.semibold as any,
    color: COLOR.income,
    minWidth: 120,
    textAlign: 'right',
  },
  expenseValue: {
    fontSize: FONT_SIZE.label,
    fontWeight: FONT_WEIGHT.semibold as any,
    color: COLOR.expense,
    minWidth: 120,
    textAlign: 'right',
  },
  totalValue: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.bold as any,
    minWidth: 120,
    textAlign: 'right',
  },
});

export default BalanceSummary;
