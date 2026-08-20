# Lot A — Contrat v3 & rupture propre — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le fil passe CanvasV3 strict : schéma Zod + fixtures gelées, convertisseur v1→v3 à la lecture (permanent), création refusée en `426 UPGRADE_REQUIRED` pour les vieux blobs et les vieux clients (version plancher), claim des stickers posés.

**Architecture:** Le schéma vit dans `packages/shared` (source unique) ; le convertisseur et les gardes vivent au gateway. UN point d'intégration lecture : `withMentions` (`postReferences.ts:145`), déjà appliqué à chaque site de sérialisation (prouvé par le chantier références). UN point d'écriture : la validation de `storyEffects` dans les routes posts.

**Tech Stack:** TypeScript strict, Zod, Fastify 5, Jest (bun local), Prisma/Mongo.

**Spec:** `docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` (§C intégral, §B1 O2/O8/O10) — la spec voyage avec ce plan.

## Global Constraints

- Plancher produit **iOS 16 / rien en dessous** ; le web n'a PAS de plancher (lockstep).
- Gates locaux : `cd packages/shared && bun run build` puis `cd services/gateway && npx tsc --noEmit` puis `bun run test:coverage` (740+ suites) — l'ordre est celui du CLAUDE.md (« Local Test Parity »).
- Commits par chemins EXPLICITES uniquement (`git add <p1> <p2>`) ; jamais `-A`/`.`/`-u` ; pas de backticks dans `-m`.
- TS strict, zéro `any` (utiliser `unknown` + validation) ; schéma d'abord, types dérivés.
- Aucun `schema.response` Fastify sur les routes touchées (la troncature silencieuse est un piège documenté) — ne pas en introduire.
- Le convertisseur est TOLÉRANT : champ inconnu ignoré + compteur loggué, jamais d'échec.
- `kind` réservés (`hashtag`, `annotation`, `interactive`) : refusés à l'écriture avec un message dédié (O1/S5/O10).

---

### Task A1: Schéma Zod `CanvasV3` (source unique, kinds réservés refusés)

**Files:**
- Create: `packages/shared/schemas/canvas-v3.ts`
- Modify: `packages/shared/schemas/index.ts` (export)
- Test: `services/gateway/src/__tests__/unit/services/posts/canvasV3.schema.test.ts`

**Interfaces:**
- Consumes: rien (racine du gel).
- Produces: `CanvasV3Schema` (Zod), types `CanvasV3`, `SceneV3`, `ObjectV3`, `BackgroundSoundV3`, `KeyframeV3` ; helper `RESERVED_KINDS = ['hashtag','annotation','interactive'] as const`. **Ces noms sont gelés** — les lots B à F les répliquent à l'identique.

- [ ] **Step 1: Écrire le test rouge**

```typescript
import { CanvasV3Schema, RESERVED_KINDS } from '@meeshy/shared/schemas/canvas-v3';

describe('CanvasV3Schema', () => {
  const minimal = {
    v: 3,
    scenes: [{
      id: 's1',
      objects: [{
        id: 'o1', kind: 'text',
        anchor: { t: 'free', x: 0.5, y: 0.4 },
        plane: 'fg', z: 0,
        transform: { scale: 1, rotation: 0, opacity: 1 },
        payload: { text: 'Bonjour', textStyle: 'bold' },
      }],
    }],
  };

  it('parses a minimal v3 document', () => {
    expect(CanvasV3Schema.parse(minimal).v).toBe(3);
  });

  it('rejects a v1-shaped blob (no v:3)', () => {
    expect(CanvasV3Schema.safeParse({ textObjects: [] }).success).toBe(false);
  });

  it('timing is optional — nil means "suit la slide" (O4)', () => {
    const parsed = CanvasV3Schema.parse(minimal);
    expect(parsed.scenes[0].objects[0].timing).toBeUndefined();
  });

  it('band anchor parses', () => {
    const doc = structuredClone(minimal);
    doc.scenes[0].objects[0].anchor = { t: 'band', edge: 'top' };
    expect(CanvasV3Schema.parse(doc).scenes[0].objects[0].anchor).toEqual({ t: 'band', edge: 'top' });
  });

  it.each(RESERVED_KINDS)('refuses the RESERVED kind %s with a dedicated message', (kind) => {
    const doc = structuredClone(minimal);
    (doc.scenes[0].objects[0] as { kind: string }).kind = kind;
    const res = CanvasV3Schema.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(JSON.stringify(res.error.issues)).toContain('KIND_RESERVED');
    }
  });

  it('background sound carries its PROVENANCE (original vs library)', () => {
    const doc = structuredClone(minimal) as Record<string, unknown>;
    doc.sound = { source: { t: 'library', soundId: 'snd1' }, volume: 0.6, bounds: { start: 2, end: 17 } };
    const parsed = CanvasV3Schema.parse(doc);
    expect(parsed.sound?.source).toEqual({ t: 'library', soundId: 'snd1' });
  });
});
```

