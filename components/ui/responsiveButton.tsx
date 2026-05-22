import React from 'react';
import { useWindowDimensions, StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';
import { COLOR, RADIUS, BREAKPOINT } from '../../theme';

interface ResponsiveButtonProps {
  title: string;
  onPress: () => void;
  mode?: 'contained' | 'outlined';
  backgroundColor?: string;
}

const ResponsiveButton: React.FC<ResponsiveButtonProps> = ({
  title, onPress, mode = 'contained', backgroundColor,
}) => {
  const { width } = useWindowDimensions();
  const bgColor = backgroundColor ?? COLOR.brand;

  return (
    <Button
      mode={mode}
      onPress={onPress}
      labelStyle={{ color: COLOR.inkOnBrand }}
      style={[
        styles.button,
        width >= BREAKPOINT.desktop ? styles.desktopButton : styles.mobileButton,
        { backgroundColor: bgColor },
      ]}
    >
      {title}
    </Button>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: RADIUS.r2,
    marginTop: 16,
  },
  mobileButton: {
    width: '100%',
  },
  desktopButton: {
    width: 300,
    alignSelf: 'center',
  },
});

export default ResponsiveButton;
