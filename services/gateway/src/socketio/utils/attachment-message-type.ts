/**
 * Dérivation serveur du `Message.messageType` à partir des types MIME des
 * pièces jointes, pour le path socket `message:send-with-attachments`.
 *
 * Pourquoi côté serveur : le schéma Zod `SocketMessageSendWithAttachmentsSchema`
 * n'expose PAS de champ `messageType` (contrairement au path texte
 * `message:send` et à la route REST `POST /messages` qui acceptent
 * `enum ['text','image','file','audio','video']`). Le client ne peut donc pas
 * l'indiquer. Sans dérivation, le handler persistait `messageType: 'text'` en
 * dur pour TOUTE pièce jointe — y compris une photo/vidéo/audio — alors que ce
 * path est le PRINCIPAL pour les médias (view-once, floutées, éphémères y
 * transitent). Conséquence concrète : `protectedPreview`
 * (services/notifications/NotificationService.ts) dérive l'icône de contenu de
 * `messageType` via `contentTypeIcon`, donc la notification d'une photo
 * view-once s'affichait `👁️ 💬` (ballon texte) au lieu de `👁️ 🖼️` (image),
 * divergence directe avec la même photo envoyée en REST.
 *
 * Règle de dérivation (une seule catégorie médias par message, comme le
 * `messageType` unique du REST) :
 *   - aucune pièce jointe            → `undefined` (l'appelant conserve 'text')
 *   - une seule catégorie présente   → cette catégorie ('image' | 'audio' | 'video' | 'file')
 *   - plusieurs catégories mélangées → 'file' (bundle hétérogène = pièce jointe générique)
 *
 * Un MIME non image/audio/video (document, inconnu, vide) tombe dans 'file' —
 * la catégorie générique des pièces jointes (icône 📎), jamais 'text'.
 *
 * Valeurs retournées alignées sur l'enum REST (`text` exclu : l'appelant le pose
 * par défaut quand la dérivation renvoie `undefined`).
 */
export type AttachmentMessageType = 'image' | 'audio' | 'video' | 'file';

function bucketForMime(mimeType: string | null | undefined): AttachmentMessageType {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export function messageTypeFromMimeTypes(
  mimeTypes: ReadonlyArray<string | null | undefined>
): AttachmentMessageType | undefined {
  if (mimeTypes.length === 0) return undefined;
  const buckets = new Set(mimeTypes.map(bucketForMime));
  if (buckets.size === 1) return [...buckets][0];
  return 'file';
}
