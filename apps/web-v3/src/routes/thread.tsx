import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { Avatar } from '@/components/avatar';
import { Bubble } from '@/components/bubble';
import { Composer } from '@/components/composer';
import { FocalRow } from '@/components/focal-row';
import { Glyph } from '@/components/glyph';
import { ReadingModeChip } from '@/components/reading-mode-chip';
import { SummarySkeleton } from '@/components/summary/summary-skeleton';
import { apiConfig } from '@/lib/api/config';
import {
  CONVERSATIONS,
  PARTICIPANTS,
  VIEWER_ID,
  hasOlderMessagesOf,
  messagesOf,
  recordViewOnceConsumption,
} from '@/lib/api/fixtures';
import { applyConsumption } from '@/lib/api/view-once';
import type { Message } from '@/lib/api/types';
import { served } from '@/lib/api/prism';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { accentOf, withAccent } from '@/lib/accent';
import { initialsOf, isGroup, peerOf, presenceOf, titleOf, unreadOf } from '@/lib/view/conversation';
import { useParams } from '@/lib/router';
import { dayLabel, place } from '@/lib/grouping';
import { Link } from '@/routes/route-table';
import { READER_LANGUAGES, READER_LOCALE } from '@/lib/reader';
import { useOnline } from '@/lib/net/online';
import type { LocalDelivery } from '@/lib/view/message';
import { menuRows } from '@/lib/reading-mode/catalog';
import {
  resolveThreadMode,
  threadCapabilities,
  toStickyPreference,
  usesFlatRow,
} from '@/lib/reading-mode/decision';
import { readingModeStore } from '@/lib/reading-mode/store';
import { useThreadScene } from '@/lib/reading-mode/scene';
import { sceneStyleVars } from '@/lib/reading-mode/metrics';

/**
 * LE RÉSUMÉ VIVANT (#5695) — module À LA DEMANDE : `SummaryHost` n'entre
 * dans le CHUNK DU FIL qu'au moment où `readingDecision.mode === 'summary'`
 * demande son premier rendu (`import()`), jamais dans la première peinture.
 * `SummarySkeleton`, lui, reste un import STATIQUE (voir son doc-comment) :
 * c'est le `fallback` de la `Suspense` qui attend ce module.
 */
const SummaryHost = lazy(() => import('@/components/summary/summary-host'));

/**
 * LE SCOPE DU MAGASIN DE MODE DE LECTURE — `'local'` tant qu'aucune session
 * n'existe (#5555, D-13 : le scope prend un `userId` sans que ce fichier ni
 * `store.ts` ne bougent). C'est la même clé pour tout visiteur de CETTE
 * WebView tant que la session n'est pas branchée — acceptable ici (POC de
 * fixtures), à corriger par le lot `staging`.
 */
const READING_MODE_SCOPE = 'local';

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
 * Bulles), soit le Résumé Vivant (`mode === 'summary'`) — la prochaine
 * surface (Rivière, D-21) EXTRAIT le montage des modes dans
 * `src/routes/thread-modes.tsx` avant d'y ajouter la sienne : ce fichier
 * reste sous le budget de taille, mais il ne le restera pas une quatrième fois.
 */
