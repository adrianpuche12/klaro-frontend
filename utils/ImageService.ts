import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';
import { REACT_APP_API_URL } from '../config';
import { apiFetch } from './apiFetch';

export interface ImageUploadResult {
  success: boolean;
  /** Clave del objeto en R2 (no una URL pública): es lo que se guarda en el registro. */
  imageUri?: string;
  error?: string;
}

/**
 * URL firmada (válida 5 minutos) para ver un comprobante. El bucket de R2 es privado:
 * `ref` es lo que tenga guardado el registro en `imageUri` (la clave nueva o la URL
 * pública vieja `https://pub-…r2.dev/…`, el backend acepta las dos).
 * Pedirla justo antes de mostrarla; no guardarla, porque vence.
 */
export async function getComprobanteUrl(ref: string): Promise<string> {
  const { data } = await axios.get<{ url: string; expiresInSeconds: number }>(
    `${REACT_APP_API_URL}/api/v2/uploads/comprobante/url`,
    { params: { ref } },
  );
  return data.url;
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
   * Sube un comprobante al backend, que lo guarda en Cloudflare R2 (bucket privado).
   * `storeId` es obligatorio: el backend valida que el usuario tenga acceso a ese local.
   * El backend decide el tipo por el contenido del archivo (solo PDF, JPG o PNG).
   */
  static async uploadImage(
    imageUri: string,
    fileName: string,
    storeId: number
  ): Promise<ImageUploadResult> {
    try {
      const formData = new FormData();
      formData.append('storeId', String(storeId));

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
        const { key, url } = await uploadResponse.json();
        return { success: true, imageUri: key ?? url };
      }
      if (uploadResponse.status === 400) {
        return { success: false, error: 'Solo se aceptan comprobantes PDF, JPG o PNG.' };
      }
      if (uploadResponse.status === 403) {
        return { success: false, error: 'No tenés permiso para adjuntar comprobantes en este local.' };
      }
      return { success: false, error: `Error del servidor: ${uploadResponse.status}` };
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