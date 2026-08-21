'use client';

import { Component, useEffect, useRef, type ReactNode } from 'react';
import type { CanvasV3, ObjectV3, SceneV3 } from '@meeshy/shared/types/canvas-v3';
import {
  resolveKeyframeState,
  resolveClipTransitionOpacity,
  safeBackgroundImageUrl,
  type StoryKeyframeData,
  type StoryEasingName,
  type StoryClipTransitionData,
} from '@/lib/story-transforms';
import { config } from '@/lib/config';
import { cn } from '@/lib/utils';

const SCENE_ASPECT_RATIO = '9 / 16';
const STORY_DESIGN_WIDTH = 1080;
const BAND_INSET = '6%';
const DEFAULT_STICKER_SIZE = 140;
const PLANE_Z = { bg: 0, content: 10, fg: 20 } as const;
/// Constat 2 (revue F7b, rattrapage) — le voile de lisibilité DOIT peindre
/// au-dessus du seul plan `bg` (parité `story.mediaUrl` legacy,
/// `StoryViewer.tsx` ancien :944-950 : le média de fond principal était SOUS
/// le voile, tout le reste — objets posés, texte — au-dessus). `container-
/// Type: 'inline-size'` (racine de la scène, requis pour le `cqw` du texte)
/// force `contain: layout`, qui établit un contexte d'empilement local : un
/// frère externe placé APRÈS la scène ne peut plus s'intercaler ENTRE ses
/// plans, il ne peut que peindre au-dessus de la scène ENTIÈRE ou en dessous.
/// D'où la prop `overlay` : StoryViewer choisit toujours le contenu/la classe
/// du voile (le composant reste agnostique de sa raison d'être), mais c'est
/// la scène qui le positionne, au bon plan, dans SON propre contexte
/// d'empilement.
const OVERLAY_Z = PLANE_Z.content - 1;
/// Parité iOS reprise du chemin legacy (`StoryViewer.tsx:951-956`) : un média
/// POSÉ occupe 65 % de la petite dimension du canvas à `scale = 1`
/// (`baseMediaSize = shortDim * 0.65`), jamais toute la largeur.
const POSED_MEDIA_WIDTH = '65%';

const SYSTEM_SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const ROUNDED_STACK = `"Arial Rounded MT Bold", "Avenir Next Rounded", ui-rounded, ${SYSTEM_SANS}`;
const NEON_GLOW = '0 0 10px currentColor, 0 0 20px currentColor';
const FLAT_SHADOW = '0 1px 4px rgba(0,0,0,0.5)';

type TextStyleCss = {
  fontFamily: string;
  fontWeight: number;
  fontStyle?: 'italic';
  textShadow?: string;
};

/// Table des 18 familles — mêmes noms et mêmes intentions que le résolveur iOS
/// (`StoryTextFontResolver` / `storyFont(for:size:)`), polices web équivalentes
/// avec repli système : la face iOS d'origine est citée par famille.
const TEXT_STYLES: Record<string, TextStyleCss> = {
  bold: { fontFamily: SYSTEM_SANS, fontWeight: 800 },
  neon: { fontFamily: ROUNDED_STACK, fontWeight: 600, textShadow: NEON_GLOW },
  typewriter: { fontFamily: 'Courier, "Courier New", monospace', fontWeight: 400 },
  handwriting: { fontFamily: '"Snell Roundhand", "Brush Script MT", cursive', fontWeight: 400 },
  classic: { fontFamily: 'Georgia, serif', fontWeight: 500 },
  calligraphy: { fontFamily: 'Zapfino, "Snell Roundhand", cursive', fontWeight: 400 },
  cartoon: { fontFamily: '"Chalkboard SE", "Comic Sans MS", cursive', fontWeight: 700 },
  futuristic: { fontFamily: '"Futura Condensed ExtraBold", Futura, "Trebuchet MS", sans-serif', fontWeight: 800 },
  fantasy: { fontFamily: 'Papyrus, fantasy', fontWeight: 400 },
  curve: { fontFamily: '"Savoye LET", "Snell Roundhand", cursive', fontWeight: 400 },
  tag: { fontFamily: '"Marker Felt", "Comic Sans MS", cursive', fontWeight: 700 },
  italic: { fontFamily: 'Georgia, serif', fontWeight: 400, fontStyle: 'italic' },
  retro: { fontFamily: '"American Typewriter", "Courier New", monospace', fontWeight: 400 },
  elegant: { fontFamily: 'Didot, "Bodoni MT", Georgia, serif', fontWeight: 400 },
  poster: { fontFamily: '"Avenir Next Condensed", "Arial Narrow", Impact, sans-serif', fontWeight: 800 },
  bubble: { fontFamily: ROUNDED_STACK, fontWeight: 700 },
  note: { fontFamily: 'Noteworthy, "Comic Sans MS", cursive', fontWeight: 700 },
  brush: { fontFamily: '"Bradley Hand", "Brush Script MT", cursive', fontWeight: 700 },
};

