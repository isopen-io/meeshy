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
  isAcceptedMimeType,
  MAX_FILES_PER_MESSAGE,
  type AttachmentType
} from '@meeshy/shared/types/attachment';
import { createAuthHeaders } from '@/utils/token-utils';
import { buildApiUrl } from '@/lib/config';

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
    // VALIDATION CRITIQUE: Vérifier que les fichiers ne sont pas vides
    const emptyFiles = files.filter(f => f.size === 0);
    if (emptyFiles.length > 0) {
      console.error('❌ [AttachmentService.uploadFiles] ERREUR: Fichiers vides reçus:', emptyFiles.map(f => f.name));
      throw new Error(`Cannot upload empty files: ${emptyFiles.map(f => f.name).join(', ')}`);
    }

    // Log détaillé des fichiers à uploader
    console.log('📤 [AttachmentService.uploadFiles] Files to upload:', files.map((f, i) => ({
      index: i,
      name: f.name,
      size: f.size,
      type: f.type,
      lastModified: f.lastModified
    })));

    const formData = new FormData();
    let totalFormDataSize = 0;

    files.forEach((file, index) => {
      console.log(`📎 [AttachmentService.uploadFiles] Appending file ${index}:`, {
        name: file.name,
        size: file.size,
        type: file.type,
        isFile: file instanceof File,
        isBlob: file instanceof Blob
      });

      // Vérifier que c'est bien un File valide
      if (!((file as any) instanceof File) && !((file as any) instanceof Blob)) {
        console.error(`❌ [AttachmentService.uploadFiles] Invalid file at index ${index}:`, typeof file);
        throw new Error(`Invalid file at index ${index}: expected File or Blob`);
      }

      formData.append('files', file);
      totalFormDataSize += file.size;

      // Si des métadonnées sont fournies pour ce fichier, les ajouter
      if (metadataArray && metadataArray[index]) {
        formData.append(`metadata_${index}`, JSON.stringify(metadataArray[index]));
        console.log(`📋 [AttachmentService.uploadFiles] Metadata for file ${index}:`, metadataArray[index]);
      }
    });

    console.log('📊 [AttachmentService.uploadFiles] FormData prepared:', {
      filesCount: files.length,
      totalSize: totalFormDataSize,
      totalSizeMB: (totalFormDataSize / (1024 * 1024)).toFixed(2) + ' MB',
      hasMetadata: !!metadataArray
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
        console.log('📥 [AttachmentService.uploadFiles] Response received:', {
          status: xhr.status,
          responseLength: xhr.responseText.length
        });

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);

            // Log détaillé de la réponse
            const attachments = result.attachments || result.data?.attachments || [];
            console.log('✅ [AttachmentService.uploadFiles] Upload success:', {
              success: result.success,
              attachmentsCount: attachments.length,
              attachments: attachments.map((a: any) => ({
                id: a.id,
                fileName: a.fileName,
                fileSize: a.fileSize,
                mimeType: a.mimeType,
                duration: a.duration
              }))
            });

            // Vérifier si des attachments ont des IDs vides
            const emptyIdAttachments = attachments.filter((a: any) => !a.id);
            if (emptyIdAttachments.length > 0) {
              console.error('❌ [AttachmentService.uploadFiles] ERREUR: Attachments avec ID vide détectés!', emptyIdAttachments);
            }

            resolve(result);
          } catch (error) {
            console.error('❌ [AttachmentService.uploadFiles] Failed to parse response:', error);
            reject(new Error('Failed to parse response'));
          }
        } else {
          console.error('❌ [AttachmentService.uploadFiles] Upload failed:', {
            status: xhr.status,
            response: xhr.responseText.substring(0, 500)
          });
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
      type?: AttachmentType;
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

    if (files.length > MAX_FILES_PER_MESSAGE) {
      errors.push(`Maximum ${MAX_FILES_PER_MESSAGE} files allowed. You selected ${files.length}.`);
    }

    files.forEach((file) => {
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

