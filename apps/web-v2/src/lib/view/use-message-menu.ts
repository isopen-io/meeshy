import { useCallback, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { prismFor, served, type Served } from '@/lib/api/prism';
import { protectionOf } from '@/lib/reading-mode/protection';
import { forwardAction, reactAction } from '@/lib/api/query';
import { reactionStore } from '@/lib/api/reaction-store';
import type { Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import {
  messageMenuContextOf,
  messageMenuItems,
  translationChoices,
  type MessageActionId,
  type MessageMenuItem,
  type TranslationChoice,
} from './message-actions';
import { admitForward } from './forward';
import { useLongPress, type LongPressAnchor } from './long-press';
import { isMineOf } from './message';
import { SELECTION_CAP, copyTextOf, orderedIds, selectionReducer, type SelectionState } from './selection';
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

export type MessageMenuTargetState = { readonly messageId: string; readonly element: HTMLElement; readonly isMine: boolean };

export function useMessageMenu(params: {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly readerLanguages: readonly string[];
  readonly readerLocale: string;
  readonly viewerId: string;
  /** Le lecteur a un COMPTE : le favori est réservé aux inscrits (#7377), l'invité d'un lien n'en a pas. */
  readonly canStar: boolean;
  /** ARME LA RÉPONSE au message — `onCompose` jusqu'à #7555, où le mot est
   * rendu au sens iOS (créer une story ou un post avec ce média). */
  readonly onReply: (messageId: string) => void;
  /**
   * LA RÉGION LIVE PARTAGÉE (revue #5814, défaut majeur 9) — remplace
   * l'ancien `actionNotice` local : ce hook POSE ses annonces sur
   * `useLiveAnnouncer`, la MÊME instance que `useSend`, pour qu'aucune des
   * deux sources ne masque durablement l'autre (voir le doc-comment de
   * `use-live-announcer.ts`).
   */
  readonly announce: (message: string) => void;
}) {
  const { conversationId, messages, readerLanguages, viewerId, announce } = params;

  const [menuTarget, setMenuTarget] = useState<MessageMenuTargetState | null>(null);
  const [displayLanguages, setDisplayLanguages] = useState<ReadonlyMap<string, string>>(new Map());
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [reactionSheetFor, setReactionSheetFor] = useState<string | null>(null);
  /** Les ids à transférer, ADMIS — `null` ⇒ la feuille de destinataires est
   * fermée. Elle n'est jamais ouverte sur une sélection refusée (#5866). */
  const [forwardIds, setForwardIds] = useState<readonly string[] | null>(null);
  const mine = useStore(reactionStore, (s) => s.mine);

  const messageOf = useCallback((id: string) => messages.find((m) => m.id === id), [messages]);

  /** LE FAVORI (#7378) — l'état CONNU dès l'ouverture du fil, offert par « Plus… » (`use-message-star.ts`). */
  const starEntryOf = useMessageStar({ enabled: params.canStar, announce });
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
   * LE TEXTE COPIABLE — `servedOf` GARDÉ par la protection (D-23).
   *
   * Défaut trouvé en revue (#5814), BLOQUANT : le menu retire bien « Copier »
   * d'un message protégé (`messageMenuItems`), mais le mode SÉLECTION n'a
   * qu'un bouton « Copier » pour TOUTE la sélection, et il lisait `servedOf`
   * en direct. Sélectionner un message FLOUTÉ, à VUE UNIQUE, ÉPHÉMÈRE ou
   * SUPPRIMÉ puis « Copier » mettait donc son texte EN CLAIR dans le
   * presse-papiers — le contenu que `check-thread-states.mjs` § 5 vérifie
   * absent du DOM entier partait par une AUTRE porte. C'est la question du
   * cycle 123 du `CLAUDE.md` racine (« que transporte-t-on À CÔTÉ de ce
   * qu'on garde ? ») : la garde vivait sur la LISTE d'actions, pas sur le
   * TEXTE. Elle vit désormais sur le texte, et les deux chemins de copie
   * (l'entrée du menu, la barre de sélection) passent par elle.
   */
  const copyableTextOf = useCallback(
    (messageId: string): string | undefined => {
      const message = messageOf(messageId);
      if (message === undefined) return undefined;
      if (protectionOf(message, Date.now()) !== 'standard') return undefined;
      return servedOf(messageId)?.text;
    },
    [messageOf, servedOf],
  );

  // LE FOCUS AVANT OUVERTURE — restitué à la fermeture SAUF si Composer ou
  // Sélectionner l'ont pris (miroir `restoreStateAfterLongPressIfNeeded`,
  // `ConversationView+LongPressMenu.swift:92-108`).
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const focusTakenRef = useRef(false);

  const openMenuFor = useCallback(
    (anchor: LongPressAnchor) => {
      if (selection !== null) return; // en sélection, un tap bascule déjà (§ hôte).
      const messageId = anchor.element.dataset.row;
      if (messageId === undefined) return;
      const message = messageOf(messageId);
      if (message === undefined) return;
      const active = document.activeElement;
      restoreFocusRef.current = active instanceof HTMLElement ? active : null;
      if (active instanceof HTMLTextAreaElement) active.blur();
      focusTakenRef.current = false;
      setMenuTarget({ messageId, element: anchor.element, isMine: isMineOf(message, viewerId) });
    },
    [selection, messageOf, viewerId],
  );

  const longPress = useLongPress({ onOpen: openMenuFor });

  const onCloseMenu = useCallback(() => {
    setMenuTarget(null);
    if (!focusTakenRef.current) restoreFocusRef.current?.focus();
    restoreFocusRef.current = null;
  }, []);

  const onMenuReact = useCallback(
    (messageId: string, emoji: string) => {
      void reactAction(conversationId, messageId, emoji).then((result) => {
        if (!result.ok) announce(result.message);
        // `notice` (revue #5814, défaut majeur 3) — l'optimiste RESTE
        // (`result.ok === true`), mais une réaction posée hors ligne ou
        // devant un 5xx n'a pas atteint la passerelle : l'annoncer plutôt
        // que de se taire, exactement comme un envoi de message le fait déjà.
        else if (result.notice !== undefined) announce(result.notice);
      });
    },
    [conversationId, announce],
  );

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

  const onMenuAction = useCallback(
    (messageId: string, id: MessageActionId) => {
      if (id === 'copy') {
        const text = copyableTextOf(messageId);
        if (text === undefined) {
          announce(translate(currentInterfaceLanguage(), 'announce.messageProtected'));
          return;
        }
        if (typeof navigator === 'object' && navigator.clipboard) void navigator.clipboard.writeText(text);
        announce(translate(currentInterfaceLanguage(), 'announce.messageCopied'));
        return;
      }
      if (id === 'reply') {
        focusTakenRef.current = true;
        params.onReply(messageId);
        return;
      }
      /**
       * « TRANSFÉRER » ARME LA SÉLECTION (#5866, décision porteur #5989 du
       * 2026-09-23) — exactement l'effet de « Sélectionner », avec CE message
       * déjà coché. Ce n'est PAS un sélecteur de conversations qui s'ouvre :
       * c'est la barre de sélection qui valide ensuite vers les destinataires.
       * Le porteur a accepté ce geste supplémentaire au cas nominal pour que
       * le même mot ait le même effet quelle que soit la porte (dimension 6).
       */
      if (id === 'select' || id === 'forward') {
        focusTakenRef.current = true;
        setSelection({ ids: [messageId] });
        return;
      }
      if (id === 'more') {
        setDetailFor(messageId);
        return;
      }
      // `translate` ne passe jamais ici — `MessageMenu` l'intercepte en
      // interne et bascule sur son sous-menu (`onPickLanguage`).
    },
    [copyableTextOf, params, announce],
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

  const onEndSelection = useCallback(() => {
    setSelection(null);
    setForwardIds(null);
  }, []);

  /**
   * LE GESTE DE LA BARRE (#5866) — il ADMET d'abord, il ouvre ensuite.
   *
   * `admitForward` (`view/forward.ts`) rejoue `admitMessageForward`
   * (`forwardAdmission.ts`) : une vue unique est refusée, une source disparue
   * aussi. Le refus s'ANNONCE ici, avant tout aller-retour — c'est la
   * différence entre « le serveur dira non » et « l'utilisateur l'apprend
   * après avoir choisi un destinataire ».
   *
   * L'ordre est celui du FIL (`orderedIds`), jamais celui des coches : ce qui
   * arrive chez le destinataire se lit comme ce qu'on a sélectionné.
   */
  const onForwardSelection = useCallback(
    (placed: readonly { readonly message: { readonly id: string } }[]) => {
      if (selection === null) return;
      const ids = orderedIds(placed, new Set(selection.ids));
      const candidates = ids.map((id) => messageOf(id)).filter((m): m is Message => m !== undefined);
      const admission = admitForward(candidates, Date.now());
      if (!admission.admitted) {
        const lang = currentInterfaceLanguage();
        announce(
          admission.reason === 'view-once'
            ? translate(lang, 'forward.refusal.viewOnce')
            : translate(lang, 'forward.refusal.unavailable'),
        );
        return;
      }
      setForwardIds(admission.ids);
    },
    [selection, messageOf, announce],
  );

  const onCloseForward = useCallback(() => setForwardIds(null), []);

  /**
   * LE DÉPART (#5866) — `forwardAction` remet les messages ENTIERS au
   * transport (`api/forward.ts`), qui compose un corps SANS `attachmentIds` :
   * c'est la passerelle qui copie les pièces jointes depuis `forwardedFromId`,
   * mêmes blobs, aucun ré-upload.
   *
   * LA FEUILLE SE FERME ET LA SÉLECTION SE TERMINE AVANT L'ACCUSÉ — le geste
   * est fini du point de vue du lecteur, et l'issue lui revient par l'annonce
   * (principe « Optimistic Updates » : le feedback est immédiat, le réseau
   * confirme après). Un échec ne ressuscite pas la sélection : il le DIT,
   * avec le motif du serveur, et le fil reste là où le lecteur l'a laissé.
   */
  const onForwardTo = useCallback(
    (targetConversationId: string) => {
      const ids = forwardIds;
      if (ids === null) return;
      const messagesToForward = ids.map((id) => messageOf(id)).filter((m): m is Message => m !== undefined);
      setForwardIds(null);
      setSelection(null);
      void forwardAction({ messages: messagesToForward, sourceConversationId: conversationId, targetConversationId }).then(
        (result) => {
          const lang = currentInterfaceLanguage();
          if (!result.ok) {
            announce(result.error === '' ? translate(lang, 'forward.announce.failed') : result.error);
            return;
          }
          announce(
            result.count > 1
              ? translate(lang, 'forward.announce.sentMany', { count: new Intl.NumberFormat(lang).format(result.count) })
              : translate(lang, 'forward.announce.sent'),
          );
        },
      );
    },
    [forwardIds, messageOf, conversationId, announce],
  );

  const onCopySelection = useCallback(
    (placed: readonly { readonly message: { readonly id: string } }[]) => {
      if (selection === null) return;
      const ids = orderedIds(placed, new Set(selection.ids));
      const text = copyTextOf(ids, copyableTextOf);
      if (text === '') {
        announce(translate(currentInterfaceLanguage(), 'announce.nothingToCopy'));
        return;
      }
      if (typeof navigator === 'object' && navigator.clipboard) void navigator.clipboard.writeText(text);
      const lang = currentInterfaceLanguage();
      announce(text.includes('\n') ? translate(lang, 'announce.messagesCopied') : translate(lang, 'announce.messageCopied'));
    },
    [selection, copyableTextOf, announce],
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
    | { readonly items: readonly MessageMenuItem[]; readonly choices: readonly TranslationChoice[]; readonly subjectLabel: string }
    | undefined = (() => {
    if (menuTarget === null) return undefined;
    const message = messageOf(menuTarget.messageId);
    if (message === undefined) return undefined;
    const ctx = messageMenuContextOf(message, { now: Date.now() });
    const servedLanguage = servedOf(menuTarget.messageId)?.language ?? '';
    const lang = currentInterfaceLanguage();
    const author = message.sender?.displayName ?? translate(lang, 'message.author.self');
    const text = copyableTextOf(menuTarget.messageId);
    const excerpt =
      text === undefined ? translate(lang, 'message.excerpt.protected') : text.length > 80 ? `${text.slice(0, 80)}…` : text;
    return {
      items: messageMenuItems(ctx),
      choices: translationChoices({ message, preferredLanguages: readerLanguages, servedLanguage }),
      subjectLabel: translate(lang, 'a11y.message.menu.subject', { author, excerpt }),
    };
  })();

  return {
    menuTarget,
    menuData,
    longPress,
    onCloseMenu,
    onMenuReact,
    onMenuAction,
    onPickLanguage,
    displayLanguageOf: (id: string) => displayLanguages.get(id),
    myReactionsOf: (id: string) => mine[id],
    selection,
    onRowTap,
    onEndSelection,
    onCopySelection,
    forwardIds,
    onForwardSelection,
    onForwardTo,
    onCloseForward,
    detailFor,
    setDetailFor,
    reactionSheetFor,
    setReactionSheetFor,
    servedOf,
    starOf,
  };
}
