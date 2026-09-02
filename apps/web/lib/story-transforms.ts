import type { Post, PostAuthor } from '@meeshy/shared/types/post';
import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';
import { formatTimeRemaining } from '@meeshy/shared/utils/time-remaining';
import { getUserDisplayName } from '@/utils/user-display-name';
import { parseTextEffect } from '@/lib/story-text-effect';
import type { StoryItem } from '@/components/v2/StoryTray';
import type { StoryData, StoryTextObjectData, StoryMediaObjectData, StoryAudioObjectData } from '@/components/v2/StoryViewer';
import type { CanvasV3MediaResolution } from '@/components/v2/CanvasV3Scene';

/**
 * « Ce blob est-il un document canvas ? » — LE site web de la question (#4774).
 *
 * Sens LECTURE, et c'est le seul sens que le web ait à porter : il RÉSOUT ce
 * qu'il rend, il ne VALIDE rien. La validation vit côté passerelle
 * (`CanvasV3Schema` + `isCanvasV3Exactly`, `services/gateway/src/services/
 * posts/storyEffectsV3.ts`), où l'inverse est vrai — on n'écrit pas en base un
 * rang qu'aucune garde ne sait relire. **Les deux prédicats ne peuvent pas
 * fusionner : un lecteur qui se durcit rend le vide, un valideur qui se
 * relâche grave l'incompris.**
 *
 * `v >= 3`, donc, jamais `v === 3` : un futur `v: 4` que la passerelle sert TEL
 * QUEL à un client caps-3 (table O17) doit rester lu en v3. Le rétrograder sur
 * la projection v1 ne dégrade pas le rendu — la forme v1 (`textObjects`,
 * `background`…) n'existe pas dans un document v3+, donc la story tomberait
 * au fond par défaut, sans texte, sans audio.
 *
 * Miroir des deux ponts natifs, qui posent la MÊME borne : iOS
 * `StoryEffects.init(from:)` (`mark >= 3`) et Android
 * `StoryEffectsWireSerializer` (`mark < 3` ⇒ legacy).
 *
 * Il rend un `boolean` NU, et c'est délibéré. Écrit sur place, le test
 * narrowait l'appelant par effet de bord (`typeof effects?.v === 'number'`
 * écarte `undefined`), et les quatre sites en vivaient. Trois prédicats de
 * type ont été essayés pour le leur rendre — `Record<string, unknown>` rabat
 * leurs propriétés déclarées sur `unknown` ; `object` et `T & object`
 * collapsent la branche FAUSSE en `never`, rendant tout le rendu legacy de
 * `StoryViewer` injoignable ; `{ v: number }` remplace le type de l'appelant
 * au lieu de l'intersecter. **Aucun n'est vrai** : ce prédicat ne dit rien de
 * la forme de son argument, il ne lit qu'une MARQUE. Les appelants portent
 * donc leur `?.`, ce qui coûte six caractères et ne ment sur rien.
 */
export function isCanvasV3OrNewer(blob: unknown): boolean {
  if (typeof blob !== 'object' || blob === null) return false;
  const mark = (blob as { v?: unknown }).v;
  return typeof mark === 'number' && mark >= 3;
}

// Résolution du bloc auteur affiché d'une story — SOURCE UNIQUE.
// Délègue le nom à `getUserDisplayName` (displayName non-vide > username >
// fallback) plutôt qu'un `??` brut qui laissait passer un displayName vide ou
// blanc et rendait un libellé de bulle vide. L'avatar vide (`''`) est normalisé
// en `undefined` pour ne jamais émettre un `<img src="">`.
function toDisplayAuthor(author?: PostAuthor | null): { name: string; avatar?: string } {
  return {
    name: getUserDisplayName(author, 'Unknown'),
    avatar: author?.avatar || undefined,
  };
}

// ============================================================================
// Shared StoryEffects shape (used by StoryViewer)
// ============================================================================

type TextStyle = 'bold' | 'neon' | 'typewriter' | 'handwriting';
type StoryFilter = 'vintage' | 'bw' | 'warm' | 'cool' | 'dramatic' | null;

const VALID_TEXT_STYLES = new Set<string>(['bold', 'neon', 'typewriter', 'handwriting']);
const VALID_FILTERS = new Set<string>(['vintage', 'bw', 'warm', 'cool', 'dramatic']);

function parseTextStyle(value: unknown): TextStyle | undefined {
  return typeof value === 'string' && VALID_TEXT_STYLES.has(value) ? value as TextStyle : undefined;
}

