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
 * L'alerte de proximité entre Sangs (`blood_proximity`, #20540) : `userId` est l'AUTRE Sang, que le
 * client ouvre sur la carte. Une identité, pas un contenu : elle voyage hors de `showPreview`, comme
 * `senderId`. La distance reste dans le corps ; aucune coordonnée n'existe dans la charge.
 */
export function bloodProximityPushFields(params: { readonly type: string; readonly metadata: unknown }): Record<string, string> {
  if (params.type !== 'blood_proximity') return {};
  const userId = pickMetadataString(params.metadata, 'userId');
  return userId === '' ? {} : { userId };
}

/** Les clés `data` que le TYPE tire de ses métadonnées : une seule entrée pour `NotificationService`. */
export function metadataPushFields(params: { readonly type: string; readonly metadata: unknown; readonly showPreview: boolean }): Record<string, string> {
  return { ...contentRemovedPushFields(params), ...bloodProximityPushFields(params) };
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