/// Parité `parsedTextStyle` iOS : une valeur inconnue retombe sur `bold`,
/// jamais sur une exception — le blob v3 est tolérant par contrat.
const DEFAULT_TEXT_STYLE = TEXT_STYLES.bold;

export interface CanvasV3MediaResolution {
  url: string;
  mimeType: string;
  aspectRatio?: number;
}

/// Gestionnaires de mise en mémoire tampon du lecteur hôte — le legacy les
/// posait sur ses vidéos (`StoryViewer.tsx:616-621`, `:911`, `:936`) pour
/// piloter son indicateur. Le chemin v3 les transmet à toutes les siennes.
export interface CanvasV3VideoGateHandlers {
  onWaiting?: () => void;
  onStalled?: () => void;
  onPlaying?: () => void;
  onCanPlay?: () => void;
}

export interface CanvasV3SceneProps {
  doc: CanvasV3;
  sceneIndex?: number;
  mediaById?: Map<string, CanvasV3MediaResolution>;
  preferredLanguages?: readonly string[];
  className?: string;
  /// Coupe les lecteurs de FOND (vidéo de fond, piste de bandeau) — c'est
  /// l'état que le badge d'annonce du fond bascule côté hôte (B3.6). Le défaut
  /// `true` est ce qui autorise le démarrage automatique côté navigateur.
  muted?: boolean;
  /// Tête de lecture du slide, en secondes. Absente, la scène rend sa pose
  /// STATIQUE ; présente, les keyframes et les transitions de clip sont jouées.
  playheadSec?: number;
  videoGateHandlers?: CanvasV3VideoGateHandlers;
  /// Nœud opaque peint entre le plan `bg` et le plan `content` (voir
  /// `OVERLAY_Z`) — la scène ne sait pas CE QUE c'est ni POURQUOI (voile de
  /// lisibilité, ou tout futur habillage d'hôte), seulement OÙ l'empiler.
  overlay?: ReactNode;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const numeric = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const hex = (v: unknown): string | undefined => {
  const raw = str(v);
  if (!raw) return undefined;
  return raw.startsWith('#') ? raw : `#${raw}`;
};

const record = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

function textStyleCss(payload: Record<string, unknown>): TextStyleCss {
  const name = str(payload.textStyle);
  return (name ? TEXT_STYLES[name] : undefined) ?? DEFAULT_TEXT_STYLE;
}

// ── Résilience par objet ─────────────────────────────────────────────────────
// Le gateway sert TEL QUEL un v3 au schéma invalide aux clients caps-3 (table
// O17) : le rendu est best-effort par contrat. Un objet amputé reçoit donc des
// défauts (transform neutre, ancre centrée, payload vide) et, s'il n'a rien à
// montrer, il est SAUTÉ — jamais au prix de la scène ni de la page.

function normalizedAnchor(raw: unknown): ObjectV3['anchor'] {
  const a = record(raw);
  if (a.t === 'band') return { t: 'band', edge: a.edge === 'top' ? 'top' : 'bottom' };
  return { t: 'free', x: numeric(a.x) ?? 0.5, y: numeric(a.y) ?? 0.5 };
}

function normalizedPlane(raw: unknown): ObjectV3['plane'] {
  return raw === 'bg' || raw === 'content' || raw === 'fg' ? raw : 'content';
}

function normalizedObject(raw: unknown): ObjectV3 | null {
  try {
    const o = record(raw);
    const id = str(o.id);
    const kind = str(o.kind);
    if (!id || !kind) return null;
    const transform = record(o.transform);
    return {
      id,
      kind,
      anchor: normalizedAnchor(o.anchor),
      plane: normalizedPlane(o.plane),
      z: numeric(o.z) ?? 0,
      transform: {
        scale: numeric(transform.scale) ?? 1,
        rotation: numeric(transform.rotation) ?? 0,
        opacity: numeric(transform.opacity) ?? 1,
      },
      timing: o.timing as ObjectV3['timing'],
      locale: str(o.locale),
      // Référence CONSERVÉE : un payload piégé (getter qui lève) doit tomber
      // sur la frontière d'objet, pas être déclenché ici pour toute la scène.
      payload: record(o.payload),
    };
  } catch {
    return null;
  }
}

class CanvasV3ObjectBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state: { failed: boolean } = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

// ── Animation : adaptateurs de forme vers les résolveurs EXISTANTS ───────────
// `resolveKeyframeState` et `resolveClipTransitionOpacity` (portages 1:1 de
// `KeyframeInterpolator.swift` et `ReaderTransitionResolver`) sont réutilisés
// tels quels ; seule la FORME v3 (timing.keyframes, scene.clipTransitions) est
// traduite vers leurs entrées v1.

const KNOWN_EASINGS: readonly string[] = ['linear', 'easeIn', 'easeOut', 'easeInOut'];

/// `spring` (accepté par le contrat v3) n'existe pas dans `StoryEasing` : iOS
/// le laisse tomber à `nil` via `StoryEasing.init(rawValue:)`, le web le laisse
/// donc retomber sur `linear` — même lecture des deux côtés.
function storyKeyframes(timing: ObjectV3['timing']): StoryKeyframeData[] | undefined {
  const raw = timing?.keyframes;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((entry) => {
    const k = record(entry);
    const easing = str(k.easing);
    return {
      time: numeric(k.time) ?? 0,
      x: numeric(k.x),
      y: numeric(k.y),
      scale: numeric(k.scale),
      opacity: numeric(k.opacity),
      easing: easing && KNOWN_EASINGS.includes(easing) ? (easing as StoryEasingName) : undefined,
    };
  });
}

function sceneClipTransitions(scene: SceneV3): StoryClipTransitionData[] {
  const raw = scene.clipTransitions;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const t = record(entry);
    const fromClipId = str(t.fromClipId);
    const toClipId = str(t.toClipId);
    const kind = str(t.kind);
    const duration = numeric(t.duration);
    if (!fromClipId || !toClipId || duration === undefined) return [];
    if (kind !== 'crossfade' && kind !== 'dissolve') return [];
    return [{ id: str(t.id), fromClipId, toClipId, kind, duration }];
  });
}

