import { MESSAGE_STICKER_ANIMATIONS, type MessageSticker, type MessageStickerAnimation } from '@meeshy/shared/types/message-sticker';

import type { Attachment, Message } from '@/lib/api/types';
import { metadataOf, type MetadataRecord } from './message-metadata';

/**
 * LE CORPS D'UN MESSAGE — sticker, emoji seul, lieu, story citée, texte
 * (#5936). Loi PURE, consommée par les DEUX peaux — miroir
 * `FocalRow.textOrEmojiBlock` (`:604-615`), `EmojiDetector.swift`,
 * `messageSticker.ts` / `sharedPlace.ts` (gateway) et
 * `postReplySnapshot.ts` (gateway).
 */

/**
 * `EmojiDetector.EmojiOnlyResult.fontSize`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Utilities/EmojiDetector.swift:14-19`).
 * Dérivées, gardées par `scripts/check-curve.mjs`.
 */
export const EMOJI_ONLY_FONT_SIZES = { single: 90, double: 60, triple: 45 } as const;

const EMOJI_GRAPHEME_PATTERN = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u;

function isEmojiGrapheme(grapheme: string): boolean {
  return EMOJI_GRAPHEME_PATTERN.test(grapheme);
}

/**
 * UN SEUL segmenteur pour toute l'application, construit UNE fois — et la
 * boucle S'ARRÊTE au premier graphème non-emoji ou au quatrième
 * (revue-correction #5936).
 *
 * Ce n'est pas une micro-optimisation : `emojiOnlyOf` est appelée par
 * `bodyKindOf` (les DEUX peaux) ET par `composeMessageLabel`, lui-même
 * rejoué pour CHAQUE rangée à chaque rendu du virtualiseur — donc pendant le
 * défilement, le geste que la dimension 4 mesure en images perdues. MESURÉ
 * (node 2 000 itérations, texte de 76 caractères) : construire le
 * segmenteur à chaque appel puis matérialiser TOUS les graphèmes coûte
 * 29,0 µs par appel ; le segmenteur hissé, 18,0 µs ; l'arrêt anticipé sur
 * un texte ordinaire, 0,1 µs. Sur 26 rangées montées, 0,75 ms de chaque
 * image de défilement partaient à détecter un emoji dans une phrase.
 */
const GRAPHEME_SEGMENTER = new Intl.Segmenter('und', { granularity: 'grapheme' });

export type EmojiOnlyResult = { readonly count: 1 | 2 | 3; readonly fontSize: number };

/**
 * `EmojiDetector.analyze` (`:22-36`) : ≤ 3 GRAPHÈMES (`Intl.Segmenter`, un
 * modificateur de teint ou un `ZWJ` ne compte PAS pour un graphème de plus),
 * tous emoji. `FocalRow.textOrEmojiBlock` (`:612`) : jamais emoji seul si le
 * message a une pièce jointe OU un lieu.
 */
export function emojiOnlyOf(input: {
  readonly content: string;
  readonly attachmentCount: number;
  readonly hasPlace: boolean;
}): EmojiOnlyResult | null {
  if (input.attachmentCount > 0 || input.hasPlace) return null;
  const trimmed = input.content.trim();
  if (trimmed === '') return null;

  let graphemeCount = 0;
  for (const { segment } of GRAPHEME_SEGMENTER.segment(trimmed)) {
    graphemeCount += 1;
    if (graphemeCount > 3 || !isEmojiGrapheme(segment)) return null;
  }
  if (graphemeCount === 0) return null;

  const count = graphemeCount as 1 | 2 | 3;
  const fontSize = count === 1 ? EMOJI_ONLY_FONT_SIZES.single : count === 2 ? EMOJI_ONLY_FONT_SIZES.double : EMOJI_ONLY_FONT_SIZES.triple;
  return { count, fontSize };
}

/**
 * LES TROIS CHAMPS HISSÉS DU FIL (revue-correction #5936).
 *
 * La passerelle sert `sticker`, `location` et `postReplyTo` À LA RACINE du
 * message, VALIDÉS serveur — c'est le contrat DÉCLARÉ
 * (`packages/shared/types/api-schemas/message.ts:163-188`), hissé par
 * `routes/conversations/messages-list.ts:670-677` (REST) et par
 * `socketio/messageNewPayload.ts:184` (temps réel). `metadata`, lui, n'est
 * servi QUE par REST (`message.ts:140-153`, `additionalProperties: true`) :
 * la charge `message:new` NE LE PORTE PAS
 * (`messageNewPayload.ts:140-190`, lu ligne à ligne — `metadata` n'y figure
 * à aucune clé).
 *
 * Lire `metadata.*` SEUL rendait donc ces trois états INERTES sur le chemin
 * TEMPS RÉEL : un sticker arrivé en direct retombait sur `emojiOnlyOf` et se
 * peignait en gros emoji — « le repli servi à la place de la chose », le
 * défaut que `FocalRow.textOrEmojiBlock` (`:617-639`) nomme lui-même. La
 * RACINE d'abord, `metadata` en repli (REST d'un client plus ancien, et les
 * fixtures qui miment la ligne stockée).
 */
type HoistedFields = {
  readonly sticker?: unknown;
  readonly location?: unknown;
  readonly postReplyTo?: unknown;
};

function hoistedOf(message: Pick<Message, 'metadata'> & HoistedFields, key: keyof HoistedFields): unknown {
  const root = message[key];
  if (root !== undefined && root !== null) return root;
  return metadataOf(message)?.[key];
}

