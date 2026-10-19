/**
 * LE PLAN DE L'ÉCRAN DE PARTAGE UNIQUE (#10949, planche
 * `docs/product/partage-unique/planche-partage-unique.html`, décisions
 * D1–D15 arrêtées par le porteur le 2026-10-18).
 *
 * Un seul écran reçoit tout ce qu'on veut envoyer — un texte, un lien, des
 * médias venus d'une autre app, une pièce d'un message, un ou plusieurs
 * messages, une publication, une story, un réel, un profil, une invitation — et
 * ce module dit, pour cette entrée et ces destinataires :
 *
 * - ce qui PART (`kept`) et ce qui est RETIRÉ avec son motif (`withdrawn`, D6) ;
 * - ce qu'on peut EN FAIRE (`actions`) et ce qui est interdit avec son motif
 *   (`withheld` — l'entrée n'est pas rendue, une ligne grise dit pourquoi) ;
 * - le choix « Ensemble / Séparément » et sa valeur par défaut (D3) ;
 * - où va la légende (D3, D4) ;
 * - la durée d'une flamme (≤ source), le flou hérité (D8) ;
 * - l'avertissement de sortie du chiffrement (D7) ;
 * - les plafonds communs (D10) : combien retirer, et si l'on peut envoyer.
 *
 * **PUR** : aucune requête, aucun réseau. Le web le consomme ; iOS le
 * mirrore (même entrée, même sortie, mêmes noms).
 *
 * La nature d'un message se lit par la LOI DE SORTIE (`content-exit-law.ts`),
 * jamais par une règle redite ici : le client masque, la passerelle refuse
 * avec un code stable (`FORWARD_REFUSAL_CODES`).
 */

import { contentExitLaw, type ContentExitAttachment, type ContentExitSubject } from './content-exit-law.js';
import { qualifiesAsReel } from './reel-composition.js';
import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';
import { SHARE_LIMITS } from './share-limits.js';

/** Un média : un fichier venu d'une autre app, ou la pièce d'un message. */
export type ShareMedia = {
  readonly id?: string;
  readonly mimeType: string;
  readonly bytes?: number | null;
  readonly durationMs?: number | null;
};

export type ShareMessagePiece = ShareMedia & ContentExitAttachment & { readonly id: string };

/**
 * Un message source, tel que le client le connaît. Ses drapeaux de protection
 * sont ceux de la loi de sortie ; `encrypted` dit que sa conversation est
 * chiffrée (ou qu'il porte un contenu chiffré) ; `citesProtected` qu'il cite un
 * contenu protégé.
 */
export type ShareMessage = Omit<ContentExitSubject, 'attachments'> & {
  readonly id: string;
  readonly text?: string | null;
  readonly encrypted?: boolean;
  readonly citesProtected?: boolean;
  readonly pieces?: readonly ShareMessagePiece[];
};

export type ShareEntry =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'link'; readonly url: string; readonly text?: string | null }
  | { readonly kind: 'media'; readonly media: readonly ShareMedia[]; readonly text?: string | null }
  | { readonly kind: 'piece'; readonly message: ShareMessage; readonly attachmentId: string }
  | { readonly kind: 'messages'; readonly messages: readonly ShareMessage[] }
  | { readonly kind: 'post' | 'story' | 'reel' | 'profile' | 'invitation'; readonly url?: string | null };

/** Un destinataire choisi. `encrypted` absent = non chiffré. */
export type ShareDestination = { readonly id: string; readonly encrypted?: boolean };

export type ShareAction =
  | 'send'
  | 'caption'
  | 'reorder'
  | 'grouping'
  | 'publish-post'
  | 'publish-story'
  | 'publish-reel'
  | 'studio'
  | 'save'
  | 'copy-link'
  | 'copy-text'
  | 'imager'
  | 'share-out';

export type ShareWithheldReason =
  | 'single-photo-not-a-reel'
  | 'not-a-reel'
  | 'too-many-for-publication'
  | 'flame'
  | 'blurred'
  | 'encrypted'
  | 'cites-protected';

export type ShareWithdrawReason = 'view-once' | 'after-read' | 'unavailable';

