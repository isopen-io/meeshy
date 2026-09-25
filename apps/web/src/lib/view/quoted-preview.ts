import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { served } from '@/lib/api/prism';
import { attachmentSrc } from '@/lib/api/media-url';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { Attachment, Message } from '@/lib/api/types';

import { kindOf } from './message';
import { attachmentSegments } from './message-a11y-label';
import { attachmentDurationLabel } from './media-transport';

/**
 * CE QU'UNE CITATION MONTRE — SITE UNIQUE (#7556), miroir de
 * `ConversationViewModel.optimisticReplyReference(quoting:)`
 * (`apps/ios/.../ConversationViewModel+ReplyReference.swift:49-63`), où la
 * résolution d'une citation vit elle aussi en UN seul endroit.
 *
 * DEUX DÉFAUTS, UNE SEULE CAUSE. `Quote` (`components/message-blocks.tsx`)
 * rendait `quote.content` et rien d'autre :
 *  1. répondre à une photo, une vidéo, un vocal ou un document SANS légende
 *     produisait une citation VIDE — un filet coloré, un nom, rien ;
 *  2. le texte cité restait en langue d'ORIGINE pendant que le bandeau du
 *     composeur, lui, descendait le Prisme (`use-reply-preview.ts`) : le MÊME
 *     message cité s'affichait traduit avant l'envoi et en langue d'origine
 *     une fois gravé dans la bulle.
 *
 * La donnée, elle, ARRIVAIT INTACTE : `decodeMessage` décode `attachments`
 * récursivement sur `replyTo` (`api/decode.ts`) et un témoin VERT le garde
 * (`decode.test.ts`). Ce témoin prouve le TRANSPORT, jamais le PIXEL — « suivre
 * une donnée jusqu'à son consommateur s'arrête un cran trop tôt : la suivre
 * jusqu'au PIXEL » (CLAUDE.md § Prisme, cycle 123, `PostCard`).
 *
 * `Quote` et `useReplyToPreview` sont deux PROJECTIONS de cette fonction.
 * Deux descentes parallèles serviraient deux langues pour un même message
 * cité — la forme exacte du défaut 2, et celle que le cycle 128 a fermée sur
 * la piste audio d'une bannière.
 */

export type QuotedMediaKind = 'image' | 'video' | 'audio' | 'file';

/**
 * LE GENRE → SON LIBELLÉ COURT, miroir `AttachmentKind.shortLabel`
 * (`packages/MeeshySDK/.../Models/AttachmentKind.swift:140-153`) ramené aux
 * QUATRE catégories que `kindOf` distingue côté web. Des clés de CATALOGUE,
 * jamais des chaînes françaises en dur : ce libellé est de l'INTERFACE (il
 * décrit un genre de fichier), pas du contenu — il suit la langue du lecteur,
 * pas celle du message.
 */
export const QUOTED_KIND_KEY = {
  image: 'attachment.kind.image',
  video: 'attachment.kind.video',
  audio: 'attachment.kind.audio',
  file: 'attachment.kind.file',
} as const satisfies Readonly<Record<QuotedMediaKind, InterfaceCatalogKey>>;

const MASKING_FLAGS = MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED;

type QuotedProtectionFields = {
  readonly isViewOnce?: boolean;
  readonly isBlurred?: boolean;
  readonly isEncrypted?: boolean;
  readonly effectFlags?: number;
};

/**
 * LA MOITIÉ CLIENTE DE `quotedMessageIsProtected`
 * (`services/gateway/src/services/messaging/servedQuotedMessage.ts`) — MÊME
 * prédicat, MÊME lecture du bitfield canonique.
 *
 * DISTINCT de `protectionOf` (`lib/reading-mode/protection.ts`), et ce n'est
 * pas une jumelle : celle-là répond « quel tombstone cette RANGÉE peint-elle,
 * à cet instant ? » et compte donc l'éphémère échu ; celle-ci répond « cette
 * CITATION a-t-elle le droit de décrire ce qu'elle cite ? », question à
 * laquelle la passerelle a déjà répondu dans la charge — et pour laquelle
 * l'éphémère n'est PAS une protection (son texte est lisible dans le fil
 * jusqu'à l'expiration, et la citation vit dans ce même fil). Poser ici la
 * loi de la rangée masquerait un texte que le serveur sert, et le client
 * dirait alors autre chose que les deux autres.
 */
export const quotedIsProtected = (quoted: QuotedProtectionFields): boolean =>
  Boolean(
    quoted.isViewOnce ||
      quoted.isBlurred ||
      quoted.isEncrypted ||
      ((quoted.effectFlags ?? 0) & MASKING_FLAGS) !== 0,
  );