- [ ] **Step 2: Vérifier le rouge**

Run: `cd services/gateway && npx jest --runTestsByPath src/__tests__/unit/services/posts/canvasV3.schema.test.ts`
Expected: FAIL — module `canvas-v3` inexistant.

- [ ] **Step 3: Implémenter le schéma**

```typescript
// packages/shared/schemas/canvas-v3.ts
import { z } from 'zod';

/** Kinds réservés par la spec (O1/S5/O10) — présents dans la nomenclature,
 *  REFUSÉS en v1. Le message est un contrat client (le composer le mappe). */
export const RESERVED_KINDS = ['hashtag', 'annotation', 'interactive'] as const;
const ACTIVE_KINDS = ['text', 'media', 'sticker', 'audio', 'place', 'drawing', 'mention'] as const;

const AnchorSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('free'), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  z.object({ t: z.literal('band'), edge: z.enum(['top', 'bottom']) }),
]);

const KeyframeSchema = z.object({
  time: z.number().min(0),
  x: z.number().optional(), y: z.number().optional(),
  scale: z.number().positive().optional(),
  opacity: z.number().min(0).max(1).optional(),
  volume: z.number().min(0).max(1).optional(),
  easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring']).optional(),
});

const TimingSchema = z.object({
  start: z.number().min(0).optional(),
  end: z.number().min(0).optional(),
  rate: z.number().min(0.25).max(4).optional(),
  keyframes: z.array(KeyframeSchema).max(60).optional(),
});

const ObjectV3Schema = z.object({
  id: z.string().min(1),
  kind: z.string().superRefine((k, ctx) => {
    if ((RESERVED_KINDS as readonly string[]).includes(k)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `KIND_RESERVED:${k}` });
    } else if (!(ACTIVE_KINDS as readonly string[]).includes(k)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `KIND_UNKNOWN:${k}` });
    }
  }),
  anchor: AnchorSchema,
  plane: z.enum(['bg', 'content', 'fg']),
  z: z.number().int(),
  transform: z.object({
    scale: z.number().positive(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
  }),
  timing: TimingSchema.optional(),
  locale: z.string().min(2).max(8).optional(),
  // Le payload reste par-kind et OUVERT (les 18 styles de texte, bornes audio,
  // etc. voyagent tels quels) — la strictesse porte sur la STRUCTURE, le
  // payload est validé par kind côté clients qui le produisent.
  payload: z.record(z.string(), z.unknown()),
});

const BackgroundSoundSchema = z.object({
  source: z.discriminatedUnion('t', [
    z.object({ t: z.literal('original') }),
    z.object({ t: z.literal('library'), soundId: z.string().min(1) }),
  ]),
  volume: z.number().min(0).max(1).default(1),
  bounds: z.object({ start: z.number().min(0), end: z.number().min(0) }).optional(),
});

const SceneV3Schema = z.object({
  id: z.string().min(1),
  objects: z.array(ObjectV3Schema).max(60),
  opening: z.record(z.string(), z.unknown()).optional(),
  closing: z.record(z.string(), z.unknown()).optional(),
  clipTransitions: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
  timelineDuration: z.number().positive().optional(),
});

export const CanvasV3Schema = z.object({
  v: z.literal(3),
  scenes: z.array(SceneV3Schema).min(1).max(10),
  sound: BackgroundSoundSchema.optional(),
});

export type CanvasV3 = z.infer<typeof CanvasV3Schema>;
export type SceneV3 = z.infer<typeof SceneV3Schema>;
export type ObjectV3 = z.infer<typeof ObjectV3Schema>;
export type BackgroundSoundV3 = z.infer<typeof BackgroundSoundSchema>;
export type KeyframeV3 = z.infer<typeof KeyframeSchema>;
```

