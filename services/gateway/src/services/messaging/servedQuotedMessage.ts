import { maskedAttachment, protectedPreview } from '../notifications/notification-preview';
import { mediaSideContentMayTravel } from '../attachments/mediaSideContent';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  hasPerReaderEphemeralDeadline,
  servedEphemeralExpiresAt,
} from '@meeshy/shared/utils/ephemeral-countdown';
import {
  transformTranslationsToArray,
  type MessageTranslationJSON,
} from '../../utils/translation-transformer';
import type { AttachmentReplyTo } from './attachmentReplySnapshot';
import { quotableNoticeKind } from '@meeshy/shared/utils/quotable-notice';
import { withoutCallSummaryParticipants } from '@meeshy/shared/utils/call-summary';
import { CAPTURE_NOTICE_KIND, captureNoticeQuotedText } from '@meeshy/shared/utils/capture-notice';

/**
 * Ce qu'une CITATION a le droit de transporter — site UNIQUE des trois
 * producteurs de `replyTo` (liste REST, `message:new` socket, `message:new`
 * REST/ZMQ).
 *
 * La garde posée au cycle #4945 ne retenait que les TRADUCTIONS du message
 * cité : deux lignes plus haut, `...message.replyTo` répandait la ligne
 * entière, `content` compris, et le `select` de la citation servait ses pièces
 * jointes par `attachmentFullSelect` — donc `fileUrl`, `thumbnailUrl`,
 * `thumbHash`, les dimensions et la TRANSCRIPTION d'un vocal. Répondre à un
 * message à vue unique republiait donc son secret en clair (texte ET média)
 * dans chaque bulle-citation du fil, pour tout lecteur, aussi longtemps que la
 * réponse existait. **Une garde se mesure sur tout ce que la charge
 * TRANSPORTE, jamais sur sa seule chaîne** (leçon 275).
 *
 * Le masquage vivait, lui, à 100 % dans les peaux SwiftUI d'iOS
 * (`APIMessageReplyTo.isProtected`, `QuotedReplyPresentation.thumbHash`) : le
 * web, un export ou un client tiers lisaient le secret. Ici la charge
 * elle-même cesse de le contenir.
 *
 * L'ÉPHÉMÈRE n'est pas une protection au sens de la citation — son texte est
 * lisible dans le fil jusqu'à l'expiration, et la citation vit dans ce même fil.
 * Même lecture exactement que `APIMessageReplyTo.isProtected` côté iOS : sans
 * cette symétrie, la passerelle masquerait un texte que le client affiche, ou
 * l'inverse.
 *
 * Mais son ÉCHÉANCE est une affaire de LECTEUR (#8562) : `D(u)`, jamais la
 * colonne `expiresAt`, qui porte l'heure INTERNE de destruction. Passé `D(u)`,
 * la citation est SCELLÉE pour ce lecteur — même forme qu'une suppression
 * (`sealedQuotedMessage`), que les clients rendent déjà sans rien en garder.
 * Le scellement vivait seulement dans le cache du web et se perdait au
 * rechargement : une flamme-œil consommée restait lisible dans la citation
 * d'une réponse jusqu'à la destruction globale.
 */
export type QuotedMessageRow = {
  readonly content?: string | null;
  readonly messageType?: string | null;
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly isEncrypted?: boolean | null;
  readonly effectFlags?: number | null;
  readonly createdAt?: Date | string | null;
  /// #8562 — la colonne BRUTE : jamais resservie pour un éphémère, dont
  /// l'échéance est celle du lecteur (voir l'en-tête).
  readonly expiresAt?: Date | string | null;
  readonly ephemeralDuration?: number | null;
  /// #7927 — la suppression GARDE `content` en base : seul ce champ dit que
  /// le texte ne doit plus sortir.
  readonly deletedAt?: Date | string | null;
  readonly id?: string;
  readonly translations?: unknown;
  readonly attachments?: unknown;
  /// #17441 — la nature d'un avis cité (appel, arrivée, départ annoncé).
  readonly metadata?: unknown;
  /// #9915 — `_count.attachments` lu avec `QUOTED_VISUAL_ATTACHMENT_COUNT` :
  /// les tuiles du message cité, au-delà des quatre pièces servies.
  readonly _count?: { readonly attachments?: number } | null;
};