export type QuotedMedia = {
  readonly kind: QuotedMediaKind;
  /** « Photo », « Vidéo », « Audio », « Fichier » — dans la langue d'INTERFACE. */
  readonly label: string;
  /** `null` quand rien ne peut voyager (protection) ou qu'aucune miniature n'est servie. */
  readonly thumbnailSrc: string | null;
  /** Le flou ThumbHash peint AVANT toute requête réseau — `null` sur un média protégé : un flou EST une image. */
  readonly placeholderSrc: string | null;
  /** « 0:42 » — `null` sans durée connue : un « 0:00 » faux est pire qu'aucun chiffre. */
  readonly durationLabel: string | null;
  /** Piste temporelle (vidéo, vocal) : le badge de lecture se pose sur la vignette. */
  readonly timebased: boolean;
};

export type QuotedPreview = {
  /** Le texte SERVI — la traduction élue, sinon l'original, sinon le libellé court du média. */
  readonly text: string;
  /** La langue de `text` — `''` quand il n'y a rien à déclarer (libellé d'interface, placeholder). */
  readonly language: string;
  readonly media: QuotedMedia | null;
  /** `attachmentSegments` du message cité, pour le nom accessible du bouton — jamais une seconde écriture. */
  readonly inventory: readonly string[];
  /**
   * `text` est un PLACEHOLDER, pas du contenu. La peau le lit pour taire ses
   * ORNEMENTS : le placeholder porte déjà son icône de genre (« 👁️ 🖼️ »), et
   * un glyphe de plus dirait deux fois la même chose.
   */
  readonly isProtected: boolean;
};

/**
 * LE MÉDIA REPRÉSENTATIF — miroir de `quotedRepresentative`
 * (`packages/MeeshySDK/.../CoreModels.swift:1362-1364`, « le premier hors
 * localisation »). Côté web il n'existe PAS de pièce jointe de localisation :
 * un lieu partagé vit dans `message.metadata` et se rend par `placeOf`
 * (`message-body.ts`) — la première pièce EST donc la règle, et non une
 * simplification de celle d'iOS.
 *
 * LA PIÈCE NOMMÉE PRIME (#6164, #7881) — répondre à la troisième photo
 * d'un carrousel : la passerelle sert `replyTo.attachmentReplyTo =
 * { attachmentId, kind }` (`servedQuotedMessage.ts`), que `decode.ts` laisse
 * passer tel quel sur la citation. Elle prime ici comme `citing` prime sur le
 * représentatif côté iOS ; une pièce nommée que la citation ne porte plus
 * (retirée, masquée pièce par pièce) retombe sur la première.
 */
const namedPieceIdOf = (quoted: object): string | undefined => {
  const named: unknown = (quoted as { readonly attachmentReplyTo?: unknown }).attachmentReplyTo;
  if (named === null || typeof named !== 'object') return undefined;
  const id: unknown = (named as { readonly attachmentId?: unknown }).attachmentId;
  return typeof id === 'string' && id !== '' ? id : undefined;
};

const representativeOf = (quoted: Pick<Message, 'attachments'>): Attachment | undefined => {
  const namedId = namedPieceIdOf(quoted);
  const named = namedId === undefined ? undefined : quoted.attachments?.find((a) => a.id === namedId);
  return named ?? quoted.attachments?.[0];
};

/**
 * `quotedThumbnailUrl` (`ConversationViewModel+ReplyReference.swift:171-173`) :
 * « une photo tout juste envoyée n'a pas encore de vignette serveur — la
 * citation montre le fichier lui-même plutôt qu'un carré vide ». Le repli ne
 * vaut QUE pour une image : servir le `fileUrl` d'une vidéo ou d'un PDF dans
 * un `<img>` peindrait une case brisée.
 */
const thumbnailOf = (attachment: Attachment, kind: QuotedMediaKind): string | null => {
  const raw = attachment.thumbnailUrl ?? (kind === 'image' ? attachment.fileUrl : undefined);
  if (raw === undefined || raw === '') return null;
  return attachmentSrc(raw);
};

