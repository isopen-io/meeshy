import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import '@/styles/thread-system.css';

import { Composer } from '@/components/composer';
import { SelectionToolbar } from '@/components/selection-toolbar';
import { ThreadHeader } from '@/components/thread-header';
import { DayPill, NoticePill, OlderLoadIndicator, ScrollToBottomButton } from '@/components/thread-chrome';
import { ThreadError, ThreadRefused, ThreadSkeleton } from '@/components/thread-states';
import { apiDeps } from '@/lib/api/deps';
import { useConversationsSnapshot, useThreadData } from '@/lib/api/query';
import { markCaughtUp } from '@/lib/api/receipts';
import { consumeViewOnceOptimistic } from '@/lib/api/view-once';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { useAuthorStoryRings } from '@/lib/view/use-author-story-rings';
import { accentOf, withAccent } from '@/lib/accent';
import { conversationStore } from '@/lib/conversation-store';
import { isGroup, titleOf, unreadOf, participantAvatarOf } from '@/lib/view/conversation';
import { useParams } from '@/lib/router';
import { mergeTimeline, place } from '@/lib/grouping';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useSend } from '@/lib/view/use-send';
import { useMessageMenu } from '@/lib/view/use-message-menu';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { useOnline } from '@/lib/net/online';
import { useThreadTyping } from '@/lib/view/use-thread-typing';
import { useEphemeralDestruction } from '@/lib/view/ephemeral-destruction';
import { useThreadReadingMode } from '@/lib/reading-mode/use-thread-reading-mode';
import { readingModeStore } from '@/lib/reading-mode/store';
import { readingModeScopeOf } from '@/lib/reading-mode/scope';
import { draftStore } from '@/lib/send/draft-store';
import { useThreadCompose } from '@/lib/view/use-thread-compose';
import { useThreadScene } from '@/lib/reading-mode/scene';
import { chromeStyleVars, sceneStyleVars } from '@/lib/reading-mode/metrics';
import { backdropStyleVars } from '@/lib/view/thread-backdrop';
import { useThreadChromeSignals } from '@/lib/view/use-thread-chrome-signals';
import { useThreadInsets } from '@/lib/view/use-thread-insets';
import { THREAD_ROW_ESTIMATE, useOlderMessages } from '@/lib/view/use-older-messages';
import { useReadTracking } from '@/lib/view/use-read-tracking';
import { resumeThreadTarget, useUnreadBoundary } from '@/lib/view/unread-boundary';
import { useThreadOpenScroll } from '@/lib/view/use-thread-open-scroll';
import { useThreadJump } from '@/lib/view/use-thread-jump';
import { summaryExits } from '@/lib/view/summary-exits';
import { ThreadMessageSheets } from './thread-sheets';
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
 *
 * DÉCOUPAGE #7429 (sans changer un pixel) — l'orchestration du mode de
 * lecture (`useThreadReadingMode`), la composition du composeur
 * (`useThreadCompose`), le saut de citation (`useThreadJump`), les trois
 * sorties du Résumé (`summaryExits`) et les feuilles du message
 * (`ThreadMessageSheets`) vivent désormais chacun dans leur propre fichier —
 * même doctrine qu'iOS (`ConversationView.swift`, découpé en quatorze
 * extensions PAR SURFACE) : cet écran ne fait plus que CÂBLER ce que chacun
 * lui rend.
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

  /**
   * LA PHOTO D'UN FRAPPEUR (#6985) — résolue ICI, depuis les participants que
   * cet hôte a DÉJÀ en cache, et remise à la cellule de frappe. Le fil
   * `typing:start` ne porte pas d'avatar, et l'y ajouter dupliquerait
   * l'information à chaque frappe de chaque personne.
   *
   * `participantAvatarOf` est la LOI PARTAGÉE (rang local puis rang compte,
   * chaînes blanches normalisées), jamais une boucle écrite ici.
   *
   * Mémoïsé sur les participants : la cellule n'est pas `memo`-isée, donc
   * l'identité ne change rien à son rendu — mais la CARTE, elle, se
   * reconstruirait à chaque frappe reçue si on ne la retenait pas.
   */
  const typistAvatarOf = useMemo(() => {
    const parParticipant = new Map(
      (conversation?.participants ?? []).map((p) => [p.userId ?? p.id, participantAvatarOf(p)] as const),
    );
    return (userId: string) => parParticipant.get(userId) ?? undefined;
  }, [conversation?.participants]);
  /**
   * `conversationId` (revue-correction #5793, défaut MAJEUR 3) — LA clé de
   * cache et de socket, jamais le paramètre de route brut : voir le
   * doc-comment de `useThreadData` (`lib/api/query.ts`). Tout ce qui doit
   * retrouver le MÊME fil qu'un `message:new`/`conversation:updated`/
   * `message:translation` (dédoublonnage, envoi, réaction, frappe) s'accroche
   * ICI — jamais à `id`, qui ne sert plus qu'à charger la case du fil.
   */
  const conversationId = threadData.conversationId;
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
  const viewer = useMemo(() => resolveViewer({ source: apiDeps.source, session }), [session]);
  const storyRingOf = useAuthorStoryRings(viewer);

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
   * `consume` (#5650, §5 étape 10 ; #7224) — DÉLÈGUE : la loi entière vit
   * dans `consumeViewOnceOptimistic` (`lib/api/view-once.ts`), qui écrit la
   * consommation au CACHE de requêtes avant tout réseau, la DIT au serveur
   * (`POST …/messages/:messageId/consume`) et la défait sur un refus
   * permanent. `threadData.messages` (dérivé du MÊME cache par `select`)
   * reflète l'écriture au rendu suivant, sans second état à tenir
   * synchronisé ; cet écran n'en garde que la garde HORS LIGNE, la seule
   * moitié qui soit à lui (`online`, D-16 — une révélation dont la
   * confirmation ne peut pas partir ne s'accorde pas).
   */
  /**
   * LA DESTRUCTION D'UN ÉPHÉMÈRE, EN TROIS PHASES (#7468) — le crochet tient
   * les deux ensembles et la minuterie qui fait passer de l'un à l'autre, et
   * s'inscrit au canal d'annonce pour que `message:expired` emprunte le MÊME
   * chemin que l'échéance atteinte sous les yeux du lecteur. L'écran ne fait
   * plus que le consommer — il tenait `expiredIds` à la main jusqu'ici.
   */
  const { destroyingIds, expiredIds, noteExpired: onEphemeralExpired } = useEphemeralDestruction();
  const consume = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!online) return false;
      return consumeViewOnceOptimistic({ conversationId, messageId, deps: { ...apiDeps, queryClient } });
    },
    [online, queryClient, conversationId],
  );

  /**
   * `otherUnread` (#5650, §5 étape 10 ; revue-correction #5793, défaut
   * majeur) — le cache PARTAGÉ de la liste, OBSERVÉ (`useConversationsSnapshot`,
   * `enabled: false` — jamais une requête de plus) plutôt que lu une fois : la
   * liste et le fil partagent le MÊME `QueryClient` (`appQueryClient`,
   * `main.tsx`), donc le compteur suit ce qui s'y écrit. Un `getQueryData()`
   * au premier rendu restait à ZÉRO pour toujours sur un lien direct vers
   * `/c/:id`, où le cache est encore vide.
   *
   * Filtré sur `conversationId` (`threadData.conversationId`), PAS sur `id`
   * (le paramètre de route brut) : les lignes de la liste portent des
   * ObjectIds, jamais un identifiant lisible — sur un lien `/c/<identifiant>`,
   * filtrer par `id` ne retire JAMAIS la conversation ouverte de son propre
   * compte de « non-lu ailleurs ». `conversationId` replie déjà sur `id` tant
   * que la conversation n'est pas résolue (`useThreadData`), donc ce
   * changement est inoffensif pendant le chargement et correct après.
   */
  const listSnapshot = useConversationsSnapshot();
  const otherUnread = useMemo(
    () => (listSnapshot ?? []).filter((c) => c.id !== conversationId).reduce((total, c) => total + unreadOf(c), 0),
    [listSnapshot, conversationId],
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
   * `conversationType`/`memberCount` — accesseurs SÛRS, `conversation`
   * pouvant être `undefined` pendant `pending`/`refused`/`error` (F8) : les
   * hooks ci-dessous s'exécutent à CHAQUE rendu (règle des Hooks), y compris
   * ceux-là — leur résultat est sans conséquence tant que le rendu final
   * (plus bas) ne montre pas encore le fil réel. `conversationId` est
   * calculé PLUS HAUT (`threadData.conversationId`, revue-correction #5793) —
   * une seule résolution, jamais recopiée.
   */
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
   * l'outbox (§ 4.10 de la spécification). La LANGUE d'origine n'est plus
   * figée ici : `send()` la reçoit PAR MESSAGE, décidée par `Composer`
   * (`useComposeLanguage`, #5828) — jamais le rang 1 du Prisme du LECTEUR
   * (`readerLocale`), qui décrit qui LIT, pas qui ÉCRIT.
   */
  const { pending, deliveryOf, startedAtOf, reasonOf, permanentOf, send, retry } = useSend({
    conversationId,
    viewerId: viewer.id ?? '',
    ...(viewerParticipant === undefined ? {} : { sender: viewerParticipant }),
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
   * LE MODE DE LECTURE (#5566, #7429) — l'ORCHESTRATION ENTIÈRE (instant
   * d'ouverture, préférence collante, décision, capacités, lignes de menu,
   * ligne courante) vit désormais dans `useThreadReadingMode`
   * (`lib/reading-mode/use-thread-reading-mode.ts`) — même doctrine qu'iOS
   * (`Focal/Core/ReadingModeOrchestrator.swift` : « la loi vit ailleurs,
   * l'écran ne fait que la consommer »). `conversation` ENTIÈRE, jamais
   * `conversationId` (qui replie sur le paramètre de route) : voir le
   * doc-comment du hook.
   */
  const reading = useThreadReadingMode({
    store: readingModeStore,
    scope,
    conversation,
    isAnonymous: viewer.isAnonymous,
  });

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
    estimateSize: () => THREAD_ROW_ESTIMATE,
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
  const scene = useThreadScene(scroller, { mode: reading.readingDecision.mode, ready: placed.length > 0 });

  /**
   * LE CHROME DU FIL (#5774, travail 3/3) — `host` est l'HÔTE COMMUN de
   * l'en-tête, du fil et du composeur (le conteneur d'écran, tout en bas de
   * ce composant) : c'est LUI qui porte `data-chrome-header`/
   * `data-chrome-composer` (`use-thread-chrome.ts`, hors React), les
   * variables CSS de `chromeStyleVars()`/`backdropStyleVars()`, la pilule
   * de jour collante et le bouton « revenir en bas » — composés par
   * `useThreadChromeSignals` (extrait, budget de taille CLAUDE.md § Code
   * Style : ce fichier l'avait déjà payé une fois, `thread-header.tsx`
   * §revue #5814, `thread-modes.tsx` §#5878).
   */
  const { bottomEdgeRef, vars: insetVars } = useThreadInsets();
  const chrome = useThreadChromeSignals({
    scroller,
    mode: reading.readingDecision.mode,
    placed,
    virtualizer,
    messages,
    viewerId: viewer.id ?? '',
    group,
    readerLanguages,
    noteProgrammaticScroll: scene.noteProgrammaticScroll,
  });

  /**
   * QUI ÉCRIT — LE ROSTER ENTIER (#6171, § 5 étape 0/2 de la spécification) —
   * extrait dans `lib/view/use-thread-typing.ts` : le magasin de frappe, le
   * port d'émission ET l'ancrage à l'APPARITION (G8, jamais au changement de
   * meneur) y vivent désormais, doc-comment complet là-bas. `thread-modes.tsx`
   * reçoit `typing.typists` (le tableau ENTIER, jamais `typists[0]`, G1) et
   * compose lui-même le libellé (`typingAnnouncement`) et le meneur
   * (`typingLead`).
   */
  const typing = useThreadTyping({
    conversationId,
    viewerId: viewer.id ?? '',
    scroller,
    nearBottom: chrome.nearBottom,
    noteProgrammaticScroll: scene.noteProgrammaticScroll,
  });

  /**
   * LE SAUT DE CITATION ET SA MISE EN ÉVIDENCE (#5566, défaut 10 ; #5695,
   * #7429) — extrait dans `useThreadJump` (`lib/view/use-thread-jump.ts`) :
   * le bouton de citation promettait une navigation par son nom accessible
   * et ne faisait rien ; le SAUT DIFFÉRÉ y vit aussi (les trois sorties du
   * Résumé Vivant appellent `jump.requestJump` avant que `<ol>` soit monté).
   */
  const jump = useThreadJump({
    placed,
    virtualizer,
    noteProgrammaticScroll: scene.noteProgrammaticScroll,
    mode: reading.readingDecision.mode,
  });

  /**
   * LA COMPOSITION DU FIL — BROUILLON, CITATION, ENVOI (#5695, #6175, #7429)
   * — extraite dans `useThreadCompose` (`lib/view/use-thread-compose.ts`) :
   * un seul hook, appelé ICI, sans condition — les Rules of Hooks qui
   * forçaient `replyToMessage`/`handleComposerSend`/`handleCancelReply` à
   * rester déclarés APRÈS le brouillon mais AVANT les trois retours
   * anticipés n'ont plus lieu d'être : il n'y a plus deux sites à garder
   * synchronisés. `setReplyTarget` reste exposé — `useMessageMenu`
   * (« Répondre ») et `summaryExits` (plus bas) l'appellent directement.
   */
  const compose = useThreadCompose({
    store: draftStore,
    scope,
    conversationId: conversation?.id,
    messages,
    readerLanguages,
    send,
  });

  /**
   * LE MENU DU MESSAGE (#5814) — appui long / clic droit / `ContextMenu` sur
   * une rangée ouvrent le rail de réactions et la liste Sélectionner ·
   * Traduire · Copier · Composer · Plus… ; toute la RÈGLE (état, effets)
   * vit dans `useMessageMenu` (`lib/view/use-message-menu.ts`) — cet écran
   * ne fait plus que CÂBLER le JSX sur ce qu'il rend (§5 étape 0 : le budget
   * de taille interdit d'ajouter une seconde machine ici).
   */
  const messageMenu = useMessageMenu({
    conversationId,
    messages,
    readerLanguages,
    readerLocale,
    viewerId: viewer.id ?? '',
    canStar: !viewer.isAnonymous,
    onReply: (messageId) => compose.setReplyTarget(messageId),
    announce: announcer.announce,
  });

  /**
   * LES TROIS SORTIES DU RÉSUMÉ VIVANT (#5695, #7429) — miroir
   * `ConversationView.swift:1527-1547` : visage → script + saut sur la
   * PREMIÈRE preuve + pré-adressage ; épisode → script + saut sur son
   * PREMIER message ; « Reprendre le fil » → script + saut sur le PREMIER
   * message d'un AUTRE (jamais du lecteur). Aucun retour automatique. La
   * fabrique elle-même (`summaryExits`, `lib/view/summary-exits.ts`) est une
   * fonction PURE, sans hook — ce qui varie d'un rendu à l'autre lui arrive
   * en PARAMÈTRE (`resumeTarget`, un thunk qui lit `unreadBoundary`/
   * `messages` AU MOMENT du geste, jamais à la construction).
   */
  const exits = summaryExits({
    selectMode: reading.selectReadingMode,
    requestJump: jump.requestJump,
    setReplyTarget: compose.setReplyTarget,
    resumeTarget: () => resumeThreadTarget({ unreadBoundary, messages, viewerId: viewer.id ?? '' }),
  });

  /**
   * **L'HISTORIQUE, À L'APPROCHE DU HAUT** (#6972) — la sentinelle haute, son
   * ancrage et le rejeu d'un refus vivent dans `useOlderMessages`
   * (`lib/view/use-older-messages.ts`, doc-comment complet là-bas : un seul
   * déclencheur, la distance au BAS du contenu comme repère, la TÊTE du fil
   * comme clé d'effet). Cet écran ne fait que CÂBLER ce que le port lui rend
   * — même motif que `useThreadChromeSignals` et `useThreadTyping`.
   */
  const older = useOlderMessages({
    scroller,
    state: threadData.olderState,
    rowCount: placed.length,
    firstMessageId: placed[0]?.message.id,
    fetchOlder: threadData.fetchOlder,
    noteProgrammaticScroll: scene.noteProgrammaticScroll,
  });

  /**
   * LE MARQUAGE-LU SANS GESTE (#7201, W1) — ouvrir ce fil, le faire défiler
   * jusqu'au bout et revenir au premier plan avancent la frontière de
   * lecture. `useReadTracking` (`lib/view/use-read-tracking.ts`) pose
   * l'IntersectionObserver et les écouteurs `visibilitychange`/`focus` ; cet
   * écran ne fait que CÂBLER `onMark` vers `markCaughtUp`
   * (`lib/api/receipts.ts`), qui porte la discipline optimiste (override
   * avant réseau, rollback sur refus) — même séparation que `fetchOlder`
   * ci-dessus.
   *
   * La frontière est le dernier message CONFIRMÉ (`threadData.messages`,
   * JAMAIS `messages`/`placed`, qui portent aussi les envois optimistes
   * encore locaux — un id que le serveur ne connaît pas).
   */
  const lastConfirmedMessageId = threadData.messages[threadData.messages.length - 1]?.id;
  const onMarkCaughtUp = useCallback((markedConversationId: string, caughtUpToMessageId: string) => {
    void markCaughtUp({
      conversationId: markedConversationId,
      caughtUpToMessageId,
      deps: { ...apiDeps, store: conversationStore, queryClient },
    });
  }, [queryClient]);
  /* (W14 #7372) Le suivi de lecture se suspend de lui-même sous une couche
     modale — visionneuse plein écran comprise, que cet écran ne monte pas :
     le registre `lib/view/modal-layers.ts` le sait, l'écran n'a rien à
     recalculer. */
  const readTracking = useReadTracking({
    scroller,
    conversationId,
    lastMessageId: lastConfirmedMessageId,
    enabled: placed.length > 0,
    onMark: onMarkCaughtUp,
  });

  /**
   * LE PREMIER NON-LU, GELÉ POUR LA SESSION (#7202, S1/D-L2/D-L3) — la loi
   * (gel + calcul) vit dans `lib/view/unread-boundary.ts`, ce hook n'en est
   * que la GLUE ; `threadData.status === 'success'` (jamais
   * `messages.length > 0`) évite de figer `null` à tort si `conversation`
   * résout avant `messages` (doc-comment complet là-bas).
   */
  const unreadBoundary = useUnreadBoundary({
    conversationId,
    ready: threadData.status === 'success',
    conversation,
    confirmedMessages: threadData.messages,
    viewerId: viewer.id ?? '',
  });

  /**
   * UN FIL S'OUVRE EN BAS — SAUF sur le séparateur de non-lus, TOUJOURS, à
   * l'ouverture (D-L2). La loi (décision pure + ancrage DOM/virtualiseur)
   * vit dans `lib/view/use-thread-open-scroll.ts` (#6972, étendu #7202) :
   * extraite d'ici pour le budget de taille de ce fichier (CLAUDE.md § Code
   * Style) et pour que la loi du séparateur ait son propre fichier, comme
   * demandé par le cadrage de W3.
   */
  useThreadOpenScroll({
    scroller,
    conversationId,
    placed,
    unreadBoundary,
    ready: threadData.status === 'success',
    virtualizer,
    onProgrammaticScroll: scene.noteProgrammaticScroll,
  });

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

  return (
    /* `h-dvh` + `overflow-hidden`, et NON `min-h-dvh` : c'est ce qui fait la
       difference entre une PAGE (le document entier defile, le composeur suit)
       et une APPLICATION (seule la zone des messages defile, l'en-tete et le
       composeur sont des bords fixes). Avec `min-h-dvh` le composeur recouvrait
       les derniers messages — le defaut le plus visible du premier rendu.

       PLUS DE COLONNE FLEX, ET PLUS DE `pt-safe` ICI (#6213). Les trois pièces
       étaient des FRÈRES DE FLUX — en-tête, défileur, composeur — donc le
       défileur était BORNÉ par ses voisins et leurs arêtes TRANCHAIENT le
       contenu (capture porteur du 2026-09-12). iOS pose l'inverse : la liste
       court de bord PHYSIQUE à bord physique (`.ignoresSafeArea(.container,
       edges: [.top, .bottom])`, `ConversationView.swift:1873`), le chrome
       FLOTTE au-dessus, et les réserves sont des marges INTÉRIEURES du
       défileur (`topInset`/`bottomInset`, :1552-1556) — c'est ce que
       `lib/view/thread-insets.ts` calcule et que `useThreadInsets` pose ici.

       L'encoche haute descend donc avec elles : elle est portée par le
       défileur (`--thread-pad-top`) ET par la bande flottante (`pt-safe`,
       `components/thread-header.tsx` — son dernier bord fixe en haut), jamais
       par cette racine, qui doit rester exactement haute de `100dvh` pour que
       le contenu puisse transiter sous la bande. */
    <div
      ref={chrome.host}
      className="relative h-dvh overflow-hidden"
      style={{ ...withAccent(accent), ...chromeStyleVars(), ...insetVars, ...backdropStyleVars() } as CSSProperties}
    >
      <div className="thread-backdrop" aria-hidden />
      <ThreadHeader
        title={title}
        accent={accent}
        conversation={conversation}
        viewerId={viewer.id ?? ''}
        group={group}
        storyRingOf={storyRingOf}
        otherUnread={otherUnread}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        currentRowTitle={reading.currentRow?.title ?? ''}
        isAuto={reading.readingDecision.reason !== 'sticky'}
        readingMenuRows={reading.readingMenuRows}
        onSelectReadingMode={reading.selectReadingMode}
        onResetReadingModeToAuto={reading.resetReadingModeToAuto}
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

      {/*
        L'ENVELOPPE DU DÉFILEUR (#5774, travail 3/3) — `position: relative`
        entre le header et le composeur : la pilule de jour et le bouton
        « revenir en bas » sont des FRÈRES ABSOLUS de `<main>`, jamais des
        DESCENDANTS — un enfant `position: absolute` d'un conteneur qui
        défile DÉFILE AVEC LUI (il reste dans le flux de rendu de son
        ancêtre positionné) ; posés ICI, ils restent ancrés au VIEWPORT du
        défileur, borné par le header au-dessus et le composeur en dessous
        (« la géométrie fait le travail », §1.5 de la spécification).
      */}
      <DayPill label={chrome.dayPillLabel} headerExpanded={expanded} />
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
        /*
          `absolute inset-0` — LE DÉFILEUR EST L'ÉCRAN (#6213), et les deux
          bandes de chrome flottent au-dessus de lui. Ses réserves sont des
          marges INTÉRIEURES (`--thread-pad-top`/`--thread-pad-bottom`,
          `lib/view/thread-insets.ts`), miroir exact des `contentInset` d'iOS :
          le contenu TRANSITE sous la bande au lieu de s'arrêter à son arête,
          et l'escamotage du chrome (#5774) découvre enfin du contenu au lieu
          de libérer du vide.

          `pt-2`/`pb-2` ont disparu avec la borne : la respiration basse est
          désormais le `+16` d'iOS, porté par la loi (`LIST_BOTTOM_BREATH`),
          et la haute est l'encoche.
        */
        className="scrollbar-none absolute inset-0 flex flex-col overflow-y-auto px-3.5"
        /*
          LES COTES DE LA SCÈNE DU FIL (#5648) — la SEULE porte par laquelle
          `reading-mode/metrics.ts::sceneStyleVars()` atteint le CSS,
          héritées par chaque rangée `[data-row]` en dessous
          (`focal-focus-overlays.tsx`, `app.css`). `--accent` hérite déjà de
          la racine (`withAccent`, sur le conteneur d'écran) — inutile de la
          reposer ici, une variable CSS traverse les nœuds intermédiaires
          sans qu'ils la déclarent.
        */
        style={{ ...sceneStyleVars(), paddingTop: 'var(--thread-pad-top)', paddingBottom: 'var(--thread-pad-bottom)' }}
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
          mode={reading.readingDecision.mode}
          viewer={viewer}
          readerLocale={readerLocale}
          summary={{
            conversation, messages, windowCoversUnread,
            onReplyToPerson: exits.onReplyToPerson,
            onOpenEpisode: exits.onOpenEpisode,
            onResumeThread: exits.onResumeThread,
            ...(summaryLang !== undefined ? { lang: summaryLang } : {}),
          }}
          placed={placed}
          virtualizer={virtualizer}
          scene={scene}
          readerLanguages={readerLanguages}
          group={group}
          storyRingOf={storyRingOf}
          highlightedId={jump.highlightedId}
          expiredIds={expiredIds}
          destroyingIds={destroyingIds}
          jumpToMessage={jump.jumpToMessage}
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
          onReact={messageMenu.onMenuReact}
          onOpenDetail={messageMenu.setDetailFor}
          typists={typing.typists}
          typistAvatarOf={typistAvatarOf}
          accent={accent}
          older={{ state: older.state, sentinelRef: older.sentinelRef }}
          readTrackingSentinelRef={readTracking.sentinelRef}
          unreadSeparatorMessageId={unreadBoundary?.firstUnreadId ?? null}
          unreadCount={unreadBoundary?.unreadCount ?? 0}
        />
      </main>
      <OlderLoadIndicator state={older.state} onRetry={older.retry} />

      <ScrollToBottomButton
        visible={chrome.scrollButtonVisible}
        unreadCount={chrome.scrollButtonUnreadCount}
        senderName={chrome.scrollButtonSenderName}
        previewText={chrome.scrollButtonPreviewText}
        onClick={chrome.onScrollToBottom}
      />

      <NoticePill text={announcer.text} />

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
      {/*
        LE BORD BAS, ET LA SEULE PIÈCE MESURÉE DE L'ÉCRAN (#6213) — cette
        enveloppe existe TOUJOURS, même vide (Résumé Vivant) : c'est elle que
        `useThreadInsets` observe, et un nœud qui se démonte emporterait son
        `ResizeObserver` avec lui. Sa hauteur devient la réserve basse du
        défileur, exactement comme `updateComposerHeight` alimente
        `bottomInset` côté iOS (`ConversationView.swift:2013-2019`).

        `absolute bottom-0` : le composeur FLOTTE au-dessus du fil (iOS
        `zIndex(50)`), il ne le borne plus. C'est ce qui permet à la dernière
        bulle de sortir de l'écran par le bord pendant le geste au lieu de
        s'arrêter net sur la pilule de langue — le défaut de la capture.
      */}
      <div ref={bottomEdgeRef} className="absolute inset-x-0 bottom-0 z-20">
      {reading.readingDecision.mode === 'summary' ? null : messageMenu.selection !== null ? (
        /* LE MODE SÉLECTION REMPLACE LE COMPOSEUR (#5814, question 5) —
           miroir `ConversationView.swift:1986` : jamais les deux à la fois. */
        <SelectionToolbar
          count={messageMenu.selection.ids.length}
          onEnd={messageMenu.onEndSelection}
          onCopy={() => messageMenu.onCopySelection(placed)}
          /* `placed` porte l'ordre du FIL — c'est lui qui ordonne les N
             transferts, jamais l'ordre des coches (#5866). */
          onForward={() => messageMenu.onForwardSelection(placed)}
        />
      ) : (
        /*
          LE COMPOSEUR ENGAGÉ (#5774, travail 3/3) — équivalent structurel
          des exceptions iOS `isEmojiPanelOpen`/`hasMentionSuggestions`
          (`ConversationView.swift:2124-2141`, « on ne retire pas l'outil en
          main ») : web-v2 n'a ni panneau emoji ni suggestions de mention
          dans `composer.tsx` (tenu par #5890, on n'y touche pas) — le focus
          sur l'ENVELOPPE, lu par bulle native (`onFocus`/`onBlur`), en est
          le signal. `relatedTarget` : un focus qui reste À L'INTÉRIEUR de
          l'enveloppe (bascule micro → champ, ouverture du tiroir de pièces
          jointes) ne désengage rien.
        */
        /* `glass-prominent` — LE MATÉRIAU DU SITE UNIQUE (#7143, D-51). Cette
            bande flotte depuis #6213 et n'a JAMAIS rien porté : le fil
            transitait dessous et ses bulles restaient lisibles sous le rail et
            la pilule « Message… ». D-50 l'interdit déjà pour tout le chrome
            flottant (« aucun flottant ne recouvre un texte au repos »), et
            `glass-prominent` est la densité que D-51 réserve à « ce qui se pose
            SUR un contenu qu'on lit » — l'en-tête, lui, porte `glass`.

            La classe, jamais une couleur : aucune densité écrite ici, aucune
            seconde source à côté de `styles/glass.css` (D-4). Et jamais un
            dégradé de masquage — le porteur a fait retirer ces voiles
            (#6537, « supprimer ces voiles, non pas simplement les rendre
            invisible, mais permettre qu'on manipule les éléments entre »). */
        <div
          className="thread-composer-chrome glass-prominent"
          onFocus={chrome.onComposerFocus}
          onBlur={chrome.onComposerBlur}
        >
          <Composer
            preferred={readerLanguages}
            onSend={compose.onSend}
            onTextChange={typing.onTextChange}
            draft={compose.initialDraft}
            /* `replyToId` COMPOSÉ PAR `useThreadCompose` (#6175, #7429) —
               `Composer` ne connaît que la citation PRÉ-ADRESSÉE
               (`replyTo.author`/`excerpt`), jamais l'identifiant. */
            onDraftChange={compose.reportComposerDraft}
            {...(viewerParticipant ? { rights: viewerParticipant.permissions } : {})}
            {...(compose.replyTo ? { replyTo: compose.replyTo, onCancelReply: compose.onCancelReply } : {})}
          />
        </div>
      )}
      </div>

      <ThreadMessageSheets
        messageMenu={messageMenu}
        messages={messages}
        readerLanguages={readerLanguages}
        readerLocale={readerLocale}
        conversationId={conversationId}
        viewerId={viewer.id ?? ''}
      />
    </div>
  );
}
