import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useStore } from 'zustand/react';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { STORY_ACTION_RAIL_CORRIDOR, StoryActionRail, type StoryActionRailHandlers } from '@/components/story-action-rail';
import { apiDeps } from '@/lib/api/deps';
import { markStoryViewedAction, storyReactionAction, useStoryFeed, useStoryPost } from '@/lib/api/query';
import { attachmentSrc } from '@/lib/api/media-url';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { backgroundCss } from '@/lib/canvas/background';
import { parseCanvasDocument } from '@/lib/canvas/document';
import { useOnline } from '@/lib/net/online';
import { shortRelativeTime } from '@/lib/relative-time';
import {
  HOLD_THRESHOLD_MS,
  classifyTapZone,
  decideTouchDown,
  decideTouchUp,
  isDoubleTap,
  isDrag,
} from '@/lib/stories/gesture';
import {
  freezeStoryActionRail,
  reconcileStoryActionRailComments,
  type FrozenStoryActionRail,
} from '@/lib/stories/action-rail';
import { STORY_DEFAULT_REACTION, hasReactedToStory } from '@/lib/stories/reaction';
import { resolveStoryCaption } from '@/lib/stories/caption';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { translate } from '@/lib/i18n-catalog';
import { resolveStoryMediaCaption } from '@/lib/stories/media-caption';
import { readerCardFraming } from '@/lib/stories/framing';

import { CloseButton, ProgressBars, StoryMediaLayer } from './story-parts';
import {
  currentStoryAt,
  groupForPlayback,
  nextPosition,
  previousPosition,
  resolvePlayablePosition,
  resolvePosition,
  slideDurationForScene,
  slideDurationMs,
  stableGroupOrder,
  storyEffectsBackgroundOf,
  storyMediaUrl,
  type StoryPlaybackGroup,
  type StoryPlaybackStory,
} from '@/lib/stories/playback';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';
import { shortcutYieldsToTarget } from '@/lib/view/shortcut-scope';
import { useElementSize } from '@/lib/view/use-element-size';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useParams } from '@/lib/router';
import { Link, href, navigate } from '@/routes/route-table';

/** L'hôte des scènes v3 (#6899) — chargé À LA DEMANDE, motif D-54 : une story
 * v1 ne paie ni ses lois (image seule, bandes, son de fond), ni le moteur. */
const StorySceneLayer = lazy(() => import('./story-scene-layer'));

/** Le fil de commentaires — chargé À LA DEMANDE (motif D-54) : un lecteur qui
 * regarde des stories sans les commenter ne paie ni la liste, ni le
 * composeur, ni leur requête. */
const StoryCommentsSheet = lazy(() =>
  import('@/components/story-comments-sheet').then((m) => ({ default: m.StoryCommentsSheet })),
);

/**
 * **LE LECTEUR PLEIN ÉCRAN DE STORIES** (#5817, D-1) — la référence est le
 * code SwiftUI cité dans la spécification : `StoryViewerContainer.swift`,
 * `StoryViewerView.swift` (+`Content`, `+Header`, `+CanvasCaption`,
 * `+Canvas`), `StoryIndexResolver.swift`, `StoryPlaybackSkipResolver.swift`.
 * Les lois PURES vivent dans `lib/stories/{playback,gesture,caption}.ts`
 * (testées séparément) ; ce fichier ne fait que les COMPOSER contre le DOM.
 *
 * Périmètre #5817 : story TEXTE et IMAGE seulement. Canvas/scène riche,
 * réactions, commentaires, kebab, audio/vidéo de fond, swipe vertical de
 * fermeture et republication sont des COMPAGNONS hors tranche (§ 0 de la
 * spécification).
 *
 * **LE RETOUR MATÉRIEL N'UTILISE PAS `useBackDismiss`**, et c'est délibéré :
 * ce hook est fait pour une COUCHE MODALE posée sur un écran INCHANGÉ (il
 * pousse une entrée d'historique de MÊME URL puis la rend au démontage). Ici
 * le lecteur est une ROUTE : le retour matériel Android, comme le retour du
 * navigateur, remonte l'historique et le routeur re-rend la liste — le
 * mécanisme générique, celui de `/c/$conversation`. Y ajouter le hook
 * poserait une entrée fantôme `/story/…` qu'un retour ultérieur ferait
 * réapparaître.
 */

type GestureState = {
  startX: number;
  startY: number;
  startTime: number;
  holdTimer: number | null;
  holdFired: boolean;
  resumedThisGesture: boolean;
};

/**
 * **LES DEUX VOILES DU CHROME** — sans eux, le nom de l'auteur et la légende
 * sont du BLANC POSÉ SUR UNE PHOTO ARBITRAIRE. Mesuré sur les captures du
 * premier jet (`node -e` sur les couleurs réelles) : le nom tient 4,47:1 sur
 * le fond par défaut (indigo 500 — SOUS la barre AA de 4,5) et 1,83:1 sur le
 * ciel clair d'une photo ; l'heure, servie à 75 % d'opacité comme iOS, tombe
 * à 3,24 et 1,59. Avec ces voiles : 12,22 / 7,62 sur l'indigo, 7,36 / 4,98
 * sur le ciel clair — au-dessus d'AA dans les quatre cas.
 *
 * **iOS n'en a pas** (`StoryViewerView+Header.swift` ne pose ni dégradé ni
 * ombre derrière le nom, vérifié) : c'est un ÉCART ASSUMÉ, du même genre que
 * les défauts de la cible déjà catalogués (`targets/README.md` § #5681-#5683).
 * D-1 fait d'iOS la référence de la DISPOSITION, de la hiérarchie, des états
 * et des gestes — aucun de ces quatre n'est touché ici : le voile ne déplace
 * rien, il rend lisible ce qui y est déjà. Un contraste sous AA n'est pas une
 * cible dont on hérite.
 */
