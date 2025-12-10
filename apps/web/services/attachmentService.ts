/**
 * Service de gestion des attachments côté frontend
 */

import { 
  Attachment, 
  UploadedAttachmentResponse,
  UploadMultipleResponse,
  formatFileSize,
  getSizeLimit,
  getAttachmentType,
  isAcceptedMimeType
} from '@meeshy/shared/types/attachment';
import { createAuthHeaders } from '@/utils/token-utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper pour construire l'URL correcte sans duplication du préfixe /api
const buildApiUrl = (path: string): string => {
  const baseUrl = API_URL.replace(/\/$/, ''); // Enlever le slash final
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Si baseUrl contient déjà /api, ne pas le rajouter
  if (baseUrl.endsWith('/api')) {
    return `${baseUrl}${cleanPath}`;
  }

  return `${baseUrl}/api${cleanPath}`;
};

export class AttachmentService {
  /**
   * Upload un ou plusieurs fichiers avec progress tracking
   * @param files - Fichiers à uploader
   * @param token - Token d'authentification
   * @param metadataArray - Métadonnées optionnelles pour chaque fichier (durée, codec, etc.)
   * @param onProgress - Callback optionnel pour le suivi de progression (percentage: number)
   */
  static async uploadFiles(
    files: File[],
    token?: string,
    metadataArray?: any[],
    onProgress?: (percentage: number, loaded: number, total: number) => void
  ): Promise<UploadMultipleResponse> {
    const formData = new FormData();

    files.forEach((file, index) => {
      formData.append('files', file);

      // Si des métadonnées sont fournies pour ce fichier, les ajouter
      if (metadataArray && metadataArray[index]) {
        formData.append(`metadata_${index}`, JSON.stringify(metadataArray[index]));
      }
    });

    // Utiliser l'utilitaire pour créer les bons headers d'authentification
    const authHeaders = createAuthHeaders(token);

    // Utiliser XMLHttpRequest pour le progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentage = Math.round((event.loaded / event.total) * 100);
            onProgress(percentage, event.loaded, event.total);
            // Note: Le log est géré dans le callback pour éviter de ralentir ici
          }
        });
      }

      // Handle successful completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            resolve(result);
          } catch (error) {
            reject(new Error('Failed to parse response'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || 'Upload failed'));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      // Handle timeout
      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timeout'));
      });

      // Open connection and set headers
      xhr.open('POST', buildApiUrl('/attachments/upload'));

      // Set auth headers
      Object.entries(authHeaders).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value as string);
      });

      // Set a longer timeout for large files (10 minutes)
      xhr.timeout = 600000;

      // Send the request
      xhr.send(formData);
    });
  }

  /**
   * Crée un attachment texte
   */
  static async uploadText(content: string, token?: string): Promise<{ success: boolean; attachment: UploadedAttachmentResponse }> {
    const authHeaders = createAuthHeaders(token);
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...authHeaders
    };

    const response = await fetch(buildApiUrl('/attachments/upload-text'), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Failed to create text attachment');
    }

    return response.json();
  }

  /**
   * Récupère les attachments d'une conversation
   */
  static async getConversationAttachments(
    conversationId: string,
    options: {
      type?: 'image' | 'document' | 'audio' | 'video' | 'text';
      limit?: number;
      offset?: number;
    } = {},
    token?: string
  ): Promise<{ success: boolean; attachments: Attachment[] }> {
    const params = new URLSearchParams();
    if (options.type) params.append('type', options.type);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());

    const authHeaders = createAuthHeaders(token);

    const response = await fetch(
      buildApiUrl(`/conversations/${conversationId}/attachments?${params}`),
      {
        headers: authHeaders,
        credentials: 'include',
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || errorData.message || 'Failed to fetch attachments');
    }

    const result = await response.json();
    return result;
  }

  /**
   * Supprime un attachment
   */
  static async deleteAttachment(attachmentId: string, token?: string): Promise<void> {
    const authHeaders = createAuthHeaders(token);

    const response = await fetch(buildApiUrl(`/attachments/${attachmentId}`), {
      method: 'DELETE',
      headers: authHeaders,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to delete attachment');
    }
  }

  /**
   * Génère l'URL d'un attachment
   */
  static getAttachmentUrl(attachmentId: string): string {
    return buildApiUrl(`/attachments/${attachmentId}`);
  }

  /**
   * Génère l'URL d'une miniature
   */
  static getThumbnailUrl(attachmentId: string): string {
    return buildApiUrl(`/attachments/${attachmentId}/thumbnail`);
  }

  /**
   * Valide un fichier avant upload
   */
  static validateFile(file: File): { valid: boolean; error?: string } {
    // Accepter tous les types de fichiers - pas de restriction MIME
    const type = getAttachmentType(file.type);
    const sizeLimit = getSizeLimit(type);

    if (file.size > sizeLimit) {
      return {
        valid: false,
        error: `File too large. Max size: ${formatFileSize(sizeLimit)}`,
      };
    }

    return { valid: true };
  }

  /**
   * Valide plusieurs fichiers
   */
  static validateFiles(files: File[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    files.forEach((file, index) => {
      const validation = this.validateFile(file);
      if (!validation.valid) {
        errors.push(`${file.name}: ${validation.error}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