type ObjectAnimation = {
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
};

function clipWindowDuration(o: ObjectV3, start: number): number | undefined {
  const declared = numeric(o.payload.duration);
  if (declared !== undefined) return declared;
  const end = numeric(o.timing?.end);
  return end !== undefined ? end - start : undefined;
}

/// Le FOND ne participe jamais au fondu de clip : le legacy retournait AVANT
/// de calculer `fgOpacity` pour un porteur `isBackground` (`StoryViewer.tsx:925`)
/// et le fond couleur/dégradé n'était même pas un objet — c'était le style du
/// conteneur (`:846`, `:878`), jamais fondu. Le convertisseur gateway, lui,
/// émet un objet `kind:'media'` d'id `bg` SANS durée pour toute story v1 à fond
/// (`storyEffectsV3.ts:71-75`) : le juger sur la fenêtre de clip le déclarerait
/// hors champ et le ferait DISPARAÎTRE.
function isBackgroundObject(o: ObjectV3): boolean {
  return str(o.payload.background) !== undefined || o.payload.isBackground === true;
}

/// Composition d'opacité identique au legacy : keyframes × facteur de
/// transition, ce dernier réservé aux CLIPS POSÉS (objets média non-fond), et
/// seulement quand le slide porte des transitions.
function resolveAnimation(
  o: ObjectV3,
  transitions: readonly StoryClipTransitionData[],
  playheadSec: number | undefined
): ObjectAnimation | null {
  if (playheadSec === undefined) return null;
  try {
    const start = numeric(o.timing?.start) ?? 0;
    const keyframed = resolveKeyframeState(storyKeyframes(o.timing), playheadSec, start);
    const transitioned = o.kind === 'media' && !isBackgroundObject(o) && transitions.length > 0;
    if (!keyframed && !transitioned) return null;
    const opacity = transitioned
      ? (keyframed?.opacity ?? o.transform.opacity)
        * resolveClipTransitionOpacity(
          { id: o.id, startTime: start, duration: clipWindowDuration(o, start) },
          transitions,
          playheadSec
        )
      : keyframed?.opacity;
    return { x: keyframed?.x, y: keyframed?.y, scale: keyframed?.scale, opacity };
  } catch {
    return null;
  }
}

