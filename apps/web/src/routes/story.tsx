import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand/react';
import { trackingLinksOf } from '@meeshy/shared/utils/text-segments';

import type { SceneScrubPainter } from '@/components/scene-scrub-bar';
import { BackgroundSoundCredit } from '@/components/background-sound-credit';
import { Glyph } from '@/components/glyph';
import { PrismPastille } from '@/components/message-blocks';
import { PublicationLanguageBarLazy } from '@/components/publication-language-bar-lazy';
import { PlaybackStallIndicator } from '@/components/playback-stall-indicator';
import { CommentsSheetPortal } from '@/components/publication-comments-sheet-lazy';
import { PublicationViewersSheetPortal } from '@/components/publication-viewers-sheet-lazy';
import { StoryActionRail } from '@/components/story-action-rail';
import { ViewerExitButton, type ViewerIdentityModel } from '@/components/viewer-chrome';
import { isContentRefusal, useVisitorInvitation } from '@/components/visitor-invitation';
import { useViewerSwipe } from '@/components/viewer-chrome-gestures';
import { apiDeps } from '@/lib/api/deps';
import { markStoryViewedAction, useStoryFeed, useStoryPost } from '@/lib/api/query';
import { attachmentSrc } from '@/lib/api/media-url';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { backgroundCss } from '@/lib/canvas/background';
import { useOnline } from '@/lib/net/online';
import { shortRelativeTime } from '@/lib/relative-time';
import { STORY_DEFAULT_REACTION, hasReactedToStory } from '@/lib/stories/reaction';
import { storyRailParticipated, usePublicationParticipation } from '@/lib/view/publication-participation';
import { resolveStoryCaption } from '@/lib/stories/caption';
import { servedStoryIndicator } from '@/lib/stories/language-availability';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { translate } from '@/lib/i18n-catalog';
import { resolveStoryMediaCaption } from '@/lib/stories/media-caption';
import { readerCardFraming } from '@/lib/stories/framing';

import { StoryBottomBar, StoryTopBar } from './story-chrome';
import { ProgressBars, StoryMediaLayer } from './story-parts';
import { useStoryScrub } from './use-story-scrub';
import {
  currentStoryAt,
  groupForPlayback,
  nextPosition,
  playedStoryScene,
  previousPosition,
  resolvePlayablePosition,
  resolvePosition,
  scopeToLiveStories,
  scopeToSingleGroup,
  slideDurationForScene,
  slideDurationMs,
  stableGroupOrder,
  storyEffectsBackgroundOf,
  storyMediaUrl,
  type StoryPlaybackGroup,
  type StoryPlaybackStory,
} from '@/lib/stories/playback';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';
import { useCommentsSheetHost } from '@/lib/view/use-comments-sheet-host';
import { useProfilePeekOpen } from '@/lib/view/profile-peek';
import { useStoryActionRail } from '@/lib/view/use-story-action-rail';
import { useStoryGestures } from '@/lib/view/use-story-gestures';
import { useCallFreezesStory } from '@/lib/view/use-call-freezes-story';
import { useStoryHiddenTabPause } from '@/lib/view/use-story-hidden-tab-pause';
import { useStoryLanguage } from '@/lib/view/use-story-language';
import { useStoryPauseWhile } from '@/lib/view/use-story-pause-while';
import { useStoryKeyboardShortcuts } from '@/lib/view/use-story-keyboard-shortcuts';
import { useStoryOwnerRail } from '@/lib/view/use-story-owner-rail';
import { useStorySend } from '@/lib/view/use-story-send';
import { chromeYields } from '@/lib/view/chrome-yields';
import { sceneYieldOf, writingSceneScale, yieldingScene } from '@/lib/view/scene-yields';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';
import { useElementSize } from '@/lib/view/use-element-size';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useParams, useSearch } from '@/lib/router';
import { Link, href, navigate } from '@/routes/route-table';

/** L'hôte des scènes v3 (#6899) — chargé À LA DEMANDE, motif D-54 : une story
 * v1 ne paie ni ses lois (image seule, bandes, son de fond), ni le moteur. */
