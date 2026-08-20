# Lot A — Contrat v3 & rupture propre — Implementation Plan (rév. 2 après revue Fable)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le fil passe CanvasV3 strict : schéma Zod + fixtures gelées, convertisseur v1→v3 à la lecture (permanent), création refusée en `426 UPGRADE_REQUIRED` pour les vieux blobs et les binaires sous plancher, claim des stickers posés.

**Architecture:** Le schéma vit dans `packages/shared/types/canvas-v3.ts` — **types/, pas un dossier neuf** : c'est le seul emplacement inclus au build (`tsconfig.json:45`), exporté (`package.json` → `"./types/*"`) et mappé par le gateway (`tsconfig:28` → `dist/*`). Un dossier `schemas/` neuf aurait donné des tests jest verts et un gateway qui ne démarre pas (jest mappe les SOURCES, prod mappe `dist/`) — le piège crashloop documenté du package. Lecture : UN point d'étranglement, `withMentions` (`postReferences.ts:145`). Écriture : les gardes de `core.ts` (création `:187`, édition `:380`).

**Tech Stack:** TypeScript strict, Zod, Fastify 5, Jest (bun local), Prisma/Mongo.

**Spec:** `docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` (§C intégral — amendé rév. 2 : règle 426-vs-400, plancher par en-tête PRÉSENT, golden gelé fin A3).

## Global Constraints

- Plancher produit **iOS 16** ; **le web est EXEMPT du plancher de version** (spec R6) — la règle d'en-tête est conçue pour ça (A6).
- Gates : `cd packages/shared && bun run build` → `cd services/gateway && npx tsc --noEmit` → `bun run test:coverage`.
- Commits par chemins EXPLICITES ; TS strict, zéro `any` ; pas de `schema.response` Fastify sur les routes touchées.
- Forme d'erreur du dépôt (`response.ts:83-89`) : `error` est une CHAÎNE, `code` et les détails vivent À LA RACINE (étalés depuis `options.details`) — jamais d'objet `error` niché.
- Le convertisseur est TOLÉRANT : champ inconnu ignoré + log compté, jamais d'échec.
- **Ordre interne impératif** : A5 crée `utils/appVersion.ts` (constantes) AVANT de s'en servir ; A6 le complète. Le golden de A3 clôt le gel — **le lot B (B2) ne démarre qu'après le commit de A3.**

---

### Task A1: Schéma Zod `CanvasV3` dans `types/` (kinds réservés refusés)

**Files:**
- Create: `packages/shared/types/canvas-v3.ts`
- Test: `services/gateway/src/__tests__/unit/services/posts/canvasV3.schema.test.ts`

**Interfaces:**
- Produces (GELÉ) : `CanvasV3Schema`, types `CanvasV3`, `SceneV3`, `ObjectV3`, `BackgroundSoundV3`, `KeyframeV3`, `RESERVED_KINDS`. Import partout : `@meeshy/shared/types/canvas-v3`.
- Aucune modification de config n'est nécessaire NI permise (tsconfig/package.json/exports restent intacts — c'est le critère du bon emplacement).

- [ ] **Step 1: Écrire le test rouge**

```typescript
import { CanvasV3Schema, RESERVED_KINDS } from '@meeshy/shared/types/canvas-v3';

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
    expect(CanvasV3Schema.parse(minimal).scenes[0].objects[0].timing).toBeUndefined();
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
    if (!res.success) expect(JSON.stringify(res.error.issues)).toContain('KIND_RESERVED');
  });

  it('background sound carries its PROVENANCE (original vs library)', () => {
    const doc = structuredClone(minimal) as Record<string, unknown>;
    doc.sound = { source: { t: 'library', soundId: 'snd1' }, volume: 0.6, bounds: { start: 2, end: 17 } };
    expect(CanvasV3Schema.parse(doc).sound?.source).toEqual({ t: 'library', soundId: 'snd1' });
  });
});
```

- [ ] **Step 2: Rouge** — `npx jest --runTestsByPath src/__tests__/unit/services/posts/canvasV3.schema.test.ts` → FAIL (module absent).