export type SharePlan = {
  /** `forward` : la source est un message (« Transférer ») ; `send` sinon (« Envoyer »). */
  readonly title: 'send' | 'forward';
  /** Ce qui part, dans l'ordre : ids des messages, de la pièce, ou des médias (index si sans id). */
  readonly kept: readonly string[];
  readonly withdrawn: readonly { readonly id: string; readonly reason: ShareWithdrawReason }[];
  /** Rien ne part : tout ce qui est choisi est protégé ou indisponible (carte « ne sort pas de Meeshy »). */
  readonly blocked: ShareWithdrawReason | null;
  readonly actions: readonly ShareAction[];
  readonly withheld: readonly { readonly action: ShareAction; readonly reason: ShareWithheldReason }[];
  readonly grouping: { readonly default: 'together' } | null;
  readonly caption: {
    readonly placement: 'message-text' | 'separate-message';
    readonly whenSeparate: 'first-message';
    readonly maxLength: number;
  } | null;
  /** La copie d'une flamme dure AU PLUS autant que la source — présélectionnée. */
  readonly flame: { readonly maxDurationSeconds: number } | null;
  /** La copie d'un flouté reste floutée (D8). */
  readonly blurInherited: boolean;
  /** Source chiffrée : la copie se fait sur l'appareil ; ces destinations ne sont pas chiffrées (D7). */
  readonly encryption: { readonly copyOnDevice: true; readonly warnDestinationIds: readonly string[] } | null;
  readonly limits: {
    readonly files: number;
    readonly bytes: number;
    /** Combien de pièces retirer, depuis la fin, pour tenir 20 fichiers et 500 Mo. */
    readonly trimCount: number;
    readonly recipients: number;
    readonly overRecipients: number;
  };
  readonly canSend: boolean;
};

export type ShareInput = {
  readonly entry: ShareEntry;
  readonly destinations?: readonly ShareDestination[];
};

export const MAX_SHARE_CAPTION = 5000;

type MediaFamily = 'image' | 'video' | 'audio' | 'file';

const familyOf = (media: ShareMedia): MediaFamily => {
  const mime = media.mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
};

const PUBLISH: readonly ShareAction[] = ['publish-post', 'publish-story', 'studio'];
const EXPORTS: readonly ShareAction[] = ['publish-post', 'publish-story', 'publish-reel', 'studio', 'save', 'copy-link', 'copy-text', 'imager', 'share-out'];
const PUBLICATIONS: readonly ShareAction[] = ['publish-post', 'publish-story', 'publish-reel', 'studio'];

type Offer = { readonly actions: readonly ShareAction[]; readonly withheld: SharePlan['withheld'] };

const NO_OFFER: Offer = { actions: [], withheld: [] };

/** Ce qu'un lot de médias permet de PUBLIER : visuels homogènes, ou sons seuls (D13) ; jamais un fichier. */
const publicationOffer = (media: readonly ShareMedia[]): Offer => {
  const families = media.map(familyOf);
  const visual = families.every((family) => family === 'image' || family === 'video');
  const sound = families.every((family) => family === 'audio');
  if (media.length === 0 || (!visual && !sound)) return NO_OFFER;
  if (media.length > SHARE_LIMITS.maxPublicationMedia) {
    return { actions: [], withheld: PUBLISH.map((action) => ({ action, reason: 'too-many-for-publication' })) };
  }
  if (sound) return { actions: PUBLISH, withheld: [] };
  const reel = qualifiesAsReel(media.map((item) => ({ mimeType: item.mimeType, duration: item.durationMs ?? null })));
  if (reel) return { actions: [...PUBLISH, 'publish-reel'], withheld: [] };
  const singlePhoto = media.length === 1 && families[0] === 'image';
  return { actions: PUBLISH, withheld: [{ action: 'publish-reel', reason: singlePhoto ? 'single-photo-not-a-reel' : 'not-a-reel' }] };
};

const merge = (...offers: readonly Offer[]): Offer => ({
  actions: offers.flatMap((offer) => offer.actions),
  withheld: offers.flatMap((offer) => offer.withheld),
});

const plain = (...actions: readonly ShareAction[]): Offer => ({ actions, withheld: [] });