const StorySceneLayer = lazy(() => import('./story-scene-layer'));
/* Le fil de commentaires — `CommentsSheetPortal` (import ci-dessus) PARTAGE
 * l'appel `lazy()` et le montage `Suspense` avec `routes/reels.tsx` (#6484,
 * `publication-comments-sheet-lazy.tsx`), motif D-54. */

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
  /**
   * **LA PORTÉE « UN SEUL GROUPE »** (revue de #6149, défaut majeur 3) —
   * `?scope=mine`, posé par les deux liens de `MyStoryCard`
   * (`routes/stories-mine.tsx`) : le lecteur ouvert depuis « Mes stories » ne
   * doit jamais passer à un AUTRE auteur, miroir
   * `StoryViewerRequest(singleGroup: true)` (`StoryTrayView.swift:75`).
   */
  const [search] = useSearch();
  const singleGroupScope = search.get('scope') === 'mine';

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
  /* LE VISITEUR D'UN LIEN PARTAGÉ (#9149) — sans compte, le corpus des stories
     (`requiredAuth`) ne se lit pas : il est VIDE d'office, ce qui arme la
     troisième marche (`useStoryPost`, `GET /posts/:id`) sur la story nommée. */
  const visitor = viewer.id === null || viewer.isAnonymous;
  const reader = useReaderLanguages();
  const online = useOnline();
  const interfaceLanguage = currentInterfaceLanguage();
  const feed = useStoryFeed({ enabled: !visitor });

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
  const hasCorpus = visitor || feed.data !== undefined;
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

  /* `scopeToSingleGroup` NARROWS le tableau AVANT toute navigation : c'est ce
     qui fait fermer `nextPosition` en fin de mon groupe au lieu de passer à
     l'auteur suivant, sans ajouter de branche à cette loi pure. */
  const scopedGroups = useMemo(() => {
    const live = scopeToLiveStories(groups, { keeping: [post, currentId], now: Date.now() });
    return singleGroupScope ? scopeToSingleGroup(live, currentId) : live;
  }, [groups, singleGroupScope, post, currentId]);

  const rawPosition = useMemo(() => resolvePosition(scopedGroups, currentId), [scopedGroups, currentId]);
  const playablePosition = useMemo(
    () => (rawPosition === null ? null : resolvePlayablePosition(scopedGroups, rawPosition, Date.now())),
    [scopedGroups, rawPosition],
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
    const skippedTo = currentStoryAt(scopedGroups, playablePosition);
    if (skippedTo !== undefined) setCurrentId(skippedTo.id);
  }, [playablePosition, rawPosition, scopedGroups, closeViewer]);

  const group = playablePosition !== null && playablePosition !== 'close' ? scopedGroups[playablePosition.groupIndex] : undefined;
  /* LA PHOTO DE L'AUTEUR, DÉRIVÉE UNE FOIS (#6975) — `participantAvatarOf`
     accepte un auteur ABSENT, donc pas de garde à écrire ici. */
  const authorPhoto = participantAvatarOf(group?.author);
  const currentStory: StoryPlaybackStory | undefined =
    playablePosition !== null && playablePosition !== 'close' ? currentStoryAt(scopedGroups, playablePosition) : undefined;

  const advance = useCallback(
    (direction: 'previous' | 'next') => {
      if (playablePosition === null || playablePosition === 'close') return;
      const target =
        direction === 'next'
          ? nextPosition(scopedGroups, playablePosition, Date.now())
          : previousPosition(scopedGroups, playablePosition);
      if (target === 'close') {
        closeViewer();
        return;
      }
      if (target === null) return;
      const story = currentStoryAt(scopedGroups, target);
      if (story !== undefined) setCurrentId(story.id);
    },
    [scopedGroups, playablePosition, closeViewer],
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
  const playedScene = useMemo(() => (currentStory === undefined ? null : playedStoryScene(currentStory)), [currentStory]);
  const sceneDocument = playedScene?.document ?? null;
  const firstScene = sceneDocument?.scenes[0];

  /* LE CHOIX DE LANGUE DU LECTEUR (#7114, `use-story-language.ts`) — UNE
     seule valeur remise à TOUT ce qui rend un texte. `canRequestTranslation:
     false` en tranche 1 (tranche 2 : `viewer.kind === 'registered' && online`). */
  const language = useStoryLanguage({
    story: currentStory,
    document: sceneDocument,
    readerLanguages: reader.languages,
    canRequestTranslation: false,
  });
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
  const toggleSound = useCallback(() => setStorySoundMuted((m) => !m), []);

  const [paused, setPaused] = useState(false);
  /* Le chrome se MASQUE pendant la pause par APPUI LONG et revient à la
     reprise (`onChromeVisibilityChange`, `StoryViewerView+Canvas.swift:45-52`)
     — jamais pendant une pause d'une autre cause (double-tap central), qui
     laisse l'en-tête lisible. */
  const [chromeHidden, setChromeHidden] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  /** Le fil de commentaires, ouvert par « Commentaires » ou par « Répondre »
   * — une seule zone de saisie pour les deux (spécification porteur du
   * 2026-05-28, citée par `StoryComposerBarView`). La loi d'hôte (focus,
   * fermeture au changement de story) est PARTAGÉE avec le lecteur des Réels
   * (#6484, `use-comments-sheet-host.ts`) — un second `commentsOpen` inline
   * ici l'aurait dupliquée. */
  const commentsHost = useCommentsSheetHost(currentStory?.id);
  const commentsOpen = commentsHost.postId !== null;
  const openComments = useCallback(() => {
    if (currentStory !== undefined) commentsHost.open(currentStory.id);
  }, [currentStory, commentsHost.open]);
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
  /* LE BUFFER GÈLE LA BARRE EN PHASE (#6925, `setPlaybackStalled` d'iOS), porté par la story. */
  const [stalledStoryId, setStalledStoryId] = useState<string | null>(null);
  const stalled = currentStory !== undefined && stalledStoryId === currentStory.id;
  const stalledRef = useRef(stalled);
  stalledRef.current = stalled;
  const noteProgressing = useCallback((storyId: string, progressing: boolean) => {
    setStalledStoryId((current) => (progressing ? (current === storyId ? null : current) : storyId));
  }, []);
  const markedRef = useRef<Set<string>>(new Set());
  const painterRef = useRef<SceneScrubPainter | null>(null);
  /** Le segment actif se parcourt au doigt (#7879) — loi d'hôte extraite. */
  const scrub = useStoryScrub({ storyId: currentStory?.id, elapsedRef, startTsRef });

  /** L'UNIQUE écriture de la progression — hors de React, à chaque image. */
  const paintProgress = useCallback((ratio: number) => painterRef.current?.(ratio), []);

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
    if (visitor || markedRef.current.has(currentStory.id)) return;
    markedRef.current.add(currentStory.id);
    void markStoryViewedAction(currentStory.id);
  }, [currentStory, visitor]);

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

  /* UNE SEULE VALEUR POUR LA BARRE ET POUR L'AVANCE (#6836) — iOS l'exige
     explicitement (« Garantit que progress bar et auto-advance utilisent la
     MÊME valeur », `StoryViewerView+Content.swift`) : deux sources donneraient
     une barre qui ment sur ce qui reste. Ici c'est structurel — `ratio`
     gouverne les deux, et le slider du segment (#7879) parcourt CETTE durée. */
  const dureeMs =
    sceneDocument !== null ? slideDurationForScene({ scene: firstScene ?? {}, mediaDurationMs }) : slideDurationMs({ mediaDurationMs });

  useEffect(() => {
    if (currentStory === undefined || paused || scrub.scrubbing || !contentReady) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      // Le temps passé en buffer ne compte pas : le départ recule d'autant.
      const now = performance.now();
      if (stalledRef.current) startTsRef.current += now - last;
      last = now;
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
  }, [currentStory, paused, scrub.scrubbing, contentReady, dureeMs, advance, paintProgress]);

  /* L'ONGLET CACHÉ NE CONSOMME PAS UNE STORY — extrait dans
     `use-story-hidden-tab-pause.ts` (§ budget de la spécification #7116),
     comportement INCHANGÉ. */
  useStoryHiddenTabPause({ paused, pause, resume });
  /* UN APPEL GÈLE LA STORY (#8727) — elle reprend en place à la fin de l'appel. */
  useCallFreezesStory({ paused, pause, resume });

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

  /**
   * **LE PLAN AUTEUR** (#7116) — « Vues », « Partager », « Enregistrer ».
   * La loi vit dans `use-story-owner-rail.ts` (pause/reprise de la feuille,
   * téléchargement + livraison de l'export, idempotence du job) : ce lecteur
   * ne fait que la BRANCHER sur SA région d'annonce et SA pause, exactement
   * comme `commentsHost` deux blocs plus haut. Déclaré ICI, AVANT le clavier,
   * pour que `viewersOpen` puisse rejoindre la cession `layerOpen`.
   */
  const ownerRail = useStoryOwnerRail({ story: currentStory, online, pause, resume, announce, language: interfaceLanguage });
  const viewersOpen = ownerRail.viewers.postId !== null;
  /* « ENVOYER » (#8884) : la feuille d'envoi commune, ouverte avec la story
     regardée ; la lecture attend dessous (`useStoryPauseWhile` plus bas). */
  const storySend = useStorySend(currentStory);
  /* L'ANNEAU DU CŒUR SUR CHAQUE GESTE DÉJÀ FAIT (directive porteur
     2026-10-01) : la réaction vient de la story servie (`currentUserReactions`,
     tout émoji), le commentaire et l'envoi de ce que le lecteur a fait pendant
     la session — la passerelle ne les sert pas sur une story. */
  const participationMarks = usePublicationParticipation(currentStory?.id);
  const profilePeekOpen = useProfilePeekOpen();
  /* LES GESTES COMMUNS DES PLEIN ÉCRANS (#8879, `viewer-chrome-gestures.ts`) :
     glisser vers le BAS ferme — le geste de sortie d'iOS
     (`StoryViewerView+Canvas.swift`, `.dismissViewer`) et celui de la
     visionneuse de médias —, glisser à l'HORIZONTALE change de story, comme le
     tiers gauche/droit. Les zones de tap restent (divergence admise : une
     story se REGARDE, le tap y avance). Une feuille ouverte réclame le doigt. */
  const swipe = useViewerSwipe({
    onDismiss: closeViewer,
    onNext: () => advance('next'),
    onPrevious: () => advance('previous'),
    enabled: !(commentsOpen || viewersOpen || profilePeekOpen),
    rtl: typeof document !== 'undefined' && document.documentElement.dir === 'rtl',
  });
  /* LES GESTES (§ 1.3) — EXTRAITS dans `use-story-gestures.ts` (§ budget,
     #7114 ; rationale complète là-bas) : trois bandes, appui posé = pause, le
     relâchement ne reprend pas, le tap suivant reprend sans naviguer ; le
     balayage commun des plein écrans (`swipe`) y est relayé aux mêmes points
     qu'avant ; `dismissLayer` AVALE le tap qui ferme la barre rapide des
     langues (« un toucher n'importe où les referme »). */
  const gestures = useStoryGestures({
    paused,
    pause,
    resume,
    advance,
    setChromeHidden,
    layerOpen: commentsOpen,
    swipe: swipe.handlers,
    dismissLayer: () => {
      if (!language.barOpen) return false;
      language.closeBar();
      return true;
    },
  });
  /* UNE loi (#8601, `chrome-yields.ts`) : feuille ouverte ou appui long ⇒
     l'en-tête, la légende et le rail cèdent ENSEMBLE ; feuille et média restent. */
  const chromeYielded = chromeYields({ sheetOpen: commentsOpen || viewersOpen, held: chromeHidden });
  /* LA SCÈNE CÈDE AUSSI (#8643, `scene-yields.ts`) : floutée pendant qu'on lit
     le fil (ou les vues), nette et RÉDUITE au-dessus de la barre pendant
     qu'on écrit — ancrée sous l'encoche, comme sa carte. */
  const writingBar = commentsHost.writing;
  const scene = yieldingScene({
    yieldTo: sceneYieldOf({ sheetOpen: commentsOpen || viewersOpen, writing: writingBar !== null }),
    scale: writingBar === null ? 1 : writingSceneScale({ ...writingBar, anchorTop: safeTopSize.height }),
    anchorTop: safeTopSize.height,
    reducedMotion: prefersReducedMotion(),
  });

  /* EXTRAIT dans `use-story-keyboard-shortcuts.ts` (§ budget, #7116) —
     comportement INCHANGÉ, sauf `layerOpen` qui gagne `viewersOpen` :
     une flèche tapée pendant que « Vues » est ouverte ne doit pas faire
     avancer la story recouverte (D-91, même loi que la feuille de
     commentaires). */
  useStoryKeyboardShortcuts({
    advance,
    paused,
    pause,
    resume,
    closeViewer,
    showsSound,
    onToggleMute: toggleSound,
    layerOpen: commentsOpen || viewersOpen || profilePeekOpen || storySend.sheetOpen || language.barOpen,
  });

  /* LA FEUILLE MET LA LECTURE EN PAUSE — sans cela, la story avancerait sous
     le fil qu'on lit, et le composeur changerait de publication à mi-phrase.
     Le focus et la fermeture au changement de story sont la loi PARTAGÉE de
     `useCommentsSheetHost` ci-dessus — plus dupliqués ici. Le profil de
     l'auteur (ou d'un commentateur, d'un spectateur) ouvert par-dessus
     attend de même, et UNE seule condition les réunit : fermer le profil
     ouvert depuis une feuille ne doit pas relancer la story sous elle. La
     BARRE rapide des langues (#7114) rejoint la même condition : la lecture
     est en pause tant que l'une de ces surfaces recouvre la scène. */
  const [optionsOpen, setOptionsOpen] = useState(false);
  useStoryPauseWhile(
    commentsOpen || viewersOpen || profilePeekOpen || optionsOpen || storySend.sheetOpen || language.barOpen,
    pause,
    resume,
  );

  /* LE RAIL D'ACTIONS, CÔTÉ HÔTE — le GEL et les GESTIONNAIRES vivent dans
     `use-story-action-rail.ts` (§ budget, #7114) ; ce lecteur BRANCHE ce
     qu'il sait FAIRE, comme `commentsHost`/`ownerRail` ci-dessus.
     `translations.available` = `language.offersTranslations`. */
  const rail = useStoryActionRail({
    story: currentStory,
    isOwnStory: group?.isMine === true,
    visitor,
    showsSound,
    toggleSound,
    announce,
    language: interfaceLanguage,
    openComments,
    ownerHandlers: ownerRail.handlers,
    forwardHandlers: storySend.handlers,
    translations: { available: language.offersTranslations, onOpen: language.openBar },
  });

  const resolvedContent = useMemo(() => {
    if (currentStory === undefined) return null;
    return resolveStoryCaption({
      preferredLanguages: language.prism,
      originalLanguage: currentStory.originalLanguage,
      translations: currentStory.translations,
      content: currentStory.content ?? '',
    });
  }, [currentStory, language.prism]);

  /* LA PASTILLE DU PRISME (D-99, #7114) — dit la langue SERVIE par l'AUTO
     (`reader.languages`, jamais le choix courant : sinon la pastille
     disparaîtrait dès qu'on montre l'original et ne pourrait plus revenir). */
  const languageIndicator = useMemo(
    () =>
      currentStory === undefined
        ? null
        : servedStoryIndicator({
            content: currentStory.content,
            originalLanguage: currentStory.originalLanguage,
            translations: currentStory.translations,
            document: sceneDocument,
            prism: reader.languages,
          }),
    [currentStory, sceneDocument, reader.languages],
  );

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
  /* LA CARTE DES ADRESSES SUIVIES (#9074), décodée UNE fois : elle couvre le
     corps, les textes de scène et chaque légende de média de la story. */
  const trackingLinks = useMemo(() => (currentStory === undefined ? [] : trackingLinksOf(currentStory)), [currentStory]);

  const resolvedMediaCaption = useMemo(
    () => resolveStoryMediaCaption({ media, preferredLanguages: language.prism }),
    [media, language.prism],
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
     verdict n'est dû qu'après son retour, succès ou échec — jamais sur une
     requête encore en vol, quelle que soit la lenteur du réseau (#9172 : sous
     le seul délai du transport, plus aucun de 2,5 s). */
  const resolvingFallback = needsFallbackFetch && fallback.isPending;
  const loading = (!hasCorpus && !feed.isError) || resolvingFallback;
  /* `playablePosition === 'close'` n'est PAS « introuvable » : c'est la
     fermeture que l'effet ci-dessus est en train d'exécuter. L'afficher, même
     une image, ferait clignoter un refus là où le lecteur se referme. */
  const notFound = !loading && playablePosition !== 'close' && (currentStory === undefined || group === undefined);
  /* Refusée par la passerelle (403/404) — jamais une panne : le visiteur garde
     alors l'état « Réessayer » ci-dessous, et le refus n'a que la modale. */
  const visitorRefused = visitor && notFound && isContentRefusal(fallback.error);
  const invitation = useVisitorInvitation({ kind: 'story', state: currentStory !== undefined ? 'served' : visitorRefused ? 'refused' : 'pending' });

  /* L'IDENTITÉ DE L'AUTEUR — la photo (#6975, même source et même loi que la
     tuile du rail qui a ouvert ce lecteur : passer d'un visage à des initiales
     en ouvrant la story serait un changement d'identité à mi-geste) et l'heure
     SUR SA LIGNE (`StoryViewerView+Header.swift:156-256`, elle qualifie
     l'auteur). L'identité MÈNE AU PROFIL (#7241) — mais PAS sur sa propre
     story : la fiche de soi n'offre aucun geste relationnel. */
  const authorName = group === undefined ? '' : authorLabel(group);
  const authorUsername = group?.author?.username;
  const identity: ViewerIdentityModel | null =
    group === undefined || currentStory === undefined
      ? null
      : {
          name: authorName,
          initials: initialsOf(authorName),
          ...(authorPhoto === undefined ? {} : { avatarSrc: authorPhoto }),
          ...(!group.isMine && typeof authorUsername === 'string' && authorUsername !== '' ? { profileUsername: authorUsername } : {}),
          time: {
            iso: new Date(currentStory.createdAt).toISOString(),
            label: shortRelativeTime(new Date(currentStory.createdAt), new Date(), reader.locale),
          },
        };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={translate(interfaceLanguage, 'stories.title')}
      className="fixed inset-0 flex flex-col"
      style={{ background: 'var(--color-media-backdrop)', color: 'var(--color-on-media)', colorScheme: 'dark', zIndex: 200 }}
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
        {loading || notFound ? <ViewerExitButton exit={{ kind: 'close', label: 'Fermer', onExit: closeViewer }} /> : null}
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
              style={{ width: 32, height: 32, background: 'var(--color-media-fill)' }}
            />
            <p className="text-body">Chargement…</p>
          </div>
        </div>
      ) : visitorRefused ? null : notFound ? (
        <div role="alert" className="grid flex-1 content-center justify-items-center gap-4 px-8 text-center">
          <Glyph name="warningCircle" size={38} style={{ color: 'var(--color-on-media-3)' }} />
          <p className="text-title font-bold">{online ? 'Story introuvable' : 'Hors ligne'}</p>
          <p className="text-body" style={{ color: 'var(--color-on-media-3)' }}>
            {online
              ? 'Impossible de charger cette story. Réessayez ou fermez.'
              : 'Cette story s’affichera à la reconnexion.'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void (visitor ? fallback.refetch() : feed.refetch())}
              className="rounded-full px-5 py-2 text-body font-semibold"
              style={{ background: 'var(--color-on-media)', color: 'var(--color-media-backdrop)', minHeight: 44 }}
            >
              Réessayer
            </button>
            <Link
              to="list"
              replace
              className="grid place-items-center rounded-full px-5 text-body font-semibold"
              style={{ border: '1px solid var(--color-media-hairline)', minHeight: 44 }}
            >
              Fermer
            </Link>
          </div>
        </div>
      ) : group !== undefined && identity !== null && currentStory !== undefined && playablePosition !== null && playablePosition !== 'close' ? (
        <div
          ref={observeScene}
          className="relative flex flex-1 flex-col overflow-hidden select-none"
          data-story-scene={currentStory.id}
          data-story-paused={paused ? 'true' : undefined}
          onPointerDown={gestures.onPointerDown}
          onPointerUp={gestures.onPointerUp}
          onPointerMove={gestures.onPointerMove}
          onPointerCancel={gestures.onPointerCancel}
          onPointerLeave={gestures.onPointerLeave}
        >
          <span
            ref={observeSafeTop}
            aria-hidden="true"
            className="pointer-events-none absolute start-0 top-0 block w-px"
            style={{ height: 'var(--safe-top, 0px)' }}
          />
          <div data-story-scene-yield="" className="absolute inset-0" {...scene}>
          {sceneDocument !== null ? (
            <Suspense fallback={null}>
              <StorySceneLayer
                key={currentStory.id}
                story={playedScene?.carrierStory ?? currentStory}
                document={sceneDocument}
                sceneIndex={0}
                preferredLanguages={language.prism}
                framing={readerCardFraming({
                  viewport: sceneSize,
                  safeTop: safeTopSize.height,
                  presentation: chromeHidden ? 'free' : 'carded',
                })}
                playing={!paused && !scrub.scrubbing}
                muted={storySoundMuted}
                onClock={scrub.onClock}
                durationSeconds={dureeMs / 1000}
                onReady={() => setReadyStoryId(currentStory.id)}
                onDurationKnown={(ms) => reportMediaDuration(currentStory.id, ms)}
                onPlaybackBlocked={muteBlockedPlayback}
                onPlaybackProgressing={(progressing) => noteProgressing(currentStory.id, progressing)}
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
              trackingLinks={trackingLinks}
              onReady={() => setReadyStoryId(currentStory.id)}
              onDurationKnown={(ms) => reportMediaDuration(currentStory.id, ms)}
              playing={!paused && !scrub.scrubbing}
              onPlaybackProgressing={(progressing) => noteProgressing(currentStory.id, progressing)}
              onFailed={() => {
                setMediaFailed(true);
                setReadyStoryId(currentStory.id);
              }}
            />
          )}
          <PlaybackStallIndicator stalled={stalled && !paused} language={interfaceLanguage} />
          </div>

          <StoryTopBar
            authorId={group.authorId}
            identity={identity}
            hidden={chromeYielded}
            language={interfaceLanguage}
            onClose={closeViewer}
            onSave={ownerRail.handlers.save}
            onOptionsOpenChange={setOptionsOpen}
            /* LE CRÉDIT DU SON (#9678, vue `2f`) — lu sur la scène QUI JOUE : celle
               de la source pour une story repartagée sans effets propres. */
            sound={sceneDocument && <BackgroundSoundCredit document={sceneDocument} language={interfaceLanguage} surface="media" />}
            /* LA PASTILLE DU PRISME (D-99, #7114) — entre l'heure et la croix,
               comme le fil et les commentaires. */
            prism={
              languageIndicator === null ? undefined : (
                <PrismPastille
                  servedLanguage={languageIndicator.servedLanguage}
                  originalLanguage={languageIndicator.originalLanguage}
                  active={language.choice.kind === 'original' ? languageIndicator.originalLanguage : null}
                  language={interfaceLanguage}
                  subject="post"
                  onToggle={language.toggleOriginal}
                />
              )
            }
            progress={
              <ProgressBars
                group={group}
                index={playablePosition.storyIndex}
                slideKey={currentStory.id}
                durationSeconds={dureeMs / 1000}
                language={interfaceLanguage}
                painterRef={painterRef}
                onScrubStart={scrub.onScrubStart}
                onScrub={scrub.onScrub}
                onScrubEnd={scrub.onScrubEnd}
              />
            }
          />

          {/* LA BARRE BASSE — légende, rail, « Répondre… » : le MÊME pied que le
              réel et le média de conversation (#8879). Le rail partage la rangée
              de la légende, qui ne passe donc jamais dessous. Le rail ne DÉCIDE
              rien : `rail.frozen.plan` est la loi figée à l'entrée, `rail.handlers`
              dit ce que le web sait FAIRE, et il ne peint que l'intersection
              (loi 4). La capsule n'existe que si la loi offre la réponse
              (`showsReply` : la story d'autrui, jamais la sienne). */}
          <StoryBottomBar
            hidden={chromeYields({ sheetOpen: commentsOpen || viewersOpen })}
            held={chromeHidden}
            language={interfaceLanguage}
            showsCaption={hasMedia}
            content={resolvedContent}
            mediaCaption={resolvedMediaCaption}
            trackingLinks={trackingLinks}
            onReply={
              rail.frozen !== null && rail.frozen.storyId === currentStory.id && rail.frozen.plan.showsReply
                ? visitor
                  ? invitation.ask
                  : openComments
                : undefined
            }
            rail={
              rail.shown && rail.frozen !== null ? (
                <StoryActionRail
                  plan={rail.frozen.plan}
                  language={interfaceLanguage}
                  handlers={rail.handlers}
                  counts={{ react: currentStory.reactionCount, comments: currentStory.commentCount, views: currentStory.viewCount }}
                  pressed={{
                    sound: storySoundMuted,
                    react: hasReactedToStory(currentStory, STORY_DEFAULT_REACTION),
                    translations: language.barOpen,
                  }}
                  badges={{ translations: language.badgeCode }}
                  /* LA BARRE RAPIDE DES LANGUES (#7114), ancrée au bouton
                     « Traductions » (`Sidebar.swift:862-903`), chargée À LA
                     DEMANDE (D-54 — hors du chunk `story_reader`) ;
                     `ViewerActionRail` garde l'identité DOM du bouton quand
                     elle apparaît, et le focus lui revient à la fermeture
                     (`use-story-language.ts`). */
                  {...(language.barOpen
                    ? {
                        anchored: {
                          action: 'translations' as const,
                          node: (
                            <PublicationLanguageBarLazy
                              languages={language.available}
                              active={language.choice.kind === 'original' ? 'original' : (language.prism[0] ?? null)}
                              language={interfaceLanguage}
                              onSelect={language.choose}
                              onClose={language.closeBar}
                            />
                          ),
                        },
                      }
                    : {})}
                  participated={storyRailParticipated({
                    marks: participationMarks,
                    reacted: (currentStory.currentUserReactions?.length ?? 0) > 0,
                  })}
                  saving={ownerRail.saving}
                  onCancelSave={ownerRail.cancelSave}
                  /* LE RAIL SE RETIRE DEVANT LA FEUILLE — mesuré à la capture :
                     les boutons se peignaient PAR-DESSUS la liste de
                     commentaires, et « Commentaires » recouvrait le bouton
                     d'envoi du composeur. Masqué, jamais démonté : il refarait
                     sa mise en page à la fermeture.

                     **ÉCART ASSUMÉ AVEC iOS** : iOS ne cède PAS la place, son
                     overlay de commentaires est une liste FLOTTANTE
                     transparente rendue SOUS les contrôles
                     (`StoryViewerView+Canvas.swift:1640-1645`) ; la nôtre est
                     une feuille OPAQUE de 68 % qui occupe la place du rail.
                     Deux contrôles superposés ne sont qu'un seul contrôle pour
                     le doigt : c'est la géométrie du web qui impose le retrait. */
                  hidden={chromeYielded}
                />
              ) : null
            }
          />

          <CommentsSheetPortal host={commentsHost} />
          <PublicationViewersSheetPortal host={ownerRail.viewers} viewCount={currentStory?.viewCount} />
        </div>
      ) : null}
      {invitation.dialog}
    </div>
  );
}
