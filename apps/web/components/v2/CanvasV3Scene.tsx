'use client';

import { Component, useEffect, useRef, type ReactNode } from 'react';
import type { CanvasV3, ObjectV3, SceneV3 } from '@meeshy/shared/types/canvas-v3';
import { isSameLanguage as sameLanguage } from '@meeshy/shared/utils/language-normalize';
import {
  effectiveMediaRatio,
  mediaCropStyle,
  readMediaCrop,
  type MediaCropRect,
} from '@meeshy/shared/utils/media-crop';
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
import { FLAT_TEXT_SHADOW, parseTextEffect, textEffectShadow } from '@/lib/story-text-effect';

const SCENE_ASPECT_RATIO = '9 / 16';
const STORY_DESIGN_WIDTH = 1080;
const STORY_DESIGN_HEIGHT = 1920;
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

type TextStyleCss = {
  fontFamily: string;
  fontWeight: number;
  fontStyle?: 'italic';
};

/// Table des 18 familles — mêmes noms et mêmes intentions que le résolveur iOS
/// (`StoryTextFontResolver` / `storyFont(for:size:)`), polices web équivalentes
/// avec repli système : la face iOS d'origine est citée par famille.
///
/// **Aucune famille ne brille par elle-même** (#4870) : « neon » est du
/// système semibold arrondi, comme sur iOS où la story est composée. La lueur
/// que cette table lui prêtait vit sur l'axe EFFET (`payload.textEffect`,
/// `lib/story-text-effect.ts`) — un effet caché derrière un nom de police,
/// différent selon le client, était exactement ce que l'axe vient fermer.
const TEXT_STYLES: Record<string, TextStyleCss> = {
  bold: { fontFamily: SYSTEM_SANS, fontWeight: 800 },
  neon: { fontFamily: ROUNDED_STACK, fontWeight: 600 },
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
  /// Texte alternatif — clé par le MÊME `postMediaId` que `url`, jamais
  /// dérivé côté rendu : `MediaObject`/`StickerObject` le SERVENT, ils ne
  /// l'inventent pas (contrat S4-web, alt vide si le document n'en porte pas).
  alt?: string;
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
  /// Repli du libellé d'un objet `place` sans nom ni adresse — miroir de la
  /// `defaultValue` d'iOS (`story.location.here`). La scène reste PURE : elle
  /// ne traduit pas, l'hôte lui passe le mot de la locale active.
  hereLabel?: string;
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

export function translationFor(translations: Record<string, unknown>, language: string): string | undefined {
  const exact = str(translations[language]);
  if (exact) return exact;
  const match = Object.entries(translations).find(([lang]) => sameLanguage(lang, language));
  return match ? str(match[1]) : undefined;
}

/// Prisme : les langues du lecteur sont parcourues DANS L'ORDRE, et la langue
/// d'origine concourt à son propre rang — la première servie gagne, par une
/// traduction ou parce que l'objet est déjà écrit dans cette langue. Jamais
/// `translations.first`, jamais de court-circuit par la langue d'origine.
export function resolveText(o: ObjectV3, preferredLanguages: readonly string[]): string {
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
  alt?: string;
  /**
   * **Les bornes de recadrage, en fractions de la source** (#5085).
   *
   * Elles voyagent depuis iOS sous `cropX/cropY/cropW/cropH` et n'étaient
   * lues par PERSONNE : `payload` est `z.record(z.unknown())` — permissif par
   * contrat — donc la clé passait la validation, arrivait ici, et une image
   * recadrée se rendait ENTIÈRE sans qu'un seul test ne rougisse.
   */
  crop: MediaCropRect | null;
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
    alt: entry?.alt,
    // La LECTURE vit dans `@meeshy/shared` et non ici : trois clients
    // projettent la même forme de fil, et une boucle réécrite par surface est
    // ce qui a produit trois familles divergentes de Prisme en trois cycles.
    crop: readMediaCrop(o.payload),
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
        textShadow: textEffectShadow(parseTextEffect(o.payload.textEffect)) ?? FLAT_TEXT_SHADOW,
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
    /**
     * **Un fond RECADRÉ ne peut pas rester en `inset-0`** : il faut agrandir
     * le média à l'inverse de la bande et le décaler, sous un conteneur qui
     * coupe. C'est ce que `CALayer.contentsRect` fait en interne côté iOS —
     * d'où l'identité du rendu, et le fait qu'aucun pixel n'est retouché ni
     * ici ni là. Le web n'a pas d'équivalent direct.
     */
    if (media.crop) {
      return (
        <div
          data-testid={`canvas-v3-object-${o.id}`}
          data-kind="media"
          className="absolute inset-0 overflow-hidden"
          style={fullBleed}
        >
          {media.kind === 'video' ? (
            <video
              data-testid={`canvas-v3-media-${o.id}`}
              src={media.url}
              className="absolute max-w-none object-cover"
              style={mediaCropStyle(media.crop)}
              muted={muted}
              loop
              autoPlay
              playsInline
              {...videoGateHandlers}
            />
          ) : (
            <img
              data-testid={`canvas-v3-media-${o.id}`}
              src={media.url}
              alt={media.alt ?? ''}
              className="absolute max-w-none object-cover"
              style={mediaCropStyle(media.crop)}
            />
          )}
        </div>
      );
    }
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
        // **Un média recadré n'a plus les proportions de son FICHIER.** Poser
        // `aspectRatio` brut laisserait la carte à la forme de la source et
        // letterboxerait la bande dedans — le recadrage se verrait alors comme
        // une marge, pas comme un cadrage.
        aspectRatio:
          media.aspectRatio !== undefined
            ? `${effectiveMediaRatio(media.aspectRatio, media.crop)}`
            : undefined,
      }}
    >
      {media.url && media.kind === 'video' && (
        <video
          data-testid={`canvas-v3-media-${o.id}`}
          src={media.url}
          className={media.crop ? 'absolute max-w-none object-cover' : 'h-full w-full object-contain'}
          style={media.crop ? mediaCropStyle(media.crop) : undefined}
          muted
          loop
          autoPlay
          playsInline
          {...videoGateHandlers}
        />
      )}
      {media.url && media.kind === 'image' && (
        <img
          data-testid={`canvas-v3-media-${o.id}`}
          src={media.url}
          alt=""
          className={media.crop ? 'absolute max-w-none object-cover' : 'h-full w-full object-contain'}
          style={media.crop ? mediaCropStyle(media.crop) : undefined}
        />
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

/// S4-web — un sticker importé (S1) est une IMAGE INTÉGRÉE au post, résolue
/// par `postMediaId` dans le MÊME `mediaById` que `MediaObject` : aucun
/// second résolveur d'URL. Le repli ne rend `null` QUE si le payload ne
/// porte NI image résolvable NI emoji — un sticker image sans emoji au fil
/// (client neuf, S1) doit rester visible, jamais retomber sur le vide qui
/// faisait disparaître ce cas avant ce lot.
function StickerObject({ o, anim, mediaById }: ObjectRenderProps & { mediaById?: Map<string, CanvasV3MediaResolution> }) {
  const emoji = str(o.payload.emoji);
  const media = resolveMedia(o, mediaById);
  const size = numeric(o.payload.baseSize) ?? DEFAULT_STICKER_SIZE;
  const style: React.CSSProperties = {
    ...objectStyle(o, anim),
    fontSize: `${((size / STORY_DESIGN_WIDTH) * 100).toFixed(4)}cqw`,
  };

  if (media.url) {
    return (
      <img
        data-testid={`canvas-v3-object-${o.id}`}
        data-kind="sticker"
        src={media.url}
        alt={media.alt ?? ''}
        className={cn('pointer-events-none select-none', bandClass(o.anchor))}
        style={{ ...style, width: '1em', height: '1em', objectFit: 'contain' }}
      />
    );
  }

  if (!emoji) return null;
  return (
    <div
      data-testid={`canvas-v3-object-${o.id}`}
      data-kind="sticker"
      className={cn('pointer-events-none select-none leading-none', bandClass(o.anchor))}
      style={style}
    >
      {emoji}
    </div>
  );
}

/**
 * W1 — la pastille de lieu, miroir de `StoryLocationLayer` (SDK iOS).
 *
 * Les quatre mesures sont les CONSTANTES du layer, exprimées dans le même
 * espace de design 1080 puis projetées en `cqw` comme le reste de la scène —
 * jamais des valeurs choisies à l'œil côté web, qui divergeraient au premier
 * ajustement iOS. Idem pour la palette : `indigo50` à 94 %, texte `indigo900`,
 * épingle `error`, tirés de `MeeshyColors`.
 */
const PLACE_DESIGN_FONT_SIZE = 42;
const PLACE_DESIGN_H_PAD = 22;
const PLACE_DESIGN_V_PAD = 14;
const PLACE_DESIGN_ICON_GAP = 10;
const PLACE_PILL_BG = 'rgba(238, 242, 255, 0.94)'; // MeeshyColors.indigo50Hex EEF2FF @ 94 %
const PLACE_LABEL_COLOR = '#312E81'; // MeeshyColors.indigo900Hex
const PLACE_PIN_COLOR = '#F87171'; // MeeshyColors.errorHex

const cqw = (designPx: number): string => `${((designPx / STORY_DESIGN_WIDTH) * 100).toFixed(4)}cqw`;

/**
 * Le libellé d'un lieu — repli EXACT de `StoryLocationLayer.resolvedLabel` :
 * nom, puis adresse, puis « Ici ». Un lieu posé par l'auteur reste affiché même
 * sans métadonnée : c'est un objet du canevas, pas une donnée facultative.
 */
export function canvasV3PlaceLabel(place: Record<string, unknown>, fallback: string): string {
  return str(place.name) ?? str(place.address) ?? fallback;
}

function PlaceObject({ o, anim, hereLabel }: ObjectRenderProps & { hereLabel: string }) {
  const place = o.payload.place;
  if (place === null || place === undefined || typeof place !== 'object') return null;
  const label = canvasV3PlaceLabel(place as Record<string, unknown>, hereLabel);

  return (
    <div
      data-testid={`canvas-v3-object-${o.id}`}
      data-kind="place"
      className={cn('pointer-events-none select-none flex items-center', bandClass(o.anchor))}
      style={{
        ...objectStyle(o, anim),
        gap: cqw(PLACE_DESIGN_ICON_GAP),
        padding: `${cqw(PLACE_DESIGN_V_PAD)} ${cqw(PLACE_DESIGN_H_PAD)}`,
        borderRadius: '9999px',
        background: PLACE_PILL_BG,
        color: PLACE_LABEL_COLOR,
        fontSize: cqw(PLACE_DESIGN_FONT_SIZE),
        fontWeight: 600,
        fontFamily: SYSTEM_SANS,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {/* `mappin.circle.fill` — l'épingle cerclée d'iOS, redessinée en SVG. */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ width: '0.82em', height: '0.82em', flex: '0 0 auto', color: PLACE_PIN_COLOR }}
      >
        <circle cx="12" cy="12" r="11" fill="currentColor" />
        <path
          d="M12 5.6c-2.32 0-4.2 1.85-4.2 4.13 0 3.1 4.2 8.67 4.2 8.67s4.2-5.57 4.2-8.67c0-2.28-1.88-4.13-4.2-4.13zm0 5.75a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4z"
          fill="#FFFFFF"
        />
      </svg>
      {label}
    </div>
  );
}

/**
 * W1 — la largeur d'un trait, miroir EXACT de `StrokeWidthMapping` (SDK).
 *
 *   base = width × (marqueur ? 2 : 1)
 *   captureVersion 0 ⇒ largeur CONSTANTE (le legacy d'avant la pression)
 *   captureVersion ≥ 1 ⇒ min(base, max(1, base × (0,4 + 0,6 × pression)))
 *
 * L'ordre des deux bornes est celui du SDK et il compte : le plafond passe
 * APRÈS le plancher, si bien qu'un trait dont la base est déjà sous l'unité y
 * reste — le « plancher d'une unité » ne le relève pas. Miroiter le CODE, pas
 * l'intention de son commentaire : c'est la seule façon que les deux
 * plateformes peignent la même épaisseur pour le même trait.
 */
const STROKE_MIN_PRESSURE_FACTOR = 0.4;
const STROKE_MIN_WIDTH = 1;
const MARKER_ALPHA = 0.45; // `StoryStrokeRasterizer.draw` — miroir du PKInkingTool(.marker)

export function canvasV3StrokeWidth(
  stroke: { width: number; tool?: string; captureVersion?: number },
  pressure: number,
): number {
  const base = stroke.width * (stroke.tool === 'marker' ? 2 : 1);
  if ((stroke.captureVersion ?? 0) < 1) return Math.max(STROKE_MIN_WIDTH, base);
  const factor = STROKE_MIN_PRESSURE_FACTOR + (1 - STROKE_MIN_PRESSURE_FACTOR) * pressure;
  return Math.min(base, Math.max(STROKE_MIN_WIDTH, base * factor));
}

/**
 * W1 — le dessin. Un objet PLEIN CADRE : iOS rastérise ses traits dans l'espace
 * de design entier (`StoryStrokeRasterizer.image(designSize:)`), le web pose le
 * même espace en `viewBox` SVG — les points du fil sont donc peints tels quels,
 * sans conversion, ce qui rend la parité vérifiable point à point.
 *
 * Deux écarts assumés, tous deux au bénéfice du web :
 *   - la largeur varie PAR SEGMENT (moyenne des pressions de ses extrémités) là
 *     où iOS tessellise un ruban continu — l'œil ne les distingue pas, et le
 *     SVG reste un élément par trait plutôt qu'un maillage ;
 *   - le blob `data` (le PNG opaque du legacy, transporté en base64 par le pont
 *     Swift) n'est PAS décodé : son format n'est garanti par aucun contrat, et
 *     `strokes` est la forme vectorielle qui le remplace.
 */
function DrawingObject({ o, anim }: ObjectRenderProps) {
  const raw = Array.isArray(o.payload.strokes) ? o.payload.strokes : [];
  const strokes = raw
    .map(record)
    .filter((s) => s.tool !== 'eraser' && Array.isArray(s.points) && s.points.length > 0);
  if (strokes.length === 0) return null;

  return (
    <div
      data-testid={`canvas-v3-object-${o.id}`}
      data-kind="drawing"
      className={cn('pointer-events-none select-none', bandClass(o.anchor))}
      style={{ ...objectStyle(o, anim), width: '100%', height: '100%' }}
    >
      <svg
        viewBox={`0 0 ${STORY_DESIGN_WIDTH} ${STORY_DESIGN_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {strokes.map((s, i) => {
          const points = (s.points as unknown[]).map(record);
          const width = numeric(s.width) ?? 1;
          const tool = str(s.tool);
          const captureVersion = numeric(s.captureVersion) ?? 0;
          const meanPressure =
            points.reduce((sum, p) => sum + (numeric(p.pressure) ?? 1), 0) / points.length;
          return (
            <polyline
              key={str(s.id) ?? `stroke-${i}`}
              points={points.map((p) => `${numeric(p.x) ?? 0},${numeric(p.y) ?? 0}`).join(' ')}
              fill="none"
              stroke={`#${hex(s.colorHex) ?? '000000'}`}
              strokeOpacity={tool === 'marker' ? MARKER_ALPHA : 1}
              strokeWidth={canvasV3StrokeWidth({ width, tool, captureVersion }, meanPressure)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
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
  hereLabel,
}: ObjectRenderProps & {
  mediaById?: Map<string, CanvasV3MediaResolution>;
  preferredLanguages: readonly string[];
  muted: boolean;
  videoGateHandlers?: CanvasV3VideoGateHandlers;
  hereLabel: string;
}) {
  if (o.kind === 'text') return <TextObject o={o} anim={anim} preferredLanguages={preferredLanguages} />;
  if (o.kind === 'media') {
    return (
      <MediaObject o={o} anim={anim} mediaById={mediaById} muted={muted} videoGateHandlers={videoGateHandlers} />
    );
  }
  if (o.kind === 'audio') return <AudioObject o={o} anim={anim} mediaById={mediaById} muted={muted} />;
  if (o.kind === 'sticker') return <StickerObject o={o} anim={anim} mediaById={mediaById} />;
  if (o.kind === 'place') return <PlaceObject o={o} anim={anim} hereLabel={hereLabel} />;
  if (o.kind === 'drawing') return <DrawingObject o={o} anim={anim} />;
  return null;
}

/// Rendu d'UNE scène v3, composant PUR. `playheadSec` joue les keyframes et les
/// transitions de clip du slide ; sans lui la scène rend sa pose statique.
/// Tout kind non rendu ici — RÉSERVÉ (`interactive`) — est ignoré EN SILENCE :
/// la lecture d'un blob v3 ne casse jamais l'écran qui l'affiche.
///
/// W1 (2026-08-23) a refermé le trou que cette tolérance masquait : elle avalait
/// aussi `place` et `drawing`, deux kinds bel et bien ACTIFS et réellement émis
/// par iOS — une story avec une épingle de lieu s'affichait donc au web SANS son
/// lieu, sans rien signaler. Les six kinds actifs qui ont un écrivain sont
/// désormais tous peints. Le septième, `mention`, n'a AUCUN écrivain : ni iOS ni
/// le gateway ne l'émet, et iOS fait `continue` à la lecture — ne pas lui écrire
/// de rendu, il n'arrivera jamais.
///
/// W2 (2026-08-23) a refermé la dette d'enchaînement que la ligne précédente
/// annonçait. Ce composant peint TOUJOURS le seul rang demandé, et c'est son
/// contrat, pas une lacune : c'est le miroir de `MeeshyScenePlayer`, qui reçoit
/// lui aussi `sceneIndex` (en Binding) et n'en change jamais de lui-même. Ce
/// qui manquait vivait chez l'hôte — `StoryViewer` ne faisait jamais varier ce
/// rang, si bien qu'un document à 10 scènes (le plafond du contrat) n'en
/// montrait qu'une. L'hôte fait désormais avancer le rang au fil de sa tête de
/// lecture, une scène à la fois, chacune pour SA durée
/// (`canvasV3SceneDurationsMs`, `lib/story-transforms.ts`), et sert une tête de
/// lecture RELATIVE à la scène qui joue — le repère dans lequel les `timing`
/// des objets sont écrits.
///
/// Reste hors périmètre, et le sera tant qu'aucun lecteur ne le rendra : les
/// TRANSITIONS inter-scènes (`scene.opening` / `scene.closing`). Le web ne les
/// a jamais peintes, pas même sur son chemin legacy ; leur donner un rendu
/// serait du neuf, pas de la parité.
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
  hereLabel = 'Ici',
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
              hereLabel={hereLabel}
            />
          </CanvasV3ObjectBoundary>
        );
      })}
    </div>
  );
}
