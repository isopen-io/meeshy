import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from 'zustand/react';

/**
 * Feuille propre à cet écran (correction de revue #5648, défaut majeur 6) —
 * import STATIQUE mais placé ICI : `thread.tsx` n'est lui-même atteint que
 * par `import('@/routes/thread')` (`route-table.tsx`), donc Vite scinde
 * cette CSS dans le CHUNK du fil, jamais dans la feuille globale chargée
 * par `main.tsx` sur CHAQUE route. Voir le doc-comment du fichier.
 */
import '@/styles/thread-scene.css';
import '@/styles/thread-protection.css';
import '@/styles/thread-menu.css';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { Composer } from '@/components/composer';
import { MessageDetailSheet } from '@/components/message-detail-sheet';
import { MessageMenu } from '@/components/message-menu';
import { reactionEntries } from '@/components/message-blocks';
import { ReactionSheet } from '@/components/reaction-sheet';
import { SelectionToolbar } from '@/components/selection-toolbar';
import { ThreadHeader } from '@/components/thread-header';
import { ThreadError, ThreadRefused, ThreadSkeleton } from '@/components/thread-states';
import { apiConfig } from '@/lib/api/config';
import { recordViewOnceConsumption } from '@/lib/api/fixtures';
import { messagesQueryKey } from '@/lib/api/messages';
import { useConversationsSnapshot, useThreadData } from '@/lib/api/query';
import { applyConsumption } from '@/lib/api/view-once';
import type { Message } from '@/lib/api/types';
import { served } from '@/lib/api/prism';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { accentOf, withAccent } from '@/lib/accent';
import { isGroup, titleOf, unreadOf } from '@/lib/view/conversation';
import { useParams } from '@/lib/router';
import { mergeTimeline, place } from '@/lib/grouping';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useSend } from '@/lib/view/use-send';
import { useMessageMenu } from '@/lib/view/use-message-menu';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { translationChoices } from '@/lib/view/message-actions';
import { deliveryOf as deliveryStatusOf, isMineOf } from '@/lib/view/message';
import { useOnline } from '@/lib/net/online';
import { menuRows } from '@/lib/reading-mode/catalog';
import {
  resolveThreadMode,
  threadCapabilities,
  toStickyPreference,
  usesFlatRow,
} from '@/lib/reading-mode/decision';
import { readingModeStore } from '@/lib/reading-mode/store';
import { readingModeScopeOf } from '@/lib/reading-mode/scope';
import { useThreadScene } from '@/lib/reading-mode/scene';
import { sceneStyleVars } from '@/lib/reading-mode/metrics';
import { ThreadModes } from './thread-modes';

/**
 * LE FIL.
 *
 * L'en-tete FLOTTE au-dessus des messages (il n'y a aucune barre de navigation
 * systeme dans l'app iOS) et se REPLIE : au repos il ne montre que le retour,
 * la grappe d'actions et l'avatar ; taper l'avatar DEPLIE le titre et les
 * etiquettes. La bande depliee ne porte AUCUNE action — c'est un arbitrage
 * iOS explicite, et il tient : deux etats, deux roles.
 *
 * Le bouton de retour porte le compte de non-lus des AUTRES conversations.
 *
 * Depuis #5695, `<main>` rend soit la rangée plate/bulle (Focal/Script/
 * Bulles), soit le Résumé Vivant (`mode === 'summary'`) — le montage des
 * modes est extrait dans `ThreadModes` (`src/routes/thread-modes.tsx`,
 * #5878) : ce fichier reste sous le budget de taille pour la prochaine
 * surface (Rivière, D-21), qui s'ajoute LÀ, pas ici.
 */
