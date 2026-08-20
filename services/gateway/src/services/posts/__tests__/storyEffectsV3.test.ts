import { readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';
import { isCanvasV3, convertV1ToV3, convertStoryEffectsForWire } from '../storyEffectsV3';

const DIR = join(__dirname, '../../../../../../packages/shared/fixtures/canvas-v3');
const v1 = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(DIR, 'v1-legacy-full.json'), 'utf8')) as Record<string, unknown>;

describe('storyEffectsV3 — convertisseur v1→v3 (table §C2)', () => {
  it('detects v3 vs v1', () => {
    expect(isCanvasV3({ v: 3, scenes: [] })).toBe(true);
    expect(isCanvasV3(v1())).toBe(false);
  });

  it('converts the legacy fixture into a STRICTLY valid v3 document', () => {
    const out = convertV1ToV3(v1());
    expect(CanvasV3Schema.safeParse(out).success).toBe(true);
  });

  it('maps each family to its kind, on the right plane', () => {
    const out = convertV1ToV3(v1());
    const objs = out.scenes[0].objects;
    const kinds = [...new Set(objs.map(o => `${o.kind}/${o.plane}`))].sort();
    expect(kinds).toEqual(['audio/content', 'media/bg', 'place/fg', 'sticker/fg', 'text/fg'].sort());
  });

  it('text position/timing/keyframes survive (anchor free, timing kept)', () => {
    const t = convertV1ToV3(v1()).scenes[0].objects.find(o => o.kind === 'text');
    expect(t?.anchor.t).toBe('free');
    expect((t?.anchor as { x: number }).x).toBe(0.5);
    expect(t?.timing?.start).toBe(1);
    expect(t?.timing?.keyframes).toHaveLength(2);
  });

  it('background sound resolves PROVENANCE library from backgroundAudioId (musicTrackId deprecated ignored)', () => {
    const out = convertV1ToV3(v1());
    expect(out.sound).toEqual({
      source: { t: 'library', soundId: 'snd_nuits_ete' },
      volume: 0.6,
      bounds: { start: 2, end: 17 },
      transcriptions: [
        { language: 'fr', content: 'Salut à tous' },
        { language: 'en', content: 'Hi everyone' },
      ],
    });
  });

  it('legacy slideDuration is DROPPED, timelineDuration kept (authority rule)', () => {
    const s = convertV1ToV3(v1()).scenes[0];
    expect(s.timelineDuration).toBe(9.5);
  });

  it('transitions survive verbatim', () => {
    const s = convertV1ToV3(v1()).scenes[0];
    expect(s.opening).toEqual({ type: 'fade' });
    expect(s.clipTransitions).toHaveLength(1);
  });

  it('unknown fields are IGNORED, never fatal (tolerance contract)', () => {
    expect(() => convertV1ToV3(v1())).not.toThrow();
  });

  it('canvasAspectRatio disappears — the carrier keeps its own ratio (S8)', () => {
    const out = convertV1ToV3(v1()) as unknown as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain('canvasAspectRatio');
  });

  it('place object travels whole into the payload', () => {
    const p = convertV1ToV3(v1()).scenes[0].objects.find(o => o.kind === 'place');
    expect((p?.payload.place as { name?: string })?.name).toBe('Douala');
  });

  it('audio chip keeps its PostMedia reference', () => {
    const a = convertV1ToV3(v1()).scenes[0].objects.find(o => o.kind === 'audio');
    expect(a?.payload.postMediaId).toBe('64b0000000000000000000aa');
  });

  it('text translations survive into the payload (Prisme par objet, C6)', () => {
    const t = convertV1ToV3(v1()).scenes[0].objects.find(o => o.kind === 'text');
    expect((t?.payload.translations as Record<string, string>)?.en).toBe('Hi');
    expect(t?.locale).toBe('fr');
  });

  it('voice transcriptions land on sound.transcriptions (karaoké, C7)', () => {
    const out = convertV1ToV3(v1());
    expect(out.sound?.transcriptions?.map(t => t.language)).toEqual(['fr', 'en']);
  });

  it('free anchors are remapped into the letterboxed carrier rect (U20)', () => {
    // canvas v1 ratio 1.7777 (16:9) dans une scène 9:16 : h = (9/16)/(16/9) ≈ 0.3164,
    // top = (1−h)/2 ≈ 0.3418 ; y' = top + y×h — un texte posé SUR le média y reste.
    const t = convertV1ToV3(v1()).scenes[0].objects.find(o => o.kind === 'text');
    expect(t?.anchor.t).toBe('free');
    expect((t?.anchor as { y: number }).y).toBeCloseTo(0.3418 + 0.2 * 0.3164, 2);
  });

  it('living sticker fields survive: baseSize, anchorPoint, fades (U21)', () => {
    const st = convertV1ToV3(v1()).scenes[0].objects
      .find(o => o.kind === 'sticker' && (o.payload as { emoji?: string }).emoji === '🔥');
    expect(st?.payload.baseSize).toBe(300);
    expect(st?.payload.fadeIn).toBe(0.3);
  });

  it('root filter lands on the bg media payload; root stickers become sticker objects (G3)', () => {
    const objs = convertV1ToV3(v1()).scenes[0].objects;
    const bg = objs.find(o => o.plane === 'bg');
    expect(bg?.payload.filter).toBe('noir');
    expect(bg?.payload.filterIntensity).toBe(0.8);
    expect(objs.filter(o => o.kind === 'sticker').length).toBe(2);
  });

  it('root legacy text styling synthesizes a text object ONLY when textObjects is empty (G3)', () => {
    const legacy = { textStyle: 'classic', textColor: '#FFFFFF', textPosition: 0.5 };
    expect(convertV1ToV3({ ...legacy }, { content: 'Vieux texte' }).scenes[0].objects
      .filter(o => o.kind === 'text').length).toBe(1);
    expect(convertV1ToV3(v1()).scenes[0].objects
      .filter(o => o.kind === 'text').length).toBe(1);
  });

  it('v1 mediaObjects become the media CARRIER: kind media, plane content, volume/muted kept, root filter lands on it (§C2, F10, U21)', () => {
    const webBlob: Record<string, unknown> = {
      backgroundColor: '#000000',
      textStyle: 'bold',
      mediaObjects: [{
        id: 'sobj_carrier',
        postMediaId: '64b0000000000000000000bb',
        mediaType: 'video',
        x: 0.5,
        y: 0.5,
        isBackground: true,
        volume: 0,
        duration: 7.2,
      }],
      filter: 'sepia',
      filterIntensity: 0.5,
    };
    const out = convertV1ToV3(webBlob);
    expect(CanvasV3Schema.safeParse(out).success).toBe(true);
    const carrier = out.scenes[0].objects.find(o => o.kind === 'media' && o.plane === 'content');
    expect(carrier?.payload.postMediaId).toBe('64b0000000000000000000bb');
    expect(carrier?.payload.mediaType).toBe('video');
    expect(carrier?.payload.volume).toBe(0);
    expect(carrier?.payload.muted).toBe(true);
    expect(carrier?.payload.filter).toBe('sepia');
    expect(carrier?.payload.filterIntensity).toBe(0.5);
  });

  it('the media carrier is EXCLUDED from the U20 letterbox remap — it IS the carrier', () => {
    const blob: Record<string, unknown> = {
      canvasAspectRatio: 16 / 9,
      mediaObjects: [{ id: 'sobj_carrier', postMediaId: '64b0000000000000000000bb', mediaType: 'video', x: 0.5, y: 0.5, volume: 0.7 }],
      textObjects: [{ id: 'txt1', text: 'Sur le média', x: 0.5, y: 0.2 }],
    };
    const out = convertV1ToV3(blob);
    const carrier = out.scenes[0].objects.find(o => o.kind === 'media');
    const text = out.scenes[0].objects.find(o => o.kind === 'text');
    expect((carrier?.anchor as { y: number }).y).toBe(0.5);
    expect(carrier?.payload.muted).toBe(false);
    expect((text?.anchor as { y: number }).y).toBeCloseTo(0.3418 + 0.2 * 0.3164, 2);
  });

  it('wire helper: v3 passes through UNTOUCHED, v1 converts, nullish passes', () => {
    const v3doc = { v: 3, scenes: [{ id: 's1', objects: [] }] };
    expect(convertStoryEffectsForWire(v3doc)).toBe(v3doc);
    expect(isCanvasV3(convertStoryEffectsForWire(v1()))).toBe(true);
    expect(convertStoryEffectsForWire(null)).toBeNull();
  });

  it('GOLDEN: output equals the frozen v1-legacy-full.v3.json byte-shape', () => {
    const golden = JSON.parse(readFileSync(join(DIR, 'v1-legacy-full.v3.json'), 'utf8')) as unknown;
    expect(convertV1ToV3(v1())).toEqual(golden);
  });
});

