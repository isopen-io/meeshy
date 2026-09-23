import type { QueryClient } from '@tanstack/react-query';

import type {
  ConversationUpdatedEventData,
  LastMessagePreviewAttachment,
} from '@meeshy/shared/types/socketio-events/conversation';

import { patchConversation } from './conversations';
import { acceptsLastMessage, isListProtected, listSafeLastMessage, withNature, withSideband } from './list-preview';
import type { Conversation, Message, Participant } from './types';

/**
 * LE PUITS DE `conversation:updated` — extrait de `realtime-apply.ts` au lot
 * #7547 : le contrat de la ligne (#7545) y ajoute la dernière réaction,
 * l'appel en cours et la NATURE du dernier message, et le fichier d'origine
 * passait le budget de taille. La règle n'a pas changé de responsabilité :
 * ce qui arrive de la passerelle sur le groupe d'aperçu d'une ligne.
 */

/** Garde de FORME pour `conversation:updated` (revue-correction #5793,
 * défaut 1) — SEULS les trois champs OBLIGATOIRES du contrat sont vérifiés ;
 * les champs du groupe d'aperçu sont TRI-ÉTAT par construction (absent /
 * `null` / valeur) et validés un par un dans `applyConversationUpdated`,
 * jamais ici — une valeur de forme inattendue sur l'un d'eux ne doit pas
 * REJETER tout l'évènement (fail-closed CHAMP PAR CHAMP, pas message par
 * message, motif la doc de `ConversationUpdatedEventData`). */
export function isConversationUpdated(payload: unknown): payload is ConversationUpdatedEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.conversationId !== 'string' || typeof p.updatedAt !== 'string') return false;
  const updatedBy = p.updatedBy;
  return typeof updatedBy === 'object' && updatedBy !== null && typeof (updatedBy as Record<string, unknown>).id === 'string';
}

/**
 * `messageTypeOf` — le SEUL champ de la ligne neutre que le contrat ne
 * transporte pas directement (question 9.4 de la spécification #6171) :
 * dérivé du `mimeType` de la PREMIÈRE pièce jointe (`image/*` ⇒ `'image'`,
 * `audio/*` ⇒ `'audio'`, `video/*` ⇒ `'video'`, sinon `'file'` ; aucune pièce
 * ⇒ `'text'`). La Lentille ne LIT PAS ce champ sur son aperçu — elle lit
 * `lastMessageAttachments` pour choisir son glyphe (`lens-row.tsx` §
 * `MEDIA_PREVIEW`) — donc cette valeur ne gouverne aucun rendu aujourd'hui ;
 * elle est posée pour que la forme du `Message` reste COMPLÈTE, documentée
 * comme telle.
 */