function objectStyle(o: ObjectV3, anim?: ObjectAnimation | null): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    zIndex: PLANE_Z[o.plane] + o.z,
    transform: `translate(-50%, -50%) scale(${anim?.scale ?? o.transform.scale}) rotate(${o.transform.rotation}deg)`,
    opacity: anim?.opacity ?? o.transform.opacity,
  };
  if (o.anchor.t === 'free') {
    return {
      ...base,
      left: `${(anim?.x ?? o.anchor.x) * 100}%`,
      top: `${(anim?.y ?? o.anchor.y) * 100}%`,
    };
  }
  return o.anchor.edge === 'top'
    ? { ...base, left: '50%', top: BAND_INSET }
    : { ...base, left: '50%', bottom: BAND_INSET, top: 'auto' };
}

function bandClass(anchor: ObjectV3['anchor']): string | undefined {
  if (anchor.t !== 'band') return undefined;
  return anchor.edge === 'top' ? 'band-top' : 'band-bottom';
}

function sameLanguage(a: string, b: string): boolean {
  return a.split('-')[0]?.toLowerCase() === b.split('-')[0]?.toLowerCase();
}

function translationFor(translations: Record<string, unknown>, language: string): string | undefined {
  const exact = str(translations[language]);
  if (exact) return exact;
  const match = Object.entries(translations).find(([lang]) => sameLanguage(lang, language));
  return match ? str(match[1]) : undefined;
}

/// Prisme : les langues du lecteur sont parcourues DANS L'ORDRE, et la langue
/// d'origine concourt à son propre rang — la première servie gagne, par une
/// traduction ou parce que l'objet est déjà écrit dans cette langue. Jamais
/// `translations.first`, jamais de court-circuit par la langue d'origine.
function resolveText(o: ObjectV3, preferredLanguages: readonly string[]): string {
  const original = str(o.payload.text) ?? str(o.payload.content) ?? '';
  const translations = o.payload.translations;
  if (typeof translations !== 'object' || translations === null) return original;
  const table = translations as Record<string, unknown>;
  for (const language of preferredLanguages) {
    const translated = translationFor(table, language);
    if (translated) return translated;
    if (o.locale && sameLanguage(language, o.locale)) return original;
  }
  return original;
}

