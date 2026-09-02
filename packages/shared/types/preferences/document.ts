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
  allowExternalLinks: z.boolean().default(true),

  /**
   * Le canal de COMPATIBILITÉ ASCENDANTE, déclaré (#4589).
   *
   * Les sept blocs de préférences du SDK iOS le portent
   * (`PreferenceModels.swift`), et iOS encode le bloc ENTIER comme corps de
   * requête (`UserPreferencesManager`, `try encoder.encode(privacy)`). Il
   * arrivait donc sur chaque écriture, et le mode *strip* de Zod le retirait :
   * mesuré sur staging le 2026-08-31, un `PATCH {"extras":{"sonde":"4589"}}`
   * rendait `success: true` et la relecture ne rendait RIEN. Le canal de
   * compatibilité ascendante d'iOS n'a jamais fonctionné.
   *
   * Le déclarer a deux effets, et le second est celui qui compte : il rend au
   * client son aller-retour, et il permet à la frontière de REFUSER tout le
   * reste (`.strict()` dans `submittedFrom`) sans casser les trois clients.
   * Une porte de sortie nommée est ce qui autorise à fermer les autres.
   *
   * Facultatif et SANS défaut : il ne doit apparaître dans un document servi
   * que si quelque chose y a été stocké — sinon les sept catégories gagneraient
   * un `extras: {}` que ni le web ni Android n'attendent.
   */
  extras: z.record(z.string(), z.unknown()).optional(),
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
