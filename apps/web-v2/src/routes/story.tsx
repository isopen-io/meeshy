import {
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
import { apiDeps } from '@/lib/api/deps';
import { markStoryViewedAction, useStoryFeed, useStoryPost } from '@/lib/api/query';
import { attachmentSrc } from '@/lib/api/media-url';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
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
import { resolveStoryCaption } from '@/lib/stories/caption';
import {
  DEFAULT_SLIDE_DURATION_MS,
  currentStoryAt,
  groupForPlayback,
  nextPosition,
  previousPosition,
  resolvePlayablePosition,
  resolvePosition,
  stableGroupOrder,
  type StoryPlaybackGroup,
  type StoryPlaybackStory,
} from '@/lib/stories/playback';
import { initialsOf } from '@/lib/view/conversation';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useParams } from '@/lib/router';
import { Link, href, navigate } from '@/routes/route-table';

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

/** `"RRGGBB"` — six chiffres hexadécimaux, rien d'autre. Ce qui vient du
 * corpus n'entre JAMAIS tel quel dans une déclaration CSS : `storyEffects`
 * est un `Json?` Prisma, donc une chaîne libre côté serveur. */
const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

/** `StoryBackgroundValue` (`StoryBackgroundValue.swift:1-38`) — `"RRGGBB"` ou
 * `"gradient:RRGGBB:RRGGBB"`. Toute autre forme retombe sur le gradient de
 * marque, exactement comme une valeur absente (tableau § 1.7 de la
 * spécification) : un fond illisible vaut mieux servi par le défaut que par
 * une valeur non validée. */