/**
 * #8562 — ce que la passerelle sait de CE lecteur face au message cité : la
 * même résolution que la racine (`EphemeralReaderResolution`), et l'instant du
 * service. Absente ⇒ lecteur inconnu (diffusion de room) : aucune échéance
 * servie, et le scellement revient à la variante par lecteur de la diffusion.
 */
export type QuotedEphemeralReader = {
  readonly resolution:
    | {
        readonly isSender: boolean;
        readonly readerDeadline: Date | null;
        readonly latestRecipientDeadline: Date | null;
      }
    | undefined;
  readonly now: Date;
};

type QuotedEphemeralVerdict = { readonly expiresAt: Date | null; readonly sealedAt: Date | null };

/**
 * `undefined` pour un message sans échéance par lecteur : sa colonne garde son
 * autre écrivain (la grâce de vue unique) et n'est pas réécrite. L'expéditeur
 * n'est jamais scellé : sur son écran, son message vit tant qu'il vit pour
 * quelqu'un, et la règle de sa bulle reste la sienne.
 */
export function quotedEphemeralVerdict(
  quoted: QuotedMessageRow,
  reader: QuotedEphemeralReader | undefined
): QuotedEphemeralVerdict | undefined {
  if (!hasPerReaderEphemeralDeadline(quoted)) return undefined;
  const resolution = reader?.resolution;
  if (!reader || !resolution) return { expiresAt: null, sealedAt: null };
  const expiresAt = servedEphemeralExpiresAt({
    ephemeralDuration: quoted.ephemeralDuration,
    effectFlags: quoted.effectFlags,
    isSender: resolution.isSender,
    readerDeadline: resolution.readerDeadline,
    latestRecipientDeadline: resolution.latestRecipientDeadline,
  });
  const lapsed = !resolution.isSender && expiresAt !== null && expiresAt.getTime() <= reader.now.getTime();
  return { expiresAt, sealedAt: lapsed ? expiresAt : null };
}

const MASKING_FLAGS = MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED;

/**
 * Vue unique, flouté ou chiffré — par les champs hérités OU par le bitfield
 * canonique (`effectFlags`, seul porteur quand un client envoie le bit sans le
 * champ). Le prédicat historique ne lisait pas le bitfield ; le contrat
 * `reply-message-protection-contract` le nomme pourtant comme le porteur
 * canonique, et iOS le lit.
 */
export const quotedMessageIsProtected = (quoted: QuotedMessageRow | null | undefined): boolean => {
  if (!quoted) return false;
  const flags = quoted.effectFlags ?? 0;
  return Boolean(
    quoted.isViewOnce || quoted.isBlurred || quoted.isEncrypted || (flags & MASKING_FLAGS) !== 0
  );
};