function parseFilter(value: unknown): StoryFilter | undefined {
  if (value === null) return null;
  return typeof value === 'string' && VALID_FILTERS.has(value) ? value as StoryFilter : undefined;
}

function parseTextPosition(value: unknown): { x: number; y: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const pos = value as Record<string, unknown>;
  if (typeof pos.x === 'number' && typeof pos.y === 'number') return { x: pos.x, y: pos.y };
  return undefined;
}

function parseStickers(value: unknown): Array<{ emoji: string; x: number; y: number; scale: number; rotation: number }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (s): s is { emoji: string; x: number; y: number; scale: number; rotation: number } =>
      s && typeof s === 'object' &&
      typeof s.emoji === 'string' &&
      typeof s.x === 'number' &&
      typeof s.y === 'number' &&
      typeof s.scale === 'number' &&
      typeof s.rotation === 'number'
  );
}

/// Parse the `textObjects[]` array produced by the iOS composer. Required fields
/// (id, content, x, y, scale, rotation) are validated; optional fields are
/// passed through. `translations` is `Record<lang, translated_text>` matching
/// the SDK's `StoryTextObject.translations`. The Prisme resolution happens at
/// render time.
function parseTextObjects(value: unknown): StoryTextObjectData[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: StoryTextObjectData[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    // The iOS composer encodes the overlay text under `text`; `content` is a
    // decoder-only legacy alias. Read the canonical key first, fall back to the
    // legacy one — without this the web dropped every text overlay iOS sent.
    const textValue = typeof r.text === 'string'
      ? r.text
      : (typeof r.content === 'string' ? r.content : undefined);
    if (typeof r.id !== 'string' || textValue === undefined) continue;
    if (typeof r.x !== 'number' || typeof r.y !== 'number') continue;
    const translations = (r.translations && typeof r.translations === 'object' && !Array.isArray(r.translations))
      ? r.translations as Record<string, string>
      : undefined;
    result.push({
      id: r.id,
      content: textValue,
      x: r.x,
      y: r.y,
      scale: typeof r.scale === 'number' ? r.scale : 1,
      rotation: typeof r.rotation === 'number' ? r.rotation : 0,
      translations,
      sourceLanguage: typeof r.sourceLanguage === 'string' ? r.sourceLanguage : undefined,
      textStyle: parseTextStyle(r.textStyle),
      textColor: typeof r.textColor === 'string' ? r.textColor : undefined,
      // Legacy `textSize` is css px; canonical `fontSize` is design px on the
      // 1080-wide reference canvas. Keep them in distinct fields so the renderer
      // can scale `fontSizeDesign` to the live canvas instead of treating an
      // iOS 96-design-px size as 96 css px (≈2.25× too large).
      textSize: typeof r.textSize === 'number' ? r.textSize : undefined,
      fontSizeDesign: typeof r.fontSize === 'number' ? r.fontSize : undefined,
      textAlign: typeof r.textAlign === 'string' ? r.textAlign : undefined,
      textBg: typeof r.textBg === 'string' ? r.textBg : undefined,
      textEffect: parseTextEffect(r.textEffect),
      zIndex: typeof r.zIndex === 'number' ? r.zIndex : undefined,
    });
  }
  return result.length > 0 ? result : undefined;
}

/// Parse `mediaObjects[]`. Each entry references a `PostMedia` by `postMediaId`
/// — the actual file URL is resolved against `post.media[]` at render time.
function parseMediaObjects(value: unknown): StoryMediaObjectData[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: StoryMediaObjectData[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.postMediaId !== 'string') continue;
    if (typeof r.x !== 'number' || typeof r.y !== 'number') continue;
    const mediaType = r.mediaType === 'video' ? 'video' : 'image';
    result.push({
      id: r.id,
      postMediaId: r.postMediaId,
      mediaType: mediaType as 'image' | 'video',
      x: r.x,
      y: r.y,
      scale: typeof r.scale === 'number' ? r.scale : 1,
      rotation: typeof r.rotation === 'number' ? r.rotation : 0,
      isBackground: r.isBackground === true,
      zIndex: typeof r.zIndex === 'number' ? r.zIndex : undefined,
      // Fenêtre de SOURCE : où l'on entre dans le fichier. `undefined` ≡ 0.
      sourceStart: typeof r.sourceStart === 'number' ? r.sourceStart : undefined,
    });
  }
  return result.length > 0 ? result : undefined;
}

