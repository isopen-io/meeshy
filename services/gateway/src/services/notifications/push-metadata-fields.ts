/**
 * Lit une clé de metadata comme chaîne non vide pour le payload push (les
 * `data` APNs/FCM ne transportent que des chaînes). Retourne `''` quand la clé
 * est absente, nulle ou vide — ce que le client interprète comme « pas de
 * valeur » (`NotificationPayload` mappe la chaîne vide vers `nil`).
 */
export function pickMetadataString(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== 'object' || !(key in metadata)) return '';
  const value = (metadata as Record<string, unknown>)[key];
  return value == null ? '' : String(value);
}

/**
 * Le retrait d'un contenu (`content_removed`, #11149 / #11158) : `contentType`
 * et `contentId` routent le tap ; le MOTIF est du contenu et suit `showPreview`.
 * Clés absentes (jamais `''`) hors de ce type ou sans valeur.
 */
export function contentRemovedPushFields(params: { readonly type: string; readonly metadata: unknown; readonly showPreview: boolean }): Record<string, string> {
  if (params.type !== 'content_removed') return {};
  const fields = {
    contentType: pickMetadataString(params.metadata, 'contentType'),
    contentId: pickMetadataString(params.metadata, 'contentId'),
    reason: params.showPreview ? pickMetadataString(params.metadata, 'reason') : '',
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ''));
}
