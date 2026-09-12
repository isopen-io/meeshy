import { useCallback, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { prismFor, served, type Served } from '@/lib/api/prism';
import { protectionOf } from '@/lib/reading-mode/protection';
import { reactAction } from '@/lib/api/query';
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
import { useLongPress, type LongPressAnchor } from './long-press';
import { isMineOf } from './message';
import { copyTextOf, orderedIds, selectionReducer, type SelectionState } from './selection';

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
  readonly onCompose: (messageId: string) => void;
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
  const mine = useStore(reactionStore, (s) => s.mine);

  const messageOf = useCallback((id: string) => messages.find((m) => m.id === id), [messages]);

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
          announce('Message protégé');
          return;
        }
        if (typeof navigator === 'object' && navigator.clipboard) void navigator.clipboard.writeText(text);
        announce(translate(currentInterfaceLanguage(), 'announce.messageCopied'));
        return;
      }
      if (id === 'compose') {
        focusTakenRef.current = true;
        params.onCompose(messageId);
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
        if (next?.reason === 'cap') announce('Maximum 100 messages');
        return next;
      });
    },
    [announce],
  );

  const onEndSelection = useCallback(() => setSelection(null), []);

  const onCopySelection = useCallback(
    (placed: readonly { readonly message: { readonly id: string } }[]) => {
      if (selection === null) return;
      const ids = orderedIds(placed, new Set(selection.ids));
      const text = copyTextOf(ids, copyableTextOf);
      if (text === '') {
        announce('Rien à copier');
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
    const author = message.sender?.displayName ?? 'Vous';
    const text = copyableTextOf(menuTarget.messageId);
    const excerpt = text === undefined ? 'contenu protégé' : text.length > 80 ? `${text.slice(0, 80)}…` : text;
    return {
      items: messageMenuItems(ctx),
      choices: translationChoices({ message, preferredLanguages: readerLanguages, servedLanguage }),
      subjectLabel: `Actions du message de ${author} : ${excerpt}`,
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
    detailFor,
    setDetailFor,
    reactionSheetFor,
    setReactionSheetFor,
    servedOf,
  };
}