- [ ] **Step 3: Implémenter** `packages/shared/types/canvas-v3.ts` — contenu IDENTIQUE au schéma ci-dessous (c'est le contrat §C1) :

```typescript
import { z } from 'zod';

/** Kinds réservés (O1/S5/O10) — nomenclature connue, REFUSÉS en v1. */
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
  // payload permissif PAR CONTRAT — il porte notamment, pour kind:text,
  // `translations: {lang: contenu}` (Prisme par objet, spec §C1 rév. 4/C6) :
  // le convertisseur A3 et le golden en font foi, pas une contrainte Zod.
  payload: z.record(z.string(), z.unknown()),
});

const BackgroundSoundSchema = z.object({
  source: z.discriminatedUnion('t', [
    z.object({ t: z.literal('original') }),
    z.object({ t: z.literal('library'), soundId: z.string().min(1) }),
  ]),
  volume: z.number().min(0).max(1).default(1),
  bounds: z.object({ start: z.number().min(0), end: z.number().min(0) }).optional(),
  // Sous-titres voix par langue (karaoké = Prisme audio) — logement du
  // `voiceTranscriptions` racine v1 (spec §C1 rév. 4, revue totale C7).
  transcriptions: z.array(z.object({
    language: z.string().min(2).max(8),
    content: z.string(),
  })).optional(),
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

- [ ] **Step 4: Vert** — `cd packages/shared && bun run build` (dist/types/canvas-v3.js DOIT exister) puis le test jest. PASS attendu.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/types/canvas-v3.ts services/gateway/src/__tests__/unit/services/posts/canvasV3.schema.test.ts
git commit -m "feat(shared): CanvasV3 dans types/ - inclus au build, exporte, mappe ; kinds reserves refuses"
```

---

### Task A2: Fixtures gelées — le blob v1 est RÉALISTE (formes Swift vérifiées)

**Files:**
- Create: `packages/shared/fixtures/canvas-v3/{minimal-text,story-3-slides,reel-16x9-bands,post-carousel-sound-library,post-sound-original,v1-legacy-full}.json`
- Test: `services/gateway/src/__tests__/unit/services/posts/canvasV3.fixtures.test.ts`

**Interfaces:**
- Produces: le GEL inter-lots — **la fixture v1 doit décoder en `StoryEffects` Swift SANS throw** (contrainte vérifiée : `clipTransitions` est `decodeIfPresent` NON-lossy, `StoryLocationObject.place: SharedPlace` est REQUIS, `StoryAudioPlayerObject` exige `postMediaId`/`placement`/`volume`).

- [ ] **Step 1: Test rouge** — chemin compté : `__dirname` = `src/__tests__/unit/services/posts` ⇒ **7 remontées** jusqu'à la racine du dépôt :

```typescript
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

const DIR = join(__dirname, '../../../../../../../packages/shared/fixtures/canvas-v3');

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

- [ ] **Step 2: Rouge** (dossier absent).

- [ ] **Step 3: Écrire les six fixtures.** Les cinq v3 sont inchangées par rapport à la rév. 1 du plan (formes déjà validées par le schéma A1) : `minimal-text`, `reel-16x9-bands` (JSON complets dans la rév. 1 — les reprendre tels quels), `story-3-slides`, `post-carousel-sound-library`, `post-sound-original`.

`v1-legacy-full.json` — **corrigé pour décoder dans les modèles Swift réels** :

```json
{
  "background": "color:#1E1B4B",
  "backgroundTransform": { "scale": 1.1, "offsetX": 0.02, "offsetY": 0, "rotation": 0 },
  "canvasAspectRatio": 1.7777,
  "slideDuration": 7,
  "timelineDuration": 9.5,
  "opening": { "type": "fade" },
  "closing": { "type": "slideUp" },
  "clipTransitions": [
    { "id": "ct1", "fromClipId": "c1", "toClipId": "c2", "kind": "crossfade", "duration": 0.4 }
  ],
  "musicTrackId": "legacy-track-9",
  "backgroundAudioId": "snd_nuits_ete",
  "backgroundAudioVolume": 0.6,
  "backgroundAudioStart": 2,
  "backgroundAudioEnd": 17,
  "voiceTranscriptions": [
    { "language": "fr", "content": "Salut à tous" },
    { "language": "en", "content": "Hi everyone" }
  ],
  "textObjects": [ { "id": "t1", "text": "Salut", "textStyle": "retro", "x": 0.5, "y": 0.2,
    "scale": 1.2, "rotation": 5, "zIndex": 3, "startTime": 1,
    "sourceLanguage": "fr", "translations": { "en": "Hi" },
    "keyframes": [ { "time": 1, "opacity": 0 }, { "time": 2, "opacity": 1 } ] } ],
  "filter": "noir",
  "filterIntensity": 0.8,
  "stickers": ["✨"],
  "stickerObjects": [ { "id": "st1", "emoji": "🔥", "x": 0.8, "y": 0.7, "scale": 1, "rotation": 0, "zIndex": 4,
    "baseSize": 300, "anchorPoint": "center", "fadeIn": 0.3, "fadeOut": 0.5 } ],
  "locationObjects": [ { "id": "L1",
    "place": { "id": "pl1", "latitude": 4.0511, "longitude": 9.7679, "name": "Douala" },
    "x": 0.3, "y": 0.85, "scale": 1, "rotation": 0, "zIndex": 5 } ],
  "audioPlayerObjects": [ { "id": "a1", "postMediaId": "64b0000000000000000000aa",
    "placement": "canvas", "x": 0.5, "y": 0.6, "volume": 1,
    "waveformSamples": [0.2, 0.5, 0.3] } ],
  "futureThing": { "unknown": true }
}
```

(Si `SharedPlace` exige un champ de plus au décodage, le test Swift B2 le dira au premier run — corriger ALORS la fixture ET le committer comme retouche du gel, jamais le modèle.)

- [ ] **Step 4: Vert.** — [ ] **Step 5: Commit** (fixtures + test, chemins explicites).

---

### Task A3: Convertisseur v1→v3 (gateway) + golden — CLÔT LE GEL

**Files:**
- Create: `services/gateway/src/services/posts/storyEffectsV3.ts`
- Create (généré puis GELÉ): `packages/shared/fixtures/canvas-v3/v1-legacy-full.v3.json`
- Test: `services/gateway/src/services/posts/__tests__/storyEffectsV3.test.ts`

**Interfaces:**
- Produces: `isCanvasV3`, `convertV1ToV3`, `convertStoryEffectsForWire`. Le commit de cette tâche **ouvre le lot B** (B2 consomme le golden).
- Le convertisseur lit les clés v1 RÉELLES : `place` (objet SharedPlace), `postMediaId`, `mediaURL`, `placement` — pas de clés inventées.

- [ ] **Step 1: Test rouge** — chemin : `__dirname` = `src/services/posts/__tests__` ⇒ **6 remontées** :

```typescript
const DIR = join(__dirname, '../../../../../../packages/shared/fixtures/canvas-v3');
```

Mêmes cas que la rév. 1 du plan, avec DEUX assertions corrigées sur les clés réelles :

```typescript
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
    expect(t?.locale).toBe('fr');   // sourceLanguage → locale (§C2 rév. 4)
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
    const st = convertV1ToV3(v1()).scenes[0].objects.find(o => o.kind === 'sticker' && (o.payload as {emoji?:string}).emoji === '🔥');
    expect(st?.payload.baseSize).toBe(300);
    expect(st?.payload.fadeIn).toBe(0.3);
  });

  it('root filter lands on the bg media payload; root stickers become sticker objects (G3)', () => {
    const objs = convertV1ToV3(v1()).scenes[0].objects;
    const bg = objs.find(o => o.plane === 'bg');
    expect(bg?.payload.filter).toBe('noir');
    expect(bg?.payload.filterIntensity).toBe(0.8);
    expect(objs.filter(o => o.kind === 'sticker').length).toBe(2);   // st1 + '✨' racine
  });

  it('root legacy text styling synthesizes a text object ONLY when textObjects is empty (G3)', () => {
    const legacy = { textStyle: 'classic', textColor: '#FFFFFF', textPosition: 0.5 };
    expect(convertV1ToV3({ ...legacy }, { content: 'Vieux texte' }).scenes[0].objects
      .filter(o => o.kind === 'text').length).toBe(1);
    expect(convertV1ToV3(v1()).scenes[0].objects
      .filter(o => o.kind === 'text').length).toBe(1);   // t1 seul — racine IGNORÉE si textObjects
  });