function parseAudioObjects(value: unknown): StoryAudioObjectData[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: StoryAudioObjectData[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.postMediaId !== 'string') continue;
    result.push({
      id: r.id,
      postMediaId: r.postMediaId,
      x: typeof r.x === 'number' ? r.x : 0.5,
      y: typeof r.y === 'number' ? r.y : 0.85,
      volume: typeof r.volume === 'number' ? r.volume : 1,
      isBackground: r.isBackground === true,
      zIndex: typeof r.zIndex === 'number' ? r.zIndex : undefined,
      // Fenêtre TIMELINE : quand la piste joue. Elle n'était pas lue du tout,
      // donc aucune fenêtre temporelle audio n'atteignait le lecteur web.
      startTime: typeof r.startTime === 'number' ? r.startTime : undefined,
      duration: typeof r.duration === 'number' ? r.duration : undefined,
      // Booléen STRICT : le blob vient du réseau, une chaîne « yes » n'est pas
      // une boucle.
      loop: r.loop === true ? true : undefined,
      // Fenêtre de SOURCE : où l'on entre dans le fichier.
      sourceStart: typeof r.sourceStart === 'number' ? r.sourceStart : undefined,
      intrinsicDuration: typeof r.intrinsicDuration === 'number' ? r.intrinsicDuration : undefined,
    });
  }
  return result.length > 0 ? result : undefined;
}

// ============================================================================
// Post -> StoryItem (for StoryTray)
// ============================================================================

export function postToStoryItem(
  post: Post,
  currentUserId: string,
  viewedIds: Set<string>
): StoryItem {
  const author = post.author;
  return {
    id: post.id,
    author: toDisplayAuthor(author),
    thumbnailUrl: post.media?.[0]?.thumbnailUrl ?? post.media?.[0]?.fileUrl ?? undefined,
    hasUnviewed: !viewedIds.has(post.id),
    isOwn: post.authorId === currentUserId,
  };
}

// ============================================================================
// Author group -> StoryItem (one tray bubble per author)
// ============================================================================

/// Collapse an author's stories into a single tray bubble. The bubble is keyed
/// by `authorId` (the group id used to scope the viewer), shows the first
/// story's thumbnail, and is considered unviewed when ANY story in the group is
/// still unviewed. `group` is assumed non-empty (callers map over the grouped
/// values produced by `groupStoriesByAuthor`).
export function groupToStoryItem(
  group: Post[],
  currentUserId: string,
  viewedIds: Set<string>
): StoryItem {
  const [first] = group;
  const author = first.author;
  return {
    id: first.authorId,
    author: toDisplayAuthor(author),
    thumbnailUrl: first.media?.[0]?.thumbnailUrl ?? first.media?.[0]?.fileUrl ?? undefined,
    hasUnviewed: group.some((post) => !viewedIds.has(post.id)),
    isOwn: first.authorId === currentUserId,
  };
}

// ============================================================================
// Post -> StoryData (for StoryViewer)
// ============================================================================

// ============================================================================
// Story timeline duration — single source of truth ported 1:1 from the iOS SDK
// (`StorySlide.computedTotalDuration()` / `contentDerivedDuration()` in
// MeeshySDK/Models/StoryModels.swift). The story lasts as long as its timeline,
// NOT a fixed slide duration: a 14s background video plays its full 14s, a
// looped 4s clip extends to the next full repetition past 6s, long text earns
// reading time, and an author-pinned `timelineDuration` overrides everything.
// The legacy `slideDuration` field is deliberately IGNORED (backend values are
// arbitrary; the composer stopped writing it).
// ============================================================================

const DEFAULT_STATIC_DURATION_S = 6.0;
const LONG_TEXT_THRESHOLD_WORDS = 30;
const LONG_TEXT_SECONDS_PER_WORD = 1 / 6;

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[]) : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

// Projection v1 d'une scène v3 : les trois termes de la durée (fenêtre la plus
// longue, temps de lecture, boucle du fond) sont les MÊMES — seule la FORME du
// blob change. Sans elle, une story v3 (donc toute story servie à un client qui
// annonce `X-Canvas-Caps: 3`) ne présente plus aucune famille v1 et retombe sur
// les 6 s par défaut : une vidéo de 14 s se coupe au tiers.
function v1ViewOfScene(scene: Record<string, unknown>): Record<string, unknown> {
  const objects = asObjectArray(scene.objects);
  const family = (kind: string): Record<string, unknown>[] =>
    objects
      .filter((o) => o.kind === kind)
      .map((o) => {
        const timing = asObject(o.timing);
        const payload = asObject(o.payload);
        return { ...payload, ...(typeof timing.start === 'number' ? { startTime: timing.start } : {}) };
      });
  return {
    ...(typeof scene.timelineDuration === 'number' ? { timelineDuration: scene.timelineDuration } : {}),
    mediaObjects: family('media'),
    audioPlayerObjects: family('audio'),
    textObjects: family('text'),
  };
}

