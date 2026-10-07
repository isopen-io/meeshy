/**
 * LA LOI DE SORTIE (#9572) — directive porteur 2026-10-07 : « un contenu qui
 * disparaît ne sort pas de Meeshy ».
 *
 * Un message a une NATURE de disparition, lue sur le message ET sur chacune de
 * ses pièces jointes — la plus restrictive gagne — et cette nature rend TROIS
 * verdicts :
 *
 * | nature | transférer | enregistrer, imager, partager, publier | capture |
 * |---|---|---|---|
 * | `ordinary` | oui | oui | libre |
 * | `timed-flame` | oui, durée ≤ source | non | bloquée |
 * | `after-read-flame` | non | non | bloquée |
 * | `view-once` | non | non | bloquée |
 *
 * La copie transférée d'une flamme à durée porte durée ET après lecture
 * ({@link forwardedCopyProtection}) : elle est donc « après lecture » pour le
 * transfert suivant, et ne se retransfère pas.
 *
 * FERMÉ PAR DÉFAUT : un contenu DÉCLARÉ éphémère dont la durée ne se lit pas
 * (bit `EPHEMERAL` nu, échéance sans date de création) reçoit les verdicts de
 * la flamme après lecture. On ne peut pas borner une copie par une durée
 * qu'on ne connaît pas.
 *
 * Le FLOU et le CHIFFREMENT ne sont pas des natures : ils gardent leurs
 * propres restrictions (`messageProtection`, `maskedAttachment`), que
 * l'appelant COMPOSE avec ces verdicts. La loi ne les remplace pas.
 *
 * Site UNIQUE : la passerelle l'applique (elle fait foi), les clients n'offrent
 * que ce qu'elle autorise. Miroir iOS attendu dans `packages/MeeshySDK`.
 */

import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';