/**
 * #20018 — **ce que la loi de contenu latéral retient sur le message PORTEUR,
 * la citation le reprenait en entier à l'événement suivant.**
 *
 * `mediaSideContentMayTravel` ferme la transcription, la description et les
 * traductions dès que le message qui porte la pièce est éphémère (échéance
 * POSÉE, pas seulement échue), supprimé, masqué ou chiffré. Un vocal éphémère
 * sort donc de `message:new` sans un mot — et le `message:new` de la RÉPONSE
 * qui le cite servait la ligne brute, sur un canal sans sérialiseur.
 *
 * ─── Pourquoi le prédicat de citation ne lit toujours PAS `expiresAt` ────────
 *
 * Parce que l'en-tête de ce module l'interdit, et qu'il a raison : « l'éphémère
 * n'est pas une protection au sens de la citation — son texte est lisible dans
 * le fil jusqu'à l'expiration, et la citation vit dans ce même fil », en
 * SYMÉTRIE avec `APIMessageReplyTo.isProtected` côté iOS. Masquer la citation
 * entière ferait taire à la passerelle un texte que le client affiche.
 *
 * Cette décision porte sur la CHAÎNE CITÉE. Elle ne dit rien de ce qui voyage
 * À CÔTÉ d'elle — leçon 275, à son endroit le plus étroit. Et les deux ne se
 * valent pas : le texte cité meurt avec le fil à l'expiration, **la
 * transcription est une COPIE DURABLE qui lui survit**. La citation garde donc
 * son texte, et ses pièces passent par la loi du porteur.
 *
 * ─── Pourquoi on retire ICI plus que `servedSideContent` ne retire ──────────
 *
 * `servedSideContent` laisse les MOTS des pistes traduites, et ce n'est pas un
 * oubli : le contrat partagé déclare `transcription` REQUISE sur chaque piste,
 * `fast-json-stringify` LÈVE sur une requise absente, et retirer la clé rendait
 * la liste REST et `/sync` en 500 (dette écrite, #20015).
 *
 * **Ce blocage n'existe pas sur ce chemin-ci, et c'est mesuré** :
 * `messageSchema.replyTo.attachments.items`
 * (`packages/shared/types/api-schemas/message.ts`) déclare douze champs et
 * **ni `transcription` ni `translations`**. REST les supprime donc déjà — il n'y
 * a aucune clé requise à violer — et le seul canal qui les transportait est le
 * socket, qui n'a pas de sérialiseur du tout. La LOI reste unique
 * (`mediaSideContentMayTravel`) ; ce qui diffère est ce que chaque contrat
 * permet de retirer, et le dire ici est ce qui empêche de lire cet écart comme
 * une jumelle divergente.
 *
 * ─── Pourquoi `undefined` et non `null` ─────────────────────────────────────
 *
 * Fail-closed, chaque clé est POSÉE pour écraser ce que le site d'appel a
 * répandu avant — même raison, et même idiome, que `servedDeletedQuote` vingt
 * lignes plus haut, qui pose `translations: undefined`.
 *
 * La valeur n'est pas indifférente : **dans ce dépôt, `translations: null` est
 * l'idiome d'un EFFACEMENT en base** — « ce message n'a plus les traductions
 * qu'il avait » — et il engage l'effacement de la table VOISINE des versions
 * scellées, que rien ne relie à `Message` (#9899, gardé par
 * `__tests__/shared-translation-erasure-guard.test.ts`). Ici rien n'est effacé :
 * la colonne reste intacte et le message PORTEUR la sert toujours ; c'est cette
 * CHARGE-ci qui ne la transporte pas. Écrire `null` aurait dit, dans la langue
 * du dépôt, exactement le contraire de ce que fait ce code — et la garde de
 * #9899 l'a signalé, à juste titre.
 *
 * `undefined` dit « absente de la charge » : la clé disparaît à la
 * sérialisation du socket, et le schéma REST ne la déclare de toute façon pas.
 */
const QUOTED_SIDE_CONTENT_WITHHELD = {
  transcription: undefined,
  translations: undefined,
  alt: undefined,
  altLanguage: undefined,
  altTranslations: undefined,
} as const;

/** Le strict discriminant d'une pièce jointe masquée : de quoi choisir une icône, rien de plus. */
const maskedQuotedAttachment = (att: Record<string, unknown>): Record<string, unknown> => ({
  id: att['id'],
  messageId: att['messageId'],
  mimeType: att['mimeType'],
  isViewOnce: att['isViewOnce'] ?? null,
  isBlurred: att['isBlurred'] ?? null,
  effectFlags: att['effectFlags'] ?? null,
});

/**
 * Les champs qu'une citation a le droit de SERVIR, à étaler PAR-DESSUS la
 * forme propre à chaque transport (le sender reste au site d'appel : les deux
 * fils le composent délibérément différemment).
 *
 * Trois décisions, jamais une :
 *  1. le TEXTE — remplacé par le placeholder de `protectedPreview`, le même
 *     vocabulaire que la bannière et que le placeholder iOS ; jamais vidé, un
 *     corps VIDE n'étant pas un choix de produit (cycle 125 bis) ;
 *  2. les TRADUCTIONS — projetées carte Mongo → tableau (la forme que tout
 *     client lit), et retirées quand le message est protégé : une traduction
 *     est le même secret en N langues ;
 *  3. le MÉDIA — retenu aux DEUX niveaux qui déclarent une protection, celui
 *     du MESSAGE et celui de la PIÈCE JOINTE (`maskedAttachment`), miroir de
 *     `QuotedReplyPresentation.thumbHash` qui refuse déjà le flou ThumbHash
 *     d'un média protégé.
 *
 * QUATRIÈME décision depuis #6164 : la PIÈCE NOMMÉE. Une réponse peut viser la
 * troisième photo d'un carrousel de cinq ; l'instantané FIGÉ que le message
 * CITANT porte (`metadata.attachmentReplyTo`) arrive ici en option et repart
 * tel quel — l'ancre du saut et la NATURE, rien d'autre. Tout ce qui DÉCRIT la
 * pièce (vignette, nom, taille, durée, transcription) reste sur `attachments`,
 * donc reste soumis au masquage pièce par pièce ci-dessous : une citation dont
 * la pièce est devenue secrète ou a été supprimée dit encore « une photo », et
 * rien de plus. Elle ne se vide pas, et elle ne fuit pas.
 *
 * Sans l'instantané, RIEN ne change : le champ n'est pas posé et chaque client
 * retombe sur son média représentatif, exactement comme avant.
 */
