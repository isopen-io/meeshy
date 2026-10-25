/**
 * Le contrat de fil d'une pièce jointe chiffrée de bout en bout (#10789).
 *
 * L'appareil chiffre (format `client-v1`, `utils/e2ee-attachment-cipher.ts`),
 * téléverse le blob par TUS sous `E2EE_ATTACHMENT_UPLOAD_CONTEXT`, et met le
 * pointeur (clé, condensat, nom, type, taille exacte, durée) dans le contenu
 * libsignal. La passerelle ne voit que le blob, sous `application/octet-stream`,
 * et ne le traite jamais. Décision :
 * `services/gateway/decisions/2026-10-25-la-passerelle-garde-une-piece-e2ee-comme-un-blob-opaque.md`.
 */

/** La valeur de la métadonnée TUS `uploadcontext` d'un blob chiffré de bout en bout. */
export const E2EE_ATTACHMENT_UPLOAD_CONTEXT = 'e2ee-attachment';

/** Le seul type qu'un blob déclare, et sous lequel il est servi. */
export const E2EE_ATTACHMENT_MIME_TYPE = 'application/octet-stream';

/** Le seul nom qu'un blob peut déclarer : les clients TUS en posent un d'office. */
export const E2EE_ATTACHMENT_FILE_NAME = 'blob';

/**
 * Les SEULES métadonnées TUS admises sur un blob : le contexte, le condensat du
 * blob, et le type et le nom neutres ci-dessus. Tout le reste (`duration`,
 * `transcription`, `alt`, `thumbhash`, `capturedinapp`, un vrai nom de fichier)
 * dirait au serveur ce que le chiffré cache : refusé avant le premier octet.
 */
export const E2EE_ATTACHMENT_METADATA_KEYS = ['uploadcontext', 'digest', 'filetype', 'filename'] as const;

export const E2EE_ATTACHMENT_ERROR_CODES = {
  /** Une métadonnée hors liste blanche, un type ou un nom qui ne sont pas les neutres. */
  METADATA_REFUSED: 'E2EE_ATTACHMENT_METADATA_REFUSED',
  /** Le condensat déclaré manque, est mal formé, ou n'est pas celui du blob reçu. */
  DIGEST_MISMATCH: 'E2EE_ATTACHMENT_DIGEST_MISMATCH',
  /** Un blob qui n'est pas celui de l'expéditeur, ou déjà rattaché, ou sans enveloppe. */
  INVALID: 'E2EE_ATTACHMENT_INVALID',
  /** Un invité de lien n'a pas d'appareil chiffrant. */
  ANONYMOUS_REFUSED: 'E2EE_ATTACHMENT_ANONYMOUS_REFUSED',
} as const;

export type E2EEAttachmentErrorCode = (typeof E2EE_ATTACHMENT_ERROR_CODES)[keyof typeof E2EE_ATTACHMENT_ERROR_CODES];

/** La ligne d'une pièce jointe est-elle un blob chiffré de bout en bout ? (casse de l'émetteur tolérée) */
export const isEndToEndAttachment = (row: { readonly encryptionMode?: string | null } | null | undefined): boolean =>
  typeof row?.encryptionMode === 'string' && row.encryptionMode.toLowerCase() === 'e2ee';