/**
 * LES FAITS D'UNE PIÈCE JOINTE CITÉE, ET CE QUI LES RETIENT.
 *
 * La protection se lit aux DEUX niveaux qui la déclarent — celui du MESSAGE et
 * celui de la PIÈCE (`mediaMayTravel`, passerelle ; `quotedFacts(of:
 * mediaMayTravel:)`, iOS) : un message parfaitement ordinaire peut porter une
 * photo à vue unique, et c'est exactement le cas qu'une lecture au seul niveau
 * message laisserait sortir.
 *
 * Ce que la protection retient n'est pas seulement l'IMAGE : dimensions, durée
 * et taille DÉCRIVENT un contenu que le lecteur n'a pas le droit de voir — les
 * servir, c'est décrire le secret par la bande (`detailsLabel(for:)`,
 * `QuotedReplyPresentation.swift:154-158`). Le GENRE, lui, reste dit : le
 * dépôt divulgue déjà l'icône de type d'un contenu protégé
 * (`protectedPreview` → `contentTypeIcon`).
 */
const mediaOf = (params: {
  readonly attachment: Attachment;
  readonly messageIsProtected: boolean;
  readonly interfaceLanguage: InterfaceLanguage;
}): QuotedMedia => {
  const { attachment, messageIsProtected, interfaceLanguage } = params;
  const kind = kindOf(attachment);
  const mayTravel = !messageIsProtected && !quotedIsProtected(attachment);
  return {
    kind,
    label: translate(interfaceLanguage, QUOTED_KIND_KEY[kind]),
    thumbnailSrc: mayTravel ? thumbnailOf(attachment, kind) : null,
    placeholderSrc: (mayTravel ? thumbHashPlaceholder(attachment.thumbHash) : undefined) ?? null,
    durationLabel: mayTravel ? attachmentDurationLabel(attachment.duration) : null,
    timebased: kind === 'video' || kind === 'audio',
  };
};

/**
 * @param readerLanguages le prisme du LECTEUR, ordonné — celui que la rangée
 *   hôte a déjà reçu. La langue EXPLORÉE au geste (`displayLanguage`) n'entre
 *   PAS ici : elle appartient au message qui PORTE la citation, pas au message
 *   CITÉ, dont la bulle a sa propre exploration.
 * @param interfaceLanguage la langue du LECTEUR — celle du libellé court, qui
 *   est de l'interface et non du contenu. OBLIGATOIRE, même discipline que
 *   `composeMessageLabel` : un défaut silencieux servirait une langue au
 *   premier appelant qui l'oublie, et le défaut serait invisible pour qui
 *   parle français.
 */
export function quotedPreviewOf(params: {
  readonly quoted: Pick<
    Message,
    'content' | 'originalLanguage' | 'translations' | 'attachments' | 'isViewOnce' | 'isBlurred' | 'isEncrypted' | 'effectFlags'
  >;
  readonly readerLanguages: readonly string[];
  readonly interfaceLanguage: InterfaceLanguage;
}): QuotedPreview {
  const { quoted, readerLanguages, interfaceLanguage } = params;
  const messageIsProtected = quotedIsProtected(quoted);
  const attachment = representativeOf(quoted);
  const media =
    attachment === undefined ? null : mediaOf({ attachment, messageIsProtected, interfaceLanguage });

  /* UN PLACEHOLDER NE SE TRADUIT PAS. La passerelle retire déjà les
     traductions d'une citation protégée (`servedQuotedMessage`), mais ce
     refus est posé ICI aussi, et fail-closed : `content` porte alors le
     placeholder (« 👁️ 🖼️ »), qui n'est pas du contenu et n'a donc aucune
     langue à déclarer — un `lang="fr"` sur deux émojis ferait prononcer un
     secret dans une voix qu'il n'a pas. */
  if (messageIsProtected) {
    return { text: quoted.content, language: '', media, inventory: [], isProtected: true };
  }

  const rendered = served({
    preferredLanguages: readerLanguages,
    originalLanguage: quoted.originalLanguage,
    translations: quoted.translations,
    original: quoted.content,
  });

  /* LE LIBELLÉ COURT EST UN REPLI, JAMAIS UN PRÉFIXE (`quotedFlow`,
     `BubbleQuotedReply.swift:427-429` : « aperçu VIDE + pièce jointe → le
     libellé court du genre »). Sa langue est celle du DOCUMENT — c'est de
     l'interface : ne rien déclarer le fait hériter du `lang` de la page,
     alors qu'annoncer la langue du CONTENU ferait lire « Photo » avec la
     voix de la langue d'origine du message. */
  if (rendered.text === '') {
    return {
      text: media?.label ?? '',
      language: '',
      media,
      inventory: attachmentSegments(quoted.attachments),
      isProtected: false,
    };
  }

  return {
    text: rendered.text,
    language: rendered.language,
    media,
    inventory: attachmentSegments(quoted.attachments),
    isProtected: false,
  };
}