export function servedQuotedMessage(
  quoted: QuotedMessageRow | null | undefined,
  options?: {
    readonly includeTranslations?: boolean;
    readonly languages?: readonly string[];
    readonly attachmentReplyTo?: AttachmentReplyTo | null;
    readonly ephemeralReader?: QuotedEphemeralReader;
  }
): Record<string, unknown> {
  if (!quoted) return {};
  if (quoted.deletedAt) return servedDeletedQuote(quoted.deletedAt);
  const ephemeral = quotedEphemeralVerdict(quoted, options?.ephemeralReader);
  if (ephemeral?.sealedAt) return sealedQuotedMessage(ephemeral.sealedAt);
  if (quotesCaptureNotice(quoted)) return redactedCaptureNoticeQuote(options?.languages);
  const isProtected = quotedMessageIsProtected(quoted);
  const served: Record<string, unknown> = {};
  // Toujours POSÉE pour un éphémère, même absente : elle écrase la colonne
  // brute que le site d'appel vient de répandre.
  if (ephemeral) served['expiresAt'] = ephemeral.expiresAt ?? undefined;

  // L'ancre et la NATURE, les DEUX seuls faits figés (#6164). Servies même
  // quand le message cité est protégé et même quand la pièce a disparu : elles
  // ne peuvent pas devenir un secret — le dépôt divulgue déjà l'icône de TYPE
  // d'un contenu protégé (`protectedPreview` → `contentTypeIcon`). Ce qui
  // DÉCRIT la pièce voyage sur `attachments`, et y est masqué pièce par pièce.
  if (options?.attachmentReplyTo) {
    served['attachmentReplyTo'] = {
      attachmentId: options.attachmentReplyTo.attachmentId,
      kind: options.attachmentReplyTo.kind,
    };
  }

  if (isProtected) {
    // La protection VOYAGE AVEC le placeholder. Un texte masqué sans la
    // déclaration qui le qualifie est un texte qu'aucun client ne peut
    // interpréter : iOS compose SON placeholder depuis `isProtected` et refuse
    // le ThumbHash sur cette seule foi. Le producteur REST/ZMQ reconstruisait
    // sa citation champ par champ et n'en portait AUCUN.
    served['isViewOnce'] = Boolean(quoted.isViewOnce);
    served['isBlurred'] = Boolean(quoted.isBlurred);
    served['isEncrypted'] = Boolean(quoted.isEncrypted);
    served['effectFlags'] = quoted.effectFlags ?? 0;
    // `expiresAt: null` DÉLIBÉRÉMENT : la précédence de `protectedPreview` met
    // l'éphémère devant, et la citation ne le tient pas pour une protection.
    served['content'] = protectedPreview({
      messageType: quoted.messageType ?? null,
      isViewOnce: quoted.isViewOnce,
      isBlurred: quoted.isBlurred,
      isEncrypted: quoted.isEncrypted,
      effectFlags: quoted.effectFlags,
      expiresAt: null,
    })?.preview ?? '';
  }

  // Toujours POSÉE, même absente : la clé étale `undefined` par-dessus la
  // carte Mongo brute que `...message.replyTo` vient de répandre au site
  // d'appel — sans quoi le blob voyagerait sous un nom que les clients lisent
  // comme un tableau, et le décodage iOS de la citation entière échouerait.
  const mayServeTranslations = options?.includeTranslations !== false && !isProtected;
  served['translations'] =
    mayServeTranslations && quoted.translations && typeof quoted.translations === 'object'
      ? Array.isArray(quoted.translations)
        ? quoted.translations
        : transformTranslationsToArray(
            quoted.id ?? '',
            quoted.translations as Record<string, MessageTranslationJSON>,
            options?.languages && options.languages.length > 0 ? { languages: options.languages } : undefined
          )
      : undefined;

  if (Array.isArray(quoted.attachments)) {
    served['attachments'] = servedQuotedAttachments(quoted, quoted.attachments);
  }

  // #9915 — Toujours POSÉES : un message protégé ne dit pas combien de pièces
  // il cache. `_count` est le compte BRUT de Prisma que le chemin socket
  // répand avant cette projection (`MessageHandler` → `inputs.replyTo`) : il
  // est écrasé ici, fail-closed, et seul le compte servi sort.
  const tileCount = quoted._count?.attachments;
  served['visualAttachmentCount'] = !isProtected && typeof tileCount === 'number' ? tileCount : undefined;
  served['_count'] = undefined;
  // #12792 — l'éditeur tiers d'un message CITÉ (#11375) : ses colonnes brutes
  // voyagent avec la ligne que le site d'appel répand, et une diffusion de
  // room n'a pas de schéma pour les retirer. Écrasées ici, fail-closed.
  served['thirdPartyEditorId'] = undefined;
  served['thirdPartyEditorRole'] = undefined;
  // #17441 — un avis AFFICHÉ se cite : sa métadonnée voyage seule, pour que le
  // client le DISE dans la langue de son lecteur (le `content` stocké n'est
  // qu'un repli français). Toujours POSÉE : un autre message n'en porte pas.
  served['notice'] = quotableNoticeKind(quoted) === null ? undefined : withoutCallSummaryParticipants(quoted.metadata);
  // #18242 — une citation ne compose pas les noms des participants d'un résumé
  // d'appel : la forme stockée `{ userId }` n'en sort pas (POSÉE seulement là).
  if (withoutCallSummaryParticipants(quoted.metadata) !== quoted.metadata) served['metadata'] = withoutCallSummaryParticipants(quoted.metadata);

  return served;
}