Ajouter l'export dans `packages/shared/schemas/index.ts` en suivant la forme des exports voisins du fichier.

- [ ] **Step 4: Vert**

Run: `cd packages/shared && bun run build && cd ../../services/gateway && npx jest --runTestsByPath src/__tests__/unit/services/posts/canvasV3.schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/schemas/canvas-v3.ts packages/shared/schemas/index.ts services/gateway/src/__tests__/unit/services/posts/canvasV3.schema.test.ts
git commit -m "feat(shared): CanvasV3 - le schema strict du fil, kinds reserves refuses avec message dedie"
```

---

### Task A2: Fixtures gelées `packages/shared/fixtures/canvas-v3/`

**Files:**
- Create: `packages/shared/fixtures/canvas-v3/{minimal-text,story-3-slides,reel-16x9-bands,post-carousel-sound-library,post-sound-original,v1-legacy-full}.json`
- Test: `services/gateway/src/__tests__/unit/services/posts/canvasV3.fixtures.test.ts`

**Interfaces:**
- Produces: le GEL inter-lots (§C4). Toute évolution ultérieure = commit dédié qui touche les six lots.

- [ ] **Step 1: Test rouge — toutes les fixtures v3 parsent, la v1 est rejetée**

```typescript
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema } from '@meeshy/shared/schemas/canvas-v3';

const DIR = join(__dirname, '../../../../../../packages/shared/fixtures/canvas-v3');

describe('canvas-v3 fixtures (le gel inter-lots)', () => {
  it('every v3 fixture parses strictly', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('v1-') && !f.endsWith('.v3.json'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const raw = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
      const res = CanvasV3Schema.safeParse(raw);
      expect(res.success ? true : { f, issues: res.error.issues }).toBe(true);
    }
  });

  it('the v1 legacy fixture does NOT parse as v3 (it feeds the converter)', () => {
    const raw = JSON.parse(readFileSync(join(DIR, 'v1-legacy-full.json'), 'utf8'));
    expect(CanvasV3Schema.safeParse(raw).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rouge** — dossier absent. `npx jest --runTestsByPath .../canvasV3.fixtures.test.ts` → FAIL.

- [ ] **Step 3: Écrire les six fixtures**

`minimal-text.json` :
```json
{ "v": 3, "scenes": [ { "id": "s1", "objects": [
  { "id": "t1", "kind": "text", "anchor": { "t": "free", "x": 0.5, "y": 0.42 },
    "plane": "fg", "z": 0, "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
    "locale": "fr", "payload": { "text": "Bonjour", "textStyle": "neon", "textColor": "#FFFFFF" } }
] } ] }
```

`reel-16x9-bands.json` :
```json
{ "v": 3, "sound": { "source": { "t": "original" }, "volume": 1 }, "scenes": [ { "id": "s1",
  "timelineDuration": 12.0, "objects": [
  { "id": "m1", "kind": "media", "anchor": { "t": "free", "x": 0.5, "y": 0.5 },
    "plane": "content", "z": 0, "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
    "payload": { "mediaId": "64b000000000000000000001", "muted": false } },
  { "id": "t1", "kind": "text", "anchor": { "t": "band", "edge": "top" },
    "plane": "fg", "z": 1, "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
    "timing": { "start": 0.5, "end": 4.0 },
    "payload": { "text": "Le titre", "textStyle": "poster" } },
  { "id": "t2", "kind": "text", "anchor": { "t": "band", "edge": "bottom" },
    "plane": "fg", "z": 1, "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
    "payload": { "text": "legende du film", "textStyle": "classic" } }
] } ] }
```

`story-3-slides.json` : 3 scènes — s1 texte `italic` + sticker emoji `{ "emoji": "🔥" }` (kind `sticker`, plane fg, keyframes `[{"time":0,"scale":0.8},{"time":1,"scale":1.2,"easing":"easeOut"}]` dans `timing`), s2 avec `opening": { "type": "fade" }` + `place` (`payload: { "name": "Douala", "precision": "city" }`), s3 texte `brush` ancré bande basse. Écrire le JSON complet en suivant exactement la forme des deux fixtures ci-dessus (mêmes clés, mêmes types).