export default function ThreadScreen() {
  const { conversation: id } = useParams<'/c/$conversation'>();
  const conversation = CONVERSATIONS.find((c) => c.id === id) ?? CONVERSATIONS[0]!;
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<readonly Message[]>(() => messagesOf(id));
  const [typing] = useState(true);
  const online = useOnline();

  /**
   * QUI LIT (#5695, étape 9) — `resolveViewer` (`lib/api/viewer.ts`) remplace
   * les deux `isAnonymous: false` en dur qui précédaient : en source
   * `fixtures`, `viewer.id === VIEWER_ID` par construction (inchangé,
   * observable nulle part) ; en `gateway`, la session RÉELLE tranche.
   */
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiConfig.source, session }), [session]);

  /**
   * LA FENÊTRE COUVRE-T-ELLE TOUT LE NON-LU ? — mime `cursorPagination.hasMore`
   * (`hasOlderMessagesOf`, `lib/api/fixtures.ts`) : c'est ce qui rend
   * « Sur les N derniers messages » (Résumé Vivant) atteignable sans mentir.
   */
  const windowCoversUnread = !hasOlderMessagesOf(conversation.id);

  /**
   * L'ÉTAT LOCAL D'UN ENVOI — à CÔTÉ du domaine, jamais dedans.
   *
   * « en attente » et « échoué » ne sont pas des champs de `Message` : le
   * serveur ne les sert pas, il ne les connaît même pas. Ce sont des états de
   * CE client, pour CE message, jusqu'à ce que le transport tranche. Les
   * graver dans la charge en ferait des données, et une charge remise à un
   * autre lecteur porterait un « échec » qui n'est pas le sien.
   */
  const [localDelivery, setLocalDelivery] = useState<ReadonlyMap<string, LocalDelivery>>(new Map());
  const setDelivery = (messageId: string, state: LocalDelivery) =>
    setLocalDelivery((previous) => new Map(previous).set(messageId, state));

  /**
   * LA PROTECTION (D-23, #5676).
   *
   * `expiredIds` — l'état qui FORCE le re-rendu d'UNE rangée quand son
   * minuteur éphémère s'éteint : `EphemeralBadge` tient son propre
   * intervalle (`memo`), il ne remonte que l'INSTANT d'expiration, jamais un
   * `setInterval` porté par la rangée elle-même.
   *
   * `consume` — la forme de la réponse `POST …/consume` MIMÉE
   * (`isFullyConsumed: true` sur `maxViewOnceCount: 1`,
   * `messages-view-once.ts:50-62`) : le fil lit toujours les fixtures
   * (`apiConfig.source`, `:22`), donc `consume` n'atteint jamais le réseau —
   * le PORT réel (`lib/api/view-once.ts::consumeViewOnce`) et le RÉDUCTEUR
   * (`applyConsumption`) que ce lot écrit sont ceux que #5493 (seconde
   * moitié) branchera sur `apiConfig.source === 'gateway'`. Hors ligne, la
   * consommation échoue PROPREMENT (`false`) — la fenêtre ne s'ouvre pas.
   *
   * `recordViewOnceConsumption` — la MOITIÉ qui manquait (revue #5676,
   * défaut 7) : `applyConsumption` ne change que `messages`, l'état LOCAL de
   * CETTE route, qui repart des fixtures à chaque montage. Sans elle, un
   * aller-retour vers `/` puis un retour sur ce fil relisait
   * `viewOnceCount: 0` et le secret se relisait — la couche de données
   * (`lib/api/fixtures.ts`) est le seul endroit qui survit au démontage.
   */
  const [expiredIds, setExpiredIds] = useState<ReadonlySet<string>>(new Set());
  const onEphemeralExpired = useCallback((messageId: string) => {
    setExpiredIds((previous) => (previous.has(messageId) ? previous : new Set(previous).add(messageId)));
  }, []);
  const consume = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!online) return false;
      recordViewOnceConsumption(messageId);
      setMessages((previous) => applyConsumption(previous, { messageId, viewOnceCount: 1 }));
      return true;
    },
    [online],
  );

  const otherUnread = CONVERSATIONS.filter((c) => c.id !== conversation.id).reduce(
    (total, c) => total + unreadOf(c),
    0,
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
  const placed = useMemo(() => place(messages, { locale: READER_LOCALE }), [messages]);
  const group = isGroup(conversation);

  /**
   * LE MODE DE LECTURE (#5566) — la LOI vit dans `@meeshy/shared`
   * (`decision.ts` ne fait que la consommer avec le catalogue de cet écran,
   * D-14) ; le CHOIX COLLANT vit dans `readingModeStore`, scopé
   * `(lecteur, conversation)`.
   *
   * `stickyMode` est un ÉTAT REACT qui MIROITE le magasin (comme
   * `@Published mode` du contrôleur iOS) : le magasin est la source de
   * vérité PERSISTANTE, l'état ne sert qu'à faire re-rendre l'écran quand la
   * sélection change.
   */
  const [stickyMode, setStickyMode] = useState<ConversationReadingMode | null>(() =>
    readingModeStore.getPreference(READING_MODE_SCOPE, conversation.id),
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
  const [lastOpenedAt] = useState(() => readingModeStore.lastOpenedAt(READING_MODE_SCOPE, conversation.id));
  useEffect(() => {
    readingModeStore.noteOpened(READING_MODE_SCOPE, conversation.id, openedAt);
    // Volontairement sur la seule CONVERSATION : ouvrir une fois par visite
    // de cet écran, jamais à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

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
        unreadCount: unreadOf(conversation),
        lastOpenedAt,
        now: openedAt,
        sticky: toStickyPreference(stickyMode),
        // #5695 : `summary` est désormais dans le catalogue de rendu web —
        // `viewer.isAnonymous` a un effet OBSERVABLE ici (un invité perd
        // `summary`, la loi le retire de `threadCapabilities`).
        isAnonymous: viewer.isAnonymous,
        conversationType: conversation.type,
        // #5696 : l'éligibilité de la Rivière lit `memberCount` comme iOS
        // (`ConversationView.swift:569`) — MÊME champ que celui affiché
        // juste en-dessous (« N participants »), voir `thread.tsx` ligne
        // sur `conversation.memberCount`.
        memberCount: conversation.memberCount ?? null,
      }),
    [conversation, lastOpenedAt, openedAt, stickyMode, viewer.isAnonymous],
  );
  const readingCapabilities = useMemo(
    () =>
      threadCapabilities({
        isAnonymous: viewer.isAnonymous,
        conversationType: conversation.type,
        memberCount: conversation.memberCount ?? null,
      }),
    [conversation.type, conversation.memberCount, viewer.isAnonymous],
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
    readingModeStore.setPreference(READING_MODE_SCOPE, conversation.id, mode);
    setStickyMode(mode);
  };
  const resetReadingModeToAuto = () => {
    readingModeStore.setPreference(READING_MODE_SCOPE, conversation.id, null);
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
  const scene = useThreadScene(scroller, { mode: readingDecision.mode });

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
    setPendingJump(messages.find((m) => m.senderId !== VIEWER_ID)?.id ?? null);
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
  const title = titleOf(conversation, VIEWER_ID);
  const accent = accentOf(conversation);
  /** Le `Participant` FIXTURE du lecteur — distinct de `viewer` (l'identité
   * résolue par `resolveViewer`, ci-dessus) : celui-ci porte la charge que
   * `sender` exige (avatar, présence…), jamais confondu avec « qui lit ». */
  const viewerParticipant = PARTICIPANTS.find((p) => p.userId === VIEWER_ID);

  /**
   * LE CADRAGE DES DATES DU RÉSUMÉ (#5695, étape 11) — `lang` est RÉSOLU
   * UNE FOIS ici, jamais une lecture DOM par nœud (`episode-list.tsx`,
   * `living-summary.tsx` le reçoivent en prop). `undefined` quand la locale
   * de cadrage EST celle du document — aucun `lang` superflu posé.
   */
  const summaryLang =
    typeof document === 'object' && READER_LOCALE !== document.documentElement.lang ? READER_LOCALE : undefined;

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
          preferredLanguages: READER_LANGUAGES,
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

  const send = (text: string, replyToId: string | null = null) => {
    /**
     * OPTIMISTIC UPDATE : le message apparait AVANT le reseau, en etat
     * « en-attente ». C'est non negociable sur la 3G visee — attendre l'accuse
     * du serveur avant de peindre ferait un composeur qui semble ne rien faire
     * pendant deux secondes.
     */
    const now = new Date();
    const localId = `local-${now.getTime()}`;
    /**
     * `navigator.onLine === false` est FIABLE : le système sait qu'aucune
     * interface n'est disponible. On marque donc l'échec TOUT DE SUITE plutôt
     * que de laisser une horloge tourner sur un envoi qui ne partira pas —
     * c'est la différence entre une application qui dit la vérité et une qui
     * fait semblant, et sur le réseau visé c'est le cas nominal.
     *
     * En ligne, l'état reste « en attente » : sans transport (#5493), aucune
     * confirmation n'existe, et peindre « remis » serait un mensonge. Le
     * manque se VOIT plutôt que de se cacher.
     */
    setDelivery(localId, online ? 'pending' : 'failed');
    setMessages((previous) => [
      ...previous,
      {
        id: localId,
        conversationId: conversation.id,
        senderId: VIEWER_ID,
        ...(viewerParticipant === undefined ? {} : { sender: viewerParticipant }),
        ...(replyToId === null ? {} : { replyToId }),
        content: text,
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
        // Rien n'est encore parti : `deliveredCount` à 0 est ce que
        // `deliveryOf` lit comme « en attente », sans champ inventé.
        deliveredCount: 0,
        readCount: 0,
        reactionCount: 0,
        isEncrypted: false,
        translations: [],
        createdAt: now,
        timestamp: now,
      },
    ]);
  };

  /**
   * LA REPRISE. Elle ne PROMET rien : elle remet le message en attente si le
   * réseau est revenu, et le laisse en échec sinon. Un bouton « Réessayer »
   * qui repasse en « en attente » alors que l'appareil est toujours coupé
   * ferait tourner une horloge pour rien — l'utilisateur croirait que ça part.
   */
  const retry = (messageId: string) => setDelivery(messageId, online ? 'pending' : 'failed');

  return (
    /* `h-dvh` + `overflow-hidden`, et NON `min-h-dvh` : c'est ce qui fait la
       difference entre une PAGE (le document entier defile, le composeur suit)
       et une APPLICATION (seule la zone des messages defile, l'en-tete et le
       composeur sont des bords fixes). Avec `min-h-dvh` le composeur recouvrait
       les derniers messages — le defaut le plus visible du premier rendu. */
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" style={withAccent(accent)}>
      <header
        className="z-10 shrink-0 backdrop-blur-xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)' }}
      >
        <div className="flex items-center gap-2 px-4 py-2">
          <Link
            to="list"
            className="relative grid size-11 shrink-0 place-items-center rounded-chip"
            style={{ color: 'var(--accent)' }}
            aria-label={otherUnread > 0 ? `Retour — ${otherUnread} messages non lus ailleurs` : 'Retour'}
          >
            <Glyph name="caretLeft" size={22} />
            {otherUnread > 0 ? (
              <span
                className="absolute top-0 right-0 grid min-h-4 min-w-4 place-items-center rounded-chip px-1 text-[9px] font-semibold text-white"
                style={{ backgroundColor: 'var(--color-error)' }}
                aria-hidden
              >
                {otherUnread}
              </span>
            ) : null}
          </Link>

          {expanded ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h1 className="truncate text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
                {title}
              </h1>
              <p className="flex items-center gap-1 text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
                <Glyph name="lock" size={9} style={{ color: 'var(--color-ok)' }} />
                {group ? `${conversation.memberCount} participants` : 'Chiffré de bout en bout'}
              </p>
            </div>
          ) : (
            <>
              <span className="flex-1" />
              {/* LE CHIP DE MODE — SOUS DRAPEAU UNIQUEMENT (D-20, miroir
                  `ConversationView.swift:2391-2430`) : `apiConfig.readingModesEnabled`
                  est un paramètre de CONSTRUCTION, figé au déploiement — quand il
                  est faux, `readingDecision.mode` vaut toujours `bubbles`
                  (`resolveThreadMode`), donc ce chip n'aurait jamais rien d'autre
                  à proposer que le mode déjà affiché. Clic ouvre le menu
                  (§1.7 : écart assumé vs iOS, voir `reading-mode-chip.tsx`).
                  Dans la grappe d'action, comme prescrit par la spécification
                  #5566. */}
              {apiConfig.readingModesEnabled ? (
                <ReadingModeChip
                  label={currentRow?.title ?? ''}
                  isAuto={readingDecision.reason !== 'sticky'}
                  rows={readingMenuRows}
                  onSelect={selectReadingMode}
                  onAuto={resetReadingModeToAuto}
                />
              ) : null}
              <button
                type="button"
                /* `shrink-0` : ces deux cibles ne cèdent JAMAIS. Sur un écran
                   étroit, c'est le chip qui tronque (voir `reading-mode-chip`). */
                className="grid size-11 shrink-0 place-items-center"
                style={{ color: 'var(--accent)' }}
                aria-label="Appeler"
              >
                <span
                  className="grid size-7 place-items-center rounded-chip"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
                >
                  <Glyph name="phone" size={13} />
                </span>
              </button>
              <button
                type="button"
                /* `shrink-0` : ces deux cibles ne cèdent JAMAIS. Sur un écran
                   étroit, c'est le chip qui tronque (voir `reading-mode-chip`). */
                className="grid size-11 shrink-0 place-items-center"
                style={{ color: 'var(--accent)' }}
                aria-label="Rechercher dans la conversation"
              >
                <span
                  className="grid size-7 place-items-center rounded-chip"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
                >
                  <Glyph name="magnifyingGlass" size={13} />
                </span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Replier l’en-tête' : 'Déplier l’en-tête'}
            className="shrink-0"
          >
            <Avatar
              initials={initialsOf(title)}
              color={accent}
              size={44}
              {...(group ? {} : { presence: presenceOf(peerOf(conversation, VIEWER_ID)) })}
            />
          </button>
        </div>
        {/*
          LE BANDEAU DE COUPURE. Discret et NON bloquant : l'application lit
          parfaitement hors ligne (précache), donc annoncer la coupure par un
          voile ou une modale punirait l'utilisateur pour un état où tout ce
          qu'il veut lire est déjà là. Ce qu'il doit savoir tient en une
          phrase : ce qu'il ÉCRIT ne partira pas maintenant.
        */}
        {online ? null : (
          <p
            role="status"
            className="flex items-center justify-center gap-1.5 px-4 py-1 text-check font-semibold"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-warn) 22%, transparent)',
              color: 'var(--color-ios-ink)',
            }}
          >
            <Glyph name="warningCircle" size={11} />
            Hors ligne — vos messages partiront à la reconnexion
          </p>
        )}
      </header>

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
        {readingDecision.mode === 'summary' ? (
          /*
            LE RÉSUMÉ VIVANT (#5695) — SOUS l'en-tête (le `<main>` du fil est
            déjà un FRÈRE de `<header>`, jamais en dessous en z-order) :
            correction du défaut #5682 de la cible iOS, pas sa recopie.
            La scène (`useThreadScene`) est INERTE sur ce mode
            (`reading-mode/scene.ts`) — le virtualiseur reste construit
            (`useVirtualizer` ne peut pas être conditionnel) mais rien ne
            monte de rangée `[data-row]` ici.
          */
          <Suspense fallback={<SummarySkeleton />}>
            <SummaryHost
              conversationId={conversation.id}
              messages={messages}
              participants={PARTICIPANTS}
              viewer={viewer}
              windowCoversUnread={windowCoversUnread}
              locale={READER_LOCALE}
              {...(summaryLang !== undefined ? { lang: summaryLang } : {})}
              onReplyToPerson={onReplyToPerson}
              onOpenEpisode={onOpenEpisode}
              onResumeThread={onResumeThread}
            />
          </Suspense>
        ) : (
          <>
            {placed.length === 0 ? (
              /*
                L'ÉTAT VIDE EST UN ÉTAT, pas une absence d'écran. Un fil sans
                historique qui rend du blanc laisse croire à un chargement qui ne
                finit pas — sur un réseau lent, c'est l'interprétation la plus
                naturelle et la plus fausse.
              */
              <div className="grid flex-1 place-items-center px-8 text-center">
                <div className="grid gap-2">
                  <p className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                    Aucun message pour l’instant
                  </p>
                  <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
                    Écrivez le premier — il sera traduit dans la langue de chacun.
                  </p>
                </div>
              </div>
            ) : null}

        <ol
          style={{
            position: 'relative',
            width: '100%',
            flexShrink: 0,
            marginBlockStart: 'auto',
            height: virtualizer.getTotalSize(),
          }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const p = placed[row.index];
            if (p === undefined) return null;
            const isElected = scene.elected === p.message.id;
            return (
            <li
              key={p.message.id}
              data-index={row.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                insetInlineStart: 0,
                top: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
                /* CHAQUE rangée est un CONTEXTE D'EMPILEMENT (`transform`), et
                   les rangées se peignent dans l'ordre du DOM : les
                   superpositions de l'élue qui DÉBORDENT vers le bas (bande de
                   focus, tampon) passaient donc SOUS la rangée suivante.
                   Mesuré : `elementFromPoint` au centre du drapeau de la bande
                   rendait la rangée d'APRÈS — le contrôle était INATTEIGNABLE
                   au doigt et à la souris, quoique présent et fonctionnel
                   (correction de revue #5648). Élever la SEULE rangée élue
                   suffit ; aucune autre ne porte de débord. */
                ...(isElected ? { zIndex: 1 } : {}),
              }}
            >
              {p.opensDay ? (
                <div className="flex justify-center py-1.5">
                  <span
                    className="rounded-chip px-3 py-1 text-time font-semibold backdrop-blur-md"
                    style={{
                      color: 'var(--color-day-ink)',
                      border: '0.5px solid var(--color-day-hairline)',
                      backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 70%, transparent)',
                    }}
                  >
                    {dayLabel(p.message.createdAt, { locale: READER_LOCALE })}
                  </span>
                </div>
              ) : null}
              {/* LE MODE DE LECTURE (#5566) : `focal`/`script` rendent la
                  rangée plate, `bubbles` reste la bulle historique — D-7,
                  D-8. `data-row` est le CANDIDAT d'élection de
                  `reading-mode/scene.ts` (#5648) — posé sur CHAQUE rangée,
                  candidat SEULEMENT quand la scène est armée (mode focal). */}
              <div data-row={p.message.id}>
                {usesFlatRow(readingDecision.mode) ? (
                  <FocalRow
                    mode={readingDecision.mode}
                    place={p}
                    languages={READER_LANGUAGES}
                    viewerId={VIEWER_ID}
                    onJumpToMessage={jumpToMessage}
                    highlighted={highlightedId === p.message.id}
                    elected={isElected}
                    expired={expiredIds.has(p.message.id)}
                    onConsumeViewOnce={consume}
                    onEphemeralExpired={onEphemeralExpired}
                    {...(localDelivery.has(p.message.id)
                      ? {
                          localDelivery: localDelivery.get(p.message.id) as LocalDelivery,
                          onRetry: () => retry(p.message.id),
                        }
                      : {})}
                  />
                ) : (
                  <Bubble
                    place={p}
                    languages={READER_LANGUAGES}
                    isGrouped={group}
                    viewerId={VIEWER_ID}
                    onJumpToMessage={jumpToMessage}
                    highlighted={highlightedId === p.message.id}
                    expired={expiredIds.has(p.message.id)}
                    onConsumeViewOnce={consume}
                    onEphemeralExpired={onEphemeralExpired}
                    {...(localDelivery.has(p.message.id)
                      ? {
                          localDelivery: localDelivery.get(p.message.id) as LocalDelivery,
                          onRetry: () => retry(p.message.id),
                        }
                      : {})}
                  />
                )}
              </div>
            </li>
            );
          })}
        </ol>

        {typing ? (
          /* L'indicateur de frappe est une VRAIE cellule du flux, en queue —
             pas un overlay : il pousse le fil comme le ferait un message, donc
             l'arrivee du vrai message ne fait sauter aucune ligne. */
          <div className="flex items-end gap-1.5 py-1">
            <Avatar initials="AD" color={accent} size={18} />
            <span
              className="flex items-center gap-1.5 rounded-chip px-3 py-2"
              style={{ backgroundColor: 'var(--color-ios-card)' }}
            >
              <span className="text-time" style={{ color: 'var(--color-ios-ink-2)' }}>
                Amina écrit
              </span>
              <span className="flex gap-[3px]" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-[5px] rounded-full"
                    style={{
                      backgroundColor: 'var(--accent)',
                      animation: 'typingDot 1s ease-in-out infinite',
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
              </span>
            </span>
          </div>
        ) : null}
          </>
        )}
      </main>

      <div className="shrink-0">
        <Composer
          onSend={(text) => {
            send(text, replyTarget);
            setReplyTarget(null);
          }}
          {...(replyTo ? { replyTo, onCancelReply: () => setReplyTarget(null) } : {})}
        />
      </div>
    </div>
  );
}