/**
 * #18830 — le cité est-il un AVIS DE CAPTURE ? Les sites d'appel qui
 * recomposent l'expéditeur ou l'heure du cité APRÈS la garde le demandent ici.
 * Lu sur la seule métadonnée, que toutes les projections de citation chargent
 * (`messageType` manque à certaines) : un faux positif masque, il ne fuit pas.
 */
export const quotesCaptureNotice = (quoted: { readonly metadata?: unknown } | null | undefined): boolean =>
  typeof quoted?.metadata === 'object'
  && quoted.metadata !== null
  && (quoted.metadata as { kind?: unknown }).kind === CAPTURE_NOTICE_KIND;

/**
 * #18830 — la citation d'un AVIS DE CAPTURE, défense en profondeur derrière
 * le refus à l'écriture (#9629) : une réponse déjà stockée qui en cite un part
 * à toute la conversation, l'avis n'étant remis qu'à son audience. Elle ne
 * transporte qu'une phrase NEUTRE dans la langue du lecteur ; chaque clé qui
 * nommerait l'acteur, le message capturé ou l'heure est POSÉE pour écraser la
 * ligne brute que le site d'appel a répandue avant.
 */
function redactedCaptureNoticeQuote(languages: readonly string[] | undefined): Record<string, unknown> {
  return {
    ...servedDeletedQuote(new Date(0)),
    deletedAt: undefined,
    content: captureNoticeQuotedText({ language: languages?.[0] }),
    senderId: undefined,
    anonymousSenderId: undefined,
    sender: undefined,
    createdAt: undefined,
    updatedAt: undefined,
  };
}

/**
 * #7927 — la citation d'un message SUPPRIMÉ ne transporte plus rien de lui.
 * Fail-closed : chaque clé qui pourrait porter un morceau du message est
 * POSÉE (même à `undefined`) pour écraser ce que le site d'appel a répandu
 * avant — la ligne Mongo brute, ou une position/un sticker déjà hissés. Seul
 * `deletedAt` voyage, pour que le client rende « Message supprimé » au lieu
 * d'une citation vide.
 */