`post-carousel-sound-library.json` : 2 scènes carrousel (chacune un `media` porteur `plane: content`) + racine `"sound": { "source": { "t": "library", "soundId": "snd_nuits_ete" }, "volume": 0.6, "bounds": { "start": 2, "end": 17 } }`.

`post-sound-original.json` : 1 scène média + `"sound": { "source": { "t": "original" }, "volume": 1 }`.

`v1-legacy-full.json` — l'entrée du convertisseur, un blob v1 RÉALISTE :
```json
{
  "background": "color:#1E1B4B",
  "backgroundTransform": { "scale": 1.1, "offsetX": 0.02, "offsetY": 0, "rotation": 0 },
  "canvasAspectRatio": 1.7777,
  "slideDuration": 7,
  "timelineDuration": 9.5,
  "opening": { "type": "fade" },
  "closing": { "type": "slideUp" },
  "clipTransitions": [ { "afterClipId": "c1", "type": "crossfade", "duration": 0.4 } ],
  "musicTrackId": "legacy-track-9",
  "backgroundAudioId": "snd_nuits_ete",
  "backgroundAudioVolume": 0.6,
  "backgroundAudioStart": 2,
  "backgroundAudioEnd": 17,
  "textObjects": [ { "id": "t1", "text": "Salut", "textStyle": "retro", "x": 0.5, "y": 0.2,
    "scale": 1.2, "rotation": 5, "zIndex": 3, "startTime": 1,
    "keyframes": [ { "time": 1, "opacity": 0 }, { "time": 2, "opacity": 1 } ] } ],
  "stickerObjects": [ { "id": "st1", "emoji": "🔥", "x": 0.8, "y": 0.7, "scale": 1, "rotation": 0, "zIndex": 4 } ],
  "locationObjects": [ { "id": "L1", "name": "Douala", "x": 0.3, "y": 0.85, "scale": 1, "rotation": 0, "zIndex": 5, "precision": "city" } ],
  "audioPlayerObjects": [ { "id": "a1", "attachmentId": "64b0000000000000000000aa", "x": 0.5, "y": 0.6, "zIndex": 6, "startTime": 0 } ],
  "futureThing": { "unknown": true }
}
```