/// `fontSize` est la clé du FIL : iOS l'émet en px de design sur le canvas de
/// référence 1080 (`CanvasV3Migration.textPayload`) et le convertisseur gateway
/// la recopie telle quelle. `fontSizeDesign` n'est que l'ALIAS interne du funnel
/// v1 du web — le lire seul faisait retomber toute story iOS sur 24 px.
export function canvasV3TextFontSize(payload: Record<string, unknown>): string {
  const design = numeric(payload.fontSize) ?? numeric(payload.fontSizeDesign);
  if (design !== undefined) return `${((design / STORY_DESIGN_WIDTH) * 100).toFixed(4)}cqw`;
  return `${numeric(payload.textSize) ?? 24}px`;
}

function allowedBackgroundOrigins(): readonly string[] {
  return typeof window !== 'undefined'
    ? [window.location.origin, config.backend.url]
    : [config.backend.url];
}

function backgroundStyle(raw: string): React.CSSProperties {
  const value = raw.startsWith('color:') ? raw.slice('color:'.length) : raw;
  if (value.startsWith('gradient:')) {
    const [from, to] = value.slice('gradient:'.length).split(',');
    return { background: `linear-gradient(135deg, ${from?.trim() ?? '#000'}, ${to?.trim() ?? '#000'})` };
  }
  if (/^#?[0-9a-fA-F]{3,8}$/.test(value)) {
    return { background: hex(value) };
  }
  const url = safeBackgroundImageUrl(value, allowedBackgroundOrigins());
  return url
    ? { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};
}

type ResolvedMedia = {
  url?: string;
  kind: 'image' | 'video';
  aspectRatio?: number;
  isBackground: boolean;
};

function resolveMedia(o: ObjectV3, mediaById?: Map<string, CanvasV3MediaResolution>): ResolvedMedia {
  const id = str(o.payload.mediaId) ?? str(o.payload.postMediaId);
  const entry = id ? mediaById?.get(id) : undefined;
  const mimeType = entry?.mimeType ?? '';
  const declared = str(o.payload.mediaType);
  return {
    url: str(o.payload.mediaURL) ?? entry?.url,
    kind: declared === 'video' || (declared === undefined && mimeType.startsWith('video')) ? 'video' : 'image',
    aspectRatio: numeric(o.payload.aspectRatio) ?? entry?.aspectRatio,
    isBackground: o.payload.isBackground === true,
  };
}

type ObjectRenderProps = {
  o: ObjectV3;
  anim: ObjectAnimation | null;
};

function TextObject({ o, anim, preferredLanguages }: ObjectRenderProps & { preferredLanguages: readonly string[] }) {
  const content = resolveText(o, preferredLanguages);
  if (!content) return null;
  const style = textStyleCss(o.payload);
  const background = hex(o.payload.textBg);
  return (
    <div
      data-testid={`canvas-v3-object-${o.id}`}
      data-kind="text"
      className={cn('pointer-events-none select-none whitespace-pre-wrap text-center', bandClass(o.anchor))}
      style={{
        ...objectStyle(o, anim),
        ...style,
        textShadow: style.textShadow ?? FLAT_SHADOW,
        fontSize: canvasV3TextFontSize(o.payload),
        color: hex(o.payload.textColor) ?? '#ffffff',
        textAlign: (str(o.payload.textAlign) as React.CSSProperties['textAlign']) ?? 'center',
        background,
        padding: background ? '4px 10px' : undefined,
        borderRadius: background ? '6px' : undefined,
        maxWidth: '85%',
      }}
    >
      {content}
    </div>
  );
}