```

(et l'assertion des kinds/plans reste : `['audio/content','media/bg','place/fg','sticker/fg','text/fg']`.)

- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — même code que la rév. 1 SAUF les deux mappings :

```typescript
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
  // §C2 rév. 4 : le Prisme par objet et le karaoké SURVIVENT à la conversion.
  // Dans le mapping textObjects : sourceLanguage → locale, translations →
  // payload.translations (copiées telles quelles). Au niveau document :
  // voiceTranscriptions (racine v1) → sound.transcriptions — en créant
  // `sound: { source: { t: 'original' }, volume: 1 }` si aucune piste de
  // bibliothèque n'existe mais que des transcriptions sont présentes.
```

- [ ] **Step 4: Générer PUIS geler le golden** (procédure rév. 1 : écrire une fois, relire À LA MAIN chaque mapping de la table §C2, retirer l'écriture, décommenter le test GOLDEN).
- [ ] **Step 5: Vert complet.** — [ ] **Step 6: Commit** — le message DOIT dire « ouvre le lot B ».

---

### Task A4: Branchement lecture — `withMentions` + repost imbriqué (early-return couvert)

**Files:**
- Modify: `services/gateway/src/services/posts/postReferences.ts`
- Test: `services/gateway/src/__tests__/unit/routes/posts/storyEffectsWire.test.ts`

- [ ] **Step 1: Tests rouges** — QUATRE cas, **tous requêtés avec `x-canvas-caps: 3` (rév. 7/F2 — sans caps, la table O17 sert v1 tel quel : ces tests exercent la CONVERSION, pas la négociation, qui a les siens en A4b)** : (1) drapeau ON : post STORY v1 en base ⇒ `GET /posts/:id` sert `storyEffects.v === 3` ; (2) drapeau ON : post v3 ⇒ ressort `toEqual` inchangé ; (3) drapeau ON : **repost d'une story v1 SANS références chargées** ⇒ `repostOf.storyEffects.v === 3` (chemin early-return de `withNestedRepostMentions:176`) ; (4) drapeau OFF (défaut) : le blob v1 ressort TEL QUEL — A est inerte pour l'ARCHIVE tant que F n'est pas déployé (la SENTINELLE, elle, est active dès le merge — O17/loi 11 : l'inertie ne vaut que pour les blobs v1, rév. 7/F2).
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Intégrer** — DERRIÈRE UN DRAPEAU (revue Fable n°13 : entre le
  déploiement de A et celui de F, le web ne lit que les familles legacy — servir
  v3 pendant cette fenêtre viderait les stories web ; le drapeau rend le
  lockstep VRAI) : `CANVAS_V3_READ=1` (env, défaut OFF ⇒ A merge INERTE en
  lecture ; l'activation se fait au déploiement de F). Dans `withMentions`
  (racine) ET dans `withNestedRepostMentions` **AVANT son early-return** :

```typescript
// withNestedRepostMentions — la conversion du blob précède le tri des
// mentions : le chemin « pas de références chargées » sort TÔT (ligne ~176)
// et laisserait sinon un repostOf.storyEffects v1 sur le fil.
if (nested.storyEffects != null) {
  nested.storyEffects = convertStoryEffectsForWire(nested.storyEffects);
}
```

- [ ] **Step 4: Vert** (+ suites voisines `postReferenceExposedKey`, `postIncludes`). — [ ] **Step 5: Commit.**

---

### Task A4b: Négociation de forme à la lecture + sentinelle (O17, rév. 5)

**Files:**
- Modify: `services/gateway/src/services/posts/storyEffectsV3.ts` (le helper `convertStoryEffectsForWire` gagne `readerCaps`)
- Modify: les routes qui appliquent `withMentions` (elles ont `request` en portée — y lire `x-canvas-caps` et le passer)
- Test: `services/gateway/src/services/posts/__tests__/storyEffectsV3.negotiation.test.ts`

**Interfaces:**
- Produces : `convertStoryEffectsForWire(post, { canvasCaps, readerLanguage })` — table O17 (spec §C3 rév. 7). **Point d'attache TRANCHÉ (F1)** : le helper vit dans `withMentions`/`withNestedRepostMentions` avec un paramètre lecteur OPTIONNEL (défaut = « sans caps », la forme compatible — jamais vide, au pire dégradée) ; les routes lisent `x-canvas-caps` + la langue du contexte d'auth et le THREADENT à travers les services — `PostFeedService.ts` (10 sites d'application : feed, tray stories, réels, user posts, community, bookmarks) et `PostAudioService.ts:332` s'ajoutent aux Files de cette tâche, leurs signatures publiques gagnent le paramètre. **Récursif (F4)** : la même règle s'applique à `repostOf.storyEffects` (l'early-return de `withNestedRepostMentions` compris). Table :
  v1 + sans caps ⇒ v1 tel quel (`toEqual` l'original — restitution) ; v1 + caps ≥ 3 ⇒ v3 si `CANVAS_V3_READ` armé, sinon v1 ;
  v3-natif + caps ≥ 3 ⇒ v3 ; **v3-natif + sans caps ⇒ sentinelle v1** : `{ background: '1E1B4B', textObjects: [{ id, text: <invite localisée>, textStyle: 'classic', x: 0.5, y: 0.45, … }] }` (fond en forme v1 RÉELLE — `"RRGGBB"` sans préfixe ni `#`, la grammaire que les vieux parseurs acceptent ; rév. 7) — texte via `resolveUserLanguage` du LECTEUR (le Prisme s'applique à l'invite ; catalogue de chaînes serveur, fr/en/… — repli fr) ; les posts à ATTACHMENT média porteur ne reçoivent pas de sentinelle (le média se lit tel quel — règle 5 d'O17).