- [ ] **Step 4: Vert** — relancer le test fixtures. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/fixtures/canvas-v3 services/gateway/src/__tests__/unit/services/posts/canvasV3.fixtures.test.ts
git commit -m "feat(shared): fixtures canvas-v3 - le gel inter-lots, six documents + l'entree v1 du convertisseur"
```

---

### Task A3: Convertisseur v1→v3 (gateway) + golden

**Files:**
- Create: `services/gateway/src/services/posts/storyEffectsV3.ts`
- Create (généré puis GELÉ): `packages/shared/fixtures/canvas-v3/v1-legacy-full.v3.json`
- Test: `services/gateway/src/services/posts/__tests__/storyEffectsV3.test.ts`

**Interfaces:**
- Produces: `isCanvasV3(blob: unknown): boolean` · `convertV1ToV3(blob: Record<string, unknown>): CanvasV3` · `convertStoryEffectsForWire(effects: unknown): unknown` (v3 → tel quel ; v1 → converti ; null/undefined → tel quel).
- Consumed by: A4 (lecture), lot B (miroir Swift — mêmes règles, golden partagé).

- [ ] **Step 1: Test rouge — la table de conversion §C2, assertion par assertion**

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema } from '@meeshy/shared/schemas/canvas-v3';
import { isCanvasV3, convertV1ToV3, convertStoryEffectsForWire } from '../storyEffectsV3';

const DIR = join(__dirname, '../../../../../packages/shared/fixtures/canvas-v3');
const v1 = () => JSON.parse(readFileSync(join(DIR, 'v1-legacy-full.json'), 'utf8'));

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
    const kinds = objs.map(o => `${o.kind}/${o.plane}`).sort();
    // fond couleur → media/bg ; texte → text/fg ; sticker → sticker/fg ;
    // lieu → place/fg ; chip audio → audio/content
    expect(kinds).toEqual(['audio/content', 'media/bg', 'place/fg', 'sticker/fg', 'text/fg'].sort());
  });

  it('text position/timing/keyframes survive (anchor free, timing kept)', () => {
    const t = convertV1ToV3(v1()).scenes[0].objects.find(o => o.kind === 'text');
    expect(t?.anchor).toEqual({ t: 'free', x: 0.5, y: 0.2 });
    expect(t?.timing?.start).toBe(1);
    expect(t?.timing?.keyframes).toHaveLength(2);
  });

  it('background sound resolves PROVENANCE library from backgroundAudioId (musicTrackId deprecated ignored)', () => {
    const out = convertV1ToV3(v1());
    expect(out.sound).toEqual({
      source: { t: 'library', soundId: 'snd_nuits_ete' },
      volume: 0.6, bounds: { start: 2, end: 17 },
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

  it('wire helper: v3 passes through UNTOUCHED, v1 converts, nullish passes', () => {
    const v3doc = { v: 3, scenes: [{ id: 's1', objects: [] }] };
    expect(convertStoryEffectsForWire(v3doc)).toBe(v3doc);
    expect(isCanvasV3(convertStoryEffectsForWire(v1()))).toBe(true);
    expect(convertStoryEffectsForWire(null)).toBeNull();
  });

  it('GOLDEN: output equals the frozen v1-legacy-full.v3.json byte-shape', () => {
    const golden = JSON.parse(readFileSync(join(DIR, 'v1-legacy-full.v3.json'), 'utf8'));
    expect(convertV1ToV3(v1())).toEqual(golden);
  });
});
```

- [ ] **Step 2: Rouge** — module absent. Expected: FAIL.

- [ ] **Step 3: Implémenter le convertisseur** — mapping intégral :

