import React, { useState } from 'react';
import { View, StyleSheet, Image, Alert } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { ImageService } from '../utils/ImageService';
import { COLOR, FONT_SIZE, FONT_WEIGHT } from '../theme';

interface SelectedImage {
  uri: string;
  name: string;
  type: string;
}

interface ImagePickerProps {
  onImageSelected: (image: SelectedImage | null) => void;
  initialImage?: SelectedImage | null;
  disabled?: boolean;
}

const ImagePicker: React.FC<ImagePickerProps> = ({ 
  onImageSelected, 
  initialImage,
  disabled = false 
}) => {
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(initialImage || null);

  const handleSelectImage = async () => {
    try {
      const result = await ImageService.selectImage();
      
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const imageData: SelectedImage = {
          uri: asset.uri,
          name: asset.name || ImageService.generateFileName('COMPROBANTE'),
          type: asset.mimeType || 'image/jpeg'
        };
        
        setSelectedImage(imageData);
        onImageSelected(imageData);
      }
    } catch (error) {
      Alert.alert('Error', 'Error al seleccionar imagen');
      console.error('Error:', error);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    onImageSelected(null);
  };

  return (
    <Card style={styles.container}>
      <Card.Content>
        <Text style={styles.label}>Comprobante (Opcional)</Text>
        
        {selectedImage ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: selectedImage.uri }} style={styles.image} />
            <View style={styles.buttonRow}>
              <Button 
                mode="outlined" 
                onPress={handleRemoveImage}
                style={styles.button}
                disabled={disabled}
              >
                Eliminar
              </Button>
              <Button 
                mode="contained" 
                onPress={handleSelectImage}
                style={styles.button}
                disabled={disabled}
              >
                Cambiar
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.noImageContainer}>
            <Button 
              mode="contained" 
              onPress={handleSelectImage}
              icon="camera"
              style={styles.selectButton}
              disabled={disabled}
              buttonColor={COLOR.brandDark}
            >
              Seleccionar Comprobante
            </Button>
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  label: {
    fontSize: FONT_SIZE.body,
    fontWeight: FONT_WEIGHT.bold as any,
    marginBottom: 10,
    color: COLOR.inkMute,
  },
  imageContainer: {
    alignItems: 'center',
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
    resizeMode: 'cover',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    marginHorizontal: 5,
  },
  noImageContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  selectButton: {
    paddingHorizontal: 20,
  },
  uploadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  uploadingText: {
    marginTop: 10,
    color: COLOR.inkMute,
  },
});

export default ImagePicker;