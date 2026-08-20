import type { CanvasV3, ObjectV3 } from '@meeshy/shared/types/canvas-v3';

export function isCanvasV3(blob: unknown): blob is CanvasV3 {
  return typeof blob === 'object' && blob !== null && (blob as { v?: unknown }).v === 3;
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

const SCENE_ASPECT = 9 / 16;

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function baseObject(
  o: Record<string, unknown>,
  kind: ObjectV3['kind'],
  plane: ObjectV3['plane'],
  fallbackZ: number
): ObjectV3 {
  const timing: NonNullable<ObjectV3['timing']> = {};
  if (typeof o.startTime === 'number') timing.start = o.startTime;
  if (typeof o.endTime === 'number') timing.end = o.endTime;
  if (Array.isArray(o.keyframes)) {
    timing.keyframes = o.keyframes as NonNullable<ObjectV3['timing']>['keyframes'];
  }
  const locale = str(o.sourceLanguage);
  return {
    id: str(o.id) ?? `${kind}-${fallbackZ}`,
    kind,
    anchor: { t: 'free', x: num(o.x, 0.5), y: num(o.y, 0.5) },
    plane,
    z: typeof o.zIndex === 'number' ? o.zIndex : fallbackZ,
    transform: { scale: num(o.scale, 1), rotation: num(o.rotation, 0), opacity: num(o.opacity, 1) },
    ...(Object.keys(timing).length ? { timing } : {}),
    ...(locale ? { locale } : {}),
    payload: {},
  };
}

function remapFreeAnchor(anchor: ObjectV3['anchor'], carrierAspect: number): ObjectV3['anchor'] {
  if (anchor.t !== 'free') return anchor;
  if (!Number.isFinite(carrierAspect) || carrierAspect <= 0) return anchor;
  if (carrierAspect > SCENE_ASPECT) {
    const h = SCENE_ASPECT / carrierAspect;
    const top = (1 - h) / 2;
    return { t: 'free', x: anchor.x, y: top + anchor.y * h };
  }
  if (carrierAspect < SCENE_ASPECT) {
    const w = carrierAspect / SCENE_ASPECT;
    const left = (1 - w) / 2;
    return { t: 'free', x: left + anchor.x * w, y: anchor.y };
  }
  return anchor;
}

export function convertV1ToV3(
  blob: Record<string, unknown>,
  context?: { content?: string | null }
): CanvasV3 {
  const objects: ObjectV3[] = [];
  let z = 0;

  if (str(blob.background)) {
    objects.push({
      ...baseObject({ id: 'bg' }, 'media', 'bg', z++),
      payload: { background: blob.background, transform: blob.backgroundTransform ?? null },
    });
  }

  const textObjects = asArray(blob.textObjects);
  for (const t of textObjects) {
    const o = baseObject(t, 'text', 'fg', z++);
    const {
      id: _i, x: _x, y: _y, scale: _s, rotation: _r, opacity: _op, zIndex: _z,
      startTime: _st, endTime: _e, keyframes: _k, sourceLanguage: _l,
      ...rest
    } = t;
    o.payload = rest;
    objects.push(o);
  }
  if (textObjects.length === 0) {
    const content = str(context?.content);
    const hasLegacyStyling =
      str(blob.textStyle) !== undefined ||
      str(blob.textColor) !== undefined ||
      typeof blob.textPosition === 'number';
    if (content && hasLegacyStyling) {
      const o = baseObject({ id: 'legacy-text', y: num(blob.textPosition, 0.5) }, 'text', 'fg', z++);
      o.payload = {
        text: content,
        ...(str(blob.textStyle) ? { textStyle: blob.textStyle } : {}),
        ...(str(blob.textColor) ? { textColor: blob.textColor } : {}),
      };
      objects.push(o);
    }
  }

  for (const st of asArray(blob.stickerObjects)) {
    const o = baseObject(st, 'sticker', 'fg', z++);
    o.payload = {
      emoji: st.emoji,
      ...(typeof st.baseSize === 'number' ? { baseSize: st.baseSize } : {}),
      ...(str(st.anchorPoint) ? { anchorPoint: st.anchorPoint } : {}),
      ...(typeof st.fadeIn === 'number' ? { fadeIn: st.fadeIn } : {}),
      ...(typeof st.fadeOut === 'number' ? { fadeOut: st.fadeOut } : {}),
    };
    objects.push(o);
  }
  for (const emoji of Array.isArray(blob.stickers) ? blob.stickers : []) {
    if (typeof emoji !== 'string' || emoji.length === 0) continue;
    const o = baseObject({}, 'sticker', 'fg', z++);
    o.payload = { emoji };
    objects.push(o);
  }

  for (const L of asArray(blob.locationObjects)) {
    const o = baseObject(L, 'place', 'fg', z++);
    o.payload = { place: L.place ?? null };
    objects.push(o);
  }
  for (const a of asArray(blob.audioPlayerObjects)) {
    const o = baseObject(a, 'audio', 'content', z++);
    o.payload = {
      postMediaId: a.postMediaId ?? null,
      mediaURL: a.mediaURL ?? null,
      placement: a.placement ?? null,
    };
    objects.push(o);
  }

  const filterTarget =
    objects.find(o => o.kind === 'media' && o.plane === 'content') ??
    objects.find(o => o.kind === 'media' && o.plane === 'bg');
  if (filterTarget && str(blob.filter)) {
    filterTarget.payload = {
      ...filterTarget.payload,
      filter: blob.filter,
      ...(typeof blob.filterIntensity === 'number' ? { filterIntensity: blob.filterIntensity } : {}),
    };
  }

  const carrierAspect = blob.canvasAspectRatio;
  const remapped = typeof carrierAspect === 'number'
    ? objects.map(o => (o.plane === 'bg' ? o : { ...o, anchor: remapFreeAnchor(o.anchor, carrierAspect) }))
    : objects;

  const scene: CanvasV3['scenes'][number] = { id: 's1', objects: remapped };
  if (typeof blob.timelineDuration === 'number') scene.timelineDuration = blob.timelineDuration;
  if (blob.opening && typeof blob.opening === 'object') scene.opening = blob.opening as Record<string, unknown>;
  if (blob.closing && typeof blob.closing === 'object') scene.closing = blob.closing as Record<string, unknown>;
  if (Array.isArray(blob.clipTransitions)) scene.clipTransitions = blob.clipTransitions as Record<string, unknown>[];

  const doc: CanvasV3 = { v: 3, scenes: [scene] };

  const transcriptions = asArray(blob.voiceTranscriptions)
    .flatMap(t => {
      const language = str(t.language);
      return language && typeof t.content === 'string'
        ? [{ language, content: t.content }]
        : [];
    });

  const soundId = str(blob.backgroundAudioId);
  const own = str(blob.voiceAttachmentId);
  if (soundId || own || transcriptions.length > 0) {
    doc.sound = {
      source: soundId ? { t: 'library', soundId } : { t: 'original' },
      volume: soundId || own ? num(blob.backgroundAudioVolume, 1) : 1,
      ...(typeof blob.backgroundAudioStart === 'number' || typeof blob.backgroundAudioEnd === 'number'
        ? { bounds: { start: num(blob.backgroundAudioStart, 0), end: num(blob.backgroundAudioEnd, 0) } }
        : {}),
      ...(transcriptions.length > 0 ? { transcriptions } : {}),
    };
  }
  return doc;
}

export function convertStoryEffectsForWire(effects: unknown): unknown {
  if (effects == null) return effects;
  if (isCanvasV3(effects)) return effects;
  if (typeof effects !== 'object') return effects;
  try {
    return convertV1ToV3(effects as Record<string, unknown>);
  } catch {
    return effects;
  }
}
