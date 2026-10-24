import { memo, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand/react';

import { ADMIN_PERMISSIONS_QUERY_KEY, type AdminIdentity } from '@/lib/api/admin';
import { apiConfig } from '@/lib/api/config';
import { appQueryClient } from '@/lib/api/query-client';
import type { ListConversation } from '@/lib/api/list-preview';
import { sessionStore } from '@/lib/api/session';
import type { Conversation } from '@/lib/api/types';
import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';
import { callActions } from '@/lib/calls/call-actions';
import { callsAvailable } from '@/lib/calls/calls-availability';
import { translate } from '@/lib/i18n-catalog';
import { categoryIdOf, reactionOf, type ConversationFlags } from '@/lib/api/preferences';
import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
import { accentOf, withAccent } from '@/lib/accent';
import { useColorScheme } from '@/lib/use-color-scheme';
import { MUTED_OPACITY } from '@/lib/lens/law';
import { conversationRowSwipeSides } from '@/lib/view/conversation-row-swipe';
import {
  isRowCallAction,
  isRowFlagAction,
  rowConversationActions,
  type RowActionId,
  type RowDetailsFocus,
  type RowFlagActionId,
  type RowIntent,
  type RowMenuMore,
  type RowSubmenuChoice,
} from '@/lib/view/row-actions';
import { useRowRoving } from '@/lib/view/row-roving';
import { memberCountLabel, rowDateLabel } from '@/lib/view/row-extra';
import { THREAD_SEARCH_PARAM } from '@/lib/view/thread-search-door';
import { readingModeScopeOf } from '@/lib/reading-mode/scope';
import { readingModeStore } from '@/lib/reading-mode/store';
import { useLongPress } from '@/lib/view/long-press';
import { useExitMotion } from '@/lib/view/exit-presence';
import { requestDeparture } from '@/lib/conversation-departure';
import { useSpeaksAsGuest } from '@/lib/view/guest-focus';
import type { AuthorStoryRing } from '@/lib/view/author-story-ring';
import { conversationAvatarDoor } from '@/lib/view/thread-header-offer';
import { currentInterfaceLanguage, interfaceLanguageOf } from '@/lib/interface-language';
import { avatarOf, initialsOf, isGroup, peerOf, presenceKeyOf, titleOf } from '@/lib/view/conversation';
import { servedRingOf, useRingDesign } from '@/lib/profile-decor/author-ring';
import { usePresence } from '@/lib/view/use-presence';
import { useConversationPreview } from '@/lib/view/use-conversation-preview';
import { navigate, useIsCurrentPath } from '@/lib/router';
import { Link, href } from '@/routes/route-table';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import { LensJoinCallButton, LensPreviewLine } from './lens-preview-line';
import { LensTime } from './lens-time';
import { UnreadBadge } from './unread-badge';
import { ConversationStreakMark } from './conversation-streak-mark';
import { ConversationRowSwipeActions, useConversationRowSwipe } from './conversation-row-swipe';
import { preloadConversationPeek, RowActions } from './row-actions';

import '@/styles/lens-row-meta.css';

/**
 * LA LIGNE DE LA LENTILLE — plate, et c'est tout le sujet.
 *
 * Elle remplace la peau CARTE, retirée avec elle : plus de fond, plus de
 * liséré, plus de rayon. iOS ne dessine pas des cartes dans la Lentille, il
 * dessine un FLUX ; et un flux qui se lit à la perspective ne peut pas être
 * découpé en boîtes, parce que les boîtes rendent visible ce que la
 * perspective déplace.
 *
 * LA COTE QUI GOUVERNE TOUT : la hauteur de MISE EN PAGE est 84, TOUJOURS.
 *
 * C'est le critère binaire du porteur — « le flux ne bouge jamais au
 * défilement, ou on garde les cartes ». La magnification n'agrandit donc pas la
 * ligne : elle révèle un contenu qui était DÉJÀ là, transparent. Le conteneur
 * visuel mesure 100 en permanence, débordant de 8 au-dessus et de 8 en dessous
 * de sa case de 84 ; au repos son supplément est à `opacity: 0`, donc invisible
 * et non cliquable.
 *
 * Ce que cela achète : AUCUNE propriété de mise en page n'est jamais animée.
 * Ni `height`, ni `margin`, ni `padding`. Seuls `transform` et `opacity`
 * bougent — les deux que le compositeur sait animer sans repasser par la mise
 * en page. Une ligne qui grandirait vraiment pousserait ses voisines, et la
 * liste entière se recalculerait à chaque image de défilement.
 *
 * L'alternative — animer la hauteur et laisser le flux s'ouvrir — a un nom :
 * c'est ce que fait une liste ordinaire, et c'est ce que les cartes rendaient
 * acceptable. Le porteur a tranché l'inverse.
 */

/** La case de mise en page. Elle ne change JAMAIS. */
export const ROW_HEIGHT = 84;

/** Le conteneur visuel, qui déborde de 8 de chaque côté. */
export const VISUAL_HEIGHT = 100;
const OVERHANG = (VISUAL_HEIGHT - ROW_HEIGHT) / 2;

export type RowState = {
  /** Élue par la bande de focus : elle montre son supplément. */
  readonly magnified: boolean;
  /** De la courbe de perspective — jamais calculée ici. */
  readonly alpha: number;
  readonly scale: number;
  /**
   * La RESPIRATION : les voisines immédiates de la magnifiée s'écartent de 8,
   * par translation. C'est ce qui donne à la magnifiée la place que sa case ne
   * lui donne pas — et c'est une translation, donc toujours pas de mise en page.
   */
  readonly breathing: number;
};

const AT_REST: RowState = { magnified: false, alpha: 1, scale: 1, breathing: 0 };

export type LensRowProps = {
  conversation: Conversation;
  languages: readonly string[];
  viewerId: string;
  status?: RowState;
  /** Flags EFFECTIFS (wire fusionné à l'override du store, `@/lib/conversation-store`). */
  flags: ConversationFlags;
  /** Compte non-lu EFFECTIF — `effectiveUnreadOf(conversation, overrides)`. */
  unreadCount: number;
  /**
   * `(conversationId, id) => void` — jamais `(id) => void` fermé sur
   * `conversation` (#5694, cinquième point) : un callback RECRÉÉ à chaque
   * rendu de l'écran casserait `memo` en aval pour TOUTES les rangées, quel
   * que soit le soin mis à comparer le reste. `routes/conversations.tsx`
   * passe désormais une fonction MODULE-LEVEL, stable par construction —
   * cette rangée n'a plus besoin de fermer sur rien pour agir.
   */
  onRowAction: (conversationId: string, id: RowFlagActionId) => void;
  /**
   * OUVRE LA FICHE D'UNE CONVERSATION NON DIRECTE (#10300) — toucher l'avatar
   * d'un groupe, d'une publique, de la globale ou d'une communauté ouvre ses
   * détails, comme l'avatar d'un direct ouvre le profil du pair. Même
   * discipline que `onRowAction` : une fonction STABLE qui reçoit l'id.
   * Absente, l'avatar garde le chemin du fil.
   */
  onOpenDetails?: ((conversationId: string) => void) | undefined;
  /**
   * LES ENTRÉES D'iOS DU MENU (#10593) — Renommer, Bloquer/Débloquer, Favori,
   * Déplacer vers… : la ligne NOMME le geste, l'écran l'exécute (fenêtres,
   * confirmation, store). Même discipline que `onRowAction` : une fonction
   * STABLE qui reçoit l'id. Absente (un visiteur sans compte), le menu n'a
   * pas ces entrées.
   */
  onRowIntent?: ((conversationId: string, intent: RowIntent) => void) | undefined;
  /** Le pair d'un direct est-il bloqué par le lecteur — `undefined` : pas de
   * pair à compte (groupe, invité), aucune entrée de blocage. */
  peerBlocked?: boolean | undefined;
  /** Les catégories du lecteur, dans son ordre — le sous-menu « Déplacer vers… ». */
  categories?: readonly { readonly id: string; readonly name: string }[] | undefined;
  /**
   * QUI ÉCRIT DANS CETTE CONVERSATION, MAINTENANT (#5793, #7547) — les noms
   * des frappeurs vivants qui ne sont pas le lecteur, distribués par l'écran
   * (`useTypistNames`, `lib/api/use-typists.ts`) : une rangée est rendue dans un
   * `.map`, elle ne peut pas s'abonner elle-même.
   *
   * `undefined` ⇒ personne n'écrit : la ligne 2 retombe sur sa précédence
   * normale, et rien n'est inventé. Deux effets, ceux d'iOS :
   *  - la ligne 2 devient « X écrit… », « X et Y écrivent… » (le composeur
   *    partagé met la frappe en tête de la précédence, après l'appel en cours) ;
   *  - la présence est FORCÉE en ligne, au niveau du RANG et jamais dans
   *    l'avatar (`LentilleConversationRow.swift:125-127`) — la frappe EST une
   *    preuve d'activité (`CLAUDE.md` § « User Presence » : « une personne qui
   *    écrit est TOUJOURS verte »).
   */
  typists?: readonly string[] | undefined;
  /**
   * LE PAIR A CETTE CONVERSATION OUVERTE (#8892) — distribué par l'écran
   * (`useHerePeers`) comme `typists`. Prime sur la frappe : sa pastille passe
   * à la couleur primaire Meeshy.
   */
  peerHere?: boolean | undefined;
  /** … et il y regarde, écoute ou agit en ce moment : le point pulse (#9061). */
  peerActive?: boolean | undefined;
  /** … ou il regarde en plein écran un élément de la conversation : le point
   * pulse, son mood se fige (#9065). */
  peerFocused?: boolean | undefined;
  /** Le mood courant du pair d'un direct (#9065, `use-author-moods.ts`) — il
   * masque le point et se cerne de la présence. */
  peerMood?: string | undefined;
  /** Le post de ce mood — ce que l'avatar compte quand il le montre (#10483). */
  peerMoodPostId?: string | undefined;
  /**
   * L'ANNEAU DES STORIES DU PAIR D'UN DIRECT (#10598) — lu par l'écran dans le
   * corpus du rail (`authorStoryRing`, aucune requête de plus), miroir de
   * `LentilleConversationRow.storyRingState`. Non vue, l'avatar ouvre la story
   * (`identityTarget`) ; vue, il garde le profil. Un groupe l'ignore.
   */
  peerStoryRing?: AuthorStoryRing | undefined;
  /**
   * « N (M) 🔥 » (#8906) — l'état d'engagement EFFECTIF de la conversation pour
   * le lecteur (servi + direct, `effectiveEngagementOf`), distribué par
   * l'écran. Rendu à côté de l'heure, hors de la rangée ÉLUE, et comme elle
   * seulement au défilement (#9570).
   */
  engagement?: ConversationEngagementSnapshot | undefined;
  /** Langue de CADRAGE des libellés — l'interface par défaut ; injectable pour les témoins. */
  interfaceLanguage?: string | undefined;
  /** Horloge injectable — jamais `Date.now()` lu dans un témoin. */
  now?: (() => number) | undefined;
};

/** Le rôle de plateforme que la passerelle a servi, lu sans s'abonner : `null` tant qu'il ne l'a pas été. */
const servedPlatformRole = (): string | null => appQueryClient.getQueryData<AdminIdentity>(ADMIN_PERMISSIONS_QUERY_KEY)?.role ?? null;

type RowPointerHandler = (event: ReactPointerEvent<HTMLLIElement>) => void;
type RowSwipeProps = ReturnType<typeof useConversationRowSwipe>['rowProps'];
type RowPressProps = ReturnType<typeof useLongPress>;

/**
 * LE BALAYAGE ET L'APPUI LONG SUR LA MÊME LIGNE — chaque geste de pointeur
 * passe aux deux, et l'appui précharge l'aperçu pendant ses 350 ms. Les
 * gestionnaires des deux hooks sont stables : la composition l'est aussi.
 */
const both =
  (first: RowPointerHandler, second: RowPointerHandler): RowPointerHandler =>
  (event) => {
    if (!startsInRow(event)) return;
    first(event);
    second(event);
  };

/**
 * UN GESTE NÉ DANS LE PORTAIL N'EST PAS UN GESTE DE LA LIGNE (revue #11211) —
 * React fait remonter les événements par l'ARBRE des composants : le voile, la
 * carte et les entrées de l'aperçu, rendus dans `document.body`, atteignent le
 * `<li>`. Sans ce filtre, toucher le voile relançait le minuteur de la ligne,
 * et l'aperçu se rouvrait 350 ms après s'être refermé.
 */
const startsInRow = (event: ReactPointerEvent<HTMLLIElement>): boolean =>
  event.target instanceof Node && event.currentTarget.contains(event.target);

function useRowGestures(swipe: RowSwipeProps, press: RowPressProps) {
  const { ref, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture } = swipe;
  return useMemo(
    () => ({
      ref,
      onClickCapture,
      onPointerDown: both(onPointerDown, (event) => {
        press.onPointerDown(event);
        if (event.button === 0) preloadConversationPeek();
      }),
      onPointerMove: both(onPointerMove, press.onPointerMove),
      onPointerUp: both(onPointerUp, press.onPointerUp),
      onPointerCancel: both(onPointerCancel, press.onPointerCancel),
    }),
    [ref, onClickCapture, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, press],
  );
}

function LensRowImpl({
  conversation,
  languages,
  viewerId,
  status = AT_REST,
  flags,
  unreadCount,
  onRowAction,
  onOpenDetails,
  onRowIntent,
  peerBlocked,
  categories,
  typists,
  peerHere = false,
  peerActive = false,
  peerFocused = false,
  peerMood,
  peerMoodPostId,
  peerStoryRing,
  engagement,
  interfaceLanguage,
  now,
}: LensRowProps) {
  const unread = unreadCount > 0;
  /* LA CONVERSATION OUVERTE À CÔTÉ (#10073) — sur grand écran, la liste reste
     montée à gauche du fil : sa rangée se marque. Un booléen observé, pas
     l'adresse — seules les deux rangées dont la réponse change re-rendent. */
  const active = useIsCurrentPath(href('thread', { conversation: conversation.id }));
  /**
   * LE FONDU DE SOURDINE NE PORTE QUE SUR LE CHROME — #5559 défauts 1/8
   * (contraste). Il vivait sur le `<li>` ENTIER (`opacity: MUTED_OPACITY`) :
   * `MUTED_OPACITY` (0.55, dérivée de `LentilleMetrics.swift:303`, D-4) se
   * COMPOSE alors avec l'encre de TOUT ce que la rangée peint, titre et
   * aperçu compris — mesuré 3,74:1 (titre) et 2,80:1 (aperçu) en schéma
   * clair, 5,71:1 et 3,63:1 en schéma sombre : sous le plancher AA (4,5:1)
   * dans les deux cas, et l'aperçu EST le dernier message, jamais un
   * contenu décoratif. `MUTED_OPACITY` reste exacte (`check-curve.mjs` la
   * garde octet pour octet contre sa source Swift) — ce qui bouge est OÙ
   * elle s'applique : l'avatar, l'heure, les puces et le supplément portent
   * le fondu ; le titre et l'aperçu gardent leur encre PLEINE, au même
   * contraste que toute rangée non muette. `--color-ios-ink-2` plafonnait
   * lui-même à ~3,0:1 en schéma clair (dette de palette, #5625) — la
   * variante CLAIRE de `MeeshyColors.textSecondary` a été relevée au cran
   * minimal AA (`indigo700.opacity(0.8)`, méthode D-18), donc ce qui reste
   * PLEIN se lit désormais réellement au-dessus de 4,5:1 — vérifié par
   * `checkRowInkMeetsAA` dans `check-list-actions.mjs` (#5559
   * revue-correction, défaut 1 bis), pas seulement par l'opacité CSS. Une
   * sourdine reste une conversation qu'on LIT.
   */
  const chromeFade = flags.isMuted ? MUTED_OPACITY : 1;
  const group = isGroup(conversation);
  const title = titleOf(conversation, viewerId);
  const photo = avatarOf(conversation, viewerId);
  /**
   * LE PSEUDO DU PAIR (#7241) — dérivé ICI, à côté de `photo` et pour la même
   * raison : `peerOf` ne rend l'autre que sur un DIRECT (§ doc-comment), donc
   * un GROUPE n'a pas de personne à ouvrir, et un participant ANONYME n'a pas
   * de compte (`Participant.user` absent). `identityTarget` range ces deux
   * absences sous la même cible nulle ; on la calcule une fois plutôt que de
   * la redemander dans le rendu.
   */
  const peerHandle = ((): string | undefined => {
    const handle = peerOf(conversation, viewerId)?.user?.username;
    return typeof handle === 'string' && handle !== '' ? handle : undefined;
  })();
  /* LE CONTOUR DU PAIR (#10713) — servi avec le participant, additif : sans lui, l'avatar d'avant. */
  const peerRing = useRingDesign(servedRingOf(peerOf(conversation, viewerId)));
  /* LE COMPTE DU PAIR, pour que l'appel lancé d'ici peigne sa présence servie (#10956). */
  const callPeerKey = group ? null : (presenceKeyOf(peerOf(conversation, viewerId)) ?? null);
  useColorScheme();
  const accent = accentOf(conversation);
  const guest = useSpeaksAsGuest();
  const avatarDoor = conversationAvatarDoor({
    group,
    guest,
    peerUsername: peerHandle,
    detailsAvailable: onOpenDetails !== undefined,
  });
  const at = conversation.lastMessageAt ?? conversation.lastMessage?.createdAt;
  const liveCall = (conversation as ListConversation).activeCall ?? null;
  /* UN COMPTE (#7285, #10593) — supprimer pour soi, favori et catégorie. Il ne
     décide plus de l'appel (#11211) : la loi partagée le juge sur le rôle,
     comme `ThreadCallButton` (`canStartCall`). */
  const account = useStore(sessionStore, (state) => state.session.status === 'authenticated') || apiConfig.source === 'fixtures';
  /* LE FAVORI ET LA CATÉGORIE (#10593) — lus sur la conversation EFFECTIVE
     (`withPreferenceOverrides`) : le geste se voit à l'instant. */
  const favorite = reactionOf(conversation);
  const menuMore: RowMenuMore | undefined =
    onRowIntent === undefined
      ? undefined
      : {
          details: onOpenDetails !== undefined,
          rename: group,
          organize: account,
          favorite,
          block: group || peerBlocked === undefined ? null : peerBlocked ? 'unblock' : 'block',
        };
  /* LES VERDICTS DU RÔLE (#11211), lus à l'ouverture du menu : le rôle de
     plateforme servi (`GET /me`, déjà en cache dès qu'un écran l'a demandé). */
  const actionsOf = () =>
    rowConversationActions({ conversation, viewer: { id: viewerId, hasAccount: account, isAnonymous: guest, platformRole: servedPlatformRole() } });
  const openDetailsOn = (focus: RowDetailsFocus) =>
    onRowIntent === undefined ? onOpenDetails?.(conversation.id) : onRowIntent(conversation.id, { kind: 'details', focus });
  /* LES DEUX PORTES DU FIL (#11226) — la recherche ouvre le fil sur elle, le
     mode de lecture s'écrit dans le magasin que le fil lit à l'ouverture,
     sous le scope du lecteur. */
  const readingScope = readingModeScopeOf({ id: viewerId === '' ? null : viewerId });
  const readingModeOf = () =>
    import('@/lib/view/row-reading-mode').then(({ rowReadingModeMenu }) =>
      rowReadingModeMenu({ conversation, isAnonymous: guest, sticky: readingModeStore.getPreference(readingScope, conversation.id), language: currentInterfaceLanguage() }),
    );
  const onChoice = (choice: RowSubmenuChoice) => {
    if (choice.kind === 'readingMode') return readingModeStore.setPreference(readingScope, conversation.id, choice.mode);
    onRowIntent?.(conversation.id, choice);
  };
  const onAction = (id: RowActionId) => {
    if (id === 'search') return navigate(href('thread', { conversation: conversation.id }, { [THREAD_SEARCH_PARAM]: '1' }));
    if (id === 'delete' || id === 'leave') return requestDeparture({ conversationId: conversation.id, kind: id, returnToList: false });
    if (id === 'invite' || id === 'manageMembers') return openDetailsOn(id === 'invite' ? 'invite' : 'members');
    if (id === 'details') return onOpenDetails?.(conversation.id);
    if (id === 'adminOpen') return navigate(href('adminConversation', { conversation: conversation.id }));
    if (id === 'rename') return onRowIntent?.(conversation.id, { kind: 'rename' });
    if (id === 'block') return onRowIntent?.(conversation.id, { kind: 'block', intent: peerBlocked === true ? 'unblock' : 'block' });
    if (isRowFlagAction(id)) return onRowAction(conversation.id, id);
    if (!isRowCallAction(id)) return undefined;
    callActions.start({ conversationId: conversation.id, media: id === 'callVideo' ? 'video' : 'audio', title, avatar: photo ?? null, isGroup: group, peerKey: callPeerKey });
  };

  /* LE BALAYAGE DE LA LIGNE (#10580) — les actions du menu, rangées par bord.
     Elles ne se calculent qu'au toucher et tant qu'un bord est montré. */
  const swipeSides = () =>
    conversationRowSwipeSides({ flags, unread, language: currentInterfaceLanguage(), canDelete: account });
  const swipe = useConversationRowSwipe(swipeSides);
  /* ARCHIVÉE OU SUPPRIMÉE, LA LIGNE SE REPLIE AVANT DE PARTIR (#11574) — quand
     l'`ExitPresence` de la liste la déclare sortante. */
  useExitMotion(swipe.rowProps.ref);
  /* L'APPUI LONG OUVRE L'APERÇU (#11211) — `useLongPress`, sur la ligne
     entière, à côté du balayage : un doigt qui bouge de plus de 6 px annule
     l'appui avant que le balayage ne s'engage. Seuls ses gestes de POINTEUR
     sont posés ici ; le clic droit et la touche menu sont écoutés par
     `RowActions`, qui ouvre la même grappe. */
  const peekOpener = useRef<(() => boolean) | null>(null);
  const press = useLongPress({ onOpen: () => peekOpener.current?.() ?? false });
  const rowGestures = useRowGestures(swipe.rowProps, press);
  /* LE PARCOURS AU CLAVIER (#11227) — un arrêt de tabulation par rangée, son
     lien vers le fil ; les flèches pour le reste (`useRowRoving`). */
  const roving = useRowRoving(conversation.id);

  /**
   * LA CLASSE DE TRONCATURE DE L'APERÇU — `truncate` au repos (une ligne,
   * point de suspension), `line-clamp-2` magnifié (deux lignes, point de
   * suspension). Les deux n'opèrent que sur un BLOC : voir le commentaire de
   * `data-line2` plus bas.
   */
  const previewText = status.magnified ? 'line-clamp-2' : 'truncate';
  const language = interfaceLanguage ?? currentInterfaceLanguage();
  const labelLanguage = (interfaceLanguage ? interfaceLanguageOf(interfaceLanguage) : null) ?? currentInterfaceLanguage();
  const preview = useConversationPreview({
    conversation,
    viewerId,
    languages,
    typists,
    interfaceLanguage: language,
    now,
  });
  const typing = typists !== undefined && typists.length > 0;
  /* LA PRÉSENCE VIVANTE DU PAIR (#10571) : la rangée mémoïsée se repeint seule
     quand SA pastille change — un `user:status`, ou un seuil 1/3/5 franchi. */
  const peerPresence = usePresence(group ? undefined : peerOf(conversation, viewerId), now === undefined ? undefined : { now });
  const peerSignals = group
    ? {}
    : {
        presence: typing ? ('online' as const) : peerPresence,
        here: peerHere,
        hereActive: peerActive,
        hereFocused: peerFocused,
        /* LE CONTOUR DU PAIR (#10713, #10946) — sur les TROIS portes de l'avatar, pas seulement celle du profil. */
        ...(peerRing === null ? {} : { ring: peerRing }),
        /* DANS LA LISTE, L'HUMEUR NE BOUGE PAS (#10528). */
        ...(peerMood === undefined
          ? {}
          : { mood: peerMood, moodStill: true, ...(peerMoodPostId === undefined ? {} : { moodPostId: peerMoodPostId }) }),
      };
  /* … ET ELLE SE TOUCHE, sur l'avatar qui porte déjà le profil du pair : la
     cible est le frère de ce lien-là (`Avatar.moodAuthorId`). */
  const moodPeer = group || peerMood === undefined ? undefined : peerOf(conversation, viewerId);
  const peerMoodAuthor = moodPeer?.userId ?? moodPeer?.user?.id ?? undefined;

  return (
    <li
      data-row={conversation.id}
      /**
       * `group` : ancre `RowActions` (second enfant, ci-dessous) pour
       * `group-hover`/`group-focus-within` — le bouton d'actions ne reste
       * visible SANS survol que sur la rangée magnifiée.
       */
      className="group"
      {...rowGestures}
      onFocus={roving.onFocus}
      onKeyDown={roving.onKeyDown}
      {...(swipe.shown === null ? {} : { 'data-row-swipe': swipe.shown.phase })}
      /**
       * `flexShrink: 0` n'est pas une précaution : la liste est un conteneur
       * flex, et un élément flex de hauteur fixe est COMPRIMÉ dès que la somme
       * dépasse la place. Mesuré sans lui : des cases de 31 px au lieu de 84 —
       * et comme la compression est uniforme, la perspective continuait de
       * s'appliquer, donc rien n'avait l'air cassé à l'œil. C'est le témoin de
       * mise en page qui l'a vu.
       *
       * Le fondu de sourdine ne vit PLUS ici (#5559 défauts 1/8 — voir
       * `chromeFade` ci-dessus) : il est descendu sur les éléments de CHROME
       * eux-mêmes (aucun d'eux n'est le `firstElementChild` que `useScene`
       * réécrit à CHAQUE image, `scene.ts:104-108` — ce sont tous des
       * PETITS-ENFANTS du `<li>`, jamais son premier enfant direct, donc rien
       * n'entre en conflit avec la passe de perspective).
       */
      style={{ height: ROW_HEIGHT, flexShrink: 0, position: 'relative', touchAction: 'pan-y' }}
    >
      {/*
        **L'ENVELOPPE N'EST PLUS UN LIEN** (#7241, directive porteur du
        2026-09-21 : « même comportement quand on touche un pseudo ou un
        avatar »). Un `<a>` ne peut pas en contenir un autre, et l'avatar doit
        désormais porter sa propre destination — la rangée ENTIÈRE ne pouvait
        donc plus être le lien vers le fil. Le lien descend d'un cran, sur la
        COLONNE DE TEXTE ; l'avatar devient son frère.

        C'est l'arbitrage d'iOS, pas une invention de ce lot :
        `LentilleConversationRow.swift:843` pose
        `onTap: isDirect ? onViewProfile : onViewConversationInfo` — sur un
        DIRECT, toucher l'avatar ouvre la FICHE de l'autre ; ailleurs, il
        continue d'ouvrir la conversation. La rangée garde son geste dominant
        (le fil) sur toute la surface du texte, qui en est l'essentiel.
      */}
      <div
        /*
         * `pe-12` (48px) et non `px-3` des deux côtés : `RowActions`
         * (frère ci-dessous, `position: absolute`, ancré `right-2` sur le
         * `<li>`) couvrait sinon l'heure/le badge de non-lus — mesuré à la
         * capture (#5559 revue). La cote se DÉDUIT du bouton : 8 (droite)
         * + 34 (dessin) + 5 (débord tactile de `tap-target-34`) = 47, donc 48
         * laisse un pixel de marge et le débord ne mord JAMAIS sur le badge,
         * dont il volerait le clic. La réserve est CONSTANTE plutôt que
         * conditionnée à `status.magnified` : le bouton se révèle aussi au
         * survol et au focus clavier d'une rangée NON magnifiée, et une
         * réserve qui apparaîtrait/disparaîtrait décalerait le texte sous le
         * pointeur — un mouvement que rien ne justifie ici.
         */
        className="lens-row absolute inset-x-0 flex items-center gap-3 ps-3 pe-12"
        {...(active ? { 'data-active': '' } : {})}
        style={withAccent(accent, {
          top: -OVERHANG,
          height: VISUAL_HEIGHT,
          /**
           * L'ORIGINE DE LA TRANSFORMATION est à 16 % de la largeur, sur
           * l'avatar — pas au centre. Une échelle centrée ferait glisser les
           * titres horizontalement au défilement ; ancrée sur l'avatar, la
           * colonne de texte reste alignée d'une ligne à l'autre.
           */
          transformOrigin: '16% 50%',
          transform: `translateY(${status.breathing}px) scale(${status.scale})`,
          opacity: status.alpha,
        })}
      >
        {/* LA FRAPPE FORCE LA PRÉSENCE EN LIGNE, au niveau du RANG et jamais
            dans l'avatar (`LentilleConversationRow.swift:125-127`) : une
            personne qui écrit est TOUJOURS verte (`CLAUDE.md` § « User
            Presence »), quel que soit ce que le serveur a servi — un
            `lastActiveAt` périmé de trois minutes ne peut pas contredire une
            frappe reçue à l'instant. Le forçage est LOCAL et ne fabrique aucune
            donnée : il ne vaut que tant que le magasin de frappe a une entrée
            vivante. */}
        {/* LA PHOTO PAR `avatarOf` (#6975) — le pair d'un direct, la
            conversation elle-même pour un groupe, via la loi PARTAGÉE
            `resolveParticipantAvatar`. Cette rangée appelait déjà
            `peerOf(...)` juste en dessous pour la PRÉSENCE : la donnée était
            là, sur la même ligne, et la photo n'était pas servie. */}
        {/* LE PSEUDO DU PAIR, quand il y en a un : `peerOf` ne rend l'autre
            que sur un DIRECT, et un participant ANONYME n'a pas de compte —
            `identityTarget` range les deux cas sous la même absence de cible,
            et l'avatar ne paraît alors pas tapable (loi 4). */}
        {avatarDoor.kind === 'details' && onOpenDetails !== undefined ? (
          /* LA FICHE DE LA CONVERSATION (#10300) — l'avatar d'une conversation
             non directe ouvre ses détails, comme celui d'un direct ouvre le
             profil. Ce n'est plus un doublon du lien du texte : c'est une
             autre porte, donc un bouton nommé, dans le parcours clavier. */
          <button
            type="button"
            onClick={() => onOpenDetails(conversation.id)}
            tabIndex={-1}
            aria-haspopup="dialog"
            aria-label={translate(currentInterfaceLanguage(), 'a11y.avatar.conversation', { name: title })}
            data-lens-avatar-door
            className="flex shrink-0 rounded-full"
          >
            <Avatar
              initials={initialsOf(title)}
              color={accent}
              size={44}
              opacity={chromeFade}
              {...(photo === undefined ? {} : { src: photo })}
              {...peerSignals}
            />
          </button>
        ) : peerHandle === undefined ? (
          /* GROUPE (ou pair sans compte) : l'avatar garde EXACTEMENT le geste
             d'avant — il ouvre le fil. Le lien est un DOUBLON de celui du
             texte, donc il sort de l'ordre de lecture et du parcours clavier :
             deux liens de même nom à la file se lisent deux fois. */
          <Link
            to="thread"
            params={{ conversation: conversation.id }}
            className="flex shrink-0"
            aria-hidden
            tabIndex={-1}
          >
            <Avatar
              initials={initialsOf(title)}
              color={accent}
              size={44}
              name={title}
              opacity={chromeFade}
              {...(photo === undefined ? {} : { src: photo })}
              {...peerSignals}
            />
          </Link>
        ) : (
          <Avatar
            initials={initialsOf(title)}
            color={accent}
            size={44}
            name={title}
            opacity={chromeFade}
            profileUsername={peerHandle}
            outOfTabOrder
            {...(photo === undefined ? {} : { src: photo })}
            {...peerSignals}
            {...(group || peerStoryRing === undefined ? {} : { storyRing: peerStoryRing })}
            {...(peerMoodAuthor === undefined ? {} : { moodAuthorId: peerMoodAuthor })}
          />
        )}

        <Link
          to="thread"
          params={{ conversation: conversation.id }}
          className="flex min-w-0 flex-1 flex-col justify-center"
          data-row-primary=""
          tabIndex={roving.tabIndex}
          {...(active ? { 'aria-current': 'page' as const } : {})}
        >
          {/*
            LE SUPPLÉMENT, premier volet : la catégorie et les étiquettes. Il est
            RENDU en permanence et masqué par l'opacité — le monter et le
            démonter ferait entrer et sortir des nœuds du document, donc une
            mise en page, donc exactement ce que la case de 84 protège.
            `aria-hidden` et `pointer-events` suivent l'opacité : un contenu
            invisible ne doit être ni lu ni cliquable.
          */}
          <span
            className="lens-extra flex items-center gap-1.5 overflow-hidden"
            aria-hidden={!status.magnified}
            style={{
              height: status.magnified ? 16 : 0,
              opacity: status.magnified ? chromeFade : 0,
              pointerEvents: status.magnified ? undefined : 'none',
            }}
          >
            <span
              className="rounded-chip px-1.5 text-check font-semibold whitespace-nowrap"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
            >
              {translate(currentInterfaceLanguage(), group ? 'list.row.group' : 'list.row.direct')}
            </span>
            {flags.isArchived ? (
              <Glyph name="archive" size={12} title={translate(currentInterfaceLanguage(), 'list.row.archived')} style={{ color: 'var(--color-ios-ink-3)' }} />
            ) : null}
          </span>

          {/* `items-center`, PLUS `items-baseline` (#6080) : la ligne porte
              maintenant une capsule de 24 px de haut à côté d'un texte de 15 —
              alignées sur la LIGNE DE BASE, la capsule pendait sous le nom.
              iOS aligne son `HStack` au centre (`line1`, alignement par
              défaut). */}
          <span className="flex items-center gap-2">
            {/*
              LA HIÉRARCHIE TYPOGRAPHIQUE (#5694, écart 1) — `LentilleMetrics.
              Name.size` = `MeeshyFont.bodySize` (15), poids `.heavy` (800 CSS)
              CONSTANT : le poids ne dépend PAS du non-lu
              (`LentilleConversationRow.swift:283-367`, `Name.font` fixe) —
              c'est le badge de non-lus qui porte la nouvelle, jamais un
              nom plus ou moins gras. `text-bubble` (15px) et
              `font-extrabold` (800) sont des jetons DÉRIVÉS
              (`packages/design-tokens/ios.css`, `check:tokens`) et un poids
              STANDARD Tailwind — aucun littéral écrit ici (D-4). `data-name`
              est le crochet STABLE des gates (`check-curve.mjs`,
              `check-list-actions.mjs`), jamais une classe de taille appelée
              à changer (leçon 548).
            */}
            <span
              data-name
              className="min-w-0 flex-1 truncate text-bubble font-extrabold"
              style={{ color: 'var(--color-ios-ink)' }}
            >
              {title}
            </span>
            {/*
              L'ÉPINGLE SE VOIT SUR LA RANGÉE, toujours — pas seulement dans le
              supplément magnifié. iOS n'a pas besoin de ce glyphe : il range
              les épinglées dans une SECTION nommée « Épingles », qui porte
              l'information à elle seule (`ConversationListView.handleDrop`).
              La v3.1 a troqué les sections contre des chips de filtre (§1.5 de
              la spécification), et rien ne restait alors pour DIRE l'épinglage
              : « Épingler » une conversation déjà en tête ne changeait
              STRICTEMENT rien à l'écran — un contrôle dont l'effet n'est pas
              observable, ce que la charte compte comme inerte.

              `title` en fait aussi le nom accessible du glyphe (`Glyph`), donc
              un lecteur d'écran annonce l'épinglage que l'œil voit — la
              parité avec le libellé VoiceOver d'iOS
              (`ThemedConversationRow.swift:296-300`, qui annonce épinglage ET
              sourdine).
            */}
            {/* LE FAVORI (#10593) — l'emoji posé par le lecteur, à côté du nom,
                comme le filtre « Favoris » le retient ; le lecteur d'écran
                l'entend nommé. */}
            {favorite === undefined ? null : (
              <span
                data-favorite
                role="img"
                aria-label={`${rowMenuText(currentInterfaceLanguage(), 'rowMenu.favorite')} ${favorite}`}
                className="shrink-0 text-title leading-none"
                style={{ opacity: chromeFade }}
              >
                {favorite}
              </span>
            )}
            {flags.isPinned ? (
              <Glyph name="pushPin" size={12} title={translate(currentInterfaceLanguage(), 'list.row.pinned')} style={{ color: 'var(--color-ios-ink-3)', opacity: chromeFade }} />
            ) : null}
            {/* LA SOURDINE SE VOIT (#10598) — la cloche barrée après le nom,
                miroir du 🔕 d'iOS (`LentilleConversationRow.swift:262`) : le
                fondu du chrome seul ne se lisait pas. Le glyphe porte le mot,
                pour le lecteur d'écran. */}
            {flags.isMuted ? (
              <span data-muted className="flex shrink-0" style={{ opacity: chromeFade }}>
                <Glyph name="bellSlash" size={12} title={rowMenuText(currentInterfaceLanguage(), 'listRow.muted')} style={{ color: 'var(--color-ios-ink-3)' }} />
              </span>
            ) : null}
            {/*
              LA PILE DE NON-LUS FINIT LA LIGNE DU NOM (#6080) — et l'HEURE a
              quitté cette ligne.

              C'est la composition iOS, énoncée par la cote elle-même
              (`LentilleMetrics.Row.height`, 64 → 84 le 2026-08-22) : « la
              rangée porte TROIS lignes — nom (avec la pile de non-lus en fin
              de ligne), "auteur : message", puis la date seule à droite ».
              `LentilleConversationRow.line1` pose `Spacer(minLength: 0)` puis
              `UnreadCountBadge` ; `dateLine`, deux lignes plus bas, pousse
              l'horodatage à droite et RIEN d'autre.

              Ce que la v3.1 faisait à la place : l'heure en fin de ligne de
              nom, et la pastille dans une colonne à part, centrée sur toute la
              hauteur. Les deux repères de DROITE étaient donc portés par deux
              colonnes différentes, et le bord droit de l'heure se déplaçait
              selon que la rangée avait une pastille ou non — mesuré à la
              capture : « 1h » de la section Épingles finissait 68 px plus à
              droite que le « 1 min » de la rangée suivante. Rien ne
              s'alignait, parce que rien n'avait de colonne.
            */}
            <UnreadBadge count={unreadCount} opacity={chromeFade} />
          </span>

          {/*
            L'APERÇU (`list.line2`, #5694 écart 1). Au repos une ligne,
            magnifié deux — et c'est `line-clamp` qui change, pas la hauteur
            du conteneur : la deuxième ligne occupe une place déjà réservée
            par le conteneur visuel de 100. `text-title` (13px = `MeeshyFont.
            subheadSize`, poids RÉGULIER — `LentilleMetrics.Line2`) est le
            jeton DÉRIVÉ ; `data-line2` le crochet stable des gates.

            UN FLUX DE TEXTE, PAS UNE RANGÉE FLEX (#5694 revue). En
            `display: flex`, `text-overflow: ellipsis` ne s'applique JAMAIS —
            les nœuds de texte y deviennent des éléments flex anonymes : la
            ligne se coupait NET au bord, sans point de suspension, là où la
            cible iOS en montre un (`targets/lentille.dark.png`). Pire une
            fois magnifiée : le nom de l'expéditeur et les deux lignes de
            l'aperçu formaient deux colonnes centrées l'une contre l'autre,
            la seconde ligne repartant au MILIEU de la rangée. iOS n'a
            qu'UN `Text` concaténé, et cette ligne en est le miroir : un bloc
            de texte, le glyphe posé `inline-block` dedans, `truncate` au
            repos et `line-clamp-2` magnifié — deux utilitaires qui, eux,
            opèrent sur un bloc.
          */}
          <span
            data-line2
            className={`block min-w-0 text-title ${previewText}`}
            style={{ color: 'var(--color-ios-ink-2)' }}
          >
            {/* LA LIGNE 2 EST CELLE DU COMPOSEUR PARTAGÉ (#7547) —
                `composeConversationPreview` (#7546) tranche la priorité (appel
                en cours, frappe, brouillon, réaction, dernier message), la
                nature, les détails, la protection et le Prisme ; le web la
                dessine (`LensPreviewLine`) et n'y compose RIEN. iOS rejoue le
                même fichier de cas (#7548). */}
            <LensPreviewLine
              preview={preview}
              interfaceLanguage={language}
              accent={accent}
              originalLanguage={conversation.lastMessageOriginalLanguage ?? conversation.lastMessage?.originalLanguage}
            />
          </span>

          {/*
            LA TROISIÈME LIGNE — `LentilleConversationRow.dateLine` : à gauche
            ce que la magnification AJOUTE (la date pleine, le compte de
            membres), à droite l'HEURE, seule, TOUJOURS.

            « La date a QUITTÉ [la ligne du nom] le 2026-08-22 : elle vit
            seule, en bas à droite (`dateLine`). Le nom possède donc toute la
            ligne » — le doc-comment d'iOS décrit exactement le défaut que
            cette ligne corrige : chez nous le nom cédait sa fin à l'heure,
            donc se tronquait plus tôt, et l'heure se déplaçait avec lui.

            La ligne est RENDUE en permanence — pas seulement magnifiée : c'est
            ce qui donne à l'heure une colonne fixe, dont le bord droit est
            celui de la rangée. Le supplément, lui, garde son fondu.
          */}
          <span className="flex items-center gap-2 overflow-hidden text-check">
            <span
              className="lens-extra flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
              aria-hidden={!status.magnified}
              style={{
                opacity: status.magnified ? chromeFade : 0,
                pointerEvents: status.magnified ? undefined : 'none',
                color: 'var(--color-ios-ink-3)',
              }}
            >
              <span>{rowDateLabel(at, labelLanguage)}</span>
              {group ? <span>· {memberCountLabel(conversation.memberCount, labelLanguage)}</span> : null}
            </span>
            {/*
              L'HEURE (#5694, écarts 1 et 8) — `LentilleMetrics.Time.size` = 12
              poids `.bold` (700), et `LentilleConversationRow.timestampColor`
              rend TOUJOURS l'encre TERTIAIRE (`:458-471` — « le timestamp
              rouge sur non-lu est supprimé ») : `LensTime` ne prend même pas
              de prop `unread`, la règle est structurelle. RELATIVE
              (`shortRelativeTime`), vivante à la minute (`minuteClock`), et
              fondue avec le reste du CHROME sous sourdine (`chromeFade`).
            */}
            {/*
              LA FEUILLE QUI S'EFFACE AU REPOS (#9570) — la marque de points
              puis l'heure ne paraissent que pendant le défilement (et une fois
              à l'ouverture), par `data-row-meta` posé sur le défileur hors
              React (`lib/view/lens-meta-reveal.ts`, `styles/lens-row-meta.css`).
              Opacité seule : la place reste réservée, le lecteur d'écran lit
              toujours les deux.
            */}
            <span className="lens-row-meta inline-flex shrink-0 items-center gap-2">
              {status.magnified ? null : <ConversationStreakMark snapshot={engagement} now={now} />}
              {at === undefined ? null : (
                <span style={{ opacity: chromeFade }}>
                  <LensTime at={at} />
                </span>
              )}
            </span>
          </span>
        </Link>
        {/* « REJOINDRE » (H4) — frère du lien, jamais dedans : voir `LensJoinCallButton`. */}
        {liveCall === null || !callsAvailable() ? null : (
          <LensJoinCallButton
            request={{ conversationId: conversation.id, callId: liveCall.id, media: liveCall.kind === 'video' ? 'video' : 'audio', title, avatar: photo ?? null, isGroup: group, peerKey: callPeerKey }}
            label={translate(currentInterfaceLanguage(), 'callJoin.named', { name: title })}
            text={translate(currentInterfaceLanguage(), 'callJoin.action')}
            onJoin={callActions.join}
            outOfTabOrder
          />
        )}
      </div>

      {/* LES ACTIONS BALAYÉES (#10580) — APRÈS le conteneur visuel, qui doit
          rester le premier enfant (la scène n'anime que lui), et montées
          seulement pendant le balayage ou l'ouverture. */}
      {swipe.shown === null ? null : (
        <ConversationRowSwipeActions
          shown={swipe.shown}
          held={swipe.held}
          sides={swipeSides()}
          label={translate(currentInterfaceLanguage(), 'rowActions.menu')}
          onAction={onAction}
          onClose={swipe.close}
        />
      )}

      <RowActions
        flags={flags}
        unread={unread}
        magnified={status.magnified}
        language={currentInterfaceLanguage()}
        canCall={callsAvailable()}
        canDelete={account}
        actionsOf={actionsOf}
        peek={{ conversation, viewerId, languages, isAnonymous: guest }}
        peekOpener={peekOpener}
        doors={{ search: true, readingMode: apiConfig.readingModesEnabled }}
        readingModeOf={readingModeOf}
        tabStop={false}
        {...(menuMore === undefined ? {} : { more: menuMore })}
        categoryId={categoryIdOf(conversation)}
        {...(categories === undefined ? {} : { categories })}
        onAction={onAction}
        onChoice={onChoice}
      />
    </li>
  );
}

/**
 * LE COMPARATEUR DE `memo` (#5694, cinquième point — directive 7) — écrit à
 * la MAIN plutôt que la comparaison superficielle par défaut de `memo`, pour
 * une raison précise : `flags` est un OBJET reconstruit à chaque rendu de
 * l'écran (`effectiveFlagsOf(...)`, `routes/conversations.tsx`) même quand
 * son CONTENU n'a pas changé — la comparaison par défaut (`Object.is` sur
 * chaque prop) verrait cette référence neuve et re-rendrait TOUTE rangée à
 * CHAQUE tick de scène ou d'horloge, exactement le défaut que ce lot ajoute
 * sinon : deux sources de re-rendu NEUVES (entrée/sortie de scène ; tick de
 * l'heure) sur un écran qui re-rendait déjà toutes ses rangées à chaque
 * élection.
 *
 * `conversation`, `languages` et `onRowAction` restent comparés par
 * RÉFÉRENCE — `CONVERSATIONS`, `READER_LANGUAGES` et la fonction MODULE-LEVEL
 * `handleRowAction` (`routes/conversations.tsx`) sont tous les trois des
 * identités STABLES d'un rendu à l'autre ; une référence qui change ICI est
 * un signal réel, pas du bruit.
 */
export function sameRowProps(prev: LensRowProps, next: LensRowProps): boolean {
  if (prev.conversation !== next.conversation) return false;
  if (prev.languages !== next.languages) return false;
  if (prev.viewerId !== next.viewerId) return false;
  if (prev.unreadCount !== next.unreadCount) return false;
  if (prev.onRowAction !== next.onRowAction) return false;
  if (prev.onOpenDetails !== next.onOpenDetails) return false;
  if (prev.onRowIntent !== next.onRowIntent || prev.peerBlocked !== next.peerBlocked || prev.categories !== next.categories) return false;
  /* `typists` (#5793, #7547) — comparés par VALEUR (les noms joints) : l'écran
     redistribue une carte d'identité neuve à chaque `typing:start`/`stop` de
     n'importe quelle conversation, et sans cette ligne la rangée concernée
     n'aurait PAS bougé (le reste de ses props étant identique) tandis que
     toutes les autres se seraient re-rendues pour rien. C'est ce que le
     doc-comment de `useTypistNames` promet de borner. */
  if ((prev.typists ?? []).join('\u0001') !== (next.typists ?? []).join('\u0001')) return false;
  if ((prev.peerHere ?? false) !== (next.peerHere ?? false)) return false;
  if ((prev.peerActive ?? false) !== (next.peerActive ?? false)) return false;
  if ((prev.peerFocused ?? false) !== (next.peerFocused ?? false)) return false;
  if (prev.peerMood !== next.peerMood) return false;
  if (prev.peerMoodPostId !== next.peerMoodPostId) return false;
  if (prev.peerStoryRing?.entryStoryId !== next.peerStoryRing?.entryStoryId || prev.peerStoryRing?.unseen !== next.peerStoryRing?.unseen) return false;
  /* L'instantané d'engagement (#8906) — comparé par RÉFÉRENCE : il vient du
     magasin ou de la charge, stables tant qu'aucun geste n'est crédité. */
  if (prev.engagement !== next.engagement) return false;
  if (prev.interfaceLanguage !== next.interfaceLanguage || prev.now !== next.now) return false;

  const s1 = prev.status ?? AT_REST;
  const s2 = next.status ?? AT_REST;
  if (s1.magnified !== s2.magnified || s1.alpha !== s2.alpha || s1.scale !== s2.scale || s1.breathing !== s2.breathing) {
    return false;
  }

  /**
   * Les drapeaux se comparent CLÉ PAR CLÉ, ÉNUMÉRÉES depuis l'objet — jamais
   * par une liste écrite à la main (revue #5694). Une liste manuelle est un
   * INVENTAIRE À TENIR À JOUR : le jour où `ConversationFlags` gagne un
   * quatrième drapeau, un comparateur qui n'en connaît que trois répond
   * « identiques » sur une rangée qui a changé — et la rangée ne se re-rend
   * PLUS, en silence, sans qu'aucun témoin ne rougisse. C'est la forme du
   * relais qui recopie champ par champ (`CLAUDE.md`, cycle 126).
   */
  const before = Object.keys(prev.flags) as (keyof ConversationFlags)[];
  const after = Object.keys(next.flags) as (keyof ConversationFlags)[];
  return before.length === after.length && before.every((key) => prev.flags[key] === next.flags[key]);
}

export const LensRow = memo(LensRowImpl, sameRowProps);
