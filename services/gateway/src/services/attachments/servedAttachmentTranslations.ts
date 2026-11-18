/**
 * La carte `MessageAttachment.translations` telle qu'elle a le droit de
 * SORTIR (#19672) : chaque piste moins son `path`, le chemin disque ABSOLU que
 * `saveTranslatedTrack` grave en base (`/app/uploads/translated/…`). La base le
 * garde ; aucun client ne le lit (iOS `APIAttachmentTranslation`, Android
 * `ApiAttachmentTranslation`, web) et il décrit l'arborescence du serveur.
 *
 * Site UNIQUE des deux transports : REST (`cleanAttachmentsForApi`) et socket
 * (`serializeAttachmentForSocket`, donc `message:new`, `message:edited`,
 * `attachment:updated`). Le schéma partagé ne le déclare plus non plus : la
 * réponse REST est gardée deux fois, le socket (sans sérialiseur) l'est ici.
 *
 * Tout ce qui n'est pas une carte d'objets traverse inchangé.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const withoutDiskPath = (entry: unknown): unknown => {
  if (!isPlainObject(entry) || !('path' in entry)) return entry;
  const { path: _diskPath, ...served } = entry;
  return served;
};

/** La forme d'entrée est conservée : seule une clé optionnelle (`path`) disparaît de chaque piste. */
export function servedAttachmentTranslations<T>(translations: T): T {
  if (!isPlainObject(translations)) return translations;
  return Object.fromEntries(
    Object.entries(translations).map(([language, entry]) => [language, withoutDiskPath(entry)]),
  ) as T;
}