- La sentinelle est GÉNÉRÉE à la lecture, jamais stockée ; elle est active dès le merge (indépendante des deux drapeaux).
- Ancrage vérifié : la langue du lecteur est DÉJÀ résolue par le middleware d'auth (`middleware/auth.ts:350` — `resolveUserLanguage(user, {deviceLocale})` ; le contexte porte `systemLanguage`) — les routes qui appliquent `withMentions` l'ont en portée, aucun aller-retour DB supplémentaire.

- [ ] **Step 1: Tests rouges** — (1) blob v1, requête sans `x-canvas-caps` ⇒ le blob ressort `toEqual` ; (2) blob v1, `x-canvas-caps: 3`, `CANVAS_V3_READ=1` ⇒ v3 golden ; (3) blob v3 (fixture minimal-text), sans caps ⇒ `storyEffects.textObjects[0].text` contient l'invite dans la langue du user de test (et JAMAIS `scenes`) ; (4) blob v3, caps 3 ⇒ v3 `toEqual` ; (5) post v3 AVEC attachment média porteur, sans caps ⇒ le média est servi, `storyEffects` = sentinelle ABSENTE (nil ou omis — pas d'invite par-dessus une vidéo) ; (6) l'invite change avec `systemLanguage` du lecteur ; (7) **repost d'une story v3-native, sans caps ⇒ `repostOf.storyEffects` = sentinelle localisée** (récursion F4) ; (8) **garde de source** : aucun appel `withMentions(` sans paramètre lecteur dans `PostFeedService.ts`/`PostAudioService.ts` (le trou F1 ne peut pas se rouvrir) ; (9) **feed de bout en bout** : `getStories` (le tray), blob v3-natif, lecteur sans caps ⇒ sentinelle — lecteur caps 3 ⇒ v3.
- [ ] **Step 2: Rouge. Step 3: Implémenter** — la décision est une fonction PURE `resolveWireForm(blob, caps, readArmed)` testée à sec, le texte vient d'une table de chaînes locale au service. **Step 4: Vert. Step 5: Commit.**