```typescript
// services/gateway/src/services/posts/storyEffectsV3.ts
import type { CanvasV3, ObjectV3 } from '@meeshy/shared/schemas/canvas-v3';

export function isCanvasV3(blob: unknown): blob is CanvasV3 {
  return typeof blob === 'object' && blob !== null && (blob as { v?: unknown }).v === 3;
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

function baseObject(o: Record<string, unknown>, kind: ObjectV3['kind'], plane: ObjectV3['plane'], fallbackZ: number): ObjectV3 {
  const timing: NonNullable<ObjectV3['timing']> = {};
  if (typeof o.startTime === 'number') timing.start = o.startTime as number;
  if (typeof o.endTime === 'number') timing.end = o.endTime as number;
  if (Array.isArray(o.keyframes)) timing.keyframes = o.keyframes as NonNullable<ObjectV3['timing']>['keyframes'];
  return {
    id: str(o.id) ?? `${kind}-${fallbackZ}`,
    kind,
    anchor: { t: 'free', x: num(o.x, 0.5), y: num(o.y, 0.5) },
    plane,
    z: typeof o.zIndex === 'number' ? (o.zIndex as number) : fallbackZ,
    transform: { scale: num(o.scale, 1), rotation: num(o.rotation, 0), opacity: num(o.opacity, 1) },
    ...(Object.keys(timing).length ? { timing } : {}),
    ...(str(o.language) ? { locale: str(o.language) } : {}),
    payload: {},
  };
}

export function convertV1ToV3(blob: Record<string, unknown>): CanvasV3 {
  const objects: ObjectV3[] = [];
  let z = 0;

  // Fond (couleur/dégradé/média) → media/bg. `canvasAspectRatio` disparaît (S8).
  if (str(blob.background)) {
    objects.push({
      ...baseObject({ id: 'bg' }, 'media', 'bg', z++),
      payload: { background: blob.background, transform: blob.backgroundTransform ?? null },
    });
  }
  for (const t of asArray(blob.textObjects)) {
    const o = baseObject(t, 'text', 'fg', z++);
    const { id: _i, x: _x, y: _y, scale: _s, rotation: _r, zIndex: _z, startTime: _st, endTime: _e, keyframes: _k, language: _l, ...rest } = t;
    o.payload = rest as ObjectV3['payload']; // styles (18), couleur, fond, align… tels quels
    objects.push(o);
  }
  for (const st of asArray(blob.stickerObjects)) {
    const o = baseObject(st, 'sticker', 'fg', z++);
    o.payload = { emoji: st.emoji };
    objects.push(o);
  }
  for (const L of asArray(blob.locationObjects)) {
    const o = baseObject(L, 'place', 'fg', z++);
    o.payload = { name: L.name, precision: L.precision ?? null, place: L.place ?? null };
    objects.push(o);
  }
  for (const a of asArray(blob.audioPlayerObjects)) {
    const o = baseObject(a, 'audio', 'content', z++);
    o.payload = { attachmentId: a.attachmentId ?? null };
    objects.push(o);
  }

  const scene: CanvasV3['scenes'][number] = { id: 's1', objects };
  if (typeof blob.timelineDuration === 'number') scene.timelineDuration = blob.timelineDuration as number;
  if (blob.opening && typeof blob.opening === 'object') scene.opening = blob.opening as Record<string, unknown>;
  if (blob.closing && typeof blob.closing === 'object') scene.closing = blob.closing as Record<string, unknown>;
  if (Array.isArray(blob.clipTransitions)) scene.clipTransitions = blob.clipTransitions as Record<string, unknown>[];
  // `slideDuration` (legacy) et `musicTrackId` (déprécié) : IGNORÉS — la règle
  // d'autorité et la dépréciation sont documentées au modèle Swift.

  const doc: CanvasV3 = { v: 3, scenes: [scene] };
  const soundId = str(blob.backgroundAudioId);
  const own = str(blob.voiceAttachmentId);
  if (soundId || own) {
    doc.sound = {
      source: soundId ? { t: 'library', soundId } : { t: 'original' },
      volume: num(blob.backgroundAudioVolume, 1),
      ...(typeof blob.backgroundAudioStart === 'number' || typeof blob.backgroundAudioEnd === 'number'
        ? { bounds: { start: num(blob.backgroundAudioStart, 0), end: num(blob.backgroundAudioEnd, 0) } }
        : {}),
    };
  }
  return doc;
}

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

export function convertStoryEffectsForWire(effects: unknown): unknown {
  if (effects == null) return effects;
  if (isCanvasV3(effects)) return effects;
  if (typeof effects !== 'object') return effects;
  try {
    return convertV1ToV3(effects as Record<string, unknown>);
  } catch {
    // Tolérance : un blob illisible reste servi tel quel plutôt que de faire
    // tomber la lecture — le client rendra dégradé.
    return effects;
  }
}
```

