import { readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';
import { isCanvasV3, convertV1ToV3, convertStoryEffectsForWire } from '../storyEffectsV3';

const DIR = join(__dirname, '../../../../../../packages/shared/fixtures/canvas-v3');
const v1 = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(DIR, 'v1-legacy-full.json'), 'utf8')) as Record<string, unknown>;

describe('storyEffectsV3 — convertisseur v1→v3 (table §C2)', () => {
  // Le convertisseur RECONSTRUIT le payload sticker au lieu de le transporter :
  // toute clé qu'il ne recopie pas est PERDUE en silence pour un client qui
  // traverse le serveur. `postMediaId` porte l'image intégrée d'un sticker —
  // sans ces deux cas, un sticker image redevenait un simple glyphe sans que
  // rien ne le signale. La spec O8 attendait déjà cette clé ici :
  // `unclaimedCanvasMediaIds` compte `sticker` parmi ses kinds porteurs.
  it('transporte postMediaId et provider d\'un sticker image', () => {
    const doc = convertV1ToV3({
      stickerObjects: [
        { id: 's1', emoji: '🖼️', x: 0.5, y: 0.5, postMediaId: 'media-42', provider: 'genmoji' },
      ],
    }) as { scenes: { objects: { kind: string; payload: Record<string, unknown> }[] }[] };

    const sticker = doc.scenes[0].objects.find((o) => o.kind === 'sticker');
    expect(sticker?.payload.postMediaId).toBe('media-42');
    expect(sticker?.payload.provider).toBe('genmoji');
    expect(sticker?.payload.emoji).toBe('🖼️');
  });

  // MÊME piège, deuxième morsure. Le lot iOS #4741 a introduit les stickers à
  // GABARIT — pastille de lieu, cadre de cœurs, ruban d'heure — dont le dessin
  // vit dans `templateId` et dont le texte vit dans `slots`. Le convertisseur
  // ne les recopiait pas : une décoration qui traverse le serveur redevenait
  // son emoji de repli, exactement comme un sticker image redevenait un glyphe
  // avant le cas ci-dessus.
  //
  // Le repli, lui, DOIT continuer de voyager : il sert le lecteur dont le build
  // ne connaît pas ce gabarit.
  it('transporte templateId et slots d\'une décoration', () => {
    const doc = convertV1ToV3({
      stickerObjects: [
        {
          id: 's2', emoji: '📍', x: 0.5, y: 0.5,
          templateId: 'locationStamp',
          slots: { title: 'Tessalit', subtitle: 'Mali' },
        },
      ],
    }) as { scenes: { objects: { kind: string; payload: Record<string, unknown> }[] }[] };

    const sticker = doc.scenes[0].objects.find((o) => o.kind === 'sticker');
    expect(sticker?.payload.templateId).toBe('locationStamp');
    expect(sticker?.payload.slots).toEqual({ title: 'Tessalit', subtitle: 'Mali' });
    expect(sticker?.payload.emoji).toBe('📍');
  });

  it('transporte le gabarit et les valeurs figées d\'une décoration (#4819)', () => {
    const doc = convertV1ToV3({
      stickerObjects: [
        { id: 's1', emoji: '🕐', x: 0.5, y: 0.5, templateId: 'time.analog',
          slots: { time: '14:32', hour: '14', minute: '32' }, duration: 3.5, animation: 'pulse' },
      ],
    }) as { scenes: { objects: { kind: string; payload: Record<string, unknown> }[] }[] };

    const sticker = doc.scenes[0].objects.find((o) => o.kind === 'sticker');
    expect(sticker?.payload.templateId).toBe('time.analog');
    expect(sticker?.payload.slots).toEqual({ time: '14:32', hour: '14', minute: '32' });
    expect(sticker?.payload.duration).toBe(3.5);
    expect(sticker?.payload.animation).toBe('pulse');
  });

  it('ignore des emplacements qui ne sont pas des chaînes', () => {
    const doc = convertV1ToV3({
      stickerObjects: [
        { id: 's1', emoji: '🕐', x: 0.5, y: 0.5, templateId: 'time.analog', slots: { hour: 14 } },
      ],
    }) as { scenes: { objects: { kind: string; payload: Record<string, unknown> }[] }[] };

    const sticker = doc.scenes[0].objects.find((o) => o.kind === 'sticker');
    expect(sticker?.payload.templateId).toBe('time.analog');
    expect(sticker?.payload.slots).toBeUndefined();
  });

  // MÊME piège, TROISIÈME morsure — sur le frère du champ ci-dessus. Le lot
  // #4717 a donné un gabarit à la pastille de LIEU (`styleId`) ; la branche
  // `locationObjects`, trente lignes plus haut, ne recopiait que `place`. Une
  // pastille décorée qui traverse le serveur redevenait la pastille de base.
  //
  // Le témoin s'écrit sur un gabarit AUTRE que `location.pill` : ce dernier est
  // le repli d'un `styleId` absent, donc sur lui la règle juste et le champ
  // perdu rendent le même verdict.
  it('transporte le styleId d\'une pastille de lieu décorée', () => {
    const doc = convertV1ToV3({
      locationObjects: [
        {
          id: 'l1', x: 0.5, y: 0.8,
          place: { latitude: 20.2, longitude: 1.01, name: 'Tessalit' },
          styleId: 'location.stamp',
        },
      ],
    }) as { scenes: { objects: { kind: string; payload: Record<string, unknown> }[] }[] };

    const lieu = doc.scenes[0].objects.find((o) => o.kind === 'place');
    expect(lieu?.payload.styleId).toBe('location.stamp');
    expect(lieu?.payload.place).toEqual({ latitude: 20.2, longitude: 1.01, name: 'Tessalit' });
  });

  it('n\'invente aucune clé de style pour une pastille nue', () => {
    const doc = convertV1ToV3({
      locationObjects: [
        { id: 'l1', place: { latitude: 20.2, longitude: 1.01 } },
      ],
    }) as { scenes: { objects: { kind: string; payload: Record<string, unknown> }[] }[] };

    const lieu = doc.scenes[0].objects.find((o) => o.kind === 'place');
    expect(lieu?.payload).not.toHaveProperty('styleId');
  });

  // MÊME piège, QUATRIÈME morsure (#4840) — la FENÊTRE, sur la branche que
  // #4832 venait de réparer. `baseObject` portait déjà `timing.start` ; les
  // trois clés de charge manquaient, et cette branche était la seule des
  // quatre familles à n'en émettre aucune.
  it('transporte la fenêtre temporelle d\'une pastille de lieu', () => {
    const doc = convertV1ToV3({
      locationObjects: [
        {
          id: 'l1', x: 0.5, y: 0.8,
          place: { latitude: 20.2, longitude: 1.01, name: 'Tessalit' },
          startTime: 2, duration: 4, fadeIn: 0.25, fadeOut: 0.5,
        },
      ],
    }) as {
      scenes: {
        objects: {
          kind: string;
          timing?: { start?: number };
          payload: Record<string, unknown>;
        }[];
      }[];
    };

    const lieu = doc.scenes[0].objects.find((o) => o.kind === 'place');
    expect(lieu?.timing?.start).toBe(2);
    expect(lieu?.payload.duration).toBe(4);
    expect(lieu?.payload.fadeIn).toBe(0.25);
    expect(lieu?.payload.fadeOut).toBe(0.5);
  });

  // Une pastille SANS fenêtre se réencode octet pour octet : le convertisseur
  // n'invente pas un début à zéro, sinon toute story déjà publiée verrait ses
  // lieux acquérir une fenêtre qu'aucun auteur n'a posée.
  it('n\'invente aucune clé de fenêtre pour une pastille sans temps', () => {
    const doc = convertV1ToV3({
      locationObjects: [
        { id: 'l1', place: { latitude: 20.2, longitude: 1.01 } },
      ],
    }) as {
      scenes: { objects: { kind: string; payload: Record<string, unknown> }[] }[];
    };

    const lieu = doc.scenes[0].objects.find((o) => o.kind === 'place');
    expect(lieu?.payload).not.toHaveProperty('duration');
    expect(lieu?.payload).not.toHaveProperty('fadeIn');
    expect(lieu?.payload).not.toHaveProperty('fadeOut');
  });

  it('n\'invente aucune clé sur un sticker emoji seul', () => {
    const doc = convertV1ToV3({
      stickerObjects: [{ id: 's1', emoji: '🔥', x: 0.5, y: 0.5 }],
    }) as { scenes: { objects: { kind: string; payload: Record<string, unknown> }[] }[] };

    const sticker = doc.scenes[0].objects.find((o) => o.kind === 'sticker');
    expect(sticker?.payload).toEqual({ emoji: '🔥' });
  });

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

  // S8 RÉVISÉE. La règle d'origine — « `canvasAspectRatio` disparaît, le porteur
  // garde son propre ratio » — tenait pour la LECTURE et échouait pour
  // l'ÉDITION (cf. le bloc carrierAspect plus bas). Ce test dit désormais les
  // DEUX moitiés, faute de quoi il passerait par simple non-collision de noms :
  // la clé v1 s'en va, l'information reste.
  it('the v1 key canvasAspectRatio disappears, but its VALUE survives as carrierAspect (S8 révisée)', () => {
    const out = convertV1ToV3(v1());
    expect(JSON.stringify(out)).not.toContain('canvasAspectRatio');
    expect(out.scenes?.[0].carrierAspect).toBeCloseTo(1.7777, 6);
  });

  it('place object travels whole into the payload', () => {
    const p = convertV1ToV3(v1()).scenes[0].objects.find(o => o.kind === 'place');
    expect((p?.payload.place as { name?: string })?.name).toBe('Douala');
  });

  it('audio chip keeps its PostMedia reference', () => {
    const a = convertV1ToV3(v1()).scenes[0].objects.find(o => o.kind === 'audio');
    expect(a?.payload.postMediaId).toBe('64b0000000000000000000aa');
  });

  /// L'axe EFFET (#4870) traverse la conversion par le `...rest` du texte —
  /// ce témoin épingle qu'aucune énumération de clés ne vienne un jour le
  /// retenir, comme `postMediaId` l'a été pour le sticker.
  it('text effect travels into the v3 payload', () => {
    const doc = convertV1ToV3({
      background: '#000000',
      textObjects: [{ id: 't', text: 'Salut', x: 0.5, y: 0.5, textEffect: 'shadow' }],
    });
    const t = doc.scenes[0].objects.find(o => o.kind === 'text');
    expect(t?.payload.textEffect).toBe('shadow');
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

  // ─── carrierAspect (révision S8) ─────────────────────────────────────────
  // S8 gravait la DISPARITION de `canvasAspectRatio` : « le porteur garde son
  // propre ratio ». L'argument vaut pour la LECTURE — un lecteur peint une
  // scène 9:16 et le porteur se débrouille. Il n'a pas survécu à l'ÉDITION :
  // `remapFreeAnchor` est affine (`y' = top + y·h`, h et top déduits du seul
  // `carrierAspect`), donc INVERSIBLE — mais seulement si l'on sait encore ce
  // que valait le porteur. Jeté, il rendait la conversion à sens unique, et
  // rouvrir un ancien post recadrait ses objets sans retour possible.
  // `StoryDraftStore` avait déjà dû le repersister hors document, par
  // diapositive, pour les brouillons ; on cesse d'industrialiser ce pansement.
  //
  // La LETTRE de S8 tient : la clé v1 `canvasAspectRatio` disparaît bien. Son
  // ESPRIT est révisé : l'information, elle, survit sous un nom v3.

  it('carrierAspect is LOGGED on the scene — the U20 remap stops being one-way', () => {
    const out = convertV1ToV3({
      canvasAspectRatio: 16 / 9,
      textObjects: [{ id: 'txt1', text: 'x', x: 0.5, y: 0.9 }],
    });
    expect(out.scenes?.[0].carrierAspect).toBeCloseTo(16 / 9, 6);
  });

  it('knowing carrierAspect, the letterbox remap inverts EXACTLY', () => {
    const y0 = 0.9;
    const scene = convertV1ToV3({
      canvasAspectRatio: 16 / 9,
      textObjects: [{ id: 'txt1', text: 'x', x: 0.5, y: y0 }],
    }).scenes?.[0];
    const aspect = scene?.carrierAspect as number;
    const h = (9 / 16) / aspect;
    const top = (1 - h) / 2;
    const y1 = (scene?.objects.find(o => o.kind === 'text')?.anchor as { y: number }).y;
    expect((y1 - top) / h).toBeCloseTo(y0, 10);
  });

  it('no carrierAspect is logged when the v1 blob never carried one', () => {
    const scene = convertV1ToV3({ textObjects: [{ id: 'txt1', text: 'x', x: 0.5, y: 0.9 }] }).scenes?.[0];
    expect(scene?.carrierAspect).toBeUndefined();
  });

  it('CanvasV3Schema PRESERVES carrierAspect through a parse (never stripped as unknown)', () => {
    const parsed = CanvasV3Schema.parse({ v: 3, scenes: [{ id: 's1', objects: [], carrierAspect: 1.7777 }] });
    expect(parsed.scenes?.[0].carrierAspect).toBeCloseTo(1.7777, 6);
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

  it('keeps the scene when only a thumbHash lives on it (offline queue, computed after persist)', () => {
    const doc = convertV1ToV3({ thumbHash: '1QcSHQRnh493V4dIh4eXh0h4kJUI' });
    expect(doc.scenes).toHaveLength(1);
    expect(doc.scenes?.[0].objects).toHaveLength(0);
    expect(doc.scenes?.[0].thumbHash).toBe('1QcSHQRnh493V4dIh4eXh0h4kJUI');
  });

  it('a truly empty blob still emits NO scenes (O3)', () => {
    const doc = convertV1ToV3({});
    expect(doc.scenes).toBeUndefined();
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

  it('no visual object AND nothing carried ⇒ NO scenes at all (O3, jamais de cadre vide)', () => {
    expect(convertV1ToV3({}).scenes).toBeUndefined();
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
