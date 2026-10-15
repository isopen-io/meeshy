import type { Attachment } from '@/lib/api/types';

export type ProfileImageKind = 'avatar' | 'banner';

const EPOCH_ISO = new Date(0).toISOString();

/**
 * **LA PHOTO OU LA BANNIÈRE D'UN PROFIL, EN PIÈCE DE VISIONNEUSE** (#10092) —
 * la visionneuse plein écran (`components/media-viewer.tsx`) ne lit que des
 * `Attachment` : on lui remet une pièce SYNTHÉTIQUE et inerte (motif
 * `lib/feed/gallery-lot.ts`), une image publique sans message ni drapeau de
 * protection. `fileUrl` garde la RÉFÉRENCE servie ; la visionneuse la résout
 * elle-même (`attachmentSrc`).
 */
export function profileImageAttachment(params: { readonly kind: ProfileImageKind; readonly src: string; readonly ownerId: string }): Attachment {
  const id = `profile-${params.kind}-${params.ownerId}`;
  return {
    id,
    messageId: id,
    fileName: id,
    originalName: id,
    mimeType: 'image/jpeg',
    fileSize: 0,
    fileUrl: params.src,
    uploadedBy: params.ownerId,
    isAnonymous: false,
    createdAt: EPOCH_ISO,
    isForwarded: false,
    capturedInApp: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    viewedCount: 0,
    downloadedCount: 0,
    consumedCount: 0,
    isEncrypted: false,
  };
}
