import type { AttachmentStatusReport } from '@/lib/api/attachments';

/**
 * QUOI RAPPORTER À L'OUVERTURE D'UNE IMAGE OU D'UN DOCUMENT (#7363, W6) —
 * miroir `DocumentOpenReport.bodyForOpening(isMine:)`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Media/DocumentOpenReport.swift`) :
 * `action: 'viewed'`, JAMAIS `'downloaded'` — lire une pièce dans la
 * visionneuse n'est pas l'enregistrer explicitement (§ doc-comment iOS,
 * `DocumentFullSheet.saveDocument()` reste le seul producteur de
 * `'downloaded'`). `null` pour SA PROPRE pièce : un expéditeur qui rouvre ce
 * qu'il vient d'envoyer ne s'auto-déclare pas destinataire.
 */
export function attachmentOpenReport(params: { readonly isMine: boolean }): AttachmentStatusReport | null {
  if (params.isMine) return null;
  return { action: 'viewed', playPositionMs: 0, durationMs: 0, complete: true };
}
