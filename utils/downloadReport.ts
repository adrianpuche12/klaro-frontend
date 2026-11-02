import axios from 'axios';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { REACT_APP_API_URL } from '../config';

export type ReportFormat = 'PDF' | 'EXCEL' | 'CSV';

const EXT: Record<ReportFormat, string> = { PDF: 'pdf', EXCEL: 'xlsx', CSV: 'csv' };
const MIME: Record<ReportFormat, string> = {
  PDF: 'application/pdf',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  CSV: 'text/csv',
};

/** Nombre del archivo que manda el servidor (Content-Disposition), o el de respaldo. */
function filenameFrom(disposition: string | undefined, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) return decodeURIComponent(star[1]);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : fallback;
}

/** Mensaje entendible a partir del error del servidor. */
async function errorMessage(e: any): Promise<string> {
  const status = e?.response?.status;
  if (status === 403) return 'No tenés permiso para descargar este informe.';
  if (status === 400) {
    const data = e?.response?.data;
    if (data instanceof Blob) return (await data.text()) || 'Revisá el período elegido.';
    return typeof data === 'string' ? data : 'Revisá el período elegido.';
  }
  if (!e?.response) return 'Sin conexión con el servidor. Probá de nuevo.';
  return 'No se pudo generar el informe. Probá de nuevo en unos minutos.';
}

/**
 * Descarga un informe del backend (/api/v3/reports/… o /api/v3/operations/export).
 * - Web: se baja con la sesión (axios lleva el token) y se guarda con el nombre que manda el servidor.
 * - Celular: se descarga con el token y se abre el menú de compartir (WhatsApp, mail, Drive…).
 * Lanza Error con un mensaje para mostrar al usuario.
 */
export async function downloadReport(
  path: string,
  params: Record<string, string | number | undefined>,
  format: ReportFormat,
  fallbackName: string,
): Promise<void> {
  const query: Record<string, string> = { format };
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') query[k] = String(v); });
  const fallback = `${fallbackName}.${EXT[format]}`;

  if (Platform.OS === 'web') {
    try {
      const res = await axios.get(`${REACT_APP_API_URL}${path}`, { params: query, responseType: 'blob', timeout: 120000 });
      const name = filenameFrom(res.headers['content-disposition'], fallback);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return;
    } catch (e) {
      throw new Error(await errorMessage(e));
    }
  }

  const qs = new URLSearchParams(query).toString();
  const target = `${FileSystem.cacheDirectory}${fallback}`;
  const auth = axios.defaults.headers.common['Authorization'];
  const res = await FileSystem.downloadAsync(`${REACT_APP_API_URL}${path}?${qs}`, target, {
    headers: auth ? { Authorization: String(auth) } : {},
  });
  if (res.status !== 200) {
    throw new Error(res.status === 403 ? 'No tenés permiso para descargar este informe.'
      : 'No se pudo generar el informe. Probá de nuevo en unos minutos.');
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(res.uri, { mimeType: MIME[format], dialogTitle: fallback });
  }
}