/// Parité du chemin legacy sur les lecteurs vidéo : `autoPlay`, `loop` et
/// `playsInline` sont POSÉS, jamais dérivés du payload — une vidéo figée sur
/// sa première image ou muette de boucle serait une perte de fonctionnalité.
/// Le `muted` d'un lecteur de FOND vient de l'hôte (badge B3.6) ; celui d'un
/// média posé est forcé, comme le legacy le faisait, faute de quoi la politique
/// d'autoplay du navigateur refuse purement et simplement de le démarrer.
function MediaObject({
  o,
  anim,
  mediaById,
  muted,
  videoGateHandlers,
}: ObjectRenderProps & {
  mediaById?: Map<string, CanvasV3MediaResolution>;
  muted: boolean;
  videoGateHandlers?: CanvasV3VideoGateHandlers;
}) {
  const background = str(o.payload.background);
  if (background) {
    return (
      <div
        data-testid={`canvas-v3-object-${o.id}`}
        data-kind="media"
        className="absolute inset-0"
        style={{
          zIndex: PLANE_Z[o.plane] + o.z,
          opacity: anim?.opacity ?? o.transform.opacity,
          ...backgroundStyle(background),
        }}
      />
    );
  }

  const media = resolveMedia(o, mediaById);

  /// Parité du chemin legacy : un porteur `isBackground` remplit le cadre en
  /// `object-cover`, il ne se letterbox pas. C'est le cas de la photo ou de la
  /// vidéo posée par le composer web, comme de toute story iOS convertie.
  if (media.url && media.isBackground) {
    const fullBleed: React.CSSProperties = {
      zIndex: PLANE_Z[o.plane] + o.z,
      opacity: anim?.opacity ?? o.transform.opacity,
    };
    return media.kind === 'video' ? (
      <video
        data-testid={`canvas-v3-object-${o.id}`}
        data-kind="media"
        src={media.url}
        className="absolute inset-0 h-full w-full object-cover"
        style={fullBleed}
        muted={muted}
        loop
        autoPlay
        playsInline
        {...videoGateHandlers}
      />
    ) : (
      <img
        data-testid={`canvas-v3-object-${o.id}`}
        data-kind="media"
        src={media.url}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={fullBleed}
      />
    );
  }

  return (
    <div
      data-testid={`canvas-v3-object-${o.id}`}
      data-kind="media"
      className={cn('overflow-hidden rounded-lg', bandClass(o.anchor))}
      style={{
        ...objectStyle(o, anim),
        width: POSED_MEDIA_WIDTH,
        maxWidth: '100%',
        maxHeight: '100%',
        aspectRatio: media.aspectRatio !== undefined ? `${media.aspectRatio}` : undefined,
      }}
    >
      {media.url && media.kind === 'video' && (
        <video
          data-testid={`canvas-v3-media-${o.id}`}
          src={media.url}
          className="h-full w-full object-contain"
          muted
          loop
          autoPlay
          playsInline
          {...videoGateHandlers}
        />
      )}
      {media.url && media.kind === 'image' && (
        <img data-testid={`canvas-v3-media-${o.id}`} src={media.url} alt="" className="h-full w-full object-contain" />
      )}
    </div>
  );
}