function messageTypeOf(attachments: readonly LastMessagePreviewAttachment[]): Message['messageType'] {
  const first = attachments[0];
  if (first === undefined) return 'text';
  if (first.mimeType.startsWith('image/')) return 'image';
  if (first.mimeType.startsWith('audio/')) return 'audio';
  if (first.mimeType.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * `neutralLastMessageFromPreview` — LA LIGNE NEUTRE (#6171, G3) que
 * `applyConversationUpdated` compose quand `lastMessageId` nomme un AUTRE
 * message que celui que la ligne connaît déjà : miroir `LastMessageFacet
 * .adoptLastMessage` (iOS, `:170-184`). Exportée pour le témoin (T5).
 *
 * CE N'EST PAS « inventer ce que la source ne porte pas » (leçon « un
 * instantané qui RECOPIE invente ce que la source ne porte pas ») : chaque
 * champ vient soit de la charge, soit d'un défaut que le CONTRAT lui-même
 * déclare — « clé absente = un FAIT » (doc-comment de
 * `ConversationUpdatedEventData` : pas de pièce jointe déclarée ⇒ pas de
 * pièce jointe, pas flouté déclaré ⇒ pas flouté).
 *
 * `sender` — SEUL le `displayName` (motif `rawMessageFromSocket`, § doc-
 * comment ci-dessus : le cast est justifié par les deux seuls lecteurs de
 * `message.sender` sur une rangée de liste, `displayName` et `avatar` — ici
 * seul le premier est transporté). Absent si `lastMessageSenderName` ne l'est
 * pas (tri-état, jamais un nom fabriqué).
 *
 * `createdAt`/`timestamp` — `lastMessageAt`, chaîne ISO gardée TELLE QUELLE
 * (D-26) ; repli sur `updatedAt` (le SEUL horodatage que le contrat garantit
 * toujours) si `lastMessageAt` est absent ou `null` dans cette branche.
 */
export function neutralLastMessageFromPreview(data: ConversationUpdatedEventData): Message {
  const attachments = data.lastMessageAttachments ?? [];
  const at = data.lastMessageAt ?? data.updatedAt;
  return {
    id: data.lastMessageId as string,
    conversationId: data.conversationId,
    senderId: data.senderId ?? '',
    content: data.lastMessagePreview ?? '',
    originalLanguage: data.lastMessageOriginalLanguage ?? '',
    messageType: messageTypeOf(attachments),
    messageSource: 'user',
    isEdited: false,
    isViewOnce: data.lastMessageIsViewOnce ?? false,
    viewOnceCount: 0,
    isBlurred: data.lastMessageIsBlurred ?? false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: at as unknown as Date,
    timestamp: at as unknown as Date,
    translations: [],
    ...(data.lastMessageExpiresAt === undefined || data.lastMessageExpiresAt === null
      ? {}
      : { expiresAt: data.lastMessageExpiresAt as unknown as Date }),
    ...(data.lastMessageSenderName === undefined || data.lastMessageSenderName === null
      ? {}
      : { sender: { displayName: data.lastMessageSenderName } as unknown as Participant }),
    ...(attachments.length === 0 ? {} : { attachments: attachments as unknown as Message['attachments'] }),
  } as unknown as Message;
}

/**
 * `acceptsLastMessageAt` — LA GARDE MONOTONE DU RANG (revue-correction #6171),
 * exigée par le contrat lui-même : « Les clients tiennent une garde monotone sur
 * le groupe d'aperçu — un `lastMessageAt` plus ancien y désigne un message
 * périmé … Posé par `emitConversationPreviewUpdate` et par LUI SEUL. Les
 * émetteurs message-driven (`MessageHandler`, `MeeshySocketIOManager`)
 * l'omettent délibérément : **ce sont eux que la garde monotone protège** »
 * (doc-comment de `previewRecalculated`, `packages/shared/types/socketio-events/
 * conversation.ts`). Miroir EXACT d'iOS : le `>` strict du bump
 * (`ConversationListViewModel.swift:1100`) et son unique exception
 * (`:1214-1216`, « Réservé au drapeau : sans lui, un horodatage qui recule
 * décrit un message périmé (diffusion arrivée dans le désordre) et doit rester
 * ignoré »).
 *
 * `lastMessageAt` est le RANG de la ligne (la liste trie dessus) : l'écrire sans
 * garde faisait redescendre une conversation vivante dès que deux `message:new`
 * arrivaient dans le désordre. Le défaut PRÉEXISTAIT à l'adoption (G3), qui l'a
 * rendu visible : la ligne adopte désormais aussi le CONTENU du message nommé.
 *
 * `known` arrive en DEUX formes — chaîne ISO du cache brut (D-26) ou `Date`
 * décodée : `new Date()` accepte les deux, et un horodatage connu ILLISIBLE
 * laisse passer (fail-open sur le rang, jamais une ligne figée pour toujours).
 */
export function acceptsLastMessageAt(params: {
  readonly known: Conversation['lastMessageAt'];
  readonly incoming: string;
  readonly previewRecalculated?: boolean | undefined;
}): boolean {
  if (params.previewRecalculated === true) return true;
  if (params.known === undefined) return true;
  const knownMs = new Date(params.known as unknown as string).getTime();
  if (Number.isNaN(knownMs)) return true;
  return new Date(params.incoming).getTime() > knownMs;
}

/**
 * `applyConversationUpdated` — le puits de `conversation:updated` (défaut
 * MAJEUR 1 de la revue #5793) : la QUATRIÈME famille du Prisme (résolue
 * SERVEUR, § CLAUDE.md « Prisme Linguistique ») — l'aperçu de ligne DÉJÀ
 * descendu par lecteur, restreint à ses langues et plafonné
 * (`resolveLastMessagePreviewPrism`, `services/gateway/.../
 * lastMessagePreviewPrism.ts`) — PRIME sur ce que `applyMessageNew` a DÉDUIT
 * de `message:new`, dont `translations` est souvent VIDE à la création (le
 * pipeline traduit APRÈS, défaut 2 de la même revue) : cet évènement est ce
 * qui rattrape la ligne quand la traduction atterrit, ou quand une édition
 * périme la carte. Témoin de RANG SUR UN RANG AUTRE QUE LE PREMIER (CLAUDE.md
 * § Prisme, leçon 261) : ce site gouverne ce que `message:new` ne peut pas
 * couvrir seul.
 *
 * TRI-ÉTAT de `lastMessageId` (doc-comment du type, `packages/shared`) :
 *  - **clé ABSENTE** — cet évènement ne parle pas du dernier message
 *    (renommage, réglage) : RIEN à toucher.
 *  - **`null`** — plus AUCUN message visible pour ce lecteur : la ligne perd
 *    son groupe d'aperçu.
 *  - **présent** — le groupe d'aperçu (`lastMessageAt`,
 *    `lastMessageOriginalLanguage`, `lastMessageTranslations`,
 *    `lastMessagePreview`) est fusionné CHAMP PAR CHAMP, chacun tri-état à
 *    son tour (absent = ne pas toucher, `null` = retirer la clé — jamais
 *    `undefined`, `exactOptionalPropertyTypes`, motif `applyMessageNew`).
 *
 * **UN AUTRE `lastMessageId` ADOPTE une ligne NEUVE** (#6171, G3, revue de
 * #5793) — miroir `LastMessageFacet.adoptLastMessage` (iOS, `:170-184` :
 * « Nommer un AUTRE message, c'est cesser de décrire le précédent … sans ce
 * geste, une suppression pour tous du dernier message laissait la ligne
 * rendre l'aperçu du remplaçant sous la vignette, l'auteur et le “Vue
 * unique” du message supprimé »). `neutralLastMessageFromPreview` compose
 * cette ligne AVANT la fusion champ par champ ci-dessous — ce n'est PAS
 * « inventer ce que la source ne porte pas » : chaque champ vient de la
 * charge, ou d'un défaut que le CONTRAT lui-même déclare (« clé absente = un
 * FAIT », doc-comment de `ConversationUpdatedEventData`).
 */
export function applyConversationUpdated(queryClient: QueryClient, data: ConversationUpdatedEventData): void {
  const speaksOfPreview = 'lastMessageId' in data;
  const speaksOfSideband = 'lastReaction' in data || 'activeCall' in data;
  if (!speaksOfPreview && !speaksOfSideband) return;

  patchConversation(queryClient, data.conversationId, (row) => {
    /* LA RÉACTION ET L'APPEL EN COURS (#7545) — posés d'abord, sans toucher au
       groupe d'aperçu. Une réaction seule ne remonte la ligne que par le
       `lastMessageAt` que le serveur lui joint, et jamais vers le passé. */
    const c = speaksOfSideband ? withSideband(row, data) : row;
    if (!speaksOfPreview) {
      return typeof data.lastMessageAt === 'string' && acceptsLastMessageAt({ known: c.lastMessageAt, incoming: data.lastMessageAt })
        ? { ...c, lastMessageAt: data.lastMessageAt as unknown as Date }
        : c;
    }

    if (data.lastMessageId === null) {
      const { lastMessage: _m, lastMessageAt: _at, lastMessageTranslations: _tr, lastMessageOriginalLanguage: _lang, ...rest } = c;
      return rest;
    }

    const described = withNature(neutralLastMessageFromPreview(data), data);
    const same = c.lastMessage !== undefined && c.lastMessage !== null && c.lastMessage.id === data.lastMessageId;

    /* LA GARDE D'ORDRE AVANT L'ADOPTION (#7547). Un AUTRE message plus ancien,
       sans `previewRecalculated`, est une diffusion arrivée dans le désordre :
       « tout le groupe est jeté » (doc-comment de `previewRecalculated`). La
       garde tournait APRÈS l'adoption et ne protégeait que le rang — la ligne
       rendait alors le contenu périmé au rang du message plus récent. */
    if (
      !same &&
      data.previewRecalculated !== true &&
      typeof data.lastMessageAt === 'string' &&
      !acceptsLastMessage(c, described)
    ) {
      return c;
    }

    let next: Conversation = c;

    if (!same) {
      /* ADOPTER, C'EST CESSER DE DÉCRIRE LE PRÉCÉDENT — *Y COMPRIS SA CARTE*
         (revue-correction #6171, miroir `LastMessageFacet.adoptLastMessage`) :
         les blocs tri-état ci-dessous reposent la carte depuis la charge. */
      const { lastMessageTranslations: _card, lastMessageOriginalLanguage: _cardLang, ...adopted } = next;
      next = { ...adopted, lastMessage: described };
    } else {
      next = { ...next, lastMessage: withNature(refreshedLastMessage(c.lastMessage as Message, described, data), data) };
    }

    if (data.lastMessageAt !== undefined) {
      if (data.lastMessageAt === null) {
        const { lastMessageAt: _at, ...rest } = next;
        next = rest;
      } else if (
        acceptsLastMessageAt({
          known: c.lastMessageAt,
          incoming: data.lastMessageAt,
          previewRecalculated: data.previewRecalculated,
        })
      ) {
        // Chaîne ISO conservée TELLE QUELLE (D-26) — `decodeConversation` la
        // revit en `Date`. `c` et non `next` : le rang se compare à celui que
        // la ligne portait AVANT cet évènement.
        next = { ...next, lastMessageAt: data.lastMessageAt as unknown as Date };
      }
    }

    if (data.lastMessageOriginalLanguage !== undefined) {
      if (data.lastMessageOriginalLanguage === null) {
        const { lastMessageOriginalLanguage: _lang, ...rest } = next;
        next = rest;
      } else {
        next = { ...next, lastMessageOriginalLanguage: data.lastMessageOriginalLanguage };
      }
    }

    if (data.lastMessageTranslations !== undefined) {
      if (data.lastMessageTranslations === null || Object.keys(data.lastMessageTranslations).length === 0) {
        const { lastMessageTranslations: _tr, ...rest } = next;
        next = rest;
      } else {
        next = { ...next, lastMessageTranslations: data.lastMessageTranslations };
      }
    }

    /* AUCUN TEXTE PROTÉGÉ EN CACHE DE LISTE (#7547) — le masquage se juge sur
       le message QUE LA LIGNE DÉCRIT désormais, après la fusion. */
    const last = next.lastMessage;
    if (last !== undefined && last !== null && isListProtected(last)) {
      const { lastMessageTranslations: _tr, ...rest } = next;
      next = { ...rest, lastMessage: listSafeLastMessage(last) };
    }

    return next;
  });
}

/**
 * LE MÊME MESSAGE RAFRAÎCHIT TOUT SON GROUPE (#7547) — texte, pièces jointes,
 * floutage, vue unique, échéance : le contrat déclare que « qui porte
 * `lastMessageId` porte les six champs de ce sous-groupe » (clé absente = un
 * FAIT). Ne restent de la ligne connue que ce que la charge ne transporte
 * pas : l'identité de l'auteur, l'horloge, les effets décoratifs, la carte du
 * message lui-même. Seul `content` suivait, et un floutage ou une pièce jointe
 * arrivée après coup n'atteignaient jamais la ligne.
 */
function refreshedLastMessage(known: Message, described: Message, data: ConversationUpdatedEventData): Message {
  const { attachments: _attachments, expiresAt: _expiresAt, ...kept } = known;
  return {
    ...kept,
    isBlurred: described.isBlurred,
    isViewOnce: described.isViewOnce,
    ...(data.lastMessagePreview === undefined || data.lastMessagePreview === null ? {} : { content: data.lastMessagePreview }),
    ...(described.expiresAt === undefined ? {} : { expiresAt: described.expiresAt }),
    ...(described.attachments === undefined ? {} : { attachments: described.attachments }),
    ...(data.lastMessageSenderName === undefined || data.lastMessageSenderName === null || kept.sender !== undefined
      ? {}
      : { sender: described.sender as Message['sender'] }),
  } as Message;
}