// Constat 3 — l'annonce du fond (B3.4) dégradait TOUJOURS une piste de
// bibliothèque en `♫ —` : le viewer ne lisait jamais le crédit qui voyage
// pourtant sur l'objet `kind:audio` de FOND de la scène (`name`,
// `soundAuthorUsername`, `duration` — services/gateway/src/services/posts/
// storyEffectsV3.ts:168-172, miroir CanvasV3Migration.swift:400-407). Extrait
// PUR, partagé entre `StoryViewer` (carte plein écran) et les futures
// surfaces carte/détail (F7c).
export interface BackgroundSoundCredit {
  title?: string;
  username?: string;
  durationSeconds?: number;
}

// Constat 4 (BLOQUANT, rejet DoD de F7d) — le composer web n'a AUCUN
// sélecteur de langue explicite pour l'auteur (contre iOS,
// `StoryComposerViewModel+Elements.swift:674`) : il ne peut donc jamais
// poser une `locale` HONNÊTE sur le texte racine à l'ÉMISSION — deviner
// depuis la locale d'interface rouvre la règle 3 du Prisme (arbitrage 4 vs
// 8). Sans repli, `CanvasV3Scene.resolveText` (`sameLanguage(language,
// o.locale)`) ne peut jamais faire concourir l'origine à son rang : un
// texte anglais sans `locale`, prisme `['en','fr']`, traduction `fr`
// disponible, sert « Bonjour » à un lecteur anglais-primaire.
//
// Le serveur, lui, détecte déjà la VRAIE langue à la création
// (`PostService.ts` `detectLanguage(data.content)`, jamais devinée) et la
// persiste sur `post.originalLanguage`. On la reporte donc ICI, à la
// LECTURE — l'entonnoir UNIQUE vers le viewer — sur tout objet texte
// dépourvu de sa propre `locale`. iOS pose une `locale` PAR OBJET
// (`CanvasV3Migration.swift:189`) : ce repli ne la retouche jamais.
function withOriginLocale(
  scenes: NonNullable<CanvasV3['scenes']>,
  originalLanguage: string | undefined,
): NonNullable<CanvasV3['scenes']> {
  if (!originalLanguage) return scenes;
  return scenes.map((scene) => ({
    ...scene,
    objects: scene.objects.map((object) =>
      object.kind === 'text' && !object.locale
        ? { ...object, locale: originalLanguage }
        : object
    ),
  }));
}

export function backgroundSoundCredit(scenes: CanvasV3['scenes']): BackgroundSoundCredit {
  const audioObject = (scenes ?? [])
    .flatMap((scene) => scene.objects)
    .find((o) => o.kind === 'audio' && o.payload.isBackground === true);
  if (!audioObject) return {};

  const { payload } = audioObject;
  const title = typeof payload.name === 'string' && payload.name.length > 0 ? payload.name : undefined;
  const username = typeof payload.soundAuthorUsername === 'string' && payload.soundAuthorUsername.length > 0
    ? payload.soundAuthorUsername
    : undefined;
  const durationSeconds = typeof payload.duration === 'number' && Number.isFinite(payload.duration)
    ? payload.duration
    : undefined;
  return { title, username, durationSeconds };
}

// Constat 2 (F7c) — la carte (`PostCard`) et le détail (`PostDetail`) ne
// passent jamais par `postToStoryData` (elles gardent la forme `Post` telle
// quelle) : sans ce résolveur, aucun appelant de ces deux surfaces n'avait
// où lire `sound`/le crédit, et le badge B3.3-6 restait câblé à des props
// mortes. Même garde (`isCanvasV3OrNewer`) que `postToStoryData`, même
// `backgroundSoundCredit` que `StoryViewer` — un seul extracteur de crédit
// partagé par les 3 surfaces (carte, détail, plein écran), jamais deux
// implémentations qui pourraient diverger.
export function postBackgroundSound(post: Post): { sound?: CanvasV3['sound']; meta: BackgroundSoundCredit } {
  const effects = (post.storyEffects && typeof post.storyEffects === 'object')
    ? post.storyEffects as Record<string, unknown>
    : undefined;
  const isV3Shaped = isCanvasV3OrNewer(effects);
  const sound = isV3Shaped && effects?.sound !== null && typeof effects?.sound === 'object'
    ? (effects.sound as CanvasV3['sound'])
    : undefined;
  const scenes = isV3Shaped && Array.isArray(effects?.scenes)
    ? (effects.scenes as CanvasV3['scenes'])
    : [];
  return { sound, meta: backgroundSoundCredit(scenes) };
}

