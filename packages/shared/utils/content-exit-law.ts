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
 * (bit `EPHEMERAL` nu, `expiresAt` sans `ephemeralDuration`) reçoit les
 * verdicts de la flamme après lecture. On ne peut pas borner une copie par une
 * durée qu'on ne connaît pas — et `expiresAt` n'en est pas une : depuis #7451
 * c'est l'heure INTERNE de destruction (sept jours tant que personne n'a
 * reçu), dont la distance à la création ferait d'une flamme de trente secondes
 * une copie d'une semaine.
 *
 * DEUX ENTRÉES. {@link contentExitLaw} sert l'AFFICHAGE des clients : un champ
 * absent n'y déclare rien. {@link contentExitLawOfSource} sert l'AUTORISATION
 * du serveur : elle exige la projection ENTIÈRE et ferme sur tout champ non
 * chargé — une colonne sélectionnée n'est jamais `undefined`, donc l'absence
 * prouve que la requête ne l'a pas lue, jamais que le contenu est ordinaire.
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
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
};

/** Ce que la loi lit d'un message. Tout est facultatif : un champ absent ne déclare rien. */
export type ContentExitSubject = {
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
  readonly ephemeralDuration?: number | null;
  /** Sa seule PRÉSENCE déclare un éphémère ; elle ne donne jamais la durée. */
  readonly expiresAt?: Date | string | null;
  readonly attachments?: ReadonlyArray<ContentExitAttachment | null | undefined> | null;
};

/**
 * La projection ENTIÈRE qu'un chemin d'autorisation doit avoir chargée : tout
 * champ est requis, `null` se dit explicitement.
 */
export type ContentExitProjection = {
  readonly isViewOnce: boolean | null;
  readonly isBlurred: boolean | null;
  readonly effectFlags: number | null;
  readonly ephemeralDuration: number | null;
  readonly expiresAt: Date | string | null;
  readonly attachments: ReadonlyArray<{
    readonly isViewOnce: boolean | null;
    readonly isBlurred: boolean | null;
    readonly effectFlags: number | null;
  }>;
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

const blurredBy = (carrier: { readonly isBlurred?: boolean | null; readonly effectFlags?: number | null }): boolean =>
  carrier.isBlurred === true || ((carrier.effectFlags ?? 0) & BLURRED) !== 0;

const piecesOf = (subject: ContentExitSubject | null | undefined): readonly ContentExitAttachment[] =>
  (subject?.attachments ?? []).filter((piece): piece is ContentExitAttachment => piece != null);

export function contentExitLaw(subject: ContentExitSubject | null | undefined): ContentExitLaw {
  if (!subject) return ORDINARY;

  const pieces = piecesOf(subject);
  const flags = pieces.reduce((acc, piece) => acc | (piece.effectFlags ?? 0), subject.effectFlags ?? 0);

  const viewOnce =
    subject.isViewOnce === true || pieces.some((piece) => piece.isViewOnce === true) || (flags & VIEW_ONCE) !== 0;
  if (viewOnce) return VIEW_ONCE_CONTENT;

  if ((flags & EPHEMERAL_AFTER_READ) !== 0) return AFTER_READ_FLAME;

  const duration = wholeSeconds(subject.ephemeralDuration);
  const declaredEphemeral = (flags & EPHEMERAL) !== 0 || instantOf(subject.expiresAt) !== null;
  if (duration === null) return declaredEphemeral ? AFTER_READ_FLAME : ORDINARY;

  return {
    nature: 'timed-flame',
    forward: { allowed: true, maxDurationSeconds: duration },
    exportable: false,
    capture: 'blocked',
  };
}

const MESSAGE_PROJECTION = ['isViewOnce', 'isBlurred', 'effectFlags', 'ephemeralDuration', 'expiresAt', 'attachments'] as const;
const PIECE_PROJECTION = ['isViewOnce', 'isBlurred', 'effectFlags'] as const;

const fullyLoaded = (row: object | null | undefined, fields: readonly string[]): boolean =>
  row != null && fields.every((field) => (row as Record<string, unknown>)[field] !== undefined);

/**
 * La loi pour un chemin d'AUTORISATION. Une source absente, une colonne ou une
 * pièce non chargée rendent les verdicts de la flamme après lecture : ni
 * transfert, ni export.
 */
export function contentExitLawOfSource(source: ContentExitProjection | null | undefined): ContentExitLaw {
  const complete =
    fullyLoaded(source, MESSAGE_PROJECTION) &&
    Array.isArray(source?.attachments) &&
    source.attachments.every((piece) => fullyLoaded(piece, PIECE_PROJECTION));
  return complete ? contentExitLaw(source) : AFTER_READ_FLAME;
}

/**
 * Les colonnes de protection de la COPIE qu'un transfert crée — `null` quand la
 * source ne se transfère pas.
 *
 * - Source flamme à durée ⇒ `min(durée demandée, durée source)` (demandée
 *   absente ou invalide ⇒ celle de la source), bits `EPHEMERAL |
 *   EPHEMERAL_AFTER_READ` : la requête ne peut ni allonger, ni retirer.
 * - Le FLOU de la source — message OU l'une de ses pièces — est imposé sur
 *   toute nature ; la requête peut l'ajouter, jamais le retirer.
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
    (input.source != null && blurredBy(input.source)) ||
    piecesOf(input.source).some(blurredBy) ||
    (input.requested != null && blurredBy(input.requested));
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
