/**
 * LE CYCLE DE VIE DE L'URL D'APERÇU D'UNE PIÈCE JOINTE EN ATTENTE (défaut 7,
 * revue #5668) — UNE SEULE `createObjectURL` par `PendingAttachment.localId`,
 * partagée entre la tuile du plateau (`composer-tray.tsx` § `PreviewTile`) et
 * la bulle optimiste (`attachmentPreviewOf`, `send/attachments.ts`). Avant ce
 * fichier, les DEUX sites créaient CHACUN leur propre URL pour la MÊME
 * sélection : deux blobs vivants pour une seule photo choisie, dont un seul
 * (celui de la tuile, révoqué à son démontage) était jamais relâché — mesuré,
 * trois envois d'une photo ⇒ six URL créées, trois révoquées (`created: 9,
 * revoked: 3` au troisième envoi). `fixtures.ts § uploadedAttachmentsOf`
 * créait une TROISIÈME URL pour simuler la réponse serveur ; elle réutilise
 * désormais celle-ci plutôt que d'en fabriquer une quatrième (fixtures
 * uniquement — la vraie passerelle rend une URL `https://`, jamais un blob).
 *
 * RÉVOCATION : EXPLICITE, au SEUL geste qui sait que l'URL ne servira jamais
 * plus — retirer une pièce AVANT l'envoi (`removeAttachment`, `composer.tsx`).
 * Une pièce ENVOYÉE garde son URL vivante : le message confirmé la porte en
 * PERMANENCE (D-28, `local-message.ts:104-112`, « la vignette ne saute pas à
 * la confirmation ») — la révoquer à ce moment romprait cette garantie déjà
 * livrée. Le suivi qui referme complètement le cycle (basculer vers l'URL
 * SERVEUR une fois l'upload confirmé, PUIS révoquer le blob local) est une
 * issue compagnon : il touche `perform-send.ts` et repose la question du
 * clignotement que D-28 a déjà tranchée — ce fichier ne la retranche pas.
 */
const cache = new Map<string, string>();

/** Rend l'URL EXISTANTE pour ce `localId`, ou en crée une nouvelle — jamais
 * deux fois la même pièce. */
export function previewUrlFor(localId: string, file: File): string {
  const existing = cache.get(localId);
  if (existing !== undefined) return existing;
  const url = URL.createObjectURL(file);
  cache.set(localId, url);
  return url;
}

/** Relâche l'URL d'un `localId`, si une a été créée — idempotent (un second
 * appel sur un `localId` déjà relâché ne fait rien). */
export function releasePreviewUrl(localId: string): void {
  const url = cache.get(localId);
  if (url === undefined) return;
  URL.revokeObjectURL(url);
  cache.delete(localId);
}

/** TÉMOIN SEUL — combien d'URL le magasin retient encore. */
export function previewUrlCacheSizeForTests(): number {
  return cache.size;
}

/** TÉMOIN SEUL — même discipline que `resetPendingAttachmentIdsForTests`
 * (`send/attachments.ts`) : la carte vit pour la durée du PROCESSUS. */
export function resetPreviewUrlCacheForTests(): void {
  cache.clear();
}
