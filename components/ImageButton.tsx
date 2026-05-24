import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLOR, FONT_SIZE, RADIUS, SPACE } from '../theme';
import ImageViewer from './ImageViewer';

interface ImageButtonProps {
  imageUri?: string;
  onPress?: () => void;
}

const ImageButton: React.FC<ImageButtonProps> = ({ imageUri, onPress }) => {
  if (!imageUri) {
    return (
      <TouchableOpacity style={styles.noImageButton} disabled>
        <MaterialCommunityIcons name="image-off" size={16} color={COLOR.inkDisabled} />
        <Text style={styles.noImageText}>Sin comprobante</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.imageButton} onPress={onPress}>
      <MaterialCommunityIcons name="image" size={16} color={COLOR.info} />
      <Text style={styles.imageButtonText}>Ver comprobante</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.s1,
    paddingHorizontal: SPACE.s2,
    backgroundColor: COLOR.infoTint,
    borderRadius: RADIUS.r1,
    marginTop: SPACE.s1,
  },
  imageButtonText: {
    fontSize: FONT_SIZE.caption,
    color: COLOR.info,
    marginLeft: SPACE.s1,
  },
  noImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.s1,
    paddingHorizontal: SPACE.s2,
    backgroundColor: COLOR.bg,
    borderRadius: RADIUS.r1,
    marginTop: SPACE.s1,
  },
  noImageText: {
    fontSize: FONT_SIZE.caption,
    color: COLOR.inkDisabled,
    marginLeft: SPACE.s1,
  },
});

export default ImageButton;
