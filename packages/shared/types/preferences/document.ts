/**
 * Document Preferences Schema
 * Gestion des fichiers, téléchargements, stockage
 */

import { z } from 'zod';

export const DocumentPreferenceSchema = z.object({
  // Téléchargements
  autoDownloadEnabled: z.boolean().default(false),
  autoDownloadOnWifi: z.boolean().default(true),
  autoDownloadMaxSize: z.number().min(1).max(100).default(10),
  downloadPath: z.string().optional(),

  // Prévisualisation
  inlinePreviewEnabled: z.boolean().default(true),
  previewPdfEnabled: z.boolean().default(true),
  previewImagesEnabled: z.boolean().default(true),
  previewVideosEnabled: z.boolean().default(true),

  // Stockage
  storageQuota: z.number().min(100).max(100000).default(5000),
  autoDeleteOldFiles: z.boolean().default(false),
  fileRetentionDays: z.number().min(7).max(365).default(90),

  // Compression
  compressImagesOnUpload: z.boolean().default(false),
  imageCompressionQuality: z.number().min(10).max(100).default(85),

  // Formats acceptés
  allowedFileTypes: z
    .array(z.string())
    .default([
      'image/*',
      'video/*',
      'audio/*',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.*'
    ]),

  // Sécurité
  scanFilesForMalware: z.boolean().default(true),
  allowExternalLinks: z.boolean().default(true)
});

export type DocumentPreference = z.infer<typeof DocumentPreferenceSchema>;

export const DOCUMENT_PREFERENCE_DEFAULTS: DocumentPreference = {
  autoDownloadEnabled: false,
  autoDownloadOnWifi: true,
  autoDownloadMaxSize: 10,
  inlinePreviewEnabled: true,
  previewPdfEnabled: true,
  previewImagesEnabled: true,
  previewVideosEnabled: true,
  storageQuota: 5000,
  autoDeleteOldFiles: false,
  fileRetentionDays: 90,
  compressImagesOnUpload: false,
  imageCompressionQuality: 85,
  allowedFileTypes: [
    'image/*',
    'video/*',
    'audio/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.*'
  ],
  scanFilesForMalware: true,
  allowExternalLinks: true
};