const CHROME_SCRIM_TOP = 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 100%)';
const CHROME_SCRIM_BOTTOM = 'linear-gradient(0deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 100%)';
/** Quatre lignes au plus, comme la légende du fil — partagé par les DEUX
 * contenus du pied (`Post.content` et `PostMedia.caption`, #6944) : deux
 * copies de ce style auraient divergé au premier ajustement. */
const CLAMPED_CAPTION = {
  color: '#fff',
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
} as const;

/** `StoryBackgroundValue` (`StoryBackgroundValue.swift:1-38`) — `"RRGGBB"` ou
 * `"gradient:RRGGBB:RRGGBB"`, validée par le SITE UNIQUE `backgroundCss`
 * (`lib/canvas/background.ts`, T6, #6899) que le moteur de scène partage
 * désormais avec ce fond v1. */
function sceneBackground(background: string | null | undefined): CSSProperties {
  return { background: backgroundCss(background, 'linear-gradient(135deg, var(--color-ios-brand), var(--color-ios-brand-deep))') };
}

/** Le nom affiché — même repli qu'`storyAuthorLabel` (`lib/view/story-tray.ts`),
 * appliqué ici à `StoryPlaybackGroup` (forme distincte de `StoryTrayGroup`,
 * l'ordre de lecture n'étant pas l'ordre du plateau). */
function authorLabel(group: StoryPlaybackGroup): string {
  const a = group.author;
  if (a === undefined) return '';
  if (group.isMine) return 'Votre story';
  const fullName = [a.firstName, a.lastName].filter((part) => part !== undefined && part !== '').join(' ');
  return a.displayName ?? (fullName !== '' ? fullName : (a.username ?? ''));
}