const rich = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(DIR, 'v1-legacy-rich.json'), 'utf8')) as Record<string, unknown>;

describe('storyEffectsV3 — contrat étendu (rattrapage B8a)', () => {
  it('drawingStrokes become a drawing OBJECT, legacy drawingData rides along in base64', () => {
    const d = convertV1ToV3(rich()).scenes[0].objects.find(o => o.kind === 'drawing');
    expect(d?.id).toBe('drawing');
    expect(d?.plane).toBe('fg');
    expect((d?.payload.strokes as unknown[]).length).toBe(1);
    expect(d?.payload.data).toBe('AQIDBA==');
  });

  it('the drawing object CONSUMES a z slot — both converters count the same ranks', () => {
    expect(convertV1ToV3(rich()).scenes[0].objects.find(o => o.kind === 'drawing')?.z).toBe(3);
  });

  it('TTS variants ride on the background sound (Prisme audio par langue)', () => {
    expect(convertV1ToV3(rich()).sound?.variants).toEqual([
      { postMediaId: '64b0000000000000000000e1', language: 'fr', isAutoGenerated: true },
      { postMediaId: '64b0000000000000000000e2', language: 'en', isAutoGenerated: true },
    ]);
  });

  it('the slide thumbHash lands on the SCENE — le placeholder du fil survit à la publication', () => {
    expect(convertV1ToV3(rich()).scenes[0].thumbHash).toBe('1QcSHQRnh493V4dIh4eXh0h4kJUI');
  });

  it('no visual object ⇒ NO scenes at all (O3, jamais de cadre vide)', () => {
    expect(convertV1ToV3({}).scenes).toBeUndefined();
    expect(convertV1ToV3({ thumbHash: '1QcSHQRnh493V4dIh4eXh0h4kJUI' }).scenes).toBeUndefined();
  });

  it('the media carrier keeps its aspectRatio and its pivot anchor', () => {
    const m = convertV1ToV3(rich()).scenes[0].objects.find(o => o.kind === 'media');
    expect(m?.payload.aspectRatio).toBe(1.7777);
    expect(m?.payload.anchor).toEqual({ x: 0.25, y: 0.75 });
  });

  it('the BORROWED sound survives on the audio object — provenance et niveau (B3.4, F10)', () => {
    const a = convertV1ToV3(rich()).scenes[0].objects.find(o => o.kind === 'audio');
    expect(a?.payload.soundId).toBe('64b0000000000000000000dd');
    expect(a?.payload.soundAuthorUsername).toBe('sam');
    expect(a?.payload.volume).toBe(0.35);
    expect(a?.payload).toMatchObject({
      isBackground: true, loop: true, duration: 18,
      fadeIn: 0.5, fadeOut: 1.25, name: 'Pluie en forêt',
    });
    expect(a?.payload.postMediaId).toBeNull();
  });

  it('a sticker keeps the living keys it REALLY carries, and nothing else', () => {
    const stickers = convertV1ToV3(rich()).scenes[0].objects.filter(o => o.kind === 'sticker');
    expect(stickers[0].payload).toEqual({
      emoji: '🎉', baseSize: 220, anchorPoint: 'center', fadeIn: 0.2, fadeOut: 0.4,
    });
    expect(stickers[1].payload).toEqual({ emoji: '💫' });
  });

  it('the rich conversion is a STRICTLY valid v3 document', () => {
    expect(CanvasV3Schema.safeParse(convertV1ToV3(rich())).success).toBe(true);
  });

  it('GOLDEN ADDITIVE: output equals the frozen v1-legacy-rich.v3.json byte-shape', () => {
    const golden = JSON.parse(readFileSync(join(DIR, 'v1-legacy-rich.v3.json'), 'utf8')) as unknown;
    expect(convertV1ToV3(rich())).toEqual(golden);
  });
});
