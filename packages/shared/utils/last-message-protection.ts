/**
 * La loi qui décide si le dernier message d'une conversation peut être servi
 * en clair dans une ligne de liste (ou de résultat de recherche), ou doit être
 * masqué — miroir EXACT de `LastMessageSummaryKind`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`),
 * ordre des tests compris : la péremption se juge AVANT le flou (#6111).
 *
 * N'inspecte que les colonnes que le client décode (`isBlurred` / `isViewOnce`
 * / `expiresAt` / `ephemeralDuration`) — jamais `effectFlags`, qui est
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
  /**
   * #7451 — présente ⇒ `expiresAt` N'EST PAS une échéance de lecteur.
   *
   * Depuis la directive du 2026-09-22, la colonne `Message.expiresAt` porte
   * l'heure INTERNE de destruction du contenu (le plafond de rétention tant que
   * personne n'a reçu, puis le dernier décompte plus une heure). L'échéance du
   * lecteur, elle, est SA première réception plus cette durée — et l'aperçu de
   * liste est composé par une DIFFUSION DE ROOM, qui ne peut pas la connaître.
   *
   * Sans cette clause, un éphémère de trente secondes se serait affiché
   * « actif » pendant sept jours dans la liste, puis « expiré » d'un coup au
   * moment de la destruction — l'inverse exact de ce que son lecteur voit dans
   * le fil. Le verdict devient `ephemeralActive`, et c'est au client de
   * décompter depuis SA réception (ou depuis `message:countdown-started`).
   */
  ephemeralDuration?: number | null;
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
  // #7451 — pour un éphémère, la colonne est l'heure interne de DESTRUCTION,
  // jamais l'échéance d'un lecteur : elle ne peut donc plus rendre de verdict.
  const isEphemeral = typeof flags.ephemeralDuration === 'number' && flags.ephemeralDuration > 0;
  const expiresAt = !isEphemeral && flags.expiresAt != null ? new Date(flags.expiresAt) : null;

  if (expiresAt && expiresAt.getTime() <= now.getTime()) return 'expired';
  if (flags.isBlurred === true) return 'hidden';
  if (flags.isViewOnce === true) return 'viewOnce';
  if (isEphemeral) return 'ephemeralActive';
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