const isBlurredCarrier = (carrier: { readonly isBlurred?: boolean | null; readonly effectFlags?: number | null }): boolean =>
  carrier.isBlurred === true || ((carrier.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.BLURRED) !== 0;

const hasText = (text: string | null | undefined): boolean => (text ?? '').trim().length > 0;

const lawOf = (message: ShareMessage, pieces: readonly ShareMessagePiece[] = message.pieces ?? []) =>
  contentExitLaw({ ...message, attachments: pieces });

const withdrawReasonOf = (message: ShareMessage, pieces?: readonly ShareMessagePiece[]): ShareWithdrawReason | null => {
  const { forward } = lawOf(message, pieces);
  return forward.allowed ? null : forward.reason;
};

/** Ce que la NATURE retire de ce que l'entrée offrirait — la plus restrictive des sources gagne. */
type NatureVerdict = {
  readonly withhold: readonly { readonly actions: readonly ShareAction[]; readonly reason: ShareWithheldReason }[];
  readonly flameSeconds: number | null;
  readonly blurred: boolean;
  readonly encrypted: boolean;
};

const natureOf = (sources: readonly { readonly message: ShareMessage; readonly pieces: readonly ShareMessagePiece[] }[]): NatureVerdict => {
  const laws = sources.map(({ message, pieces }) => ({ message, law: lawOf(message, pieces) }));
  const flames = laws.flatMap(({ law }) => (law.forward.allowed && law.forward.maxDurationSeconds !== null ? [law.forward.maxDurationSeconds] : []));
  const blurred = sources.some(
    ({ message, pieces }) => isBlurredCarrier(message) || pieces.some(isBlurredCarrier),
  );
  const encrypted = sources.some(({ message }) => message.encrypted === true);
  const citesProtected = sources.some(({ message }) => message.citesProtected === true);
  const withhold = [
    ...(flames.length > 0 ? [{ actions: EXPORTS, reason: 'flame' as const }] : []),
    ...(blurred ? [{ actions: EXPORTS, reason: 'blurred' as const }] : []),
    ...(encrypted ? [{ actions: PUBLICATIONS, reason: 'encrypted' as const }] : []),
    ...(citesProtected ? [{ actions: ['imager'] as readonly ShareAction[], reason: 'cites-protected' as const }] : []),
  ];
  return { withhold, flameSeconds: flames.length > 0 ? Math.min(...flames) : null, blurred, encrypted };
};

const applyNature = (offer: Offer, nature: NatureVerdict): Offer => {
  const reasonFor = (action: ShareAction): ShareWithheldReason | null =>
    nature.withhold.find((rule) => rule.actions.includes(action))?.reason ?? null;
  const kept = offer.actions.filter((action) => reasonFor(action) === null);
  const removed = offer.actions.flatMap((action) => {
    const reason = reasonFor(action);
    return reason === null ? [] : [{ action, reason }];
  });
  return { actions: kept, withheld: [...removed, ...offer.withheld.filter((entry) => reasonFor(entry.action) === null)] };
};

type Draft = {
  readonly title: SharePlan['title'];
  readonly kept: readonly string[];
  readonly withdrawn: SharePlan['withdrawn'];
  readonly blocked: ShareWithdrawReason | null;
  readonly offer: Offer;
  readonly nature: NatureVerdict | null;
  readonly media: readonly ShareMedia[];
  readonly captionPlacement: 'message-text' | 'separate-message' | null;
};

const CARD_OFFERS: Record<'post' | 'story' | 'reel' | 'profile' | 'invitation', Offer> = {
  post: plain('send', 'caption', 'publish-post', 'publish-story', 'copy-link', 'share-out'),
  story: plain('send', 'caption', 'copy-link', 'share-out'),
  reel: plain('send', 'caption', 'publish-post', 'publish-story', 'copy-link', 'share-out'),
  profile: plain('send', 'caption', 'copy-link', 'share-out'),
  invitation: plain('send', 'caption', 'copy-link', 'share-out'),
};

const mediaIds = (media: readonly ShareMedia[]): readonly string[] => media.map((item, index) => item.id ?? String(index));

const sendDraft = (offer: Offer, captionPlacement: Draft['captionPlacement'], media: readonly ShareMedia[] = []): Draft => ({
  title: 'send',
  kept: mediaIds(media),
  withdrawn: [],
  blocked: null,
  offer,
  nature: null,
  media,
  captionPlacement,
});

const blockedDraft = (reason: ShareWithdrawReason, withdrawn: SharePlan['withdrawn'] = []): Draft => ({
  title: 'forward',
  kept: [],
  withdrawn,
  blocked: reason,
  offer: NO_OFFER,
  nature: null,
  media: [],
  captionPlacement: null,
});

const pieceDraft = (message: ShareMessage, attachmentId: string): Draft => {
  const piece = (message.pieces ?? []).find((candidate) => candidate.id === attachmentId);
  if (!piece) return blockedDraft('unavailable');
  const refusal = withdrawReasonOf(message, [piece]);
  if (refusal) return blockedDraft(refusal);
  const nature = natureOf([{ message, pieces: [piece] }]);
  const offer = merge(plain('send', 'caption'), publicationOffer([piece]), plain('save', 'share-out'));
  return { title: 'forward', kept: [piece.id], withdrawn: [], blocked: null, offer, nature, media: [], captionPlacement: 'separate-message' };
};

const messagesDraft = (messages: readonly ShareMessage[]): Draft => {
  const withdrawn = messages.flatMap((message) => {
    const reason = withdrawReasonOf(message);
    return reason ? [{ id: message.id, reason }] : [];
  });
  const kept = messages.filter((message) => !withdrawn.some((entry) => entry.id === message.id));
  if (kept.length === 0) return blockedDraft(withdrawn[0]?.reason ?? 'unavailable', withdrawn);

  const nature = natureOf(kept.map((message) => ({ message, pieces: message.pieces ?? [] })));
  const textOffer = kept.some((message) => hasText(message.text)) ? plain('copy-text') : NO_OFFER;
  const sole = kept.length === 1 ? kept[0] : null;
  const pieces = sole?.pieces ?? [];
  const publishable = pieces.length > 0 ? merge(publicationOffer(pieces), plain('save', 'share-out')) : NO_OFFER;
  const offer = merge(
    plain('send', 'caption'),
    kept.length > 1 || pieces.length > 1 ? plain('reorder') : NO_OFFER,
    sole ? publishable : NO_OFFER,
    plain('imager'),
    textOffer,
  );
  return { title: 'forward', kept: kept.map((message) => message.id), withdrawn, blocked: null, offer, nature, media: [], captionPlacement: 'separate-message' };
};

const mediaDraft = (media: readonly ShareMedia[]): Draft =>
  sendDraft(merge(plain('send', 'caption'), media.length > 1 ? plain('reorder', 'grouping') : NO_OFFER, publicationOffer(media)), 'message-text', media);

const draftOf = (entry: ShareEntry): Draft => {
  switch (entry.kind) {
    case 'text':
      return sendDraft(plain('send', 'publish-post', 'publish-story', 'studio'), null);
    case 'link':
      return sendDraft(plain('send', 'caption', 'publish-post', 'publish-story', 'studio', 'copy-link', 'share-out'), 'message-text');
    case 'media':
      return mediaDraft(entry.media);
    case 'piece':
      return pieceDraft(entry.message, entry.attachmentId);
    case 'messages':
      return messagesDraft(entry.messages);
    default:
      return sendDraft(CARD_OFFERS[entry.kind], 'message-text');
  }
};

/** Le plus petit nombre de pièces à retirer, depuis la fin, pour tenir les deux plafonds. */
const trimCountOf = (media: readonly ShareMedia[]): number => {
  const fits = (count: number) =>
    count <= SHARE_LIMITS.maxFiles &&
    media.slice(0, count).reduce((total, item) => total + Math.max(0, item.bytes ?? 0), 0) <= SHARE_LIMITS.maxTotalBytes;
  const keep = Array.from({ length: media.length + 1 }, (_, index) => media.length - index).find(fits) ?? 0;
  return media.length - keep;
};

const unique = (actions: readonly ShareAction[]): readonly ShareAction[] => [...new Set(actions)];

export function planShare(input: ShareInput): SharePlan {
  const draft = draftOf(input.entry);
  const offer = draft.nature ? applyNature(draft.offer, draft.nature) : draft.offer;
  const actions = unique(offer.actions);
  const destinations = input.destinations ?? [];
  const bytes = draft.media.reduce((total, item) => total + Math.max(0, item.bytes ?? 0), 0);
  const trimCount = trimCountOf(draft.media);
  const overRecipients = Math.max(0, destinations.length - SHARE_LIMITS.maxRecipients);
  const encrypted = draft.nature?.encrypted === true;

  return {
    title: draft.title,
    kept: draft.kept,
    withdrawn: draft.withdrawn,
    blocked: draft.blocked,
    actions,
    withheld: offer.withheld,
    grouping: actions.includes('grouping') ? { default: 'together' } : null,
    caption:
      draft.captionPlacement && actions.includes('caption')
        ? { placement: draft.captionPlacement, whenSeparate: 'first-message', maxLength: MAX_SHARE_CAPTION }
        : null,
    flame: draft.nature?.flameSeconds != null ? { maxDurationSeconds: draft.nature.flameSeconds } : null,
    blurInherited: draft.nature?.blurred === true,
    encryption: encrypted
      ? { copyOnDevice: true, warnDestinationIds: destinations.filter((destination) => destination.encrypted !== true).map((destination) => destination.id) }
      : null,
    limits: { files: draft.media.length, bytes, trimCount, recipients: destinations.length, overRecipients },
    canSend:
      draft.blocked === null &&
      actions.includes('send') &&
      trimCount === 0 &&
      destinations.length > 0 &&
      overRecipients === 0,
  };
}