const { EPHEMERAL, BLURRED, VIEW_ONCE, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;
const EPHEMERAL_BITS = EPHEMERAL | EPHEMERAL_AFTER_READ;

export type ContentExitNature = 'ordinary' | 'timed-flame' | 'after-read-flame' | 'view-once';

/** Ce que la loi lit d'une pièce jointe — ses propres drapeaux, indépendants du message. */
export type ContentExitAttachment = {
  readonly isViewOnce?: boolean | null;
  readonly effectFlags?: number | null;
};

/** Ce que la loi lit d'un message. Tout est facultatif : un champ absent ne déclare rien. */
export type ContentExitSubject = {
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
  readonly ephemeralDuration?: number | null;
  /** Repli des lignes d'avant `ephemeralDuration` (#7451) : la durée est `expiresAt − createdAt`. */
  readonly expiresAt?: Date | string | null;
  readonly createdAt?: Date | string | null;
  readonly attachments?: ReadonlyArray<ContentExitAttachment | null | undefined> | null;
};

export type ContentForwardRefusal = 'view-once' | 'after-read';

export type ContentForwardVerdict =
  /** `maxDurationSeconds` nul ⇒ aucune borne ; sinon la copie dure AU PLUS autant. */
  | { readonly allowed: true; readonly maxDurationSeconds: number | null }
  | { readonly allowed: false; readonly reason: ContentForwardRefusal };

export type ContentCaptureVerdict = 'free' | 'blocked';

export type ContentExitLaw = {
  readonly nature: ContentExitNature;
  readonly forward: ContentForwardVerdict;
  /** Enregistrer, imager, partager hors de Meeshy, publier en post, réel ou story. */
  readonly exportable: boolean;
  readonly capture: ContentCaptureVerdict;
};

/** Les colonnes de protection que porte la copie transférée. */
export type ForwardedCopyProtection = {
  readonly effectFlags: number;
  readonly isBlurred: boolean;
  readonly ephemeralDuration: number | null;
};

const ORDINARY: ContentExitLaw = {
  nature: 'ordinary',
  forward: { allowed: true, maxDurationSeconds: null },
  exportable: true,
  capture: 'free',
};

const AFTER_READ_FLAME: ContentExitLaw = {
  nature: 'after-read-flame',
  forward: { allowed: false, reason: 'after-read' },
  exportable: false,
  capture: 'blocked',
};

const VIEW_ONCE_CONTENT: ContentExitLaw = {
  nature: 'view-once',
  forward: { allowed: false, reason: 'view-once' },
  exportable: false,
  capture: 'blocked',
};

const wholeSeconds = (value: number | null | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const seconds = Math.floor(value);
  return seconds > 0 ? seconds : null;
};

const instantOf = (value: Date | string | null | undefined): number | null => {
  if (value == null) return null;
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(time) ? null : time;
};

const knownDuration = (subject: ContentExitSubject): number | null => {
  const declared = wholeSeconds(subject.ephemeralDuration);
  if (declared !== null) return declared;
  const expiresAt = instantOf(subject.expiresAt);
  const createdAt = instantOf(subject.createdAt);
  return expiresAt === null || createdAt === null ? null : wholeSeconds((expiresAt - createdAt) / 1000);
};

export function contentExitLaw(subject: ContentExitSubject | null | undefined): ContentExitLaw {
  if (!subject) return ORDINARY;

  const pieces = (subject.attachments ?? []).filter((piece): piece is ContentExitAttachment => piece != null);
  const flags = pieces.reduce((acc, piece) => acc | (piece.effectFlags ?? 0), subject.effectFlags ?? 0);

  const viewOnce =
    subject.isViewOnce === true || pieces.some((piece) => piece.isViewOnce === true) || (flags & VIEW_ONCE) !== 0;
  if (viewOnce) return VIEW_ONCE_CONTENT;

  if ((flags & EPHEMERAL_AFTER_READ) !== 0) return AFTER_READ_FLAME;

  const duration = knownDuration(subject);
  const declaredEphemeral = (flags & EPHEMERAL) !== 0 || instantOf(subject.expiresAt) !== null;
  if (duration === null) return declaredEphemeral ? AFTER_READ_FLAME : ORDINARY;

  return {
    nature: 'timed-flame',
    forward: { allowed: true, maxDurationSeconds: duration },
    exportable: false,
    capture: 'blocked',
  };
}

/**
 * Les colonnes de protection de la COPIE qu'un transfert crée — `null` quand la
 * source ne se transfère pas.
 *
 * - Source flamme à durée ⇒ `min(durée demandée, durée source)` (demandée
 *   absente ou invalide ⇒ celle de la source), bits `EPHEMERAL |
 *   EPHEMERAL_AFTER_READ` : la requête ne peut ni allonger, ni retirer.
 * - Le FLOU de la source est imposé sur toute nature ; la requête peut
 *   l'ajouter, jamais le retirer.
 * - Source ordinaire ⇒ la requête passe telle quelle, flou mis à part.
 */
export function forwardedCopyProtection(input: {
  readonly source: ContentExitSubject | null | undefined;
  readonly requested: Pick<ContentExitSubject, 'effectFlags' | 'isBlurred' | 'ephemeralDuration'> | null | undefined;
}): ForwardedCopyProtection | null {
  const { forward } = contentExitLaw(input.source);
  if (forward.allowed === false) return null;

  const requestedFlags = input.requested?.effectFlags ?? 0;
  const isBlurred =
    input.source?.isBlurred === true ||
    ((input.source?.effectFlags ?? 0) & BLURRED) !== 0 ||
    input.requested?.isBlurred === true ||
    (requestedFlags & BLURRED) !== 0;
  const blurBit = isBlurred ? BLURRED : 0;
  const requestedDuration = wholeSeconds(input.requested?.ephemeralDuration);

  if (forward.maxDurationSeconds === null) {
    return { effectFlags: requestedFlags | blurBit, isBlurred, ephemeralDuration: requestedDuration };
  }

  return {
    effectFlags: (requestedFlags & ~EPHEMERAL_BITS) | EPHEMERAL_BITS | blurBit,
    isBlurred,
    ephemeralDuration: Math.min(requestedDuration ?? forward.maxDurationSeconds, forward.maxDurationSeconds),
  };
}