- [ ] **Step 4: Générer PUIS geler le golden** — lancer les tests SANS le test GOLDEN (le commenter), écrire la sortie :
`node -e "const {convertV1ToV3}=require('./dist-ou-ts-node…')"` — en pratique : ajouter temporairement dans le test un `writeFileSync` du résultat, l'exécuter UNE fois, retirer l'écriture, décommenter le GOLDEN. Relire le fichier généré À LA MAIN (chaque mapping de la table §C2 doit s'y voir), puis le committer — c'est le gel.

- [ ] **Step 5: Vert complet** — la suite entière du fichier passe, GOLDEN compris.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/posts/storyEffectsV3.ts services/gateway/src/services/posts/__tests__/storyEffectsV3.test.ts packages/shared/fixtures/canvas-v3/v1-legacy-full.v3.json
git commit -m "feat(gateway): convertisseur v1 vers v3 a la lecture - tolerant, golden gele, une seule forme sur le fil"
```

---

### Task A4: Branchement lecture — le point d'étranglement `withMentions`

**Files:**
- Modify: `services/gateway/src/services/posts/postReferences.ts` (fonction `withMentions`, ligne ~145)
- Test: `services/gateway/src/__tests__/unit/routes/posts/storyEffectsWire.test.ts`

**Interfaces:**
- Consumes: `convertStoryEffectsForWire` (A3).
- Garantit: TOUT post sérialisé (détail, feeds, stories, repost imbriqué via `withNestedRepostMentions`) sort en v3 — parce que `withMentions` est déjà appliqué partout (chantier références, vérifié).

- [ ] **Step 1: Test rouge de route** — seed un post STORY dont `storyEffects` est le blob v1 fixture ; `GET /posts/:id` doit renvoyer `storyEffects.v === 3` et `sound.source.t === 'library'` ; un post v3 ressort inchangé (`toEqual` sur le blob). Suivre la forme des tests de `postReferenceExposedKey.test.ts` (même harnais de routes).
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Intégrer** — dans `withMentions`, après l'aplatissement des mentions :

```typescript
if ('storyEffects' in out && out.storyEffects != null) {
  out.storyEffects = convertStoryEffectsForWire(out.storyEffects);
}
```

et l'équivalent sur `repostOf.storyEffects` dans `withNestedRepostMentions` (le repost d'une story porte un blob).
- [ ] **Step 4: Vert** — le test de route + `npx jest --runTestsByPath` des suites voisines (`postReferenceExposedKey`, `postIncludes`).
- [ ] **Step 5: Commit** (chemins explicites).

---

### Task A5: Écriture stricte + `426 UPGRADE_REQUIRED`

**Files:**
- Modify: `services/gateway/src/utils/response.ts` (ajout `sendUpgradeRequired`)
- Modify: `services/gateway/src/routes/posts/core.ts` (création + édition : garde storyEffects)
- Test: `services/gateway/src/__tests__/unit/routes/posts/storyEffectsUpgradeGate.test.ts`

**Interfaces:**
- Produces: contrat d'erreur `{ success:false, error:{ code:'UPGRADE_REQUIRED', message, minVersion, storeUrl } }`, statut 426 — consommé par lots C (porte bloquante) et F.

- [ ] **Step 1: Tests rouges** — trois cas sur `POST /posts` : (1) `storyEffects` v1-shaped ⇒ 426 code `UPGRADE_REQUIRED` ; (2) `storyEffects` avec `v:3` mais invalide (kind réservé `interactive`) ⇒ 400 avec `KIND_RESERVED` dans le détail ; (3) v3 valide (fixture minimal-text) ⇒ 201 et le blob STOCKÉ tel quel (relire via GET). Même harnais que A4.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — `sendUpgradeRequired(reply, message, { minVersion, storeUrl })` calqué sur `sendConflict` (response.ts:142) avec statusCode 426 ; dans `core.ts`, au point où `storyEffects` est lu du body :

```typescript
if (storyEffects != null) {
  if (!isCanvasV3(storyEffects)) {
    return sendUpgradeRequired(reply, 'Story format outdated — update the app', {
      minVersion: MIN_APP_VERSION, storeUrl: APP_STORE_URL,
    });
  }
  const parsed = CanvasV3Schema.safeParse(storyEffects);
  if (!parsed.success) {
    return sendBadRequest(reply, 'Invalid canvas', { code: 'CANVAS_INVALID', issues: parsed.error.issues.slice(0, 5) });
  }
}
```
(mêmes gardes sur `PUT /posts/:id` — l'édition d'une story passe par là.)
- [ ] **Step 4: Vert + suites du fichier core.**
- [ ] **Step 5: Commit.**

---

### Task A6: Version plancher `X-App-Version` + route publique

**Files:**
- Modify: `services/gateway/src/env.ts` (MIN_APP_VERSION, APP_STORE_URL — défauts inertes : plancher vide = porte désarmée)
- Create: `services/gateway/src/utils/appVersion.ts` (compare semver simple, sans dépendance)
- Modify: `services/gateway/src/routes/posts/core.ts` (garde version sur création quand `storyEffects` présent OU `type === 'STORY'`)
- Create: route `GET /app/min-version` (fichier route léger, enregistré comme ses voisins dans `route-registration.ts`)
- Test: `services/gateway/src/__tests__/unit/routes/appVersionGate.test.ts`

**Interfaces:**
- Produces: header `X-App-Version` (convention : `CFBundleShortVersionString`, ex. `1.0.5`), route bootstrap `{ minVersion }` — consommés par lot C (APIClient + porte) et documentés pour F.

- [ ] **Step 1: Tests rouges** — `compareAppVersions('1.0.5','1.2.0') < 0` ; plancher désarmé (env vide) ⇒ création sans header passe ; plancher `1.2.0` ⇒ sans header 426, avec `1.1.9` 426, avec `1.2.0` 201 ; `GET /app/min-version` renvoie le plancher.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** :

```typescript
// utils/appVersion.ts
export function compareAppVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
export function isBelowFloor(header: string | undefined, floor: string): boolean {
  if (!floor) return false;               // porte désarmée
  if (!header) return true;               // un vieux client n'envoie PAS le header
  return compareAppVersions(header, floor) < 0;
}
```
Garde dans `core.ts` AVANT la garde de format (A5) ; route min-version en `sendSuccess`.
- [ ] **Step 4: Vert.**
- [ ] **Step 5: Commit.**

---

### Task A7: Claim des stickers posés (O8)

**Files:**
- Modify: `services/gateway/src/routes/posts/core.ts` (validation croisée)
- Test: `services/gateway/src/__tests__/unit/routes/posts/canvasStickerClaim.test.ts`

- [ ] **Step 1: Test rouge** — un v3 dont un objet `sticker` a `payload.mediaId` ABSENT de `body.mediaIds` ⇒ 400 `MEDIA_NOT_CLAIMED` ; présent ⇒ 201.
- [ ] **Step 2: Rouge.** 
- [ ] **Step 3: Implémenter** — après le parse v3 : collecter `scenes[].objects[]` où `kind==='sticker'||kind==='media'` et `typeof payload.mediaId==='string'` ; exiger l'inclusion dans `mediaIds` (le claim existant fait le reste — ne PAS dupliquer la logique de claim).
- [ ] **Step 4: Vert.** — **Step 5: Commit.**

---

### Task A8: Gate final du lot

- [ ] `cd packages/shared && bun run build` — 0 erreur.
- [ ] `cd services/gateway && npx tsc --noEmit` — 0 erreur.
- [ ] `bun run test:coverage` — toutes suites vertes, seuils tenus.
- [ ] Commit final éventuel (retouches), puis le lot est mergeable — PREMIER de l'ordre de merge.