export default function StoryScreen() {
  const { post } = useParams<'/story/$post'>();
  const [currentId, setCurrentId] = useState(post);

  /* Une NOUVELLE adresse sur la MÊME route (une notification ouverte pendant
     la lecture, un lien collé) change `post` sans remonter l'écran : sans
     cette synchronisation, le lecteur resterait sur la story précédente. La
     progression interne, elle, ne touche pas l'URL — le retour FERME le
     lecteur (critère de fin), il ne recule pas d'une story. */
  useEffect(() => {
    setCurrentId(post);
  }, [post]);

  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiDeps.source, session }), [session]);
  const reader = useReaderLanguages();
  const online = useOnline();
  const interfaceLanguage = currentInterfaceLanguage();
  const feed = useStoryFeed();

  /* L'ORDRE DES AUTEURS EST FIGÉ À L'OUVERTURE (`stableGroupOrder`,
     `lib/stories/playback.ts`) : le rang d'un groupe dépend de `hasUnseen`,
     que la lecture fait basculer — un corpus rafraîchi en cours de route
     reclasserait les groupes sous le lecteur et le ferait FERMER au lieu de
     passer à l'auteur suivant. Le contenu reste frais ; seul le rang est gelé. */
  /**
   * **LA TROISIÈME MARCHE DE LA CASCADE** (#5817, revue-correction, défaut
   * 4) — miroir de `StoryViewerContainer.swift:297-352`. `loadStoryFeed` ne
   * sert que les 50 stories les plus récentes ; une story partagée par LIEN
   * mais hors de cette fenêtre (l'exact cas que `parity.md:310` qualifie
   * « lien partageable publiquement ») ne s'y trouve jamais, quel que soit
   * l'état du réseau. `primaryGroups`/`primaryRawPosition` mesurent CE
   * MANQUE sur le corpus principal SEUL, avant tout repli — c'est ce
   * verdict, jamais un simple « le corpus est là », qui arme le repli.
   */
  const primaryGroups = useMemo(
    () => groupForPlayback(feed.data ?? [], { viewerId: viewer.id ?? undefined }),
    [feed.data, viewer.id],
  );
  const primaryRawPosition = useMemo(() => resolvePosition(primaryGroups, currentId), [primaryGroups, currentId]);
  const hasCorpus = feed.data !== undefined;
  const needsFallbackFetch = hasCorpus && primaryRawPosition === null;
  const fallback = useStoryPost(currentId, { enabled: needsFallbackFetch });

  const frozenOrder = useRef<readonly string[]>([]);
  const groups = useMemo(() => {
    const alreadyPresent = feed.data?.some((story) => story.id === fallback.data?.id) ?? false;
    const fresh =
      fallback.data === undefined || alreadyPresent
        ? primaryGroups
        : groupForPlayback([...(feed.data ?? []), fallback.data], { viewerId: viewer.id ?? undefined });
    if (frozenOrder.current.length === 0) frozenOrder.current = fresh.map((g) => g.authorId);
    return stableGroupOrder(fresh, frozenOrder.current);
  }, [primaryGroups, fallback.data, feed.data, viewer.id]);

  const rawPosition = useMemo(() => resolvePosition(groups, currentId), [groups, currentId]);
  const playablePosition = useMemo(
    () => (rawPosition === null ? null : resolvePlayablePosition(groups, rawPosition, Date.now())),
    [groups, rawPosition],
  );

  const closeViewer = useCallback(() => {
    navigate(href('list'), true);
  }, []);

  /* LE SAUT DES ILLISIBLES (§ 1.2) — reconcilie l'ÉTAT après chaque
     changement de position : la story ciblée peut être expirée ou vide, et
     `resolvePlayablePosition` dit où aller à la place, ou `'close'` quand la
     liste entière l'est. */
  useEffect(() => {
    if (playablePosition === 'close') {
      closeViewer();
      return;
    }
    if (playablePosition === null || rawPosition === null) return;
    if (playablePosition.groupIndex === rawPosition.groupIndex && playablePosition.storyIndex === rawPosition.storyIndex) return;
    const skippedTo = currentStoryAt(groups, playablePosition);
    if (skippedTo !== undefined) setCurrentId(skippedTo.id);
  }, [playablePosition, rawPosition, groups, closeViewer]);

  const group = playablePosition !== null && playablePosition !== 'close' ? groups[playablePosition.groupIndex] : undefined;
  /* LA PHOTO DE L'AUTEUR, DÉRIVÉE UNE FOIS (#6975) — `participantAvatarOf`
     accepte un auteur ABSENT, donc pas de garde à écrire ici. */
  const authorPhoto = participantAvatarOf(group?.author);
  const currentStory: StoryPlaybackStory | undefined =
    playablePosition !== null && playablePosition !== 'close' ? currentStoryAt(groups, playablePosition) : undefined;

  const advance = useCallback(
    (direction: 'previous' | 'next') => {
      if (playablePosition === null || playablePosition === 'close') return;
      const target =
        direction === 'next'
          ? nextPosition(groups, playablePosition, Date.now())
          : previousPosition(groups, playablePosition);
      if (target === 'close') {
        closeViewer();
        return;
      }
      if (target === null) return;
      const story = currentStoryAt(groups, target);
      if (story !== undefined) setCurrentId(story.id);
    },
    [groups, playablePosition, closeViewer],
  );

  const media = currentStory?.media?.[0];
  const mediaUrl = media === undefined ? '' : storyMediaUrl(media);
  const mediaSrc = mediaUrl === '' ? '' : attachmentSrc(mediaUrl);
  const hasMedia = (currentStory?.media?.length ?? 0) > 0;

  /**
   * **LA PORTE v3** (§ 1.2 de la spécification `stories-lecteur`) — un
   * document canvas v3 (`storyEffects`) se rend par le MÊME moteur que le
   * fil (`StorySceneLayer` → `ScenePlayer`, D-79) ; `null` retombe sur le
   * chemin v1 INCHANGÉ (`StoryMediaLayer`).
   */
  const sceneDocument = useMemo(() => parseCanvasDocument(currentStory?.storyEffects), [currentStory]);
  const firstScene = sceneDocument?.scenes[0];
  /** La scène a-t-elle un son à couper ? Appris de la couche de scène (chargée
   * à la demande), qui seule connaît le porteur et l'élection de la piste.
   * La réponse porte l'IDENTITÉ de la story qui l'a donnée : une remise à zéro
   * « à chaque story » dans l'effet du lecteur s'exécuterait APRÈS l'effet de
   * la couche (les effets d'un enfant passent avant ceux du parent) et
   * effacerait la réponse de la story qu'on vient d'ouvrir. */
  const [soundAvailability, setSoundAvailability] = useState<{ readonly storyId: string; readonly available: boolean } | null>(null);
  const showsSound =
    sceneDocument !== null && soundAvailability !== null && soundAvailability.storyId === currentStory?.id && soundAvailability.available;
  const [observeScene, sceneSize] = useElementSize();
  /* La zone sûre haute en PIXELS (`topInset` du plateau iOS) : une sonde de
     hauteur `var(--safe-top)`, mesurée comme le reste — jamais une seconde
     source de la valeur que la coque pose. */
  const [observeSafeTop, safeTopSize] = useElementSize();
  /** Muet VIEWER (`isGlobalMuted = false`, `StoryViewerView.swift:165`) — le
   * son joue par défaut et le muet survit aux avances. Un refus de la
   * politique de lecture automatique (ouverture par lien, sans geste) le
   * pose à `true` : le bouton dit alors la vérité, et le toucher est le geste
   * qui autorise le son. */
  const [storySoundMuted, setStorySoundMuted] = useState(false);
  const muteBlockedPlayback = useCallback(() => setStorySoundMuted(true), []);

  const [paused, setPaused] = useState(false);
  /* Le chrome se MASQUE pendant la pause par APPUI LONG et revient à la
     reprise (`onChromeVisibilityChange`, `StoryViewerView+Canvas.swift:45-52`)
     — jamais pendant une pause d'une autre cause (double-tap central), qui
     laisse l'en-tête lisible. */
  const [chromeHidden, setChromeHidden] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  /**
   * **LE PLAN DU RAIL, FIGÉ À L'ENTRÉE DE LA DIAPOSITIVE** (directive porteur
   * 2026-07-10, `StoryActionRailPlan`) — la loi vit dans
   * `lib/stories/action-rail.ts` ; ici on ne fait que l'appeler au bon
   * moment. Le gel porte l'identité de la story, comme `mediaDuration` et
   * `soundAvailability` : une remise à zéro « à chaque story » serait la
   * même course entre les effets du parent et ceux de l'enfant.
   */
  const [frozenRail, setFrozenRail] = useState<FrozenStoryActionRail | null>(null);
  /** Le fil de commentaires, ouvert par « Commentaires » ou par « Répondre »
   * — une seule zone de saisie pour les deux (spécification porteur du
   * 2026-05-28, citée par `StoryComposerBarView`). */
  const [commentsOpen, setCommentsOpen] = useState(false);
  const showsImage = mediaSrc !== '' && !mediaFailed;
  /**
   * « PRÊT » ET LA DURÉE APPARTIENNENT À UNE STORY, et portent son identité
   * (#6899, revue-correction). Les remettre à zéro dans l'effet « à chaque
   * story » ci-dessous était une COURSE : les effets d'un enfant passent avant
   * ceux du parent, donc une couche de scène déjà chargée qui se déclare prête
   * à son montage (un fond de couleur, une image en cache) était ÉCRASÉE par
   * la remise à zéro de la story qu'elle venait d'ouvrir — la barre restait à
   * 0. Une valeur étiquetée par story ne se remet jamais à zéro : elle cesse
   * simplement de valoir pour la suivante.
   */
  const [readyStoryId, setReadyStoryId] = useState<string | null>(null);
  const contentReady =
    currentStory !== undefined && (readyStoryId === currentStory.id || (sceneDocument === null && mediaSrc === ''));
  /** LA DURÉE DU MÉDIA COURANT (#6836) — `null` tant que le décodeur ne l'a pas
   * annoncée, et pour toute story qui n'en porte pas. `slideDurationMs` traite
   * `null` comme « pas de média » et rend le plancher : une story de texte garde
   * donc exactement les 6 s qu'elle avait. Sans cette étiquette, la durée du
   * clip précédent gouvernerait la diapositive suivante. */
  const [mediaDuration, setMediaDuration] = useState<{ readonly storyId: string; readonly ms: number } | null>(null);
  const mediaDurationMs = currentStory !== undefined && mediaDuration?.storyId === currentStory.id ? mediaDuration.ms : null;
  /* L'ÉTAT PRÉCÉDENT est rendu tel quel quand rien ne change : `StoryMediaLayer`
     annonce la durée depuis une réf de rappel EN LIGNE, rappelée à CHAQUE
     rendu (#6866). Un objet neuf à chaque annonce relançait un rendu, qui
     relançait l'annonce — une boucle sans fin, mesurée (`check-feed-media` figé
     sur `/story/st-video`, moteur de rendu à 100 % pendant vingt minutes). */
  const reportMediaDuration = useCallback((storyId: string, ms: number) => {
    setMediaDuration((current) => (current !== null && current.storyId === storyId && current.ms === ms ? current : { storyId, ms }));
  }, []);
  const elapsedRef = useRef(0);
  const startTsRef = useRef(0);
  const markedRef = useRef<Set<string>>(new Set());
  const barRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLSpanElement | null>(null);

  /** L'UNIQUE écriture de la progression — hors de React, à chaque image. */
  const paintProgress = useCallback((ratio: number) => {
    const fill = fillRef.current;
    if (fill !== null) fill.style.transform = `scaleX(${ratio})`;
    const bar = barRef.current;
    if (bar === null) return;
    const percent = String(Math.round(ratio * 100));
    if (bar.getAttribute('aria-valuenow') !== percent) bar.setAttribute('aria-valuenow', percent);
  }, []);

  useEffect(() => {
    elapsedRef.current = 0;
    startTsRef.current = performance.now();
    setPaused(false);
    setChromeHidden(false);
    setMediaFailed(false);
    paintProgress(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStory?.id]);

  useEffect(() => {
    if (currentStory === undefined) return;
    if (markedRef.current.has(currentStory.id)) return;
    markedRef.current.add(currentStory.id);
    void markStoryViewedAction(currentStory.id);
  }, [currentStory]);

  const pause = useCallback(() => {
    setPaused((was) => {
      if (!was) elapsedRef.current += performance.now() - startTsRef.current;
      return true;
    });
  }, []);
  const resume = useCallback(() => {
    setPaused((was) => {
      if (was) startTsRef.current = performance.now();
      return false;
    });
    setChromeHidden(false);
  }, []);

  useEffect(() => {
    if (currentStory === undefined || paused || !contentReady) return;
    let raf = 0;
    /* UNE SEULE VALEUR POUR LA BARRE ET POUR L'AVANCE (#6836) — calculée une
       fois par diapositive, hors de la boucle. iOS l'exige explicitement
       (« Garantit que progress bar et auto-advance utilisent la MÊME valeur »,
       `StoryViewerView+Content.swift`) : deux sources donneraient une barre qui
       ment sur ce qui reste. Ici c'est structurel — `ratio` gouverne les deux,
       donc mesurer la barre mesure aussi le moment où la story avance. */
    const dureeMs =
      sceneDocument !== null
        ? slideDurationForScene({ scene: firstScene ?? {}, mediaDurationMs })
        : slideDurationMs({ mediaDurationMs });
    const tick = () => {
      const elapsed = elapsedRef.current + (performance.now() - startTsRef.current);
      const ratio = Math.min(1, elapsed / dureeMs);
      paintProgress(ratio);
      if (ratio >= 1) {
        advance('next');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [currentStory, paused, contentReady, mediaDurationMs, sceneDocument, firstScene, advance, paintProgress]);

  /* LES GESTES (§ 1.3) — trois bandes, appui posé = pause, le relâchement ne
     reprend pas, le tap suivant reprend sans naviguer. */
  const gestureRef = useRef<GestureState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    holdTimer: null,
    holdFired: false,
    resumedThisGesture: false,
  });
  const lastCenterTapRef = useRef(-Infinity);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const zone = classifyTapZone((e.clientX - rect.left) / rect.width);
    const g = gestureRef.current;
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.startTime = performance.now();
    g.holdFired = false;
    g.resumedThisGesture = decideTouchDown({ zone, isPaused: paused }) === 'resume';
    if (g.resumedThisGesture) resume();
    g.holdTimer = window.setTimeout(() => {
      g.holdFired = true;
      pause();
      setChromeHidden(true);
    }, HOLD_THRESHOLD_MS);
  };

  const clearHoldTimer = () => {
    const g = gestureRef.current;
    if (g.holdTimer !== null) {
      clearTimeout(g.holdTimer);
      g.holdTimer = null;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    clearHoldTimer();
    if (g.holdFired || g.resumedThisGesture) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const zone = classifyTapZone((e.clientX - rect.left) / rect.width);
    const moved = isDrag(Math.hypot(e.clientX - g.startX, e.clientY - g.startY));
    const elapsedMs = performance.now() - g.startTime;
    const action = decideTouchUp({ zone, holdActive: false, moved, elapsedMs });

    if (action === 'previous') return advance('previous');
    if (action === 'next') return advance('next');
    if (zone === 'center' && !moved) {
      const now = performance.now();
      if (isDoubleTap(now - lastCenterTapRef.current)) {
        lastCenterTapRef.current = -Infinity;
        if (paused) resume();
        else pause();
      } else {
        lastCenterTapRef.current = now;
      }
    }
  };

  /* L'ONGLET CACHÉ NE CONSOMME PAS UNE STORY (miroir web de
     `scenePhase == .background ⇒ isPresented = false`,
     `StoryViewerView.swift:614-622`). `requestAnimationFrame` s'arrête quand
     l'onglet passe en arrière-plan, mais `elapsedRef` se calcule depuis
     `performance.now()`, qui, lui, continue : au retour, le PREMIER tick
     trouvait `ratio >= 1` et avalait la story sans que personne ne l'ait vue.
     On met donc en pause à la disparition et on ne reprend qu'une pause qu'on
     a soi-même posée — une pause voulue par l'utilisateur (appui long,
     double-tap) survit au passage en arrière-plan. */
  const hiddenPauseRef = useRef(false);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenPauseRef.current = !paused;
        if (!paused) pause();
        return;
      }
      if (!hiddenPauseRef.current) return;
      hiddenPauseRef.current = false;
      resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [paused, pause, resume]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* ÉCHAP D'ABORD, ET SANS CONDITION : fermer depuis un champ reste juste,
         et la feuille de commentaires, qui veut le garder pour elle,
         l'intercepte en phase de CAPTURE (`story-comments-sheet.tsx`). */
      if (e.key === 'Escape') {
        closeViewer();
        return;
      }
      /* LE RESTE APPARTIENT AU NŒUD QUI A LE FOCUS, TOUCHE PAR TOUCHE
         (`lib/view/shortcut-scope.ts`, D-91). Sans cette cession, mesuré au
         navigateur : « a b » tapé dans le composeur de commentaire rendait
         « ab » (le raccourci de pause avalait l'espace), une flèche pendant
         la frappe faisait avancer la story — ce qui ferme la feuille et
         emporte le brouillon — et Espace n'activait AUCUN bouton du lecteur,
         le `click` d'un `<button>` naissant d'un `keyup` que le
         `preventDefault` ci-dessous supprimait. La cession est FINE : un
         bouton ne réclame qu'Espace et Entrée, sinon cliquer « muet » (ce
         qui le focalise) figerait les flèches jusqu'au clic suivant. */
      if (shortcutYieldsToTarget({ target: e.target, key: e.key })) return;
      if (e.key === 'ArrowLeft') advance('previous');
      else if (e.key === 'ArrowRight') advance('next');
      else if (e.key === ' ') {
        e.preventDefault();
        if (paused) resume();
        else pause();
      } else if (e.key === 'm' || e.key === 'M') {
        if (showsSound) setStorySoundMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, paused, pause, resume, closeViewer, showsSound]);

  /* LE GEL — re-résolu au CHANGEMENT de story, et la seule remontée que le
     lecteur apprend ensuite est le SON (le sondage de piste audio conclut
     souvent après l'entrée). Le compteur de commentaires, lui, est déjà dans
     le corpus : sa RÉCONCILIATION est un second chemin, appliqué ci-dessous
     quand le corpus se rafraîchit sous le lecteur. */
  useEffect(() => {
    if (currentStory === undefined) return;
    setFrozenRail((current) =>
      freezeStoryActionRail(current, {
        storyId: currentStory.id,
        isOwnStory: group?.isMine === true,
        /* `canReply` — la capacité que l'hôte OFFRE, miroir de
           `onReplyToStory != nil` : le web répond par le fil de commentaires
           de la publication, donc il peut toujours. */
        canReply: true,
        hasAudibleSound: showsSound,
        commentCount: currentStory.commentCount ?? 0,
        /* Le Prisme a-t-il quelque chose à explorer ? Le lecteur web ne sert
           pas encore de sélecteur de langue : `false` retire le bouton, et
           `storyActionRailButtons` le fait sans branche à oublier (loi 4). */
        hasTranslatableContent: false,
      }),
    );
  }, [currentStory, group?.isMine, showsSound]);

  useEffect(() => {
    if (currentStory === undefined) return;
    const count = currentStory.commentCount ?? 0;
    if (count <= 0) return;
    setFrozenRail((current) =>
      current === null ? current : reconcileStoryActionRailComments(current, { storyId: currentStory.id, commentCount: count }),
    );
  }, [currentStory]);

  /* LA FEUILLE MET LA LECTURE EN PAUSE — sans cela, la story avancerait sous
     le fil qu'on lit, et le composeur changerait de publication à mi-phrase. */
  useEffect(() => {
    if (!commentsOpen) return;
    pause();
    return () => resume();
  }, [commentsOpen, pause, resume]);

  /* Une nouvelle story ferme le fil : il appartenait à la précédente. */
  useEffect(() => {
    setCommentsOpen(false);
  }, [currentStory?.id]);

  /**
   * **CE QUE LE GESTE DE RÉACTION APPREND DOIT S'ENTENDRE** (#7112, revue).
   * `performStoryReaction` distingue trois issues — parti, POSÉ MAIS NON
   * CONFIRMÉ (réseau, 5xx, 429), REFUSÉ et défait — et rendait ses deux clés
   * (`STORY_REACTION_PENDING`, `STORY_REACTION_FAILED`) à un appelant qui les
   * JETAIT (`void storyReactionAction(...)`). Mesuré : aucun site du dépôt ne
   * lisait ces clés. Un refus permanent retirait donc le cœur SANS un mot —
   * indiscernable d'un second tap — et un geste hors ligne ressemblait à un
   * geste confirmé. C'est la « loi qui calcule une valeur que personne ne
   * lit », et le remède est celui que les Réels emploient déjà sur la MÊME
   * grammaire d'issues (`usePostGesture` → `reels.tsx`) : une région
   * `role="status"` unique, la dernière annonce gagnant (`useLiveAnnouncer`).
   */
  const { text: announcement, announce } = useLiveAnnouncer();

  const railHandlers = useMemo<StoryActionRailHandlers>(() => {
    if (currentStory === undefined) return {};
    const storyId = currentStory.id;
    return {
      ...(showsSound ? { sound: () => setStorySoundMuted((m) => !m) } : {}),
      react: () => {
        void storyReactionAction(storyId).then((result) => {
          if (!result.ok) announce(translate(interfaceLanguage, result.message));
          else if (result.notice !== undefined) announce(translate(interfaceLanguage, result.notice));
        });
      },
      /* « Répondre » et « Commentaires » ouvrent la MÊME feuille : une seule
         zone de saisie, et le bouton de réponse n'est donc jamais un second
         composeur (spécification porteur 2026-05-28). */
      reply: () => setCommentsOpen(true),
      comments: () => setCommentsOpen(true),
    };
  }, [currentStory, showsSound, announce, interfaceLanguage]);

  /* LE RAIL EST-IL PEINT ? Une seule réponse, lue par le rail ET par la
     légende qui doit lui laisser la place. */
  const railShown =
    currentStory !== undefined && frozenRail !== null && frozenRail.storyId === currentStory.id && Object.keys(railHandlers).length > 0;

  const resolvedContent = useMemo(() => {
    if (currentStory === undefined) return null;
    return resolveStoryCaption({
      preferredLanguages: reader.languages,
      originalLanguage: currentStory.originalLanguage,
      translations: currentStory.translations,
      content: currentStory.content ?? '',
    });
  }, [currentStory, reader.languages]);

  /**
   * **LA LÉGENDE DU MÉDIA** (#6944) — `PostMedia.caption`, un contenu
   * DISTINCT de `resolvedContent` ci-dessus (`Post.content`) : « une story
   * n'a pas de `content` mais l'image ou la vidéo de fond peut avoir une
   * légende » (directive porteur 2026-09-17). La passerelle la sert et la
   * traduit depuis #6280 ; personne ne la RENDAIT — la question du cycle 122
   * (« qui AFFICHE ce que le résolveur élit ? ») restée sans réponse.
   *
   * La descente passe par le site existant (`resolveStoryMediaCaption` →
   * `resolveMediaCaption`, `lib/api/prism.ts`), jamais une boucle réécrite, et
   * la règle de DÉRIVATION de `caption.ts` ne s'y applique pas : elle juge un
   * `Post.content` qui redit les calques, pas une légende qui a son sujet.
   */
  const resolvedMediaCaption = useMemo(
    () => resolveStoryMediaCaption({ media, preferredLanguages: reader.languages }),
    [media, reader.languages],
  );

  /* CACHE-FIRST : le squelette n'apparaît que sur un cache VIDE. Un échec de
     rafraîchissement EN ARRIÈRE-PLAN (le corpus est déjà là, la fenêtre
     reprend le focus, le réseau tombe) ne doit RIEN détruire — le premier jet
     posait `notFound` dès `feed.isError`, ce qui remplaçait une story en cours
     de lecture par « Story introuvable ».
     `resolvingFallback` (#5817, revue-correction, défaut 4) ÉTEND ce même
     principe à la 3ᵉ marche : tant qu'elle est EN VOL (`needsFallbackFetch`,
     déclaré plus haut avec `primaryGroups`), afficher « introuvable » serait
     précisément le faux négatif que la cascade iOS existe pour éviter — le
     verdict n'est dû qu'après son retour (2,5 s au plus,
     `STORY_POST_FALLBACK_TIMEOUT_MS`), succès ou échec. */
  const resolvingFallback = needsFallbackFetch && fallback.isPending;
  const loading = (!hasCorpus && !feed.isError) || resolvingFallback;
  /* `playablePosition === 'close'` n'est PAS « introuvable » : c'est la
     fermeture que l'effet ci-dessus est en train d'exécuter. L'afficher, même
     une image, ferait clignoter un refus là où le lecteur se referme. */
  const notFound = !loading && playablePosition !== 'close' && (currentStory === undefined || group === undefined);

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: '#000', color: '#fff', colorScheme: 'dark', zIndex: 200 }}
    >
      {/* LA CROIX DES ÉTATS D'ATTENTE LIT L'ENCOCHE, comme celle du chemin
          chargé (#7040). Elle était posée à `top-3` SEC, pendant que le chrome
          de la story, douze lignes plus bas, lit bien `--safe-top` : sur une
          coque à encoche, la seule porte de sortie d'un « Chargement… » ou d'une
          « Story introuvable » passait SOUS la barre d'état. Une divergence
          interne à un même fichier, et sur l'état où l'utilisateur a le plus
          besoin de sortir. Le `12px` conserve l'espacement de `top-3` quand il
          n'y a pas d'encoche : rien ne bouge là où rien n'était cassé. */}
      <div className="pointer-events-none absolute end-3" style={{ top: 'calc(var(--safe-top, 0px) + 12px)', zIndex: 2 }}>
        {loading || notFound ? <CloseButton onClose={closeViewer} /> : null}
      </div>

      {/* L'UNIQUE RÉGION VIVANTE DU LECTEUR — l'issue d'un geste s'y dit, et
          nulle part ailleurs (D-11 : jamais deux notifications pour un même
          événement). Elle vit à la RACINE, hors du bloc conditionnel de la
          scène : une région live démontée entre l'annonce et sa lecture n'est
          jamais annoncée, et le corpus change sous elle à chaque avance. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {loading ? (
        <div className="grid flex-1 place-items-center" role="status">
          <div className="grid gap-3 justify-items-center">
            <div
              aria-hidden="true"
              className="animate-pulse rounded-full"
              style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.25)' }}
            />
            <p className="text-body">Chargement…</p>
          </div>
        </div>
      ) : notFound ? (
        <div role="alert" className="grid flex-1 content-center justify-items-center gap-4 px-8 text-center">
          <Glyph name="warningCircle" size={38} style={{ color: 'rgba(255,255,255,0.7)' }} />
          <p className="text-title font-bold">{online ? 'Story introuvable' : 'Hors ligne'}</p>
          <p className="text-body" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {online
              ? 'Impossible de charger cette story. Réessayez ou fermez.'
              : 'Cette story s’affichera à la reconnexion.'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void feed.refetch()}
              className="rounded-full px-5 py-2 text-body font-semibold"
              style={{ background: '#fff', color: '#000', minHeight: 44 }}
            >
              Réessayer
            </button>
            <Link
              to="list"
              replace
              className="grid place-items-center rounded-full px-5 text-body font-semibold"
              style={{ border: '1px solid rgba(255,255,255,0.4)', minHeight: 44 }}
            >
              Fermer
            </Link>
          </div>
        </div>
      ) : group !== undefined && currentStory !== undefined && playablePosition !== null && playablePosition !== 'close' ? (
        <div
          ref={observeScene}
          className="relative flex flex-1 flex-col overflow-hidden select-none"
          data-story-scene={currentStory.id}
          data-story-paused={paused ? 'true' : undefined}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={clearHoldTimer}
          onPointerLeave={clearHoldTimer}
        >
          <span
            ref={observeSafeTop}
            aria-hidden="true"
            className="pointer-events-none absolute start-0 top-0 block w-px"
            style={{ height: 'var(--safe-top, 0px)' }}
          />
          {sceneDocument !== null ? (
            <Suspense fallback={null}>
              <StorySceneLayer
                key={currentStory.id}
                story={currentStory}
                document={sceneDocument}
                sceneIndex={0}
                preferredLanguages={reader.languages}
                framing={readerCardFraming({
                  viewport: sceneSize,
                  safeTop: safeTopSize.height,
                  presentation: chromeHidden ? 'free' : 'carded',
                })}
                playing={!paused}
                muted={storySoundMuted}
                onReady={() => setReadyStoryId(currentStory.id)}
                onDurationKnown={(ms) => reportMediaDuration(currentStory.id, ms)}
                onPlaybackBlocked={muteBlockedPlayback}
                onSoundAvailability={(available) =>
                  setSoundAvailability((current) =>
                    current !== null && current.storyId === currentStory.id && current.available === available
                      ? current
                      : { storyId: currentStory.id, available },
                  )
                }
              />
            </Suspense>
          ) : (
            <StoryMediaLayer
              storyId={currentStory.id}
              mediaSrc={mediaSrc}
              mimeType={media?.mimeType}
              showsMedia={showsImage}
              hasMedia={hasMedia}
              background={sceneBackground(storyEffectsBackgroundOf(currentStory.storyEffects))}
              caption={resolvedContent}
              onReady={() => setReadyStoryId(currentStory.id)}
              onDurationKnown={(ms) => reportMediaDuration(currentStory.id, ms)}
              onFailed={() => {
                setMediaFailed(true);
                setReadyStoryId(currentStory.id);
              }}
            />
          )}

          <div
            className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 px-3"
            style={{
              paddingTop: 'calc(var(--safe-top, 0px) + 8px)',
              paddingBottom: 44,
              background: CHROME_SCRIM_TOP,
              opacity: chromeHidden ? 0 : 1,
              transition: 'opacity 180ms ease',
            }}
            /* MASQUÉ ⇒ INERTE, jamais `aria-hidden` seul (D-90). Cette
               en-tête porte un CONTRÔLE — la croix de fermeture — et
               `CloseButton` ré-active `pointer-events-auto` sur lui-même :
               le `pointer-events-none` du conteneur ne le retenait pas.
               Pendant une pause par appui long, une croix invisible restait
               donc cliquable et tabulable, et `aria-hidden` par-dessus un
               bouton focusable est en outre la faute `aria-hidden-focus`.
               Mesuré au navigateur, aux quatre configurations
               (`check-story-scene.mjs`, « la croix doit rester MONTÉE mais
               devenir INATTEIGNABLE »). La LÉGENDE, douze lignes plus bas,
               garde `aria-hidden` : elle ne contient que des `<p>` — rien
               d'atteignable, donc rien à rendre inerte. */
            inert={chromeHidden}
          >
            <ProgressBars
              group={group}
              index={playablePosition.storyIndex}
              slideKey={currentStory.id}
              barRef={barRef}
              fillRef={fillRef}
            />
            {/* L'HEURE QUALIFIE L'AUTEUR, donc elle vit SUR SA LIGNE
                (`StoryViewerView+Header.swift:156-256`) — jamais sur une
                seconde ligne sous le nom, qui en ferait un sous-titre. */}
            {/* `data-story-author` est la PRISE de mesure : le gate de la
                Lentille (`check-list-actions.mjs`) tape une pastille du rail et
                doit prouver que le lecteur ouvert est bien celui de CET auteur
                — une comparaison d'identifiants, jamais de libellés traduits.
                Même motif que la tuile du rail (leçon 575 : un composant sans
                prise mesurable ne peut être gardé par rien). */}
            <div className="flex items-center gap-2 py-1" data-story-author={group.authorId}>
              {/* LA PHOTO DE L'AUTEUR (#6975) — même source et même loi que la
                  tuile du rail qui a ouvert ce lecteur (`story-rail.tsx`) :
                  passer d'un visage à des initiales en ouvrant la story
                  serait un changement d'identité à mi-geste. */}
              <Avatar
                initials={initialsOf(authorLabel(group))}
                color="var(--color-ios-brand)"
                size={32}
                {...(authorPhoto === undefined ? {} : { src: authorPhoto })}
              />
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="truncate text-body font-semibold" style={{ color: '#fff' }}>
                  {authorLabel(group)}
                </span>
                <span className="shrink-0 text-check" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {shortRelativeTime(new Date(currentStory.createdAt), new Date(), reader.locale)}
                </span>
              </div>
              {/* LE SON A QUITTÉ CETTE LIGNE POUR LA TÊTE DU RAIL (#4508,
                  arbitrage écrit avant d'être codé, cité par
                  `StoryViewerView+Sidebar.swift:479-491`) : « le son est le
                  SEUL élément du rail qui décrit ce qui est en train de SE
                  PASSER ; tous les autres décrivent ce qu'on peut FAIRE. Un
                  état se lit en premier, une action s'atteint au pouce. »
                  Le bouton est le MÊME (`data-story-sound-toggle`, libellé
                  constant + `aria-pressed`) — seule sa place change. */}
              <CloseButton onClose={closeViewer} />
            </div>
          </div>

          {hasMedia && (resolvedContent !== null || resolvedMediaCaption !== null) ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4"
              style={{
                paddingTop: 40,
                paddingBottom: 'calc(var(--safe-bottom, 0px) + 16px)',
                /* LA LÉGENDE S'ARRÊTE AVANT LE RAIL — sans ce couloir, une
                   phrase longue passe SOUS les boutons (mesuré : le bloc
                   courait jusqu'à x 374, le bouton « Commentaires » occupait
                   x 338→382). La valeur vient du rail lui-même, jamais d'un
                   nombre recopié ici. */
                paddingInlineEnd: railShown ? STORY_ACTION_RAIL_CORRIDOR : undefined,
                background: CHROME_SCRIM_BOTTOM,
                /* MÊME CESSION QUE LE RAIL (mesuré à la capture) : « Le lac,
                   ce matin. » se lisait PAR-DESSUS « Écrire un commentaire… ».
                   Deux textes superposés ne sont pas un état — c'en est zéro. */
                opacity: chromeHidden || commentsOpen ? 0 : 1,
                transition: 'opacity 180ms ease',
              }}
              aria-hidden={chromeHidden || commentsOpen ? true : undefined}
            >
              {resolvedContent !== null ? (
                <p className="text-body" style={CLAMPED_CAPTION} lang={resolvedContent.language || undefined}>
                  {resolvedContent.text}
                </p>
              ) : null}
              {/* La légende du MÉDIA, à sa propre ligne et avec sa propre
                  langue : deux contenus, deux `lang=` — un lecteur d'écran qui
                  prononcerait la seconde avec la voix de la première est le
                  défaut du cycle 122 rendu audible. */}
              {resolvedMediaCaption !== null ? (
                <p
                  data-story-media-caption
                  className="text-body"
                  style={CLAMPED_CAPTION}
                  lang={resolvedMediaCaption.language || undefined}
                >
                  {resolvedMediaCaption.text}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* LE RAIL D'ACTIONS — il ne DÉCIDE rien : `frozenRail.plan` est la
              loi figée à l'entrée, `railHandlers` dit ce que le web sait
              FAIRE, et le rail ne peint que l'intersection (loi 4). */}
          {railShown ? (
            <StoryActionRail
              plan={frozenRail.plan}
              language={interfaceLanguage}
              handlers={railHandlers}
              counts={{ react: currentStory.reactionCount, comments: currentStory.commentCount }}
              pressed={{
                sound: storySoundMuted,
                react: hasReactedToStory(currentStory, STORY_DEFAULT_REACTION),
              }}
              /* LE RAIL SE RETIRE DEVANT LA FEUILLE — mesuré à la capture :
                 les trois boutons se peignaient PAR-DESSUS la liste de
                 commentaires, et « Commentaires » recouvrait le bouton
                 d'envoi du composeur. Masqué, jamais démonté : il refarait sa
                 mise en page à la fermeture.

                 **ÉCART ASSUMÉ AVEC iOS, et il faut le dire dans ce sens** :
                 iOS ne cède PAS la place. Il rend son overlay de commentaires
                 SOUS les contrôles, exprès — « Rendered BEFORE the sidebar …
                 so SwiftUI ZStack z-orders it BENEATH the story controls —
                 user can still tap React / Reply / mute while comments are
                 visible » (`StoryViewerView+Canvas.swift:1640-1645`). Sa
                 surface est une liste FLOTTANTE transparente ; la nôtre est
                 une feuille OPAQUE de 68 % qui occupe la place du rail. Deux
                 contrôles superposés ne sont qu'un seul contrôle pour le
                 doigt : c'est la géométrie du web qui impose le retrait, pas
                 un choix d'iOS qu'on recopierait. */
              hidden={chromeHidden || commentsOpen}
            />
          ) : null}

          {commentsOpen ? (
            <Suspense fallback={null}>
              <StoryCommentsSheet postId={currentStory.id} onClose={() => setCommentsOpen(false)} />
            </Suspense>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