/// Parité du lecteur legacy (`audioObjects` → `StoryAudioElement`) : une piste
/// de fond joue sans surface, une piste posée garde ses contrôles à son ancre.
/// Sans ce rendu, une story v3 à pièce jointe audio perd son lecteur — la
/// famille v1 qui le portait n'existe plus pour la rattraper. La piste de FOND
/// suit le `muted` de l'hôte : c'est elle que le badge B3.6 coupe.
function AudioObject({
  o,
  anim,
  mediaById,
  muted,
}: ObjectRenderProps & { mediaById?: Map<string, CanvasV3MediaResolution>; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const volume = numeric(o.payload.volume) ?? 1;
  useEffect(() => {
    if (ref.current) ref.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  const id = str(o.payload.postMediaId) ?? str(o.payload.mediaId);
  const url = str(o.payload.mediaURL) ?? (id ? mediaById?.get(id)?.url : undefined);
  if (!url) return null;

  const isBackground = o.payload.isBackground === true;
  return (
    <audio
      ref={ref}
      data-testid={`canvas-v3-object-${o.id}`}
      data-kind="audio"
      src={url}
      autoPlay
      loop
      muted={isBackground && muted}
      controls={!isBackground}
      className={isBackground ? undefined : cn('pointer-events-auto', bandClass(o.anchor))}
      style={isBackground ? { display: 'none' } : { ...objectStyle(o, anim), width: '60%' }}
    />
  );
}

function StickerObject({ o, anim }: ObjectRenderProps) {
  const emoji = str(o.payload.emoji);
  if (!emoji) return null;
  const size = numeric(o.payload.baseSize) ?? DEFAULT_STICKER_SIZE;
  return (
    <div
      data-testid={`canvas-v3-object-${o.id}`}
      data-kind="sticker"
      className={cn('pointer-events-none select-none leading-none', bandClass(o.anchor))}
      style={{ ...objectStyle(o, anim), fontSize: `${((size / STORY_DESIGN_WIDTH) * 100).toFixed(4)}cqw` }}
    >
      {emoji}
    </div>
  );
}

function CanvasV3Object({
  o,
  anim,
  mediaById,
  preferredLanguages,
  muted,
  videoGateHandlers,
}: ObjectRenderProps & {
  mediaById?: Map<string, CanvasV3MediaResolution>;
  preferredLanguages: readonly string[];
  muted: boolean;
  videoGateHandlers?: CanvasV3VideoGateHandlers;
}) {
  if (o.kind === 'text') return <TextObject o={o} anim={anim} preferredLanguages={preferredLanguages} />;
  if (o.kind === 'media') {
    return (
      <MediaObject o={o} anim={anim} mediaById={mediaById} muted={muted} videoGateHandlers={videoGateHandlers} />
    );
  }
  if (o.kind === 'audio') return <AudioObject o={o} anim={anim} mediaById={mediaById} muted={muted} />;
  if (o.kind === 'sticker') return <StickerObject o={o} anim={anim} />;
  return null;
}

/// Rendu d'UNE scène v3, composant PUR. `playheadSec` joue les keyframes et les
/// transitions de clip du slide ; sans lui la scène rend sa pose statique.
/// Tout kind non rendu ici — réservé (`interactive`) ou hors périmètre v1 — est
/// ignoré EN SILENCE : la lecture d'un blob v3 ne casse jamais l'écran qui
/// l'affiche.
///
/// Dette assumée : un document MULTI-SCÈNES (le contrat en autorise 10) ne rend
/// que `sceneIndex`, sans enchaînement ni transition inter-scènes. iOS n'en émet
/// qu'une aujourd'hui ; l'enchaînement appartient aux lots C/E.
export function CanvasV3Scene({
  doc,
  sceneIndex = 0,
  mediaById,
  preferredLanguages = [],
  className,
  muted = true,
  playheadSec,
  videoGateHandlers,
  overlay,
}: CanvasV3SceneProps) {
  const scene = doc.scenes?.[sceneIndex];
  if (!scene) return null;
  const transitions = sceneClipTransitions(scene);

  return (
    <div
      data-testid="canvas-v3-scene"
      className={cn('relative w-full overflow-hidden', className)}
      style={{ aspectRatio: SCENE_ASPECT_RATIO, containerType: 'inline-size' }}
    >
      {overlay !== undefined && (
        <div className="absolute inset-0" style={{ zIndex: OVERLAY_Z }}>
          {overlay}
        </div>
      )}
      {scene.objects.map((raw) => {
        const o = normalizedObject(raw);
        if (!o) return null;
        return (
          <CanvasV3ObjectBoundary key={o.id}>
            <CanvasV3Object
              o={o}
              anim={resolveAnimation(o, transitions, playheadSec)}
              mediaById={mediaById}
              preferredLanguages={preferredLanguages}
              muted={muted}
              videoGateHandlers={videoGateHandlers}
            />
          </CanvasV3ObjectBoundary>
        );
      })}
    </div>
  );
}