function v3Scenes(effects: Record<string, unknown> | undefined): Record<string, unknown>[] {
  return isCanvasV3OrNewer(effects) ? asObjectArray(effects?.scenes) : [];
}

// Durée d'UNE slide, en millisecondes — miroir de `StorySlide
// .computedTotalDuration()` (StoryModels.swift:1420) : le pin d'auteur d'abord,
// sinon les trois termes du contenu.
function slideDurationMs(source: Record<string, unknown> | undefined): number {
  // Priority 0 — author-pinned timeline duration is authoritative (the timeline
  // IS the story). `nil` for everything existing → falls back to content.
  const pinned = positiveNumber(source?.timelineDuration);
  if (pinned !== undefined) return Math.round(pinned * 1000);

  const mediaObjects = asObjectArray(source?.mediaObjects);
  const audioObjects = asObjectArray(source?.audioPlayerObjects);
  const textObjects = asObjectArray(source?.textObjects);

  // Component 1 — background video/audio of natural duration.
  const bgVideoDur = positiveNumber(
    mediaObjects.find((m) => m.isBackground === true && m.mediaType === 'video')?.duration,
  );
  const bgAudioDur = positiveNumber(audioObjects.find((a) => a.isBackground === true)?.duration);
  const rawMediaDur = bgVideoDur ?? bgAudioDur;

  // Component 2 — long text earns reading time (>30 words → 6s + 1s per 6 words).
  const totalWords = textObjects.reduce((acc, t) => {
    // Mirror parseTextObjects: the canonical key is `text`, `content` is the
    // decoder-only legacy alias. Without the fallback, legacy overlays keyed
    // under `content` count as 0 words and the slide auto-advances at 6s.
    const raw = typeof t.text === 'string'
      ? t.text
      : typeof t.content === 'string' ? t.content : '';
    const text = raw.trim();
    return acc + (text ? text.split(/\s+/).length : 0);
  }, 0);
  const textDur = totalWords > LONG_TEXT_THRESHOLD_WORDS
    ? DEFAULT_STATIC_DURATION_S + (totalWords - LONG_TEXT_THRESHOLD_WORDS) * LONG_TEXT_SECONDS_PER_WORD
    : DEFAULT_STATIC_DURATION_S;

  // MIROIR EXACT de `StoryEffects.contentDerivedDuration`
  // (packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1323-1337).
  // Trois termes, dans cet ordre. Toute divergence se voit à la lecture : la
  // slide se coupe avant la fin d'un média, ou s'étire au-delà.

  // 1. La plus longue FENÊTRE, tous types confondus. `startTime + duration` et
  //    non `duration` seule : une vidéo de 4 s posée à 10 s finit à 14 s. Et
  //    les fenêtres AUDIO comptent autant que les médias — elles n'entraient
  //    dans aucun terme jusqu'ici.
  const windowEnd = (o: Record<string, unknown>): number | undefined => {
    const d = positiveNumber(o.duration);
    if (d === undefined) return undefined;
    return (positiveNumber(o.startTime) ?? 0) + d;
  };
  const longestData = [...mediaObjects, ...audioObjects]
    .map(windowEnd)
    .filter((v): v is number => v !== undefined)
    .reduce((a, b) => Math.max(a, b), 0);

  // 2. La cible inclut la plus longue fenêtre — sans elle, l'arrondi de boucle
  //    ci-dessous se calcule sur une cible trop basse.
  const target = Math.max(textDur, DEFAULT_STATIC_DURATION_S, longestData);

  // 3. Le fond boucle jusqu'à couvrir la cible, en répétitions ENTIÈRES.
  const bgResult = rawMediaDur === undefined
    ? target
    : rawMediaDur >= target
      ? rawMediaDur
      : Math.ceil(target / rawMediaDur) * rawMediaDur;

  return Math.round(Math.max(bgResult, longestData) * 1000);
}

/// W2 — la durée de CHAQUE scène du document, dans l'ordre de lecture.
///
/// Une scène v3 projetée en familles v1 EST une slide : c'est exactement ce que
/// fait `StoryEffects(rendering:sceneIndex:)` côté iOS
/// (`CanvasV3Migration.swift:523`), dont `v1ViewOfScene` est le jumeau web. La
/// règle de durée est donc celle d'une slide, appliquée scène par scène —
/// aucune règle nouvelle n'est inventée pour l'enchaînement.
///
/// Tableau VIDE pour un blob legacy ou un document v3 sans scène (O3 — `scenes`
/// reste absent tant qu'aucun objet visuel n'est posé) : il n'y a alors rien à
/// enchaîner, et `computeStoryDurationMs` retombe sur la mesure du blob entier.
export function canvasV3SceneDurationsMs(effects: Record<string, unknown> | undefined): number[] {
  return v3Scenes(effects).map((scene) => slideDurationMs(v1ViewOfScene(scene)));
}

