/**
 * CE QU'UNE TRADUCTION PARTAGÉE PEUT S'APPUYER SUR LE TEXTE D'UN MESSAGE (#9899).
 *
 * Sans `zod` : la page web l'importe à côté de son fil, et le validateur du
 * contrat (`types/shared-translation.ts`) n'a rien à faire dans ce chunk. Le
 * miroir iOS est `DeviceTranslationEligibility` (MeeshySDK) ; toute évolution
 * de la règle touche les deux.
 */

/** La version d'un message jamais modifié. */
export const SHARED_TRANSLATION_ORIGINAL_SOURCE = 'original';

const SERVER_READABLE_MODES: ReadonlySet<string> = new Set(['server', 'hybrid']);

const normalizedMode = (mode: string | null | undefined): string => (mode ?? '').trim().toLowerCase();

/**
 * Le serveur lit-il déjà le texte de ce message ? Seuls un message en clair et
 * un message chiffré PAR le serveur (`server`, `hybrid`) le lui donnent. Tout le
 * reste — bout en bout, mode inconnu, message chiffré sans mode — se lit comme
 * un message que le serveur ne lit pas : la clé `message-content` y donnerait au
 * serveur de quoi deviner un message court en essayant d'ouvrir l'enveloppe.
 */
export function sharedTranslationServerReadsMessage(params: {
  readonly conversationEncryptionMode: string | null | undefined;
  readonly messageIsEncrypted: boolean | null | undefined;
  readonly messageEncryptionMode: string | null | undefined;
}): boolean {
  const conversation = normalizedMode(params.conversationEncryptionMode);
  if (conversation !== '' && !SERVER_READABLE_MODES.has(conversation)) return false;
  const message = normalizedMode(params.messageEncryptionMode);
  if (message === '') return params.messageIsEncrypted !== true;
  return SERVER_READABLE_MODES.has(message);
}

/**
 * La version du texte source qu'une traduction traduit : l'instant de sa
 * dernière modification, à la milliseconde et en UTC (`toISOString`), ou
 * {@link SHARED_TRANSLATION_ORIGINAL_SOURCE}. `null` quand la date ne se lit
 * pas : l'appareil ne sait pas ce qu'il traduit, et ne partage pas.
 */
export function sharedTranslationSourceVersion(editedAt: Date | string | null | undefined): string | null {
  if (editedAt === null || editedAt === undefined) return SHARED_TRANSLATION_ORIGINAL_SOURCE;
  const instant = editedAt instanceof Date ? editedAt : new Date(editedAt);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