---

### Task A5: Écriture stricte — 426 pour le PASSÉ, 400 pour le CASSÉ, le tout SOUS DRAPEAU (O15)

**Files:**
- Create: `services/gateway/src/utils/appVersion.ts` (constantes + comparateur — créées ICI car A5 les consomme)
- Modify: `services/gateway/src/utils/response.ts` (ajout `sendUpgradeRequired`)
- Modify: `services/gateway/src/routes/posts/core.ts` (création `:187` ET édition `:380`)
- Test: `services/gateway/src/__tests__/unit/routes/posts/storyEffectsUpgradeGate.test.ts`

**Interfaces:**
- Produces — contrat d'erreur **À LA RACINE**, forme réelle de `sendError` (`response.ts:83-89`) :
  `{ success:false, error:'…', message:'…', code:'UPGRADE_REQUIRED', minVersion:'…', storeUrl:'…' }` (426)
  — `storeUrl` résolu par l'en-tête `X-App-Platform` (`ios` → App Store,
  `android` → Play Store ; absent ⇒ Apple par défaut — rév. 4 G1 : Android est
  un client v1 complet, un lien Apple sur son 426 serait absurde)
  et `{ success:false, error:'…', code:'CANVAS_INVALID', issues:[…] }` (400, via `options.details = { issues }`).
  C'est CE contrat que les lots C et F lisent — spec §C3 amendée en conformité.