export default function ThreadScreen() {
  const { conversation: id } = useParams<'/c/$conversation'>();

  /**
   * LA SOURCE (#5650, F2/F5/§5 étape 10) — `useThreadData(id)` compose
   * `useConversation`/`useMessages` (`lib/api/query.ts`) : `conversation`
   * peut être `undefined` (chargement, refus) — plus AUCUN repli sur une
   * autre conversation (F8, `thread.test.tsx` § id inconnu).
   */
  const threadData = useThreadData(id);
  const conversation = threadData.conversation;
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const online = useOnline();

  /**
   * QUI LIT (#5695, étape 9) — `resolveViewer` (`lib/api/viewer.ts`) remplace
   * les deux `isAnonymous: false` en dur qui précédaient : en source
   * `fixtures`, `viewer.id` égale l'identifiant du POC par construction
   * (inchangé, observable nulle part) ; en `gateway`, la session RÉELLE tranche.
   */
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiConfig.source, session }), [session]);

  /**
   * LE `Participant` DU LECTEUR DANS cette conversation (#5813, étape 8) —
   * calculé ICI, AVANT les retours anticipés (`useSend` en a besoin) : la
   * charge que `sender` exige sur un message ENVOYÉ (avatar, présence…).
   * `conversation` peut être `undefined` pendant `pending`/`refused`/`error`
   * (F8) — le résultat est alors `undefined`, sans conséquence tant que le
   * rendu final ne montre pas encore le fil réel.
   */
  const viewerParticipant = useMemo(
    () => conversation?.participants.find((p) => p.userId === viewer.id),
    [conversation, viewer.id],
  );

  /**
   * QUI ÉCRIT — DÉRIVÉ, jamais écrit en dur (revue #5815). L'indicateur
   * portait « AD » et « Amina écrit » en LITTÉRAL : le nom d'une FIXTURE
   * gravé dans un composant de production, que le jour du socket (#5494,
   * `query.ts:91`) aurait servi à tous les lecteurs pour tous leurs
   * correspondants — et le seul marqueur de fixture de `thread-*.js` qui ne
   * venait pas d'un import (`build-shells.mjs::auditShellBundle`).
   * Aucun typist connu ⇒ aucun indicateur : on n'invente pas de copie, la
   * forme iOS est « <Auteur> écrit » (`ConversationListViewModel.swift:966`).
   */
  const typist = useMemo(
    () => conversation?.participants.find((p) => p.userId !== viewer.id),
    [conversation, viewer.id],
  );

  /**
   * LA FENÊTRE COUVRE-T-ELLE TOUT LE NON-LU ? — `threadData.hasOlder` mime
   * `cursorPagination.hasMore` : c'est ce qui rend « Sur les N derniers
   * messages » (Résumé Vivant) atteignable sans mentir.
   */
  const windowCoversUnread = !threadData.hasOlder;

  /**
   * LA PROTECTION (D-23, #5676).
   *
   * `expiredIds` — l'état qui FORCE le re-rendu d'UNE rangée quand son
   * minuteur éphémère s'éteint : `EphemeralBadge` tient son propre
   * intervalle (`memo`), il ne remonte que l'INSTANT d'expiration, jamais un
   * `setInterval` porté par la rangée elle-même.
   *
   * `consume` (#5650, §5 étape 10) — écrit désormais dans le CACHE de
   * requêtes (`queryClient.setQueryData(messagesQueryKey(id), …)`), jamais
   * un état local : `threadData.messages` (dérivé du MÊME cache par
   * `select`) reflète la consommation au rendu SUIVANT, sans second état à
   * tenir synchronisé. En source `fixtures`, `recordViewOnceConsumption`
   * fait survivre la consommation à un aller-retour vers `/` (la couche de
   * données est le seul endroit qui survit au démontage) ; en `gateway`,
   * c'est le port `consumeViewOnce` (`lib/api/view-once.ts`) qui écrira la
   * confirmation serveur — HORS PÉRIMÈTRE de ce diff (l'écriture cache
   * suffit pour la session courante).
   */
  const [expiredIds, setExpiredIds] = useState<ReadonlySet<string>>(new Set());
  const onEphemeralExpired = useCallback((messageId: string) => {
    setExpiredIds((previous) => (previous.has(messageId) ? previous : new Set(previous).add(messageId)));
  }, []);
  const consume = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!online) return false;
      if (__FIXTURES__ && apiConfig.source === 'fixtures') recordViewOnceConsumption(messageId);
      queryClient.setQueryData<{ readonly messages: readonly Message[]; readonly hasOlder: boolean }>(
        messagesQueryKey(id),
        (page) =>
          page === undefined
            ? page
            : { ...page, messages: applyConsumption(page.messages, { messageId, viewOnceCount: 1 }) },
      );
      return true;
    },
    [online, queryClient, id],
  );

  /**
   * `otherUnread` (#5650, §5 étape 10) — le cache PARTAGÉ de la liste, OBSERVÉ
   * (`useConversationsSnapshot`, `enabled: false` — jamais une requête de
   * plus) plutôt que lu une fois : la liste et le fil partagent le MÊME
   * `QueryClient` (`appQueryClient`, `main.tsx`), donc le compteur suit ce
   * qui s'y écrit. Un `getQueryData()` au premier rendu restait à ZÉRO pour
   * toujours sur un lien direct vers `/c/:id`, où le cache est encore vide.
   * Filtré sur l'id de ROUTE, pas `conversation?.id` — le compteur reste
   * correct même pendant le chargement de cette conversation.
   */
  const listSnapshot = useConversationsSnapshot();
  const otherUnread = useMemo(
    () => (listSnapshot ?? []).filter((c) => c.id !== id).reduce((total, c) => total + unreadOf(c), 0),
    [listSnapshot, id],
  );
  /**
   * `place()` rend des objets NEUFS à chaque appel : sans ce `useMemo`,
   * CHAQUE rendu de l'écran — dont ceux que la scène du fil provoque à
   * chaque changement d'élu — donnait une nouvelle identité à `place` sur
   * les cinquante rangées montées, et le `memo` de `FocalRow` ne
   * court-circuitait JAMAIS (correction de revue #5648 : la promesse « deux
   * rangées re-rendent, jamais toutes » était écrite dans un commentaire et
   * démentie par ce seul appel). `messages` est un état, donc son identité
   * ne bouge qu'à l'arrivée d'un message.
   */
  /**
   * `conversationId`/`conversationType`/`memberCount` — accesseurs SÛRS,
   * `conversation` pouvant être `undefined` pendant `pending`/`refused`/
   * `error` (F8) : les hooks ci-dessous s'exécutent à CHAQUE rendu (règle des
   * Hooks), y compris ceux-là — leur résultat est sans conséquence tant que
   * le rendu final (plus bas) ne montre pas encore le fil réel.
   */
  const conversationId = conversation?.id ?? id;
  const { languages: readerLanguages, locale: readerLocale } = useReaderLanguages();
  const scope = useMemo(() => readingModeScopeOf(viewer), [viewer.id]);

  /**
   * LA RÉGION LIVE UNIQUE DE L'ÉCRAN (revue #5814, défaut majeur 9) — UN
   * seul possesseur d'état, partagé par `useSend` (« Message envoyé » /
   * « Message non envoyé ») ET `useMessageMenu` (« Message copié », refus de
   * réaction, « Message protégé »…). Avant ce hook, les deux sources
   * portaient chacune son propre état, combinées par `announcement ||
   * messageMenu.actionNotice` : `announcement` n'était jamais remis à `''`,
   * masquant TOUT `actionNotice` pour le reste de la session dès le premier
   * envoi confirmé (mesuré, `recette6.mjs`). Voir `use-live-announcer.ts`.
   */
  const announcer = useLiveAnnouncer();

  /**
   * L'ENVOI (#5813) — `send/perform-send.ts` porte la RÈGLE (débounce,
   * accusé, reprise, upsert idempotent) ; ce hook n'est qu'un abonnement à
   * l'outbox (§ 4.10 de la spécification). `originalLanguage` = rang 1 du
   * Prisme du lecteur (Q3 : jamais de détection on-device ce lot), figée à
   * l'envoi et préservée au renvoi (`entry.message` repris tel quel).
   */
  const { pending, deliveryOf, startedAtOf, reasonOf, permanentOf, send, retry } = useSend({
    conversationId: id,
    viewerId: viewer.id ?? '',
    ...(viewerParticipant === undefined ? {} : { sender: viewerParticipant }),
    originalLanguage: readerLocale,
    announce: announcer.announce,
  });
  /**
   * `messages` COMPOSE le domaine CONFIRMÉ (`threadData.messages`, le cache
   * TanStack) avec les locaux de CETTE session (`pending`, l'outbox) — le
   * même geste qu'avant #5813, `pending` remplaçant `pendingSends`. FUSIONNÉ
   * PUIS TRIÉ par `mergeTimeline` (`lib/grouping.ts`), jamais concaténé —
   * revue-correction #5813, défaut majeur 5 (voir le doc-comment de
   * `mergeTimeline` pour le scénario qu'une concaténation inverse).
   */
  const messages = useMemo(
    () => mergeTimeline(threadData.messages, pending),
    [threadData.messages, pending],
  );
  const placed = useMemo(() => place(messages, { locale: readerLocale }), [messages, readerLocale]);
  const group = conversation !== undefined && isGroup(conversation);

  /**
   * LE MODE DE LECTURE (#5566) — la LOI vit dans `@meeshy/shared`
   * (`decision.ts` ne fait que la consommer avec le catalogue de cet écran,
   * D-14) ; le CHOIX COLLANT vit dans `readingModeStore`, scopé
   * `(lecteur, conversation)` — `scope` REMPLACE la constante `'local'`
   * figée (#5650, F7).
   *
   * `stickyMode` est un ÉTAT REACT qui MIROITE le magasin (comme
   * `@Published mode` du contrôleur iOS) : le magasin est la source de
   * vérité PERSISTANTE, l'état ne sert qu'à faire re-rendre l'écran quand la
   * sélection change.
   */
  const [stickyMode, setStickyMode] = useState<ConversationReadingMode | null>(() =>
    readingModeStore.getPreference(scope, conversationId),
  );
  /**
   * Figés à l'OUVERTURE (comme l'`init` du contrôleur iOS) : la branche
   * d'absence de la loi lit l'INSTANT de l'ouverture, pas un instant qui
   * recule à chaque rendu tant que l'écran reste monté.
   *
   * INITIALISEURS PARESSEUX, et ce n'est pas un détail de style : le
   * virtualiseur re-rend CET écran à chaque image de défilement. Écrits
   * `useRef(new Date())` / `useRef(store.lastOpenedAt(…))`, l'argument est
   * évalué à CHAQUE rendu — une `Date` allouée et une lecture de magasin par
   * image, pour une valeur que `useRef` jette aussitôt.
   */
  const [openedAt] = useState(() => new Date());
  const [lastOpenedAt] = useState(() => readingModeStore.lastOpenedAt(scope, conversationId));
  useEffect(() => {
    readingModeStore.noteOpened(scope, conversationId, openedAt);
    // Volontairement sur la seule CONVERSATION (et son scope) : ouvrir une
    // fois par visite de cet écran, jamais à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, conversationId]);

  /**
   * MÉMORISÉS, parce que le virtualiseur re-rend cet écran à chaque image de
   * défilement : sans `useMemo`, la loi, les capacités et les CINQ lignes du
   * menu (objets neufs, libellés interpolés) étaient reconstruites soixante
   * fois par seconde pour un menu fermé. C'est aussi le motif que copieront
   * les surfaces à venir — il doit être juste maintenant.
   */
  const readingDecision = useMemo(
    () =>
      resolveThreadMode({
        unreadCount: conversation === undefined ? 0 : unreadOf(conversation),
        lastOpenedAt,
        now: openedAt,
        sticky: toStickyPreference(stickyMode),
        // #5695 : `summary` est désormais dans le catalogue de rendu web —
        // `viewer.isAnonymous` a un effet OBSERVABLE ici (un invité perd
        // `summary`, la loi le retire de `threadCapabilities`).
        isAnonymous: viewer.isAnonymous,
        conversationType: conversation?.type ?? 'direct',
        // #5696 : l'éligibilité de la Rivière lit `memberCount` comme iOS
        // (`ConversationView.swift:569`) — MÊME champ que celui affiché
        // juste en-dessous (« N participants »), voir `thread.tsx` ligne
        // sur `conversation.memberCount`.
        memberCount: conversation?.memberCount ?? null,
      }),
    [conversation, lastOpenedAt, openedAt, stickyMode, viewer.isAnonymous],
  );
  const readingCapabilities = useMemo(
    () =>
      threadCapabilities({
        isAnonymous: viewer.isAnonymous,
        conversationType: conversation?.type ?? 'direct',
        memberCount: conversation?.memberCount ?? null,
      }),
    [conversation?.type, conversation?.memberCount, viewer.isAnonymous],
  );
  const readingMenuRows = useMemo(
    () =>
      menuRows({
        availableModes: readingCapabilities.availableModes,
        riverEligibilityReason: readingCapabilities.riverEligibilityReason,
        currentMode: readingDecision.mode,
      }),
    [readingCapabilities, readingDecision.mode],
  );
  const currentRow = readingMenuRows.find((row) => row.mode === readingDecision.mode);
  const selectReadingMode = (mode: ConversationReadingMode) => {
    readingModeStore.setPreference(scope, conversationId, mode);
    setStickyMode(mode);
  };
  const resetReadingModeToAuto = () => {
    readingModeStore.setPreference(scope, conversationId, null);
    setStickyMode(null);
  };

  /**
   * LA VIRTUALISATION DU FIL — la seule chose qui tienne un fil de cinq cents
   * messages sur une WebView Android d'entrée de gamme (#5446).
   *
   * Sans elle, cinq cents bulles sont cinq cents sous-arbres montés, mesurés et
   * repeints à chaque défilement. Le symptôme n'est pas une erreur : c'est un
   * fil qui met deux secondes à s'ouvrir puis saccade — exactement la lenteur
   * que la charte du dépôt classe comme un BUG, pas comme une dette.
   *
   * `measureElement` plutôt qu'une hauteur fixe : les bulles n'ont PAS de
   * hauteur commune (un mot contre un paragraphe, une image, un vocal, un
   * séparateur de jour porté par la cellule). Une estimation fixe ferait sauter
   * la barre de défilement à chaque mesure réelle — le défaut le plus visible
   * d'une virtualisation naïve, et celui qu'un banc de bulles identiques ne
   * révèle jamais.
   *
   * Le positionnement est un `translateY`, jamais un `top` : la même discipline
   * que la Lentille — seuls `transform` et `opacity` bougent.
   */
  const scroller = useRef<HTMLElement | null>(null);
  const virtualizer = useVirtualizer({
    count: placed.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 88,
    overscan: 6,
    getItemKey: (index) => placed[index]?.message.id ?? index,
  });

  /**
   * LA SCÈNE DU FIL (#5648) — l'ÉLECTION d'une rangée au défilement soutenu
   * (Focal seul), plus par la courbe continue qu'iOS a retirée
   * (`reading-mode/perspective.ts`, gelée) ; le RÉVÉLÉ (heure, coches) vit
   * en Focal ET en Script — `useThreadScene` le monte donc dès que le mode
   * n'est PAS `bubbles` (« densité uniforme, zéro perspective » ne parle
   * que de l'ÉLECTION, jamais du révélé).
   */
  /**
   * `ready` — le cadre `<main ref={scroller}>` n'existe qu'une fois le fil
   * RÉSOLU (les états transitoires plus bas rendent d'autres arbres) et il
   * n'y a de rangée à élire que si le fil en porte : `placed.length > 0`
   * dit les deux à la fois, et RE-DÉCLENCHE la scène au commit où le cadre
   * apparaît — exactement comme l'ancrage bas (`count`, plus bas) le fait
   * déjà pour la même raison.
   */
  const scene = useThreadScene(scroller, { mode: readingDecision.mode, ready: placed.length > 0 });

  /**
   * LE SAUT DE CITATION (#5566, défaut 10) — le bouton de citation promettait
   * une navigation par son nom accessible et ne faisait rien. `scrollToIndex`
   * amène le message cité dans la fenêtre virtualisée ; la mise en évidence
   * s'efface d'elle-même, jamais un état qui s'accumule sans fin.
   */
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * `useCallback` et non une fonction nue : cette référence est une PROP de
   * chaque `FocalRow`, dont le `memo` (#5648) ne vaut que si elle est
   * stable. `noteProgrammaticScroll` l'est déjà (`reading-mode/scene.ts`),
   * `virtualizer` aussi (instance TanStack), `placed` depuis le `useMemo`
   * ci-dessus — la chaîne tient de bout en bout.
   */
  const noteProgrammaticScroll = scene.noteProgrammaticScroll;
  const jumpToMessage = useCallback(
    (messageId: string) => {
      const index = placed.findIndex((p) => p.message.id === messageId);
      if (index === -1) return;
      // ANNONCE le défilement PROGRAMMÉ avant de le déclencher — ni le révélé
      // ni l'armement de la scène ne doivent réagir à un saut de citation
      // (§1.5 de la spécification #5648, même famille de désarmement que
      // l'ancrage bas ci-dessous, D-15).
      noteProgrammaticScroll();
      virtualizer.scrollToIndex(index, { align: 'center' });
      setHighlightedId(messageId);
      if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 1600);
    },
    [placed, virtualizer, noteProgrammaticScroll],
  );
  useEffect(() => () => {
    if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
  }, []);

  /**
   * LE SAUT DIFFÉRÉ (#5695) — les TROIS sorties du Résumé Vivant reposent
   * sur `jumpToMessage`, qui n'a de cible que quand `<ol>` est MONTÉ
   * (`usesFlatRow`). Sans ce différé, basculer `summary → script` puis
   * sauter dans le MÊME geste viserait un virtualiseur qui compte encore
   * zéro rangée plate — miroir des trois portes iOS
   * (`ConversationView.swift:1527-1547`, qui posent `scrollToMessageId` +
   * `trigger`, consommés APRÈS le rebasculement de mode).
   */
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  useEffect(() => {
    if (pendingJump === null || !usesFlatRow(readingDecision.mode)) return;
    jumpToMessage(pendingJump);
    setPendingJump(null);
  }, [pendingJump, readingDecision.mode, jumpToMessage]);

  /**
   * LE PRÉ-ADRESSAGE DU COMPOSEUR (#5695, écart 8 §1.4) — au tap d'un
   * visage de la Rampe, le composeur s'ouvre déjà adressé à cette personne :
   * la citation ET `replyToId` à l'envoi.
   */
  const [replyTarget, setReplyTarget] = useState<string | null>(null);

  /**
   * LE MENU DU MESSAGE (#5814) — appui long / clic droit / `ContextMenu` sur
   * une rangée ouvrent le rail de réactions et la liste Sélectionner ·
   * Traduire · Copier · Composer · Plus… ; toute la RÈGLE (état, effets)
   * vit dans `useMessageMenu` (`lib/view/use-message-menu.ts`) — cet écran
   * ne fait plus que CÂBLER le JSX sur ce qu'il rend (§5 étape 0 : le budget
   * de taille interdit d'ajouter une seconde machine ici).
   */
  const messageMenu = useMessageMenu({
    conversationId: id,
    messages,
    readerLanguages,
    readerLocale,
    viewerId: viewer.id ?? '',
    onCompose: (messageId) => setReplyTarget(messageId),
    announce: announcer.announce,
  });

  /**
   * LES TROIS SORTIES DU RÉSUMÉ VIVANT (#5695) — miroir
   * `ConversationView.swift:1527-1547` : visage → script + saut sur la
   * PREMIÈRE preuve + pré-adressage ; épisode → script + saut sur son
   * PREMIER message ; « Reprendre le fil » → script + saut sur le PREMIER
   * message d'un AUTRE (jamais du lecteur). Aucun retour automatique.
   */
  const onReplyToPerson = (entry: { readonly evidenceMessageIds: readonly string[] }) => {
    const target = entry.evidenceMessageIds[0] ?? null;
    selectReadingMode('script');
    setPendingJump(target);
    setReplyTarget(target);
  };
  const onOpenEpisode = (episode: { readonly messageIds: readonly string[] }) => {
    selectReadingMode('script');
    setPendingJump(episode.messageIds[0] ?? null);
  };
  const onResumeThread = () => {
    selectReadingMode('script');
    setPendingJump(messages.find((m) => m.senderId !== (viewer.id ?? ''))?.id ?? null);
  };

  /**
   * UN FIL S'OUVRE EN BAS. Sur le dernier message, pas sur le premier — et
   * `align: 'end'` plutôt qu'un `scrollTop = scrollHeight`, qui serait faux
   * tant que les hauteurs réelles ne sont pas mesurées.
   */
  const count = placed.length;
  useEffect(() => {
    const el = scroller.current;
    if (el === null || count === 0) return;

    /**
     * UN SEUL `scrollToIndex` NE SUFFIT PAS, et c'est mesuré : il vise le bas
     * d'une hauteur ESTIMÉE, puis les cellules réellement montées se mesurent
     * et la hauteur totale change sous lui. Le témoin voyait alors un fil
     * « en bas » où le dernier message n'était pas rendu.
     *
     * On se RÉ-ANCRE donc sur quelques images, le temps que les mesures
     * convergent — et on abandonne à la PREMIÈRE intention de l'utilisateur.
     * Sans ce désarmement, remonter son historique dans la demi-seconde qui
     * suit l'ouverture serait impossible : le fil reviendrait en bas sous le
     * doigt, ce qui est pire que de s'ouvrir au mauvais endroit.
     */
    let armed = true;
    let frames = 0;
    let raf = 0;
    const release = () => {
      armed = false;
    };
    const pin = () => {
      if (!armed) return;
      // ANNONCE au premier pin : l'ancrage en bas ne doit ni révéler ni
      // armer la scène du fil (§5.8 de la spécification #5648) — l'unique
      // intention qui la RELÂCHE (`release`, même écouteurs) rouvre la
      // scène par le même événement, sans course possible entre les deux
      // effets.
      if (frames === 0) scene.noteProgrammaticScroll();
      el.scrollTop = el.scrollHeight;
      if (++frames < 20) raf = requestAnimationFrame(pin);
    };
    raf = requestAnimationFrame(pin);
    for (const event of ['wheel', 'touchstart', 'keydown'] as const) {
      el.addEventListener(event, release, { passive: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      for (const event of ['wheel', 'touchstart', 'keydown'] as const) {
        el.removeEventListener(event, release);
      }
    };
    // Volontairement sur le seul COMPTE : se ré-ancrer à chaque rendu
    // empêcherait l'utilisateur de remonter son historique.
  }, [count]);

  /**
   * LES TROIS ÉTATS AVANT LE RENDU RÉEL (#5650, F5/F8/§5 étape 10) — TOUS les
   * HOOKS ci-dessus se sont déjà exécutés (règle des Hooks : jamais un hook
   * après un retour anticipé) ; tout ce qui suit est du calcul SIMPLE, en
   * sécurité derrière ce garde. `refused` prime sur `error` (un id 403/404
   * reste un refus, jamais une panne réseau à réessayer) ; `pending` couvre
   * aussi le cas défensif `conversation === undefined` — la narrowing
   * TypeScript qui suit rend `conversation` NON-optionnel pour le reste de
   * la fonction.
   */
  if (threadData.status === 'refused') return <ThreadRefused />;
  if (threadData.status === 'error') return <ThreadError onRetry={threadData.refetch} />;
  if (threadData.status === 'pending' || conversation === undefined) return <ThreadSkeleton />;

  const title = titleOf(conversation, viewer.id ?? '');
  const accent = accentOf(conversation);
  /** Le `Participant` du lecteur DANS cette conversation — distinct de
   * `viewer` (l'identité résolue par `resolveViewer`, ci-dessus) : celui-ci
   * porte la charge que `sender` exige (avatar, présence…), jamais confondu
   * avec « qui lit ». Calculé plus haut (`viewerParticipant`, avant les
   * retours anticipés) : `useSend` (#5813) en a besoin AVANT que `conversation`
   * ne soit narrowée non-optionnelle ici. */

  /**
   * LE CADRAGE DES DATES DU RÉSUMÉ (#5695, étape 11) — `lang` est RÉSOLU
   * UNE FOIS ici, jamais une lecture DOM par nœud (`episode-list.tsx`,
   * `living-summary.tsx` le reçoivent en prop). `undefined` quand la locale
   * de cadrage EST celle du document — aucun `lang` superflu posé.
   */
  const summaryLang =
    typeof document === 'object' && readerLocale !== document.documentElement.lang ? readerLocale : undefined;

  /**
   * LA CITATION DU COMPOSEUR PRÉ-ADRESSÉ (#5695, écart 8) — l'extrait passe
   * par le PRISME (`served()`, jamais `content` brut) : citer quelqu'un dans
   * une langue qu'il n'a pas écrite serait exactement le défaut que le
   * Prisme existe pour éviter.
   */
  const replyToMessage = replyTarget === null ? undefined : messages.find((m) => m.id === replyTarget);
  const replyToServed =
    replyToMessage === undefined
      ? undefined
      : served({
          preferredLanguages: readerLanguages,
          originalLanguage: replyToMessage.originalLanguage,
          translations: replyToMessage.translations,
          original: replyToMessage.content,
        });
  const replyTo =
    replyToMessage === undefined || replyToServed === undefined
      ? undefined
      : {
          author: replyToMessage.sender?.displayName ?? replyToMessage.senderId,
          excerpt: replyToServed.text,
          /* La PAIRE, jamais le seul texte : `served()` rend `language`
             précisément pour que l'hôte puisse DIRE dans quelle langue il
             sert (`lang`), comme `bubble.tsx` et `focal-row.tsx`. */
          ...(replyToServed.language === '' ? {} : { language: replyToServed.language }),
        };

  return (
    /* `h-dvh` + `overflow-hidden`, et NON `min-h-dvh` : c'est ce qui fait la
       difference entre une PAGE (le document entier defile, le composeur suit)
       et une APPLICATION (seule la zone des messages defile, l'en-tete et le
       composeur sont des bords fixes). Avec `min-h-dvh` le composeur recouvrait
       les derniers messages — le defaut le plus visible du premier rendu. */
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" style={withAccent(accent)}>
      <ThreadHeader
        title={title}
        accent={accent}
        conversation={conversation}
        viewerId={viewer.id ?? ''}
        group={group}
        otherUnread={otherUnread}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        online={online}
        currentRowTitle={currentRow?.title ?? ''}
        isAuto={readingDecision.reason !== 'sticky'}
        readingMenuRows={readingMenuRows}
        onSelectReadingMode={selectReadingMode}
        onResetReadingModeToAuto={resetReadingModeToAuto}
      />
      {/*
        L'ANNONCE LECTEUR D'ÉCRAN (#5813, § 6.3 ; #5814, § 5 étape 5 ;
        revue #5814, défauts majeurs 9/10) — UN SEUL texte
        (`announcer.text`, `use-live-announcer.ts`), DEUX rendus : ce nœud
        visuellement masqué pour VoiceOver/NVDA, et la pilule VISIBLE
        au-dessus du composeur plus bas. Avant l'unification, `announcement
        || messageMenu.actionNotice` masquait tout `actionNotice` après le
        premier envoi confirmé — voir `use-live-announcer.ts`.
      */}
      <div role="status" aria-live="polite" className="offscreen">
        {announcer.text}
      </div>

      <main
        id="contenu"
        ref={scroller}
        /* `tabIndex={-1}` — focalisable PROGRAMMATIQUEMENT (jamais dans
           l'ordre de tabulation naturel) : c'est ce qui permet à `PageUp` /
           `PageDown` de défiler CE conteneur au clavier — l'intention que
           `reading-mode/scene.ts` écoute (`keydown`, D-15) — sans ajouter un
           arrêt de tabulation superflu au parcours normal (#5648 §4.5). */
        tabIndex={-1}
        /*
          PAS de `justify-end` ici, et c'est mesuré : avec
          `justify-content: flex-end`, un enfant plus haut que le conteneur
          déborde par le HAUT — et ce débordement-là n'est PAS atteignable au
          défilement. Relevé : un `<ol>` de 46 175 px dans un `<main>` dont
          `scrollHeight` valait 708, exactement sa hauteur visible. Le fil
          entier était injoignable, sans la moindre erreur.
          L'ancrage en bas se fait donc par `margin-block-start: auto` sur la
          liste : même effet quand le contenu est court, et un débordement
          normal quand il est long.
        */
        className="flex flex-1 flex-col overflow-y-auto px-3.5 pt-2 pb-2"
        /*
          LES COTES DE LA SCÈNE DU FIL (#5648) — la SEULE porte par laquelle
          `reading-mode/metrics.ts::sceneStyleVars()` atteint le CSS,
          héritées par chaque rangée `[data-row]` en dessous
          (`focal-focus-overlays.tsx`, `app.css`). `--accent` hérite déjà de
          la racine (`withAccent`, sur le conteneur d'écran) — inutile de la
          reposer ici, une variable CSS traverse les nœuds intermédiaires
          sans qu'ils la déclarent.
        */
        style={sceneStyleVars()}
      >
        {/*
          `flexShrink: 0` n'est PAS une précaution : `<main>` est un conteneur
          flex, et un enfant de hauteur explicite y est COMPRIMÉ dès que la
          somme dépasse la place. Mesuré sans lui : 2 137 px de contenu pour
          cinq cents messages — la liste tenait dans un écran, le fil ne
          pouvait plus s'ancrer en bas, et rien n'avait l'air cassé puisque les
          cellules se rendaient. C'est le MÊME défaut que la Lentille avait
          payé sur ses rangées ; il est venu deux fois parce qu'il ne se voit
          ni au type-check ni à l'œil, seulement à la mesure.
        */}
        <ThreadModes
          mode={readingDecision.mode}
          conversation={conversation}
          messages={messages}
          viewer={viewer}
          windowCoversUnread={windowCoversUnread}
          readerLocale={readerLocale}
          {...(summaryLang !== undefined ? { summaryLang } : {})}
          onReplyToPerson={onReplyToPerson}
          onOpenEpisode={onOpenEpisode}
          onResumeThread={onResumeThread}
          placed={placed}
          virtualizer={virtualizer}
          scene={scene}
          readerLanguages={readerLanguages}
          group={group}
          highlightedId={highlightedId}
          expiredIds={expiredIds}
          jumpToMessage={jumpToMessage}
          consume={consume}
          onEphemeralExpired={onEphemeralExpired}
          deliveryOf={deliveryOf}
          startedAtOf={startedAtOf}
          reasonOf={reasonOf}
          permanentOf={permanentOf}
          retry={retry}
          displayLanguageOf={messageMenu.displayLanguageOf}
          myReactionsOf={messageMenu.myReactionsOf}
          selection={messageMenu.selection}
          onRowTap={messageMenu.onRowTap}
          longPress={messageMenu.longPress}
          onPickLanguage={messageMenu.onPickLanguage}
          typing={threadData.typing}
          typist={typist}
          accent={accent}
        />
      </main>

      {/*
        LA PILULE VISIBLE (revue #5814, défaut majeur 10) — le refus d'une
        réaction (plafond de 5), « Message copié », « Message protégé »
        n'avaient AUCUN retour à l'œil : leur seul canal était la région
        `role="status"` ci-dessus, `className="offscreen"` — visuellement
        masquée. `aria-hidden` ICI : le MÊME texte est déjà lu par cette
        région-là, l'annoncer deux fois doublerait la lecture au lecteur
        d'écran. Motif `dayLabel` (rondeur, flou) au-dessus du composeur.
      */}
      {announcer.text !== '' ? (
        <div className="flex justify-center px-4 pb-1.5" aria-hidden>
          <span
            className="rounded-chip px-3 py-1.5 text-mini font-semibold backdrop-blur-md"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 92%, transparent)',
              color: 'var(--color-ios-ink)',
              border: '0.5px solid var(--color-edge)',
            }}
          >
            {announcer.text}
          </span>
        </div>
      ) : null}

      {/*
        LE COMPOSEUR NE SE MONTE JAMAIS EN RÉSUMÉ (revue-correction #5813,
        défaut BLOQUANT 4) — miroir du recouvrement iOS : `LivingSummaryHost`
        est posé à `zIndex(80)`, AU-DESSUS du composeur (`zIndex(60)`,
        `ConversationView.swift:1409-1418, 1516, 1967`), donc rien n'y est
        jamais tapé ni envoyé. L'écran Résumé ne rend AUCUNE rangée de
        message (`readingDecision.mode === 'summary'`, plus haut) : un
        composeur monté ici enverrait un message RÉEL — la passerelle
        confirmerait, `aria-live` dirait « Message envoyé » — sans qu'aucune
        bulle ne l'affiche nulle part avant le prochain chargement complet du
        fil. Le Résumé porte déjà son geste de sortie, « Reprendre le fil »
        (`onResumeThread`) : composer d'abord.
      */}
      {readingDecision.mode === 'summary' ? null : messageMenu.selection !== null ? (
        /* LE MODE SÉLECTION REMPLACE LE COMPOSEUR (#5814, question 5) —
           miroir `ConversationView.swift:1986` : jamais les deux à la fois. */
        <SelectionToolbar
          count={messageMenu.selection.ids.length}
          onEnd={messageMenu.onEndSelection}
          onCopy={() => messageMenu.onCopySelection(placed)}
        />
      ) : (
        <div className="shrink-0">
          <Composer
            onSend={({ text, attachments }) => {
              /* LE MESSAGE CITÉ ENTIER, PAS SON SEUL IDENTIFIANT
                 (revue-correction #5813, défaut majeur 6) — `replyToMessage`
                 est déjà résolu plus haut pour la bande du composeur ; le
                 réutiliser ici évite une seconde recherche ET porte la
                 citation jusqu'à la bulle optimiste. */
              send(text, attachments, replyToMessage ?? null);
              setReplyTarget(null);
            }}
            {...(viewerParticipant ? { rights: viewerParticipant.permissions } : {})}
            {...(replyTo ? { replyTo, onCancelReply: () => setReplyTarget(null) } : {})}
          />
        </div>
      )}

      {/* LE MENU DU MESSAGE (#5814) — portail conditionnel : monté SEULEMENT
          quand `useLongPress`/le clic droit/`ContextMenu` ont ciblé un
          message ET que ce message existe encore dans le fil. */}
      {((target, data) =>
        target === null || data === undefined ? null : (
          /* L'ID EST CAPTURÉ, PAS RÉ-ASSERTÉ (revue #5814) — `menuTarget!`
             dans chaque fermeture était une assertion de type par fermeture,
             que la garde d'au-dessus ne justifie pas (TypeScript ne narrow
             pas à travers un callback). Un paramètre le fige une fois. */
          <MessageMenu
            target={target}
            items={data.items}
            choices={data.choices}
            subjectLabel={data.subjectLabel}
            onClose={messageMenu.onCloseMenu}
            onReact={(emoji) => messageMenu.onMenuReact(target.messageId, emoji)}
            onExpandReactions={() => messageMenu.setReactionSheetFor(target.messageId)}
            onAction={(actionId) => messageMenu.onMenuAction(target.messageId, actionId)}
            onPickLanguage={(code) => messageMenu.onPickLanguage(target.messageId, code)}
          />
        ))(messageMenu.menuTarget, messageMenu.menuData)}

      {/* « ＋ Ajouter une réaction » (rail) et « Plus… » (détails) — deux
          feuilles indépendantes, jamais montées en même temps que le menu
          (celui-ci se referme déjà avant de les ouvrir, `use-message-menu.ts`). */}
      {((messageId) =>
        messageId === null ? null : (
          <ReactionSheet
            onPick={(emoji) => {
              messageMenu.onMenuReact(messageId, emoji);
              messageMenu.setReactionSheetFor(null);
            }}
            onClose={() => messageMenu.setReactionSheetFor(null)}
          />
        ))(messageMenu.reactionSheetFor)}
      {((detailFor) => {
        if (detailFor === null) return null;
        const detailMessage = messages.find((m) => m.id === detailFor);
        if (detailMessage === undefined) return null;
        const servedDetail = messageMenu.servedOf(detailFor);
        return (
          <MessageDetailSheet
            choices={translationChoices({
              message: detailMessage,
              preferredLanguages: readerLanguages,
              servedLanguage: servedDetail?.language ?? '',
            })}
            reactions={reactionEntries(detailMessage.reactionSummary)}
            sentAt={new Date(detailMessage.createdAt)}
            delivery={isMineOf(detailMessage, viewer.id ?? '') ? deliveryStatusOf(detailMessage) : null}
            locale={readerLocale}
            onPickLanguage={(code) => {
              messageMenu.onPickLanguage(detailFor, code);
              messageMenu.setDetailFor(null);
            }}
            onClose={() => messageMenu.setDetailFor(null)}
          />
        );
      })(messageMenu.detailFor)}
    </div>
  );
}
