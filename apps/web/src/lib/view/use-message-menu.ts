import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { MessageSticker } from '@meeshy/shared/types/message-sticker';
import type { ActionConversation } from '@meeshy/shared/utils/message-action-policy';
import { isContactCardAttachment } from '@meeshy/shared/utils/vcard';
import { useStore } from 'zustand/react';

import { prismFor, served, type Served } from '@/lib/api/prism';
import { reactAction } from '@/lib/api/query';
import { findCachedConversation } from '@/lib/api/conversations';
import { appQueryClient } from '@/lib/api/query-client';
import { conversationEncrypted } from '@/lib/send/share-entry';
import { apiDeps } from '@/lib/api/deps';
import type { DataSource } from '@/lib/api/config';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { reactionStore } from '@/lib/api/reaction-store';
import type { Message } from '@/lib/api/types';
import { discussionCardSubjectOf } from '@/lib/export/discussion-card-subject';
import { readDefaultMessageCardFormat } from '@/lib/export/message-card-format';
import { translate } from '@/lib/i18n-catalog';
import { isMessagePiecesCatalogLoaded, loadMessagePiecesCatalog, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { openSendSheet } from '@/lib/send/send-sheet-store';
import { stickerAddable } from '@/lib/stickers/received';
import { useStickerLibrary } from '@/lib/stickers/use-sticker-library';
import { safeLocalStorage } from '@/lib/storage';
import { saveContactFile } from '@/lib/contact-card/save-contact-file';
import { coqueCourante } from '@/lib/native-shell';

import {
  forwardMenuItems,
  imageableOf,
  messageMenuContextOf,
  messageMenuItems,
  translationChoices,
  type MenuViewer,
  type MessageActionId,
  type MessageMenuItem,
  type TranslationChoice,
} from './message-actions';
import { menuConversationOf, menuViewerRegistered, type ActionScope } from './message-action-scope';
import { contentExitOf, exitOffers } from './content-exit';
import { doubleTapReactable } from './double-tap';
import { admitForward, forwardRefusalOf, forwardRequestOf, type ForwardRefusal } from './forward';
import { useLongPress, type LongPressAnchor } from './long-press';
import { PIECE_ATTRIBUTE, pieceIdAt, soleSaveablePieceOf, targetedPieceOf } from './message-piece';
import { prewarmPieceReaction, usePieceMenu, type PieceMenuData } from './use-piece-menu';
import { copyPlainText } from './copy-text';
import { isMineOf } from './message';
import { mapsUrlOf, stickerOf } from './message-body';
import { editOffered } from './message-edit';
import { useDoubleTap, type DoubleTap } from './use-double-tap';
import { SELECTION_CAP, copyTextOf, orderedIds, selectionReducer, type SelectionState } from './selection';
import { useMessageDelete } from './use-message-delete';
import { useMessagePin, type MessagePinEntry } from './use-message-pin';
import { useMessageReport } from './use-message-report';
import { useMessageStar, type MessageStarEntry } from './use-message-star';

/**
 * LE HOOK DU MENU DU MESSAGE (#5814) — porte l'ÉTAT et les EFFETS (menu
 * ouvert, langue explorée par message, sélection, réactions, annonces) hors
 * de `routes/thread.tsx` (déjà à son budget de taille, § 5 étape 0 de la
 * spécification) : l'hôte ne fait plus que CÂBLER le JSX sur ce que ce hook
 * rend, motif `useSend`/`useThreadScene`.
 *
 * SANS RÈGLE PROPRE — la loi vient d'ailleurs à chaque fois : `served()`
 * (D-14, le Prisme), `messageMenuItems`/`translationChoices`
 * (`message-actions.ts`), `selectionReducer` (`selection.ts`), `reactAction`
 * (`api/query.ts`, qui délègue à `performReaction`). Ce fichier ne fait que
 * les COMPOSER derrière une surface stable pour l'hôte.
 */

type PieceMenuTransport = { readonly request: <T>(request: HttpRequest) => Promise<ApiResult<T>> };

const FORWARD_REFUSAL_KEY = {
  'view-once': 'forward.refusal.viewOnce',
  'after-read': 'forward.refusal.afterRead',
  unavailable: 'forward.refusal.unavailable',
} as const satisfies Readonly<Record<ForwardRefusal, string>>;

/** `scope: 'discussion'` (#9039) — la carte de la discussion qui mène à ce message ; absent : la carte du seul message. */
export type MessageExportRequest = { readonly messageId: string; readonly quick: boolean; readonly scope?: 'message' | 'discussion' };

/**
 * `pieceId` (#9907) — la PIÈCE que l'appui long a touchée dans un message à
 * plusieurs pièces : l'aperçu la montre seule, le défilement la change, et le
 * menu agit sur elle. Absente : le menu vise le message entier.
 */
export type MessageMenuTargetState = {
  readonly messageId: string;
  readonly element: HTMLElement;
  readonly isMine: boolean;
  readonly pieceId?: string;
};

/**
 * LA BARRE DE RÉACTION RAPIDE QU'OUVRE UN DOUBLE TOUCHER (#10599) — ancrée au
 * message (`anchor` : la rangée, ou la tuile de la pièce visée), centrée sous
 * le doigt (`x`). `pieceId` : la réaction vise cette pièce ; absent, le message.
 */
export type QuickReactionTarget = {
  readonly messageId: string;
  readonly anchor: HTMLElement;
  readonly x: number;
  readonly pieceId?: string;
};

/** LES GESTES DU TYPE (#11210) — ce que le contenu EST ajoute au menu : un lien, un lieu, une carte de contact. */
type TypeActionId = Extract<MessageActionId, 'openLink' | 'copyLink' | 'openInMaps' | 'copyAddress' | 'saveContact'>;
const TYPE_ACTIONS: ReadonlySet<MessageActionId> = new Set<TypeActionId>(['openLink', 'copyLink', 'openInMaps', 'copyAddress', 'saveContact']);
const isTypeAction = (id: MessageActionId): id is TypeActionId => TYPE_ACTIONS.has(id);

/** Une conversation que le fil n'a pas encore lue : un type inconnu, qui n'ouvre rien qui dépende du type. */
const UNKNOWN_CONVERSATION: ActionConversation = menuConversationOf(undefined);

/** Le menu d'un STICKER (#10630) : hors bibliothèque tant qu'elle n'est pas lue, l'ajout est offert — le doublon se déduplique côté serveur. */
const stickerContextOf = (
  message: Message,
  library: { readonly has: (sticker: MessageSticker, picture: { readonly fileUrl: string } | undefined) => boolean },
): { readonly sticker?: { readonly inLibrary: boolean; readonly hasPicture: boolean } } => {
  const sticker = stickerOf(message);
  const picture = message.attachments?.[0];
  return sticker === null ? {} : { sticker: { inLibrary: library.has(sticker, picture), hasPicture: stickerAddable(picture) } };
};

export function useMessageMenu(params: {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly readerLanguages: readonly string[];
  readonly readerLocale: string;
  /**
   * QUI LIT (#11210) — explicite : son compte, son rôle de plateforme, son rôle
   * dans la conversation, sa permission d'écrire (`menuViewerOf`). Le hook n'en
   * déduit rien : le favori, l'épingle, la suppression et la modération lisent
   * les verdicts de `messageActionsFor`.
   */
  readonly viewer: MenuViewer;
  /** LA CONVERSATION (#11210, `menuConversationOf`) — type, régime de chiffrement, écriture ; absente : un type inconnu, qui n'ouvre rien. */
  readonly conversation?: ActionConversation;
  /** L'ENVOI DU FIL (#11210, `useSend`) — « Réessayer » relance un envoi en échec ; absent, rien ne s'offre. */
  readonly send?: { readonly retry: (messageId: string) => void; readonly failed: (messageId: string) => boolean };
  /**
   * ARME LA RÉPONSE — au message (`setReplyTarget`, `onCompose` jusqu'à #7555,
   * où le mot est rendu au sens iOS) ou à UNE pièce (`setReplyToMedia`, #9908,
   * la porte de la visionneuse). Le composeur du fil (`useThreadCompose`) les
   * porte toutes deux.
   */
  readonly reply: {
    readonly setReplyTarget: (messageId: string) => void;
    readonly setReplyToMedia: (messageId: string, attachmentId: string) => void;
    /** ARME LE MODE ÉDITION du composeur (#10581) ; absent : l'hôte n'en a pas, « Modifier » ne s'offre pas. */
    readonly beginEdit?: (messageId: string) => void;
  };
  /**
   * LA RÉGION LIVE PARTAGÉE (revue #5814, défaut majeur 9) — remplace
   * l'ancien `actionNotice` local : ce hook POSE ses annonces sur
   * `useLiveAnnouncer`, la MÊME instance que `useSend`, pour qu'aucune des
   * deux sources ne masque durablement l'autre (voir le doc-comment de
   * `use-live-announcer.ts`).
   */
  readonly announce: (message: string) => void;
  /** INJECTABLES pour les témoins — le cache et le transport de l'application par défaut. */
  readonly queryClient?: QueryClient;
  readonly transport?: PieceMenuTransport;
  /** La source servie au signalement (`reports.ts` se tait sur les fixtures) — celle de l'application par défaut. */
  readonly source?: DataSource;
}) {
  const { conversationId, messages, readerLanguages, announce, viewer, send } = params;
  const viewerId = viewer.id;
  const conversation = params.conversation ?? UNKNOWN_CONVERSATION;
  /* LE LECTEUR ET LA CONVERSATION, PAR LEURS VALEURS — l'hôte les recompose à chaque rendu. */
  const scope = useMemo<ActionScope>(
    () => ({ viewer, conversation }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewer.id, viewer.participantId, viewer.hasAccount, viewer.isAnonymous, viewer.platformRole, viewer.conversationRole, viewer.canSendMessages, viewer.isActiveMember,
      conversation.type, conversation.encryptionMode, conversation.isActive, conversation.closedAt, conversation.isAnnouncementChannel, conversation.defaultWriteRole],
  );
  const registered = menuViewerRegistered(viewer);
  const failedOf = useCallback((messageId: string): boolean => send?.failed(messageId) === true, [send]);

  const [menuTarget, setMenuTarget] = useState<MessageMenuTargetState | null>(null);
  const [displayLanguages, setDisplayLanguages] = useState<ReadonlyMap<string, string>>(new Map());
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [reactionSheetFor, setReactionSheetFor] = useState<string | null>(null);
  /** La carte d'export ouverte — `quick` : « Export rapide », le format par défaut enregistré aussitôt peint. */
  const [exportFor, setExportFor] = useState<MessageExportRequest | null>(null);
  const mine = useStore(reactionStore, (s) => s.mine);

  const messageOf = useCallback((id: string) => messages.find((m) => m.id === id), [messages]);
  /* D7 — la source est-elle chiffrée ? Lu dans le cache de la conversation, au moment du geste. */
  const sourceEncrypted = useCallback(
    () => conversationEncrypted(findCachedConversation(params.queryClient ?? appQueryClient, conversationId)),
    [params.queryClient, conversationId],
  );
  /* « AJOUTER À MES STICKERS » (#10630) — la bibliothèque n'est lue que quand le menu vise un sticker. */
  const targetedMessage = menuTarget === null ? undefined : messages.find((m) => m.id === menuTarget.messageId);
  const stickerLibrary = useStickerLibrary(targetedMessage !== undefined && stickerOf(targetedMessage) !== null);
  const piece = usePieceMenu({
    conversationId,
    viewerId,
    messageOf,
    onReplyToMedia: params.reply.setReplyToMedia,
    announce,
    queryClient: params.queryClient ?? appQueryClient,
    transport: params.transport ?? apiDeps.transport,
  });
  const { onPieceReact, onPieceAction, pieceDataOf } = piece;
  /* LES LIBELLÉS D'UNE PIÈCE (#9907) arrivent avec le fil, hors du catalogue d'interface. */
  useEffect(() => {
    void loadMessagePiecesCatalog(currentInterfaceLanguage()).catch(() => undefined);
  }, []);

  /** LE FAVORI (#7378) — l'état CONNU dès l'ouverture du fil, offert par « Plus… » (`use-message-star.ts`). */
  const starEntryOf = useMessageStar({ enabled: registered, announce });
  const starOf = useCallback((messageId: string): MessageStarEntry | null => starEntryOf(messageOf(messageId)), [starEntryOf, messageOf]);

  /** Le texte SERVI d'UN message, `displayLanguage` inséré au rang 0 du
   * Prisme (D-14, un SEUL résolveur — jamais une seconde loi ici). */
  const servedOf = useCallback(
    (messageId: string): Served | undefined => {
      const message = messageOf(messageId);
      if (message === undefined) return undefined;
      return served({
        // `prismFor` (`api/prism.ts`) — SITE UNIQUE de l'insertion au rang 0
        // depuis la revue #5805 ; ce ternaire en était la troisième copie.
        preferredLanguages: prismFor({ readerLanguages, displayLanguage: displayLanguages.get(messageId) }),
        originalLanguage: message.originalLanguage,
        translations: message.translations,
        original: message.content,
      });
    },
    [messageOf, displayLanguages, readerLanguages],
  );

  /**
   * « MODIFIER » (#10581) — le geste, ou `null` quand rien ne s'offre : la
   * règle du serveur lue avant l'aller-retour (`editOffered`), un hôte qui a
   * un mode édition, et le catalogue du fil chargé (le libellé y vit). Le menu
   * et « Plus… » lisent cette même réponse.
   */
  const beginEdit = params.reply.beginEdit;
  const editOf = useCallback(
    (messageId: string): (() => void) | null => {
      const message = messageOf(messageId);
      if (message === undefined || beginEdit === undefined) return null;
      if (!isMessagePiecesCatalogLoaded(currentInterfaceLanguage())) return null;
      if (!editOffered(message, scope, { now: Date.now() })) return null;
      return () => beginEdit(messageId);
    },
    [messageOf, beginEdit, scope],
  );

  /**
   * « SUPPRIMER » (#10582) — le dialogue et ses effets (`use-message-delete.ts`),
   * offerts à « Plus… » pour un message et à la barre pour la sélection. Le
   * geste parti, la sélection se termine.
   */
  const endSelection = useCallback(() => setSelection(null), []);
  const deletion = useMessageDelete({
    conversationId,
    messageOf,
    scope,
    announce,
    queryClient: params.queryClient ?? appQueryClient,
    transport: params.transport ?? apiDeps.transport,
    onConfirmed: endSelection,
  });
  const { ask: askDelete, askRemove, offerOf: deleteOfferFor } = deletion;
  const deleteOf = useCallback(
    (messageId: string): (() => void) | null => (deleteOfferFor([messageId]) === null ? null : () => askDelete([messageId])),
    [deleteOfferFor, askDelete],
  );
  /**
   * « ÉPINGLER » ET « SIGNALER » (#7558) — offerts par « Plus… » selon la règle
   * du serveur (`messagePinAction`, `reportOffered`) ; l'épingle est optimiste
   * (`use-message-pin.ts`), le signalement passe par la feuille des motifs
   * (`use-message-report.ts`).
   */
  const transport = params.transport ?? apiDeps.transport;
  const pinEntryOf = useMessagePin({ conversationId, scope, announce, queryClient: params.queryClient ?? appQueryClient, transport });
  const pinOf = useCallback((messageId: string): MessagePinEntry | null => pinEntryOf(messageOf(messageId)), [pinEntryOf, messageOf]);
  const source = params.source ?? apiDeps.source;
  const reportDeps = useMemo(() => ({ source, transport }), [source, transport]);
  const reporting = useMessageReport({ messageOf, scope, announce, deps: reportDeps });

  /** L'ordre est celui du FIL (`orderedIds`), comme pour le transfert : la boucle « pour tous » supprime dans l'ordre où on lit. */
  const onDeleteSelection = useCallback(
    (placed: readonly { readonly message: { readonly id: string } }[]) => {
      if (selection !== null) askDelete(orderedIds(placed, new Set(selection.ids)));
    },
    [selection, askDelete],
  );

  /**
   * LE TEXTE COPIABLE — `servedOf` GARDÉ par la loi de sortie (`content-exit.ts`).
   *
   * La garde vit sur le TEXTE, pas sur la liste d'actions (revue #5814) : le
   * menu retire « Copier » d'un message qui ne sort pas, mais la barre de
   * sélection n'a qu'un bouton pour TOUTE la sélection, et l'étiquette du menu
   * cite un extrait. Les trois chemins passent par ici — un message flouté, à
   * vue unique, supprimé, échu, ou qui disparaît (#9573) n'y rend rien.
   */
  const copyableTextOf = useCallback(
    (messageId: string): string | undefined => {
      const message = messageOf(messageId);
      if (message === undefined) return undefined;
      if (!exitOffers(contentExitOf(message, Date.now()), 'copy')) return undefined;
      return servedOf(messageId)?.text;
    },
    [messageOf, servedOf],
  );

  /**
   * « IMAGER LA DISCUSSION » A UNE CARTE À PEINDRE (#9039, #9573) — la MÊME
   * fonction que l'atelier (`discussionCardSubjectOf`) : une discussion qui
   * contient une réponse citant un contenu protégé se refuse, et le menu ne
   * rend pas une entrée dont l'atelier n'aurait rien à montrer. Le lecteur n'y
   * sert qu'à nommer les auteurs, ce que la réponse oui/non ne lit pas.
   */
  const discussionImageableOf = useCallback(
    (messageId: string): boolean =>
      discussionCardSubjectOf({
        messages,
        anchorId: messageId,
        servedOf: (id) => servedOf(id)?.text,
        viewer: { id: viewerId, displayName: '' },
        now: Date.now(),
      }) !== null,
    [messages, servedOf, viewerId],
  );

  // LE FOCUS AVANT OUVERTURE — restitué à la fermeture SAUF si Composer ou
  // Sélectionner l'ont pris (miroir `restoreStateAfterLongPressIfNeeded`,
  // `ConversationView+LongPressMenu.swift:92-108`).
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const originRef = useRef<EventTarget | null>(null);
  const focusTakenRef = useRef(false);

  const openMenuFor = useCallback(
    (anchor: LongPressAnchor & { readonly origin: EventTarget | null }) => {
      if (selection !== null) return; // en sélection, un tap bascule déjà (§ hôte).
      const messageId = anchor.element.dataset.row;
      if (messageId === undefined) return;
      const message = messageOf(messageId);
      if (message === undefined) return;
      const active = document.activeElement;
      restoreFocusRef.current = active instanceof HTMLElement ? active : null;
      if (active instanceof HTMLTextAreaElement) active.blur();
      focusTakenRef.current = false;
      /* LA PIÈCE TOUCHÉE (#9907) — seulement si l'aperçu sait la parcourir
         (au moins deux pièces visuelles) ; sinon le message entier. */
      const pieceId = pieceIdAt(anchor.origin, anchor.element);
      if (pieceId !== undefined) prewarmPieceReaction();
      setMenuTarget({
        messageId,
        element: anchor.element,
        isMine: isMineOf(message, viewerId),
        ...(targetedPieceOf(message, pieceId, Date.now()) === null || pieceId === undefined ? {} : { pieceId }),
      });
    },
    [selection, messageOf, viewerId],
  );

  /**
   * L'ORIGINE DU GESTE (#9907) — l'élément que l'appui, le clic droit ou la
   * touche Menu a TOUCHÉ, retenu avant que `useLongPress` ne remonte la rangée
   * (`currentTarget`). Retenu ici plutôt que dans `long-press.ts`, qui vit dans
   * la première peinture (menu de l'avatar) : le fil seul en paie le poids.
   */
  const gesture = useLongPress({ onOpen: (anchor) => openMenuFor({ ...anchor, origin: originRef.current }) });

  const onCloseMenu = useCallback(() => {
    setMenuTarget(null);
    if (!focusTakenRef.current) restoreFocusRef.current?.focus();
    restoreFocusRef.current = null;
  }, []);

  /** LE DÉFILEMENT DE L'APERÇU CHANGE LA CIBLE (#9907) ; `undefined` : « Tout le message ». */
  const onPieceChange = useCallback((pieceId: string | undefined) => {
    setMenuTarget((current) => {
      if (current === null) return current;
      const { pieceId: _previous, ...rest } = current;
      return pieceId === undefined ? rest : { ...rest, pieceId };
    });
  }, []);

  const onMenuReact = useCallback(
    (messageId: string, emoji: string, pieceId?: string) => {
      if (pieceId !== undefined) {
        onPieceReact(messageId, pieceId, emoji);
        return;
      }
      void reactAction(conversationId, messageId, emoji).then((result) => {
        if (!result.ok) announce(result.message);
        // `notice` (revue #5814, défaut majeur 3) — l'optimiste RESTE
        // (`result.ok === true`), mais une réaction posée hors ligne ou
        // devant un 5xx n'a pas atteint la passerelle : l'annoncer plutôt
        // que de se taire, exactement comme un envoi de message le fait déjà.
        else if (result.notice !== undefined) announce(result.notice);
      });
    },
    [conversationId, announce, onPieceReact],
  );

  /**
   * LE DOUBLE TOUCHER OUVRE LA BARRE DE RÉACTION RAPIDE (#10599, décision
   * porteur du 2026-10-14 : « Non, sur le web le double toucher peut ouvrir
   * plutôt un petit menu de réaction rapide ! ») — la barre de la capsule
   * « + » (`MessageReactionQuickBar`), jamais le menu complet ni une réaction
   * posée d'office. Sur la tuile d'un message à plusieurs pièces dont la pièce
   * accepte une réaction (`pieceDataOf(…).canReact`, la loi du menu d'une
   * pièce), la barre s'ancre sur la tuile et vise CETTE pièce. Ce que la
   * capsule refuse, le geste le refuse (`doubleTapReactable`). Le menu
   * ouvert, la barre ouverte et la sélection le neutralisent.
   */
  const [quickReactionFor, setQuickReactionFor] = useState<QuickReactionTarget | null>(null);
  const onCloseQuickReaction = useCallback(() => setQuickReactionFor(null), []);
  const blockedRef = useRef(false);
  blockedRef.current = selection !== null || menuTarget !== null || quickReactionFor !== null;
  const onDoubleTap = useCallback(
    ({ row, origin, x }: DoubleTap) => {
      const messageId = row.dataset.row;
      const message = messageId === undefined ? undefined : messageOf(messageId);
      if (message === undefined || !doubleTapReactable(message, Date.now())) return;
      const pieceId = pieceIdAt(origin, row);
      const reactsOnPiece = pieceId !== undefined && pieceDataOf(message.id, pieceId)?.canReact === true;
      if (reactsOnPiece) prewarmPieceReaction();
      const tile = reactsOnPiece && origin instanceof Element ? origin.closest(`[${PIECE_ATTRIBUTE}]`) : null;
      setQuickReactionFor({
        messageId: message.id,
        anchor: tile instanceof HTMLElement ? tile : row,
        x,
        ...(reactsOnPiece ? { pieceId } : {}),
      });
    },
    [messageOf, pieceDataOf],
  );
  const doubleTap = useDoubleTap({ enabled: () => !blockedRef.current, onDoubleTap });

  /**
   * LES GESTES D'UNE RANGÉE — l'appui long (menu) et le double toucher
   * (barre de réaction rapide), étalés ensemble sur chaque rangée par l'hôte.
   */
  const longPress = useMemo(() => {
    const note = (event: { readonly target: EventTarget | null }) => {
      originRef.current = event.target;
    };
    return {
      ...gesture,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        note(event);
        gesture.onPointerDown(event);
        doubleTap.onPointerDown(event);
      },
      onClickCapture: doubleTap.onClickCapture,
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
        note(event);
        gesture.onContextMenu(event);
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
        note(event);
        gesture.onKeyDown(event);
      },
    };
  }, [gesture, doubleTap]);

  /**
   * BASCULE (revue #5814, défaut majeur 12) — c'est le SEUL geste qui pose
   * `displayLanguage`, qu'il vienne du sous-menu « Traduire » ou du pied
   * d'une rangée/bulle (`FocalRow`/`Bubble`, prop `onPickLanguage`) : une
   * loi, deux portes. Cliquer la langue DÉJÀ imposée l'efface (retour à la
   * résolution ordinaire du Prisme) plutôt que de la reposer sans effet —
   * même geste qu'un `Flags`/`PrismPastille` local offrait avant l'unification.
   */
  const onPickLanguage = useCallback((messageId: string, code: string) => {
    setDisplayLanguages((prev) => {
      const next = new Map(prev);
      if (next.get(messageId) === code) next.delete(messageId);
      else next.set(messageId, code);
      return next;
    });
  }, []);

  /**
   * LES GESTES DU TYPE (#11210) — un lien s'ouvre ou se copie, un lieu s'ouvre
   * dans une carte ou se copie, une carte de contact s'enregistre. Ce qui SORT
   * de Meeshy repasse par la loi de sortie, comme « Copier ».
   */
  const runTypeAction = useCallback(
    (id: TypeActionId, message: Message) => {
      const lang = currentInterfaceLanguage();
      const ctx = messageMenuContextOf(message, { now: Date.now() });
      const leaves = !ctx.isProtected && ctx.leaves !== false;
      const link = ctx.link ?? null;
      const place = ctx.place ?? null;
      const card = message.attachments?.find((piece) => isContactCardAttachment({ mimeType: piece.mimeType, fileName: piece.originalName ?? piece.fileName }));
      const open = (url: string) => void window.open(url, '_blank', 'noopener,noreferrer');
      const copy = (text: string, done: 'message.link.copied' | 'message.location.copied') =>
        void copyPlainText(text).then((outcome) => announce(outcome === 'copied' ? translateMessagePieces(lang, done) : translate(lang, 'feed.post.copy_failed')));
      const saveCard = (attachment: NonNullable<typeof card>) =>
        void saveContactFile({ attachment }).then((outcome) => {
          if (outcome === 'failed') announce(translate(lang, 'contactCard.downloadFailed'));
        });
      const gestures: Readonly<Record<TypeActionId, (() => void) | null>> = {
        openLink: link === null ? null : () => open(link),
        copyLink: link === null || !leaves ? null : () => copy(link, 'message.link.copied'),
        openInMaps: place === null ? null : () => open(mapsUrlOf(place, { platform: coqueCourante()?.getPlatform?.() })),
        copyAddress: place === null || !leaves ? null : () => copy(place.address ?? place.name ?? `${place.latitude}, ${place.longitude}`, 'message.location.copied'),
        saveContact: card === undefined || !leaves ? null : () => saveCard(card),
      };
      gestures[id]?.();
    },
    [announce],
  );

  const onMenuAction = useCallback(
    (messageId: string, id: MessageActionId) => {
      if (id === 'copy') {
        const text = copyableTextOf(messageId);
        if (text === undefined) {
          announce(translate(currentInterfaceLanguage(), 'announce.messageProtected'));
          return;
        }
        void copyPlainText(text).then((outcome) =>
          announce(translate(currentInterfaceLanguage(), outcome === 'copied' ? 'announce.messageCopied' : 'feed.post.copy_failed')),
        );
        return;
      }
      if (id === 'reply') {
        focusTakenRef.current = true;
        params.reply.setReplyTarget(messageId);
        return;
      }
      if (id === 'edit') {
        const edit = editOf(messageId);
        if (edit === null) return;
        focusTakenRef.current = true;
        edit();
        return;
      }
      if (id === 'retry') {
        if (failedOf(messageId)) send?.retry(messageId);
        return;
      }
      if (isTypeAction(id)) {
        const message = messageOf(messageId);
        if (message !== undefined) runTypeAction(id, message);
        return;
      }
      if (id === 'pin' || id === 'unpin') {
        pinOf(messageId)?.onToggle();
        return;
      }
      if (id === 'delete') {
        askDelete([messageId]);
        return;
      }
      if (id === 'remove') {
        askRemove([messageId]);
        return;
      }
      /**
       * « TRANSFÉRER » OUVRE L'ÉCRAN DE PARTAGE (D1, #10949, porteur
       * 2026-10-18 — supplante #5989) — depuis toutes les portes, avec CE
       * message. La sélection multiple reste « Sélectionner », dans « Plus… ».
       */
      if (id === 'forward') {
        const message = messageOf(messageId);
        const now = Date.now();
        const refusal = message === undefined ? 'unavailable' : forwardRefusalOf(message, now);
        if (message === undefined || refusal !== null) {
          announce(translate(currentInterfaceLanguage(), FORWARD_REFUSAL_KEY[refusal ?? 'unavailable']));
          return;
        }
        openSendSheet(forwardRequestOf({ conversationId, messages: [message], now, sourceEncrypted: sourceEncrypted() }));
        return;
      }
      if (id === 'select') {
        focusTakenRef.current = true;
        setSelection({ ids: [messageId] });
        return;
      }
      if (id === 'more') {
        setDetailFor(messageId);
        return;
      }
      if (id === 'addSticker') {
        const message = messageOf(messageId);
        const sticker = message === undefined ? null : stickerOf(message);
        if (message === undefined || sticker === null) return;
        const lang = currentInterfaceLanguage();
        void stickerLibrary.add(sticker, message.attachments?.[0]).then((ok) =>
          announce(translateMessagePieces(lang, ok ? 'message.sticker.added' : 'message.sticker.addFailed')),
        );
        return;
      }
      /* « ENREGISTRER » (#10599) — la pièce unique, par la porte du menu d'une
         pièce (`pieceSave`) : une seule écriture du téléchargement. */
      if (id === 'save') {
        const message = messageOf(messageId);
        const sole = message === undefined ? null : soleSaveablePieceOf(message, Date.now());
        if (sole !== null) onPieceAction(messageId, sole.id, 'pieceSave');
        return;
      }
      if (id === 'export' || id === 'exportQuick' || id === 'exportDiscussion') {
        const message = messageOf(messageId);
        if (message === undefined || !imageableOf(messageMenuContextOf(message, { now: Date.now() }))) return;
        if (id === 'exportDiscussion' && !discussionImageableOf(messageId)) return;
        focusTakenRef.current = true;
        setExportFor(id === 'exportDiscussion' ? { messageId, quick: false, scope: 'discussion' } : { messageId, quick: id === 'exportQuick' });
        return;
      }
      // `translate` ne passe jamais ici — `MessageMenu` l'intercepte en
      // interne et bascule sur son sous-menu (`onPickLanguage`).
    },
    [copyableTextOf, params, announce, messageOf, discussionImageableOf, editOf, onPieceAction, stickerLibrary, failedOf, send, runTypeAction, pinOf, askDelete, askRemove],
  );

  /** Le tap d'une rangée EN MODE SÉLECTION — bascule la coche ; le 101ᵉ id
   * refusé annonce le plafond (`SELECTION_CAP`, `selection.ts`). */
  const onRowTap = useCallback(
    (messageId: string) => {
      setSelection((current) => {
        if (current === null) return current;
        const next = selectionReducer(current, { type: 'toggle', id: messageId });
        if (next?.reason === 'cap') {
          const lang = currentInterfaceLanguage();
          announce(translate(lang, 'announce.selectionCap', { count: new Intl.NumberFormat(lang).format(SELECTION_CAP) }));
        }
        return next;
      });
    },
    [announce],
  );

  const onEndSelection = useCallback(() => setSelection(null), []);

  /**
   * LE GESTE DE LA BARRE (#5866, #8884) — il ADMET d'abord, il ouvre ensuite.
   *
   * `admitForward` (`view/forward.ts`) lit la loi de sortie que
   * `admitMessageForward` applique : vue unique, flamme après lecture et
   * source disparue sont refusées. La barre n'offre déjà plus le bouton
   * (`selectionOffers`) ; le refus s'ANNONCE ici pour toute autre porte, avant tout aller-retour — c'est la
   * différence entre « le serveur dira non » et « l'utilisateur l'apprend
   * après avoir choisi un destinataire ».
   *
   * L'ordre est celui du FIL (`orderedIds`), jamais celui des coches : ce qui
   * arrive chez le destinataire se lit comme ce qu'on a sélectionné.
   *
   * ADMISE, la sélection débouche sur LA FEUILLE D'ENVOI commune (#8884,
   * `openSendSheet`) — personnes, groupes, ou publication en story / post /
   * réel, avec une légende. Ce hook ne monte plus aucune feuille de
   * destinataires : il REMET la demande (`forwardRequestOf`) et la sélection
   * SE TERMINE, le geste étant fini du point de vue du fil. Le départ, son
   * état par destinataire et ses échecs sont l'affaire de la feuille
   * (`lib/send/`), qui les montre là où le lecteur regarde.
   */
  const onForwardSelection = useCallback(
    (placed: readonly { readonly message: { readonly id: string } }[]) => {
      if (selection === null) return;
      const ids = orderedIds(placed, new Set(selection.ids));
      const candidates = ids.map((id) => messageOf(id)).filter((m): m is Message => m !== undefined);
      const now = Date.now();
      const admission = admitForward(candidates, now);
      if (!admission.admitted) {
        announce(translate(currentInterfaceLanguage(), FORWARD_REFUSAL_KEY[admission.reason]));
        return;
      }
      setSelection(null);
      openSendSheet(forwardRequestOf({ conversationId, messages: candidates, now, sourceEncrypted: sourceEncrypted() }));
    },
    [selection, messageOf, announce, conversationId, sourceEncrypted],
  );

  /**
   * CE QUE LA BARRE OFFRE POUR CETTE SÉLECTION (#9573) — « Transférer » n'est
   * pas rendu dès qu'UN message coché ne se transfère pas (le lot part entier
   * ou pas du tout, `admitForward`) ; « Copier » n'est pas rendu quand rien de
   * coché ne se copie. Un bouton interdit n'existe pas, il ne se grise pas.
   */
  const selectionOffers = ((): { readonly forward: boolean; readonly copy: boolean; readonly delete: boolean } => {
    if (selection === null) return { forward: false, copy: false, delete: false };
    const picked = selection.ids.map((id) => messageOf(id)).filter((m): m is Message => m !== undefined);
    return {
      forward: admitForward(picked, Date.now()).admitted,
      copy: selection.ids.some((id) => (copyableTextOf(id) ?? '') !== ''),
      delete: deleteOfferFor(selection.ids) !== null,
    };
  })();

  const onCopySelection = useCallback(
    (placed: readonly { readonly message: { readonly id: string } }[]) => {
      if (selection === null) return;
      const ids = orderedIds(placed, new Set(selection.ids));
      const text = copyTextOf(ids, copyableTextOf);
      if (text === '') {
        announce(translate(currentInterfaceLanguage(), 'announce.nothingToCopy'));
        return;
      }
      void copyPlainText(text).then((outcome) => {
        const lang = currentInterfaceLanguage();
        if (outcome === 'failed') announce(translate(lang, 'feed.post.copy_failed'));
        else announce(text.includes('\n') ? translate(lang, 'announce.messagesCopied') : translate(lang, 'announce.messageCopied'));
      });
    },
    [selection, copyableTextOf, announce],
  );

  /**
   * **LE GLISSÉ ET L'ICÔNE « RÉPONDRE » PASSENT PAR LE MENU** (#7559, #8899) —
   * même loi d'offre (`messageMenuItems` : pas de réponse ni de transfert sur
   * une vue unique, pas de transfert refusé par `canForward`), même effet
   * (`onMenuAction`) : « Répondre » arme la citation, « Transférer » arme la
   * sélection avec ce message coché (D-113), comme le fait iOS au glissé
   * (`beginSelectionMode(seedingWith:)`). En sélection, rien ne s'offre.
   */
  const swipeActionsOf = useCallback(
    (message: Message): { readonly canReply: boolean; readonly canForward: boolean } | undefined => {
      if (selection !== null) return undefined;
      const ids = messageMenuItems(messageMenuContextOf(message, { now: Date.now(), scope, failed: failedOf(message.id) })).map((item) => item.id);
      return { canReply: ids.includes('reply'), canForward: ids.includes('forward') };
    },
    [selection, scope, failedOf],
  );

  /** Les données du menu OUVERT — `undefined` tant qu'aucun message n'est
   * ciblé, ou si le message a disparu du fil entre-temps (fixture rechargée,
   * suppression) : l'hôte n'y monte alors rien.
   *
   * `subjectLabel` (revue #5814, défaut majeur 13) — le menu NOMME
   * désormais son sujet (« Actions du message de … : … ») au lieu du seul
   * générique « Actions du message » : un lecteur d'écran l'entendait sans
   * jamais entendre le message que la cible iOS, elle, expose
   * (`targets/thread.message-menu.light.a11y.txt`). `copyableTextOf` — PAS
   * `servedOf` en direct — parce qu'il est déjà GARDÉ par la protection
   * (D-23) : un extrait de message flouté/à vue unique/éphémère/chiffré ne
   * doit PAS fuir par cette étiquette après avoir été retiré de « Copier ».
   */
  const menuData:
    | {
        readonly items: readonly MessageMenuItem[];
        readonly forwardItems: readonly MessageMenuItem[];
        readonly choices: readonly TranslationChoice[];
        readonly subjectLabel: string;
        /** RÉAGIR EST-IL PERMIS (#11206) — la loi du double toucher, appliquée
         * au rail du menu : ni supprimé, ni éphémère échu, ni envoi local, ni système. */
        readonly canReact: boolean;
        readonly piece?: PieceMenuData;
      }
    | undefined = (() => {
    if (menuTarget === null) return undefined;
    const message = messageOf(menuTarget.messageId);
    if (message === undefined) return undefined;
    const lang = currentInterfaceLanguage();
    const ctx = {
      ...messageMenuContextOf(message, { now: Date.now(), scope, failed: failedOf(message.id) }),
      canRetry: send !== undefined,
      piecesLabels: isMessagePiecesCatalogLoaded(lang),
      hasDefaultExportFormat: readDefaultMessageCardFormat(safeLocalStorage()) !== null,
      discussionImageable: discussionImageableOf(menuTarget.messageId),
      canEdit: editOf(menuTarget.messageId) !== null,
      canSave: soleSaveablePieceOf(message, Date.now()) !== null,
      ...stickerContextOf(message, stickerLibrary),
    };
    const servedLanguage = servedOf(menuTarget.messageId)?.language ?? '';
    const author = message.sender?.displayName ?? translate(lang, 'message.author.self');
    const text = copyableTextOf(menuTarget.messageId);
    const excerpt =
      text === undefined ? translate(lang, 'message.excerpt.protected') : text.length > 80 ? `${text.slice(0, 80)}…` : text;
    const pieceData = piece.pieceDataOf(menuTarget.messageId, menuTarget.pieceId);
    return {
      items: messageMenuItems(ctx),
      forwardItems: forwardMenuItems(ctx),
      choices: translationChoices({ message, preferredLanguages: readerLanguages, servedLanguage }),
      subjectLabel: translate(lang, 'a11y.message.menu.subject', { author, excerpt }),
      canReact: doubleTapReactable(message, Date.now()),
      ...(pieceData === undefined ? {} : { piece: pieceData }),
    };
  })();

  return {
    menuTarget,
    menuData,
    quickReactionFor,
    onCloseQuickReaction,
    longPress,
    onCloseMenu,
    onMenuReact,
    onMenuAction,
    onPieceChange,
    onPieceAction,
    onPickLanguage,
    displayLanguageOf: (id: string) => displayLanguages.get(id),
    myReactionsOf: (id: string) => mine[id],
    selection,
    onRowTap,
    onEndSelection,
    onCopySelection,
    onForwardSelection,
    onDeleteSelection,
    selectionOffers,
    deleteOf,
    deleteRequest: deletion.request,
    onDismissDelete: deletion.dismiss,
    onConfirmDelete: deletion.confirm,
    detailFor,
    setDetailFor,
    reactionSheetFor,
    setReactionSheetFor,
    exportFor,
    setExportFor,
    servedOf,
    starOf,
    editOf,
    pinOf,
    reportOf: reporting.reportOf,
    reportFor: reporting.reportFor,
    onPickReportReason: reporting.onPickReportReason,
    onDismissReport: reporting.onDismissReport,
    swipeActionsOf,
  };
}

/**
 * LE CONTRÔLEUR DU MENU, TEL QUE L'HÔTE LE REÇOIT (#7429) — DÉRIVÉ du hook,
 * jamais redéclaré : une déclaration à la main serait une jumelle à tenir à
 * jour à chaque champ ajouté. Ses consommateurs en prennent la part qu'ils
 * lisent (`Pick`), ce qui DIT leur contrat et rend leurs bouchons de test
 * honnêtes sans `as`.
 */
export type MessageMenuController = ReturnType<typeof useMessageMenu>;
