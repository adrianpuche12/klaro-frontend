import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, ScrollView } from 'react-native';
import { Button, Card, Title, Text, TextInput, IconButton } from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { format } from 'date-fns';
import { COLOR, SPACE, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../theme';

interface Transaction {
  id: number;
  type: string;
  amount: number;
  date: string;
  description: string;
}

interface BalanceCalculatorProps {
  visible: boolean;
  onDismiss: () => void;
  transactions: Transaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

interface BalanceState {
  total: number;
  incomes: number;
  expenses: number;
}

const BalanceCalculator: React.FC<BalanceCalculatorProps> = ({
  visible, onDismiss, transactions, onEdit, onDelete
}) => {
  const [startDate, setStartDate]             = useState<Date | undefined>(undefined);
  const [endDate, setEndDate]                 = useState<Date | undefined>(undefined);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [selectedDateField, setSelectedDateField] = useState<'start' | 'end'>('start');
  const [balance, setBalance]                 = useState<BalanceState>({ total: 0, incomes: 0, expenses: 0 });
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (startDate && endDate && transactions) calculateBalanceAndFilter();
  }, [startDate, endDate, transactions]);

  const calculateBalanceAndFilter = () => {
    if (!startDate || !endDate) return;
    const filtered = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= startDate && d <= endDate;
    });
    setFilteredTransactions(filtered);
    const result = filtered.reduce((acc: BalanceState, curr) => {
      const amount = parseFloat(curr.amount.toString());
      if (curr.type === 'income')       { acc.incomes += amount; acc.total += amount; }
      else if (curr.type === 'expense') { acc.expenses += amount; acc.total -= amount; }
      return acc;
    }, { total: 0, incomes: 0, expenses: 0 });
    setBalance(result);
  };

  const handleDateSelect = (field: 'start' | 'end') => {
    setSelectedDateField(field);
    setDatePickerVisible(true);
  };

  const onConfirmDate = ({ date }: { date: Date | undefined }) => {
    if (date) {
      if (selectedDateField === 'start') setStartDate(date);
      else setEndDate(date);
    }
    setDatePickerVisible(false);
  };

  const formatDate = (date: Date | string | undefined): string => {
    if (!date) return '';
    return typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  };

  const clearDates = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setBalance({ total: 0, incomes: 0, expenses: 0 });
    setFilteredTransactions([]);
  };

  return (
    <Modal visible={visible} onDismiss={onDismiss} transparent animationType="slide">
      <View style={styles.modalContainer}>
        <Card style={styles.card}>
          <View style={styles.header}>
            <Title style={styles.title}>Cálculo de Balance</Title>
            <Button mode="contained" onPress={onDismiss} style={styles.closeButton}>
              Cerrar
            </Button>
          </View>

          <ScrollView style={styles.scrollContent}>
            <Card.Content>
              <View style={styles.dateInputContainer}>
                <TextInput
                  label="Fecha Inicio"
                  value={formatDate(startDate)}
                  mode="outlined"
                  style={styles.input}
                  showSoftInputOnFocus={false}
                  right={<TextInput.Icon icon="calendar" onPress={() => handleDateSelect('start')} />}
                />
                <TextInput
                  label="Fecha Fin"
                  value={formatDate(endDate)}
                  mode="outlined"
                  style={styles.input}
                  showSoftInputOnFocus={false}
                  right={<TextInput.Icon icon="calendar" onPress={() => handleDateSelect('end')} />}
                />
              </View>

              {(startDate || endDate) && (
                <Button mode="outlined" onPress={clearDates} style={styles.clearButton}>
                  Limpiar fechas
                </Button>
              )}

              {startDate && endDate && (
                <>
                  <View style={styles.balanceContainer}>
                    <Text style={styles.balanceText}>Ingresos: L{balance.incomes.toFixed(2)}</Text>
                    <Text style={styles.balanceText}>Egresos: L{balance.expenses.toFixed(2)}</Text>
                    <Text style={[styles.balanceTotal, { color: balance.total >= 0 ? COLOR.income : COLOR.expense }]}>
                      Balance Total: L{balance.total.toFixed(2)}
                    </Text>
                  </View>

                  <Title style={styles.subtitle}>Transacciones en el período</Title>
                  {filteredTransactions.length > 0 ? (
                    <View style={styles.transactionsList}>
                      {filteredTransactions.map(transaction => (
                        <Card key={transaction.id} style={styles.transactionCard}>
                          <Card.Content>
                            <View style={styles.transactionHeader}>
                              <Text style={[
                                styles.transactionType,
                                { color: transaction.type === 'income' ? COLOR.income : COLOR.expense },
                              ]}>
                                {transaction.type === 'income' ? '↑' : '↓'} {transaction.type}
                              </Text>
                              <Text style={styles.transactionAmount}>
                                L{parseFloat(transaction.amount.toString()).toFixed(2)}
                              </Text>
                            </View>
                            <Text style={styles.transactionDate}>Fecha: {formatDate(transaction.date)}</Text>
                            <Text style={styles.transactionDescription}>{transaction.description}</Text>
                            <View style={styles.actionButtons}>
                              <IconButton
                                icon="pencil"
                                mode="contained"
                                size={20}
                                onPress={() => { onEdit(transaction); onDismiss(); }}
                              />
                              <IconButton
                                icon="delete"
                                mode="contained"
                                size={20}
                                iconColor={COLOR.expense}
                                onPress={() => { onDelete(transaction); onDismiss(); }}
                              />
                            </View>
                          </Card.Content>
                        </Card>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noTransactions}>
                      No hay transacciones en el período seleccionado
                    </Text>
                  )}
                </>
              )}
            </Card.Content>
          </ScrollView>
        </Card>

        <DatePickerModal
          locale="es"
          mode="single"
          visible={datePickerVisible}
          onDismiss={() => setDatePickerVisible(false)}
          date={selectedDateField === 'start' ? startDate : endDate}
          onConfirm={onConfirmDate}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLOR.overlay,
    padding: SPACE.s5,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    borderRadius: RADIUS.r2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACE.s4,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
  },
  title: {
    fontSize: FONT_SIZE.h2,
    flex: 1,
  },
  closeButton: {
    marginLeft: SPACE.s4,
  },
  scrollContent: {
    flexGrow: 1,
  },
  subtitle: {
    fontSize: FONT_SIZE.h3,
    marginVertical: SPACE.s2,
  },
  dateInputContainer: {
    marginBottom: SPACE.s2,
  },
  input: {
    marginBottom: SPACE.s4,
  },
  clearButton: {
    marginBottom: SPACE.s4,
  },
  balanceContainer: {
    marginTop: SPACE.s5,
    marginBottom: SPACE.s5,
    padding: SPACE.s4,
    backgroundColor: COLOR.bg,
    borderRadius: RADIUS.r2,
  },
  balanceText: {
    fontSize: FONT_SIZE.body,
    marginBottom: SPACE.s2,
  },
  balanceTotal: {
    fontSize: FONT_SIZE.h3,
    fontWeight: FONT_WEIGHT.bold as any,
    marginTop: SPACE.s2,
  },
  transactionsList: {
    marginTop: SPACE.s2,
  },
  transactionCard: {
    marginBottom: SPACE.s2,
    elevation: 2,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.s1,
  },
  transactionType: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.bold as any,
  },
  transactionAmount: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.bold as any,
  },
  transactionDate: {
    fontSize: FONT_SIZE.label,
    color: COLOR.inkMute,
    marginBottom: SPACE.s1,
  },
  transactionDescription: {
    fontSize: FONT_SIZE.label,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: SPACE.s2,
  },
  noTransactions: {
    textAlign: 'center',
    marginTop: SPACE.s5,
    color: COLOR.inkMute,
    fontStyle: 'italic',
  },
});

export default BalanceCalculator;
