/**
 * L'HORLOGE D'ENVOI (#5813, étape 9) — miroir
 * `BubbleDeliveryCheck.swift:128-141` (`SendingClockGlyph.revealDelay = 0.2`) :
 * un envoi qui aboutit sous 200 ms ne fait JAMAIS clignoter d'horloge.
 * `startedAt` ABSENT (aucun envoi local pour ce message) ⇒ révélée
 * immédiatement — c'est le cas d'un message déjà CONFIRMÉ, dont la coche
 * `pending` ne devrait de toute façon jamais s'afficher.
 */
export function shouldRevealSendingClock(startedAt: number | undefined, now: number): boolean {
  if (startedAt === undefined) return true;
  return now - startedAt >= 200;
}
