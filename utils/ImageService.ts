import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { REACT_APP_API_URL } from '../config';
import { apiFetch } from './apiFetch';

export interface ImageUploadResult {
  success: boolean;
  imageUri?: string;
  error?: string;
}

export class ImageService {
    /**
   * Permite al usuario seleccionar una imagen (solo selecciona, no sube)
   */
  static async selectImage(): Promise<DocumentPicker.DocumentPickerResult> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      
      return result;
    } catch (error) {
      console.error('Error al seleccionar imagen:', error);
      throw error;
    }
  }

  /**
   * Sube una imagen al servidor Python
   */
  static async uploadImage(
    imageUri: string,
    fileName: string,
    _folder: string = 'comprobantes'
  ): Promise<ImageUploadResult> {
    try {
      const formData = new FormData();

      if (Platform.OS === 'web') {
        const response = await apiFetch(imageUri);
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
        formData.append('file', file);
      } else {
        formData.append('file', {
          uri: imageUri,
          type: 'image/jpeg',
          name: fileName,
        } as any);
      }

      // Upload vía backend → backend sube a Cloudflare R2
      const uploadResponse = await apiFetch(`${REACT_APP_API_URL}/api/v2/uploads/comprobante`, {
        method: 'POST',
        body: formData,
      });

      if (uploadResponse.ok) {
        const { url } = await uploadResponse.json();
        return { success: true, imageUri: url };
      } else {
        return { success: false, error: `Error del servidor: ${uploadResponse.status}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Genera un nombre único para la imagen
   */
  static generateFileName(prefix: string = 'IMG'): string {
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}_${timestamp}_${random}.jpg`;
  }
}