function sceneBackground(background: string | null | undefined): CSSProperties {
  const fallback: CSSProperties = {
    background: 'linear-gradient(135deg, var(--color-ios-brand), var(--color-ios-brand-deep))',
  };
  if (background === null || background === undefined || background === '') return fallback;
  if (background.startsWith('gradient:')) {
    const [, from, to] = background.split(':');
    if (from !== undefined && to !== undefined && HEX_COLOR.test(from) && HEX_COLOR.test(to)) {
      return { background: `linear-gradient(135deg, #${from}, #${to})` };
    }
    return fallback;
  }
  return HEX_COLOR.test(background) ? { background: `#${background}` } : fallback;
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

function CloseButton({ onClose }: { readonly onClose: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      aria-label="Fermer"
      className="pointer-events-auto grid shrink-0 place-items-center rounded-full"
      style={{ width: 44, height: 44, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.12)' }}
    >
      <Glyph name="x" size={16} style={{ color: '#fff' }} />
    </button>
  );
}

/**
 * `StoryProgressBarsView` (`StoryViewerView+Content.swift:3128-3177`) —
 * capsules de hauteur 3, `gap: 3`, piste blanc 20 % ; segments PASSÉS blanc
 * PLEIN, segment COURANT le dégradé `indigo500 → error → indigo400`. Le
 * premier jet peignait TOUS les segments en indigo de marque : sur le fond
 * par défaut d'une story texte — le gradient de marque, précisément — la
 * progression devenait invisible, et le passé ne se distinguait plus du
 * présent (mesuré sur `story-light.png`, deux barres grises identiques).
 *
 * **LA FRACTION NE PASSE PAS PAR L'ÉTAT** — `fillRef` reçoit un
 * `transform: scaleX()` écrit à même le DOM à chaque image. Poser la
 * progression en `useState` re-rendait l'écran ENTIER soixante fois par
 * seconde (l'image, l'en-tête, la légende, la scène), pour animer trois
 * pixels de haut ; iOS évite exactement cela (« évite de committer le
 * `@State` `progress` », granularité 1/300). `scaleX` plutôt que `width` :
 * la propriété n'apparaît dans AUCUN objet `style` rendu, donc aucun rendu
 * ne peut l'écraser, et l'animation reste sur le compositeur.
 */
function ProgressBars({
  group,
  index,
  slideKey,
  barRef,
  fillRef,
}: {
  readonly group: StoryPlaybackGroup;
  readonly index: number;
  readonly slideKey: string;
  readonly barRef: { current: HTMLDivElement | null };
  readonly fillRef: { current: HTMLSpanElement | null };
}) {
  return (
    <div
      ref={barRef}
      role="progressbar"
      aria-label={`Story ${index + 1} sur ${group.stories.length}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      className="flex"
      style={{ gap: 3, height: 3 }}
    >
      {group.stories.map((story, i) => (
        <span
          key={story.id}
          aria-hidden="true"
          className="flex-1 overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.2)' }}
        >
          {i === index ? (
            <span
              key={slideKey}
              ref={fillRef}
              className="block size-full rounded-full"
              style={{
                transform: 'scaleX(0)',
                transformOrigin: 'left center',
                willChange: 'transform',
                background:
                  'linear-gradient(90deg, var(--color-ios-brand), var(--ios-error), var(--color-i400))',
              }}
            />
          ) : (
            <span className="block size-full rounded-full" style={{ background: i < index ? '#fff' : 'transparent' }} />
          )}
        </span>
      ))}
    </div>
  );
}

/** Le média d'une story dont la source est INEXPLOITABLE (absente, ou dont le
 * téléchargement a échoué) — un état DESSINÉ, jamais un `<img src="">` : le
 * navigateur y peint son icône de lien brisé sur fond noir et redemande le
 * document courant au passage. Mesuré sur `story-image-light.png` du premier
 * jet (§ A de la revue). */
function MediaUnavailable() {
  return (
    <div className="grid gap-2 justify-items-center px-8 text-center">
      <Glyph name="image" size={38} style={{ color: 'rgba(255,255,255,0.7)' }} />
      <p className="text-body" style={{ color: 'rgba(255,255,255,0.75)' }}>
        Média indisponible
      </p>
    </div>
  );
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
  const mediaSrc = media?.url === undefined || media.url === '' ? '' : attachmentSrc(media.url);
  const hasMedia = (currentStory?.media?.length ?? 0) > 0;

  const [paused, setPaused] = useState(false);
  /* Le chrome se MASQUE pendant la pause par APPUI LONG et revient à la
     reprise (`onChromeVisibilityChange`, `StoryViewerView+Canvas.swift:45-52`)
     — jamais pendant une pause d'une autre cause (double-tap central), qui
     laisse l'en-tête lisible. */
  const [chromeHidden, setChromeHidden] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const showsImage = mediaSrc !== '' && !mediaFailed;
  const [contentReady, setContentReady] = useState(mediaSrc === '');
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
    setContentReady(mediaSrc === '');
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
    const tick = () => {
      const elapsed = elapsedRef.current + (performance.now() - startTsRef.current);
      const ratio = Math.min(1, elapsed / DEFAULT_SLIDE_DURATION_MS);
      paintProgress(ratio);
      if (ratio >= 1) {
        advance('next');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [currentStory, paused, contentReady, advance, paintProgress]);

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
      if (e.key === 'ArrowLeft') advance('previous');
      else if (e.key === 'ArrowRight') advance('next');
      else if (e.key === ' ') {
        e.preventDefault();
        if (paused) resume();
        else pause();
      } else if (e.key === 'Escape') closeViewer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, paused, pause, resume, closeViewer]);

  const resolvedContent = useMemo(() => {
    if (currentStory === undefined) return null;
    return resolveStoryCaption({
      preferredLanguages: reader.languages,
      originalLanguage: currentStory.originalLanguage,
      translations: currentStory.translations,
      content: currentStory.content ?? '',
    });
  }, [currentStory, reader.languages]);

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
      <div className="pointer-events-none absolute top-3 end-3" style={{ zIndex: 2 }}>
        {loading || notFound ? <CloseButton onClose={closeViewer} /> : null}
      </div>

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
          className="relative flex flex-1 flex-col overflow-hidden select-none"
          data-story-scene={currentStory.id}
          data-story-paused={paused ? 'true' : undefined}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={clearHoldTimer}
          onPointerLeave={clearHoldTimer}
        >
          {showsImage ? (
            <img
              key={currentStory.id}
              src={mediaSrc}
              alt=""
              className="absolute inset-0 size-full object-cover"
              onLoad={() => setContentReady(true)}
              onError={() => {
                setMediaFailed(true);
                setContentReady(true);
              }}
            />
          ) : (
            <div
              className="absolute inset-0 grid place-items-center px-8"
              style={sceneBackground(currentStory.storyEffects?.background)}
            >
              {hasMedia ? (
                <MediaUnavailable />
              ) : resolvedContent !== null ? (
                <p
                  className="text-center text-title font-semibold"
                  style={{ fontSize: 28, lineHeight: 1.3 }}
                  lang={resolvedContent.language || undefined}
                >
                  {resolvedContent.text}
                </p>
              ) : null}
            </div>
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
            aria-hidden={chromeHidden ? true : undefined}
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
              <Avatar initials={initialsOf(authorLabel(group))} color="var(--color-ios-brand)" size={32} />
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="truncate text-body font-semibold" style={{ color: '#fff' }}>
                  {authorLabel(group)}
                </span>
                <span className="shrink-0 text-check" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {shortRelativeTime(new Date(currentStory.createdAt), new Date(), reader.locale)}
                </span>
              </div>
              <CloseButton onClose={closeViewer} />
            </div>
          </div>

          {hasMedia && resolvedContent !== null ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 px-4"
              style={{
                paddingTop: 40,
                paddingBottom: 'calc(var(--safe-bottom, 0px) + 16px)',
                background: CHROME_SCRIM_BOTTOM,
                opacity: chromeHidden ? 0 : 1,
                transition: 'opacity 180ms ease',
              }}
              aria-hidden={chromeHidden ? true : undefined}
            >
              <p
                className="text-body"
                style={{
                  color: '#fff',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
                lang={resolvedContent.language || undefined}
              >
                {resolvedContent.text}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