export function computeStoryDurationMs(effects: Record<string, unknown> | undefined): number {
  // W2 — la story dure ses scènes CUMULÉES. Ne mesurer que `scenes[0]` (ce que
  // faisait cette fonction) coupait la story à la fin de la première scène : le
  // contrat en autorise 10 et les suivantes n'étaient jamais jouées. La somme
  // porte donc sur les durées DÉJÀ arrondies, celles-là mêmes que le lecteur
  // consomme scène par scène — arrondir la somme, elle, laisserait dériver la
  // frontière de la dernière scène.
  const perScene = canvasV3SceneDurationsMs(effects);
  if (perScene.length > 0) return perScene.reduce((total, ms) => total + ms, 0);
  return slideDurationMs(effects);
}

export function postToStoryData(post: Post): StoryData {
  const author = post.author;
  const effects = (post.storyEffects && typeof post.storyEffects === 'object')
    ? post.storyEffects as Record<string, unknown>
    : undefined;
  const firstMedia = post.media?.[0];

  let mediaUrl: string | undefined;
  let mediaType: 'image' | 'video' | undefined;
  if (firstMedia) {
    mediaUrl = firstMedia.fileUrl;
    if (firstMedia.mimeType.startsWith('image/')) mediaType = 'image';
    else if (firstMedia.mimeType.startsWith('video/')) mediaType = 'video';
  }

  // Resolve a `postMediaId -> { url, mimeType }` lookup for the foreground media
  // / audio renderers — they store only the id, not the URL.
  // Constat 9 — le letterbox v3 (`CanvasV3Scene` : le porteur garde SON ratio)
  // a besoin d'un `aspectRatio` que la production ne fournissait jamais.
  // `PostMedia.width`/`height` (packages/shared/types/post.ts:67-68) le
  // dérivent quand les deux sont posés ; absent, `CanvasV3Scene` retombe sur
  // `payload.aspectRatio` puis sur l'absence de contrainte (plein cadre).
  const mediaById = new Map<string, CanvasV3MediaResolution>();
  for (const m of post.media ?? []) {
    if (!m.id || !m.fileUrl) continue;
    const aspectRatio = typeof m.width === 'number' && typeof m.height === 'number' && m.height > 0
      ? m.width / m.height
      : undefined;
    mediaById.set(m.id, {
      url: m.fileUrl,
      mimeType: m.mimeType ?? '',
      ...(aspectRatio !== undefined ? { aspectRatio } : {}),
      // S4-web — `PostMedia.alt` est déjà clé par `postMediaId` côté gateway ;
      // un sticker importé (S1) le sert tel quel, jamais un alt fabriqué ici.
      ...(m.alt ? { alt: m.alt } : {}),
    });
  }

  // Pass the post-level `translations` straight through. Previously this was
  // hardcoded `undefined`, so `TranslationToggle` was dead on stories — even
  // when the gateway had cached translations for the post content.
  const translations = (post.translations && typeof post.translations === 'object')
    ? Object.entries(post.translations as Record<string, unknown>)
        .map(([languageCode, raw]) => {
          if (typeof raw === 'string') {
            return { languageCode, languageName: languageCode, content: raw };
          }
          if (raw && typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string') {
            return { languageCode, languageName: languageCode, content: (raw as { text: string }).text };
          }
          return null;
        })
        .filter((t): t is { languageCode: string; languageName: string; content: string } => t !== null)
    : undefined;

  // Un blob v3 traverse le funnel INTACT. Reconstruit à clés FIXES, il perdait
  // `v`, `scenes` et `sound` : la garde de version de `StoryViewer` restait
  // fausse, `CanvasV3Scene` ne se montait jamais et la story revenait au fond
  // par défaut — sans son texte, sans son audio, sans son annonce de fond.
  // `postToStoryData` est l'entonnoir UNIQUE vers le viewer : ce qu'il jette
  // n'existe plus. Le contrat est validé à l'ÉCRITURE (gateway) ; la lecture
  // reste tolérante objet par objet.
  const isV3Shaped = isCanvasV3OrNewer(effects);
  const canvasScenes = isV3Shaped && Array.isArray(effects?.scenes)
    ? withOriginLocale(effects.scenes as NonNullable<CanvasV3['scenes']>, post.originalLanguage ?? undefined)
    : undefined;
  const backgroundSound = isV3Shaped && effects?.sound !== null && typeof effects?.sound === 'object'
    ? (effects.sound as CanvasV3['sound'])
    : undefined;

  const textObjects = effects ? parseTextObjects(effects.textObjects) : undefined;
  const mediaObjects = effects ? parseMediaObjects(effects.mediaObjects) : undefined;
  const audioObjects = effects ? parseAudioObjects(effects.audioPlayerObjects) : undefined;
  // Duration derived from the timeline (background video length, looped clips,
  // long-text reading time, author pin) — never the fixed legacy slide duration.
  const slideDurationMs = computeStoryDurationMs(effects);

  return {
    id: post.id,
    authorId: post.authorId,
    author: toDisplayAuthor(author),
    content: post.content ?? undefined,
    originalLanguage: post.originalLanguage ?? undefined,
    translations: translations && translations.length > 0 ? translations : undefined,
    storyEffects: effects ? {
      v: typeof effects.v === 'number' ? effects.v : undefined,
      scenes: canvasScenes,
      sound: backgroundSound,
      // Canonical key is `background` (iOS composer + gateway StoryEffectsSchema);
      // `backgroundColor` is a legacy alias kept as a fallback for old payloads.
      background: typeof effects.background === 'string'
        ? effects.background
        : (typeof effects.backgroundColor === 'string' ? effects.backgroundColor : undefined),
      textStyle: parseTextStyle(effects.textStyle),
      textColor: typeof effects.textColor === 'string' ? effects.textColor : undefined,
      textPosition: parseTextPosition(effects.textPosition),
      filter: parseFilter(effects.filter),
      stickers: parseStickers(effects.stickers),
      textObjects,
      mediaObjects,
      audioObjects,
      slideDurationMs,
    } : undefined,
    mediaById,
    mediaUrl,
    mediaType,
    createdAt: typeof post.createdAt === 'string' ? post.createdAt : post.createdAt.toISOString(),
    expiresAt: post.expiresAt
      ? (typeof post.expiresAt === 'string' ? post.expiresAt : post.expiresAt.toISOString())
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    viewCount: post.viewCount,
    // Le droit d'ouvrir cette story malgré son expiration — déclaré par le
    // serveur (`resolveReferenceAccess`), jamais recalculé depuis `expiresAt`
    // côté client. `undefined` (serveur non déployé) se lit comme `'none'`
    // dans `StoryViewer` : un contenu expiré sans ce champ reste bloqué.
    referenceAccess: post.referenceAccess,
  };
}

