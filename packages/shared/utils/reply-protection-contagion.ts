/**
 * LA CONTAGION DES PROTECTIONS PAR LA RÉPONSE (#8557) — directive porteur
 * 2026-09-28 : « La contagion est additive : si on reply à un message
 * éphémère, son message devient éphémère ; si on répond à un message flou, son
 * message devient flou, non désactivable — le serveur enforcera cela de toute
 * façon. Si le message était éphémère et flou, la réponse gagne les deux ! Un
 * message contaminé flou peut avoir en plus l'ajout éphémère, même chose pour
 * un éphémère et l'ajout flou. »
 *
 * ─── LA RÈGLE ───────────────────────────────────────────────────────────────
 *
 * - FLOU cité ⇒ la réponse est floue. La réponse ne peut pas le retirer.
 * - ÉPHÉMÈRE cité ⇒ la réponse porte le MÊME mode : flamme-œil ⇒ flamme-œil,
 *   durée d ⇒ durée d. Le mode est IMPOSÉ : celui que la réponse demandait est
 *   remplacé, sinon une réponse pourrait survivre à ce qu'elle cite.
 * - Ce que le message cité ne porte pas, la réponse peut l'AJOUTER librement
 *   (l'éphémère sur une réponse contaminée par le flou, et inversement ; la
 *   vue unique, qui ne se transmet pas).
 * - Transitive par construction : la réponse PORTE les bits, sa propre réponse
 *   en hérite.
 *
 * Un site UNIQUE : la passerelle l'applique à tout envoi (elle fait foi), les
 * clients s'en servent pour verrouiller le composeur et peindre l'optimiste.
 * Miroir iOS : `ReplyProtectionContagion` (`packages/MeeshySDK/.../Models`).
 */

import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';

const { EPHEMERAL, BLURRED, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;
const EPHEMERAL_BITS = EPHEMERAL | EPHEMERAL_AFTER_READ;

export type ProtectionColumns = {
  readonly effectFlags?: number | null;
  readonly isBlurred?: boolean | null;
  readonly ephemeralDuration?: number | null;
};

export type ContaminatedReplyProtection = {
  readonly effectFlags: number;
  readonly isBlurred: boolean;
  readonly ephemeralDuration: number | null;
};

export type ImposedEphemeral = { readonly kind: 'after-read' } | { readonly kind: 'duration'; readonly seconds: number };

export type ImposedReplyProtection = {
  readonly blurred: boolean;
  readonly ephemeral: ImposedEphemeral | null;
};

const declaredDuration = (value?: number | null): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;

/** Ce que le message cité IMPOSE à toute réponse — ce que le composeur verrouille. */
export function imposedReplyProtection(quoted: ProtectionColumns | null | undefined): ImposedReplyProtection {
  if (!quoted) return { blurred: false, ephemeral: null };
  const flags = quoted.effectFlags ?? 0;
  const blurred = quoted.isBlurred === true || (flags & BLURRED) !== 0;
  if ((flags & EPHEMERAL_AFTER_READ) !== 0) return { blurred, ephemeral: { kind: 'after-read' } };
  const seconds = declaredDuration(quoted.ephemeralDuration);
  return { blurred, ephemeral: seconds === null ? null : { kind: 'duration', seconds } };
}

/**
 * Les colonnes de protection d'une réponse, après contagion par le message
 * qu'elle cite. `quoted` absent (pas de citation, message introuvable) ⇒ la
 * demande passe telle quelle, recomposée.
 */
export function contaminateReplyProtection(input: {
  readonly requested: ProtectionColumns;
  readonly quoted: ProtectionColumns | null | undefined;
}): ContaminatedReplyProtection {
  const { requested } = input;
  const imposed = imposedReplyProtection(input.quoted);
  const isBlurred = requested.isBlurred === true || ((requested.effectFlags ?? 0) & BLURRED) !== 0 || imposed.blurred;
  const requestedDuration = declaredDuration(requested.ephemeralDuration);

  const base = (requested.effectFlags ?? 0) | (isBlurred ? BLURRED : 0);
  if (imposed.ephemeral === null) {
    const flags = requestedDuration === null ? base : base | EPHEMERAL;
    return { effectFlags: flags, isBlurred, ephemeralDuration: requestedDuration };
  }

  const withoutEphemeral = base & ~EPHEMERAL_BITS;
  return imposed.ephemeral.kind === 'after-read'
    ? { effectFlags: withoutEphemeral | EPHEMERAL_BITS, isBlurred, ephemeralDuration: null }
    : { effectFlags: withoutEphemeral | EPHEMERAL, isBlurred, ephemeralDuration: imposed.ephemeral.seconds };
}