- Règle (spec §C3 rév. 2) : blob **sans `v:3`** ⇒ 426 (client du passé) ; blob **avec `v:3` invalide** ⇒ 400 (client neuf cassé — l'inviter à « se mettre à jour » serait un mensonge).
- **Règle rév. 4 (revue totale C5) : TOUTE la validation stricte vit derrière
  `CANVAS_V3_WRITE_STRICT` (env, défaut OFF)** — au merge de A, AUCUN écrivain
  n'émet v3 (100 % du parc iOS, `StoryComposer.tsx:252` web, Android) : un 426
  inconditionnel serait une panne totale de création de story au jour J.
  Drapeau OFF ⇒ le blob v1 passe TEL QUEL (comportement actuel intact) ;
  l'armement est un acte de déploiement, postérieur aux trois écrivains v3
  (iOS lot C large, web F5b, Android). Symétrique exact de `CANVAS_V3_READ`.

- [ ] **Step 1: Tests rouges** — les cas (1)-(4) s'exécutent DRAPEAU ARMÉ (`CANVAS_V3_WRITE_STRICT=1` posé/reset par test, même pattern que CANVAS_V3_READ en A4) : (1) v1-shaped ⇒ 426, `body.code === 'UPGRADE_REQUIRED'`, `body.minVersion` présent À LA RACINE ; (2) `v:3` + kind réservé ⇒ 400, `body.code === 'CANVAS_INVALID'`, `body.issues` contient `KIND_RESERVED` ; (3) v3 valide (fixture minimal-text) ⇒ 201 puis GET rend le blob `toEqual` ; (4) mêmes gardes sur `PUT /posts/:id` ; **(5) drapeau OFF (défaut) : le blob v1-shaped de (1) ⇒ 201 — le merge est INERTE à l'écriture.**
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** :

```typescript
// utils/appVersion.ts — process.env lu inline, le pattern du dépôt
// (env.ts est un pur loader dotenv en side-effect : rien à y modifier).
export function getAppVersionFloor(): string { return process.env.MIN_APP_VERSION ?? ''; }
export function getAppStoreUrl(): string {
  return process.env.APP_STORE_URL ?? 'https://apps.apple.com/app/meeshy';
}
export function compareAppVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d !== 0) return d; }
  return 0;
}

// response.ts — calqué sur sendConflict, PLUS les détails racine :
export function sendUpgradeRequired(
  reply: FastifyReply,
  error: string,
  options?: { message?: string; details?: Record<string, unknown> }
): void {
  sendError(reply, 426, error, { code: 'UPGRADE_REQUIRED', ...options });
}

// core.ts — au point de lecture du body (création :187, édition :380) :
if (storyEffects != null) {
  if (!isCanvasV3(storyEffects)) {
    return sendUpgradeRequired(reply, 'Story format outdated - update the app', {
      details: { minVersion: getAppVersionFloor(), storeUrl: getAppStoreUrl() },
    });
  }
  const parsed = CanvasV3Schema.safeParse(storyEffects);
  if (!parsed.success) {
    return sendBadRequest(reply, 'Invalid canvas', {
      code: 'CANVAS_INVALID',
      details: { issues: parsed.error.issues.slice(0, 5) },
    });
  }
}
```

- [ ] **Step 4: Vert.** — [ ] **Step 5: Commit.**

---

### Task A6: Plancher `X-App-Version` — **présence sous plancher = 426 ; ABSENCE = passe**

**Files:**
- Modify: `services/gateway/src/utils/appVersion.ts` (ajout `isBelowFloor`)
- Modify: `services/gateway/src/routes/posts/core.ts` (garde AVANT celle d'A5, création à scène uniquement)
- Create: route `GET /app/min-version` (enregistrée dans `src/route-registration.ts` comme ses voisines)
- Test: `services/gateway/src/__tests__/unit/routes/appVersionGate.test.ts`

**Interfaces & règle (spec §C3 rév. 2, R6 respectée):**
- Le web n'envoie pas `X-App-Version` et n'en enverra pas — **l'absence d'en-tête PASSE**. Les vieux binaires iOS sont attrapés par le FORMAT (426 d'A5 sur leur blob v1), pas par l'en-tête. La porte d'en-tête sert aux ruptures FUTURES : un binaire qui s'annonce (`X-App-Version` présent) sous un plancher armé ⇒ 426.

- [ ] **Step 1: Tests rouges** — `compareAppVersions('1.0.5','1.2.0') < 0` ; plancher désarmé (env vide) ⇒ tout passe ; plancher `1.2.0` : **sans en-tête ⇒ 201** (web exempt), `1.1.9` ⇒ 426, `1.2.0` ⇒ 201 ; `GET /app/min-version` ⇒ `{ minVersion }`.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** :

```typescript
export function isBelowFloor(header: string | undefined, floor: string): boolean {
  if (!floor) return false;      // porte désarmée par défaut
  if (!header) return false;     // ABSENCE = web ou binaire d'avant l'en-tête :
                                 // le FORMAT (A5) juge, jamais l'en-tête absent (R6)
  return compareAppVersions(header, floor) < 0;
}
```

Garde dans `core.ts` (création avec `storyEffects` présent OU `type === 'STORY'`), AVANT la garde de format. Route min-version en `sendSuccess`.
- [ ] **Step 4: Vert.** — [ ] **Step 5: Commit.**

---

### Task A7: Claim des stickers posés (O8) — inchangé (rév. 1)

Un objet `sticker`/`media` du canvas dont `payload.mediaId`/`payload.postMediaId` est une chaîne DOIT appartenir à `body.mediaIds` ⇒ sinon 400 `MEDIA_NOT_CLAIMED`. Le claim lui-même reste `claimableMediaWhere` — jamais dupliqué. Test rouge → implémentation → vert → commit.

---

### Task A7b: Le pipeline de traduction des objets texte parle v3 (revue totale C6)

**Files:**
- Modify: `services/gateway/src/services/posts/StoryTextObjectTranslationService.ts` (persistance `:98` : `storyEffects.textObjects.$i.translations.$lang` — chemin v1 MORT dans un document v3 ; trigger et broadcast alentour)
- Test: `services/gateway/src/__tests__/unit/services/posts/storyTextObjectTranslationV3.test.ts`

**Interfaces:**
- Consomme : `isCanvasV3` (A3), `CANVAS_V3_WRITE_STRICT` (A5).
- Règle : sur un document `v:3`, la traduction d'un objet texte persiste dans
  `storyEffects.scenes.$s.objects.$o.payload.translations.$lang` (l'objet ciblé
  par id, jamais par index aveugle) ; sur un blob v1 (drapeau OFF, archive), le
  chemin actuel reste inchangé. Le broadcast conserve sa forme.

- [ ] **Step 1: Tests rouges** — (1) post v3 en base + traduction reçue ⇒ le `$set` Mongo vise `scenes.0.objects.<idx>.payload.translations.en` (l'index résolu par id d'objet) ; (2) post v1 ⇒ le `$set` actuel `textObjects.<i>.translations.en` inchangé (non-régression) ; (3) le trigger se déclenche pour un doc v3 dont un objet text a du contenu (aujourd'hui il lit `effects.textObjects` — vérifié `PostService.ts:381-394`) ; (4) l'index de recherche composé (`composeStoryContent`) intègre les textes v3.
- [ ] **Step 2: Rouge. Step 3: Implémenter** — un résolveur de chemin unique `translationSetPath(blob, objectId, lang)` testé à sec, branché aux deux écritures ; le trigger énumère `textes = blob v3 ? scenes[].objects[kind=text] : textObjects`. **Step 4: Vert. Step 5: Commit.**

---

### Task A8: Gate final du lot

- [ ] `cd packages/shared && bun run build` — **vérifier que `dist/types/canvas-v3.js` existe** (le critère anti-crashloop).
- [ ] `cd services/gateway && npx tsc --noEmit` — 0 erreur.
- [ ] `bun run test:coverage` — toutes suites vertes, seuils tenus.
- [ ] `CANVAS_V3_READ` est OFF par défaut — le merge de A ne change RIEN à la
  lecture en production ; l'activation est un acte de déploiement, simultané à
  la mise en ligne du lot F (le lockstep de R6, opérationnalisé).
- [ ] Le lot merge PREMIER.

## Self-review (rév. 2)

Les 12 constats Fable touchant ce lot sont intégrés : emplacement `types/` (n°1), fixture v1 aux formes Swift réelles (n°2-3), 426-vs-400 codifié et remonté en spec (n°4), forme d'erreur racine réelle + `details.issues` (n°5), `appVersion.ts` créé en A5 avant usage (n°6), absence d'en-tête = passe / web exempt (n°7-8), chemins DIR recomptés 7/6 (n°12), env.ts non touché (n°13), portée story explicitée (n°15), early-return du nested couvert + testé (n°16), golden « clôt le gel, ouvre B » (n°17).