// ============================================================================
// Group stories by author (for StoryTray display)
// ============================================================================

export function groupStoriesByAuthor(posts: Post[]): Map<string, Post[]> {
  const grouped = new Map<string, Post[]>();
  for (const post of posts) {
    const authorId = post.authorId;
    const existing = grouped.get(authorId);
    if (existing) {
      existing.push(post);
    } else {
      grouped.set(authorId, [post]);
    }
  }
  return grouped;
}

// ============================================================================
// Time remaining helper
// ============================================================================

export function timeRemaining(expiresAt: string): string | null {
  return formatTimeRemaining(new Date(expiresAt).getTime(), Date.now());
}

// ── W1 — Keyframes (portage 1:1 de KeyframeInterpolator.swift) ────────────────

export type StoryEasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface StoryKeyframeData {
  time: number;          // secondes, RELATIF au startTime de l'objet porteur
  x?: number;            // normalisé 0-1
  y?: number;
  scale?: number;
  opacity?: number;
  easing?: StoryEasingName;
}

export function applyStoryEasing(easing: StoryEasingName, t: number): number {
  switch (easing) {
    case 'easeIn': return t * t;
    case 'easeOut': return 1 - (1 - t) * (1 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    default: return t;
  }
}

/** Portage exact de `KeyframeInterpolator.interpolate` : tri par time, un seul
 *  keyframe = constante, clamp avant le premier / après le dernier, sinon
 *  interpolation du segment avec l'easing du keyframe BAS. */
export function interpolateKeyframeChannel(
  channel: Array<{ time: number; value: number; easing: StoryEasingName }>,
  at: number
): number | undefined {
  if (channel.length === 0) return undefined;
  const sorted = [...channel].sort((a, b) => a.time - b.time);
  if (sorted.length === 1) return sorted[0].value;
  if (at <= sorted[0].time) return sorted[0].value;
  if (at >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (at >= lo.time && at <= hi.time) {
      const span = hi.time - lo.time;
      const u = span > 0 ? (at - lo.time) / span : 0;
      const eased = applyStoryEasing(lo.easing, u);
      return lo.value + (hi.value - lo.value) * eased;
    }
  }
  return undefined;
}

export interface ResolvedKeyframeState {
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
}

/** État interpolé d'un objet à `playheadSec` (temps slide). `startTime` est
 *  celui de l'objet porteur — `keyframe.time` lui est relatif (spec 2.1). */
export function resolveKeyframeState(
  keyframes: StoryKeyframeData[] | undefined,
  playheadSec: number,
  startTime: number = 0
): ResolvedKeyframeState | null {
  if (!keyframes || keyframes.length === 0) return null;
  const local = playheadSec - startTime;
  const channel = (pick: (k: StoryKeyframeData) => number | undefined) =>
    keyframes.flatMap((k) => {
      const v = pick(k);
      return v == null ? [] : [{ time: k.time, value: v, easing: k.easing ?? ('linear' as StoryEasingName) }];
    });
  return {
    x: interpolateKeyframeChannel(channel((k) => k.x), local),
    y: interpolateKeyframeChannel(channel((k) => k.y), local),
    scale: interpolateKeyframeChannel(channel((k) => k.scale), local),
    opacity: interpolateKeyframeChannel(channel((k) => k.opacity), local),
  };
}

export interface StoryClipTransitionData {
  id?: string;
  fromClipId: string;
  toClipId: string;
  kind: 'crossfade' | 'dissolve';
  duration: number;
  easing?: StoryEasingName;
}

/**
 * W1 inc.4 — portage 1:1 de `ReaderTransitionResolver.opacity` (iOS, branché
 * au playback par R14) : facteur d'opacité d'un clip foreground sous ses
 * `clipTransitions` crossfade. Sortant : 1→0 sur `[end-d, end]` ; entrant :
 * 0→1 sur `[start, start+d]` ; multiplicatif quand plusieurs transitions
 * matchent ; `dissolve` ignoré (compositor-only, parité reader iOS) ; hors
 * fenêtre `[start, end]` du média → 0 ; interpolation linéaire (l'easing est
 * ignoré par le reader iOS). Clamp [0, 1].
 */
export function resolveClipTransitionOpacity(
  media: { id: string; startTime?: number; duration?: number },
  transitions: readonly StoryClipTransitionData[] | undefined,
  currentTime: number
): number {
  if (!transitions || transitions.length === 0) return 1;
  const start = media.startTime ?? 0;
  const end = start + (media.duration ?? 0);
  if (currentTime < start || currentTime > end) return 0;

  let opacity = 1;
  for (const tr of transitions) {
    if (tr.kind !== 'crossfade' || tr.duration <= 0) continue;
    const isOutgoing = tr.fromClipId === media.id;
    const isIncoming = tr.toClipId === media.id;
    if (!isOutgoing && !isIncoming) continue;
    const trStart = isOutgoing ? end - tr.duration : start;
    if (currentTime < trStart || currentTime > trStart + tr.duration) continue;
    const progress = (currentTime - trStart) / tr.duration;
    opacity *= isOutgoing ? 1 - progress : progress;
  }
  return Math.max(0, Math.min(1, opacity));
}

/**
 * W7 — un `storyEffects.background` non-hex/non-gradient est traité comme URL
 * d'image de fond par les viewers. Rendre une URL ARBITRAIRE (posée par un
 * client malveillant, le serveur ne borne que la longueur) ferait requêter
 * chaque viewer vers un domaine tiers : tracking pixel / IP-leak des viewers.
 * N'autorise que les chemins relatifs internes et les origins explicitement
 * permis (front, gateway) ; rejette aussi tout métacaractère CSS (parenthèse,
 * quote, espace — aucun chemin média légitime n'en contient) pour qu'aucune
 * valeur ne puisse s'échapper du contexte `url(...)`. `null` → le caller
 * retombe sur le gradient par défaut.
 */
export function safeBackgroundImageUrl(
  bg: string,
  allowedOrigins: readonly string[]
): string | null {
  if (/[()'"\s\\]/.test(bg)) return null;
  if (bg.startsWith('/') && !bg.startsWith('//')) return bg;
  let parsed: URL;
  try {
    parsed = new URL(bg);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  return allowedOrigins.some((origin) => {
    try {
      return new URL(origin).origin === parsed.origin;
    } catch {
      return false;
    }
  })
    ? bg
    : null;
}
