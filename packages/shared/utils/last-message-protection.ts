/**
 * La loi qui décide si le dernier message d'une conversation peut être servi
 * en clair dans une ligne de liste (ou de résultat de recherche), ou doit être
 * masqué — miroir EXACT de `LastMessageSummaryKind`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`),
 * ordre des tests compris : la péremption se juge AVANT le flou (#6111).
 *
 * N'inspecte que les trois colonnes que le client décode
 * (`isBlurred` / `isViewOnce` / `expiresAt`) — jamais `effectFlags`, qui est
 * un bitfield RECOMPOSÉ serveur depuis ces mêmes colonnes
 * (`packages/shared/types/api-schemas/message.ts`, doc-comment d'`effectFlags`)
 * et ne porte donc aucun signal que les trois n'auraient déjà.
 */

export type LastMessageSummaryKind =
  | 'standard'
  | 'hidden'
  | 'viewOnce'
  | 'expired'
  | 'ephemeralActive';

export interface LastMessageProtectionFlags {
  isBlurred?: boolean | null;
  isViewOnce?: boolean | null;
  expiresAt?: Date | string | null;
}

const PROTECTED_KINDS: ReadonlySet<LastMessageSummaryKind> = new Set([
  'hidden',
  'viewOnce',
  'expired'
]);

/**
 * Résout le type de résumé à afficher pour le dernier message d'une
 * conversation. `now` est injectable pour les tests.
 */
export function resolveLastMessageSummaryKind(
  flags: LastMessageProtectionFlags,
  now: Date = new Date()
): LastMessageSummaryKind {
  const expiresAt = flags.expiresAt != null ? new Date(flags.expiresAt) : null;

  if (expiresAt && expiresAt.getTime() <= now.getTime()) return 'expired';
  if (flags.isBlurred === true) return 'hidden';
  if (flags.isViewOnce === true) return 'viewOnce';
  if (expiresAt && expiresAt.getTime() > now.getTime()) return 'ephemeralActive';
  return 'standard';
}

/**
 * `true` quand le contenu réel (texte, lieu, sticker, pièces jointes…) ne
 * doit PAS être servi — un aperçu éphémère encore actif (`ephemeralActive`)
 * n'est PAS protégé : il reste lisible jusqu'à son expiration.
 */
export function isLastMessageProtected(
  flags: LastMessageProtectionFlags,
  now: Date = new Date()
): boolean {
  return PROTECTED_KINDS.has(resolveLastMessageSummaryKind(flags, now));
}