function servedDeletedQuote(deletedAt: Date | string): Record<string, unknown> {
  return {
    deletedAt,
    content: '',
    translations: undefined,
    attachments: [],
    metadata: undefined,
    location: undefined,
    sticker: undefined,
    validatedMentions: [],
    attachmentReplyTo: undefined,
    visualAttachmentCount: undefined,
    _count: undefined,
    thirdPartyEditorId: undefined,
    thirdPartyEditorRole: undefined,
    notice: undefined,
  };
}

/**
 * #8562 — la citation d'un éphémère ÉCHU pour son lecteur : la forme d'une
 * suppression (rien ne reste), datée de l'échéance du lecteur, qui voyage aussi
 * en `expiresAt` pour qu'un client sache que c'est une EXPIRATION.
 */
export function sealedQuotedMessage(sealedAt: Date): Record<string, unknown> {
  return { ...servedDeletedQuote(sealedAt), expiresAt: sealedAt };
}

/**
 * La variante SCELLÉE d'une charge déjà composée (`message:new`,
 * `message:edited`), pour les lecteurs qu'une diffusion de room ne peut pas
 * distinguer : l'identité et l'auteur de la citation restent, rien d'autre.
 *
 * #8630 — et la RÉPONSE meurt avec ce qu'elle cite (décision porteur
 * 2026-09-29) : elle part vidée, datée de la mort du cité, que les clients
 * retirent comme un éphémère échu. Aucun `deletedAt` : ce n'est pas une
 * suppression, que les clients peindraient en « Message supprimé ».
 */
export function withSealedQuote<T extends object>(payload: T, sealedAt: Date): T {
  const quote = (payload as { replyTo?: unknown }).replyTo;
  if (!quote || typeof quote !== 'object') return payload;
  const ownExpiry = (payload as { expiresAt?: unknown }).expiresAt;
  const expiresAt = ownExpiry instanceof Date && ownExpiry.getTime() < sealedAt.getTime() ? ownExpiry : sealedAt;
  return {
    ...payload,
    content: '',
    originalContent: undefined,
    translations: [],
    attachments: [],
    metadata: undefined,
    location: undefined,
    sticker: undefined,
    validatedMentions: [],
    encryptedContent: undefined,
    encryptedPayload: undefined,
    encryptionMetadata: undefined,
    postReplyTo: undefined,
    expiresAt,
    replyTo: { ...(quote as Record<string, unknown>), ...sealedQuotedMessage(sealedAt) },
  };
}

/**
 * Le masquage PIÈCE PAR PIÈCE, isolé pour que le rattrapage d'une pièce NOMMÉE
 * tombée hors de la fenêtre `take` de la citation (`citedAttachmentBackfill.ts`,
 * #6164) passe par le MÊME site. Une seconde boucle chez l'appelant aurait
 * divergé au premier champ ajouté à `maskedQuotedAttachment` — et elle aurait
 * divergé dans le sens qui expose.
 *
 * Les DEUX niveaux déclarent : celui du MESSAGE (`quotedMessageIsProtected`) et
 * celui de la PIÈCE (`maskedAttachment`). Un message parfaitement ordinaire
 * peut porter une pièce à vue unique — c'est précisément le cas qu'une lecture
 * au niveau message seul laisserait sortir.
 */
export function servedQuotedAttachments(
  quoted: QuotedMessageRow | null | undefined,
  attachments: readonly unknown[]
): unknown[] {
  const isProtected = quotedMessageIsProtected(quoted);
  return attachments.map((att) => {
    const row = (att ?? {}) as Record<string, unknown>;
    const protection = {
      isViewOnce: row['isViewOnce'] as boolean | null | undefined,
      isBlurred: row['isBlurred'] as boolean | null | undefined,
      effectFlags: row['effectFlags'] as number | null | undefined,
    };
    if (isProtected || maskedAttachment(protection)) return maskedQuotedAttachment(row);
    const pieceProtection = {
      ...protection,
      isEncrypted: row['isEncrypted'] as boolean | null | undefined,
      encryptionMode: row['encryptionMode'] as string | null | undefined,
    };
    return mediaSideContentMayTravel(pieceProtection, quoted ?? null)
      ? att
      : { ...row, ...QUOTED_SIDE_CONTENT_WITHHELD };
  });
}
