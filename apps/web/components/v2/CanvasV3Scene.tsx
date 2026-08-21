'use client';

import { useEffect, useRef } from 'react';
import type { CanvasV3, ObjectV3 } from '@meeshy/shared/types/canvas-v3';
import { safeBackgroundImageUrl } from '@/lib/story-transforms';
import { config } from '@/lib/config';
import { cn } from '@/lib/utils';

const SCENE_ASPECT_RATIO = '9 / 16';
const STORY_DESIGN_WIDTH = 1080;
const BAND_INSET = '6%';
const DEFAULT_STICKER_SIZE = 140;
const PLANE_Z = { bg: 0, content: 10, fg: 20 } as const;

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

export interface CanvasV3SceneProps {
  doc: CanvasV3;
  sceneIndex?: number;
  mediaById?: Map<string, CanvasV3MediaResolution>;
  preferredLanguages?: readonly string[];
  className?: string;
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

function textStyleCss(payload: Record<string, unknown>): TextStyleCss {
  const name = str(payload.textStyle);
  return (name ? TEXT_STYLES[name] : undefined) ?? DEFAULT_TEXT_STYLE;
}

function objectStyle(o: ObjectV3): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    zIndex: PLANE_Z[o.plane] + o.z,
    transform: `translate(-50%, -50%) scale(${o.transform.scale}) rotate(${o.transform.rotation}deg)`,
    opacity: o.transform.opacity,
  };
  if (o.anchor.t === 'free') {
    return { ...base, left: `${o.anchor.x * 100}%`, top: `${o.anchor.y * 100}%` };
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

function fontSize(payload: Record<string, unknown>): string {
  const design = numeric(payload.fontSizeDesign);
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
  muted: boolean;
  loop: boolean;
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
    muted: o.payload.muted !== false,
    loop: o.payload.loop === true,
    isBackground: o.payload.isBackground === true,
  };
}

function TextObject({ o, preferredLanguages }: { o: ObjectV3; preferredLanguages: readonly string[] }) {
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
        ...objectStyle(o),
        ...style,
        textShadow: style.textShadow ?? FLAT_SHADOW,
        fontSize: fontSize(o.payload),
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

function MediaObject({ o, mediaById }: { o: ObjectV3; mediaById?: Map<string, CanvasV3MediaResolution> }) {
  const background = str(o.payload.background);
  if (background) {
    return (
      <div
        data-testid={`canvas-v3-object-${o.id}`}
        data-kind="media"
        className="absolute inset-0"
        style={{ zIndex: PLANE_Z[o.plane] + o.z, opacity: o.transform.opacity, ...backgroundStyle(background) }}
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
      opacity: o.transform.opacity,
    };
    return media.kind === 'video' ? (
      <video
        data-testid={`canvas-v3-object-${o.id}`}
        data-kind="media"
        src={media.url}
        className="absolute inset-0 h-full w-full object-cover"
        style={fullBleed}
        muted={media.muted}
        loop={media.loop}
        autoPlay
        playsInline
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
      className={cn('overflow-hidden', bandClass(o.anchor))}
      style={{
        ...objectStyle(o),
        width: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        aspectRatio: media.aspectRatio !== undefined ? `${media.aspectRatio}` : undefined,
      }}
    >
      {media.url && media.kind === 'video' && (
        <video
          src={media.url}
          className="h-full w-full object-contain"
          muted={media.muted}
          loop={media.loop}
          playsInline
        />
      )}
      {media.url && media.kind === 'image' && (
        <img src={media.url} alt="" className="h-full w-full object-contain" />
      )}
    </div>
  );
}

/// Parité du lecteur legacy (`audioObjects` → `StoryAudioElement`) : une piste
/// de fond joue sans surface, une piste posée garde ses contrôles à son ancre.
/// Sans ce rendu, une story v3 à pièce jointe audio perd son lecteur — la
/// famille v1 qui le portait n'existe plus pour la rattraper.
function AudioObject({ o, mediaById }: { o: ObjectV3; mediaById?: Map<string, CanvasV3MediaResolution> }) {
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
      controls={!isBackground}
      className={isBackground ? undefined : cn('pointer-events-auto', bandClass(o.anchor))}
      style={isBackground ? { display: 'none' } : { ...objectStyle(o), width: '60%' }}
    />
  );
}

function StickerObject({ o }: { o: ObjectV3 }) {
  const emoji = str(o.payload.emoji);
  if (!emoji) return null;
  const size = numeric(o.payload.baseSize) ?? DEFAULT_STICKER_SIZE;
  return (
    <div
      data-testid={`canvas-v3-object-${o.id}`}
      data-kind="sticker"
      className={cn('pointer-events-none select-none leading-none', bandClass(o.anchor))}
      style={{ ...objectStyle(o), fontSize: `${((size / STORY_DESIGN_WIDTH) * 100).toFixed(4)}cqw` }}
    >
      {emoji}
    </div>
  );
}

/// Rendu STATIQUE d'une scène v3 : les timings ne sont pas joués (un objet timé
/// est simplement visible — dette explicite du lot F). Tout kind non rendu ici
/// — réservé (`interactive`) ou hors périmètre v1 — est ignoré EN SILENCE :
/// la lecture d'un blob v3 ne casse jamais l'écran qui l'affiche.
export function CanvasV3Scene({
  doc,
  sceneIndex = 0,
  mediaById,
  preferredLanguages = [],
  className,
}: CanvasV3SceneProps) {
  const scene = doc.scenes?.[sceneIndex];
  if (!scene) return null;

  return (
    <div
      data-testid="canvas-v3-scene"
      className={cn('relative w-full overflow-hidden', className)}
      style={{ aspectRatio: SCENE_ASPECT_RATIO, containerType: 'inline-size' }}
    >
      {scene.objects.map((o) => {
        if (o.kind === 'text') return <TextObject key={o.id} o={o} preferredLanguages={preferredLanguages} />;
        if (o.kind === 'media') return <MediaObject key={o.id} o={o} mediaById={mediaById} />;
        if (o.kind === 'audio') return <AudioObject key={o.id} o={o} mediaById={mediaById} />;
        if (o.kind === 'sticker') return <StickerObject key={o.id} o={o} />;
        return null;
      })}
    </div>
  );
}