/**
 * `sticker` À LA RACINE, `metadata.sticker` en repli (`hoistedOf`) — le type
 * partagé `Message` ne déclare pas encore le champ hissé (§ 3.6 de la
 * spécification), mais le FIL le porte sur les DEUX transports.
 * `MESSAGE_STICKER_ANIMATIONS` valide l'animation — une valeur hors de
 * l'énumération fait tomber le sticker ENTIER (« une borne franchie ⇒ pas de
 * sticker », miroir `messageSticker.ts:104-121`).
 */
export function stickerOf(message: Pick<Message, 'metadata'> & HoistedFields): MessageSticker | null {
  const raw = hoistedOf(message, 'sticker');
  if (raw === undefined || raw === null || typeof raw !== 'object') return null;

  const obj = raw as MetadataRecord;
  const animation = obj.animation;
  if (animation !== undefined && !(MESSAGE_STICKER_ANIMATIONS as readonly string[]).includes(animation as string)) {
    return null;
  }

  const emoji = typeof obj.emoji === 'string' ? obj.emoji : undefined;
  const templateId = typeof obj.templateId === 'string' ? obj.templateId : undefined;
  const slots =
    obj.slots !== undefined && obj.slots !== null && typeof obj.slots === 'object'
      ? (obj.slots as Record<string, string>)
      : undefined;

  if (emoji === undefined && templateId === undefined) return null;

  return {
    ...(templateId === undefined ? {} : { templateId }),
    ...(slots === undefined ? {} : { slots }),
    ...(animation === undefined ? {} : { animation: animation as MessageStickerAnimation }),
    ...(emoji === undefined ? {} : { emoji }),
  };
}

/**
 * Miroir LOCAL de `services/gateway/src/services/location/sharedPlace.ts` —
 * le type gateway n'est pas importable (§ 3.6). Mêmes bornes : coordonnées
 * valides obligatoires, textes tronqués à 200 caractères plutôt que le lieu
 * entier rejeté.
 */
export type SharedPlace = {
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string | null;
  readonly address: string | null;
};

const PLACE_TEXT_MAX_LENGTH = 200;

function boundedPlaceText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, PLACE_TEXT_MAX_LENGTH);
}

function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' && typeof longitude === 'number' &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  );
}

/** `location` à la racine (`messages-list.ts:670-676`), `metadata.location` en repli (`sharedPlace.ts:72-79`). */
export function placeOf(message: Pick<Message, 'metadata'> & HoistedFields): SharedPlace | null {
  const raw = hoistedOf(message, 'location');
  if (raw === undefined || raw === null || typeof raw !== 'object') return null;
  const obj = raw as MetadataRecord;
  if (!validCoordinates(obj.latitude, obj.longitude)) return null;
  return {
    latitude: obj.latitude as number,
    longitude: obj.longitude as number,
    name: boundedPlaceText(obj.name),
    address: boundedPlaceText(obj.address),
  };
}

/** Pas de tuile de carte ce lot (§ 9 Q6 de la spécification) — un lien nommé, ouvert dans Plans sur iOS. */
export function mapsUrlOf(place: SharedPlace): string {
  const query = place.name !== null ? `&q=${encodeURIComponent(place.name)}` : '';
  return `https://maps.apple.com/?ll=${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}${query}`;
}

export type StoryCitation = {
  readonly id: string;
  readonly previewText: string;
  readonly thumbnailUrl: string | null;
  readonly createdAt: string;
};

/**
 * `postReplyTo` à la racine, `metadata.postReplyTo` en repli
 * (`postReplySnapshot.ts:32-58`). Une HUMEUR
 * (`moodEmoji` non nul) n'a pas de scène — `StoryCitationPlacement.isDetached`
 * (`BubbleStoryCitationCard.swift:272-294`) l'exclut déjà pour cette raison ;
 * cette loi ne rend RIEN pour elle, le rendu texte ordinaire suffit.
 */
export function storyCitationOf(
  message: Pick<Message, 'storyReplyToId' | 'metadata'> & HoistedFields,
): StoryCitation | null {
  if (message.storyReplyToId === undefined) return null;
  const raw = hoistedOf(message, 'postReplyTo');
  if (raw === undefined || raw === null || typeof raw !== 'object') return null;

  const obj = raw as MetadataRecord;
  if (obj.moodEmoji !== null && obj.moodEmoji !== undefined) return null;
  if (typeof obj.id !== 'string') return null;

  return {
    id: obj.id,
    previewText: typeof obj.previewText === 'string' ? obj.previewText : '',
    thumbnailUrl: typeof obj.thumbnailUrl === 'string' ? obj.thumbnailUrl : null,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date(0).toISOString(),
  };
}

export type BodyKind =
  | { readonly kind: 'sticker'; readonly sticker: MessageSticker; readonly picture: Attachment | undefined }
  | { readonly kind: 'emoji-only'; readonly text: string; readonly fontSize: number }
  | { readonly kind: 'text' };

/**
 * `textOrEmojiBlock` (`FocalRow.swift:604-615`) : sticker d'abord (« un
 * gabarit porte un emoji de repli, si bien qu'un message-sticker peut
 * satisfaire `isEmojiOnly` — le repli servi à la place de la chose »), puis
 * emoji seul SANS citation (`FocalRow.swift:612`), puis texte.
 */
export function bodyKindOf(
  message: Pick<Message, 'content' | 'metadata' | 'attachments' | 'replyTo'> & HoistedFields,
): BodyKind {
  const sticker = stickerOf(message);
  if (sticker !== null) {
    return { kind: 'sticker', sticker, picture: message.attachments?.[0] };
  }

  const place = placeOf(message);
  const emoji = emojiOnlyOf({
    content: message.content,
    attachmentCount: message.attachments?.length ?? 0,
    hasPlace: place !== null,
  });
  if (emoji !== null && message.replyTo === undefined) {
    return { kind: 'emoji-only', text: message.content.trim(), fontSize: emoji.fontSize };
  }

  return { kind: 'text' };
}
