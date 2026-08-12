# Fenêtre de source — Lot A (serveur) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire écrire au serveur la *vraie* part du son utilisée par une story, et lui faire enfin peupler la forme d'onde de la bibliothèque — deux données aujourd'hui fausses ou vides en production.

**Architecture:** Trois corrections indépendantes dans le pipeline de publication du gateway. (1) `extractCaptureTracks`, fonction pure exportée, cesse de ranger des coordonnées de **timeline** dans `SoundUsage.startMs`/`endMs` et y range des coordonnées de **source**. (2) Cette même fonction transporte les échantillons de forme d'onde que le client envoie déjà et que le serveur jette, et `SoundCaptureService` les grave sur le `Sound` créé. (3) `SoundUsage` gagne `windowAdjustedAt`, qui distingue une fenêtre choisie par l'auteur d'un défaut accepté. Les bornes Zod des deux schémas d'objets de slide accueillent les nouveaux champs temporels.

**Tech Stack:** TypeScript strict, Fastify 5, Prisma (MongoDB 8), Zod, Jest, bun 1.3.14.

## Global Constraints

- Gestionnaire de paquets : **bun 1.3.14** (parité CI). Les commandes de ce plan s'exécutent depuis `services/gateway/`.
- **Aucun `any`** — `unknown` + validation. Le blob `storyEffects` vient entièrement du client : chaque champ est vérifié, jamais coercé.
- Prérequis avant toute exécution de tests : `cd packages/shared && npx prisma generate --generator client`, puis `cd packages/shared && bun run build`. Sans eux, ~17 suites gateway échouent pour une raison sans rapport avec ce lot.
- `extractCaptureTracks` **reste pure et sans accès base**. Tout ce qui exige la base (plafond sur la durée réelle du son) vit dans `SoundCaptureService`.
- **INVARIANT existant à ne pas casser** : `captureSounds` ne rejette jamais ; chaque piste est isolée. Aucune modification de ce plan n'a le droit d'introduire un `throw` sur le chemin de publication.
- Commentaires en français, denses, expliquant le *pourquoi* — c'est le style du fichier modifié.
- Format de réponse : `sendSuccess` / `sendError` de `utils/response.ts`.

---

## Place de ce plan dans la série

Le spec (`docs/superpowers/specs/2026-08-02-story-source-window-loop-mute-design.md`, § 15) découpe le chantier en 11 lots sur trois chaînes d'outils. Un plan par sous-système livrable seul :

| Plan | Lots | Chaîne | État |
|---|---|---|---|
| **1 — Serveur (ce document)** | A | gateway / jest | à exécuter |
| 2 — Miroir web | B | Next.js / vitest | à écrire |
| 3 — Mute du fond vidéo | K | Swift / XCTest | à écrire |
| 4 — Résolveur et modèle | C, D | Swift | à écrire |
| 5 — Édition (ripple, commandes, plafond) | E | Swift | à écrire |
| 6 — Moteurs et export | F, G, H | Swift | à écrire |
| 7 — Timeline UI et feuille « Zone » | I, J | Swift | à écrire |

**Ce lot est livrable en premier et seul.** Propriété qui le permet (spec § 9.1) : un client qui ne publie pas encore `sourceStart` produit `startMs = 0, endMs = duration`, ce qui est **exactement juste** pour lui, puisqu'il entre la source à 0. Le lot corrige donc la production avant même que le client existe.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `services/gateway/src/services/posts/captureTracks.ts` | Lecture pure et hostile du blob client → `CaptureTrack[]` | Modifier |
| `services/gateway/src/services/posts/__tests__/captureTracks.test.ts` | Tests de cette fonction pure | Modifier |
| `services/gateway/src/services/posts/SoundCaptureService.ts` | `CaptureTrack`, création du `Sound`, écriture du `SoundUsage` | Modifier |
| `services/gateway/src/services/posts/__tests__/SoundCaptureService.test.ts` | Tests du service | Modifier |
| `services/gateway/src/routes/posts/types.ts` | Schémas Zod des objets de slide | Modifier |
| `services/gateway/src/routes/posts/audio.ts` | Upload manuel d'un son | Modifier |
| `services/gateway/src/services/posts/waveformSamples.ts` | Nettoyage et lecture des échantillons, partagés par les deux chemins de création d'un `Sound` | Créer |
| `services/gateway/src/services/posts/__tests__/waveformSamples.test.ts` | Tests de ce module pur | Créer |
| `services/gateway/src/routes/posts/__tests__/audio.waveform.test.ts` | Garde de source du câblage de l'upload (pas de harnais Fastify pour cette route) | Créer |
| `services/gateway/src/routes/posts/__tests__/storySourceWindowSchema.test.ts` | Bornes Zod des nouveaux champs, sur les deux schémas | Créer |
| `packages/shared/prisma/schema.prisma` | Modèle `SoundUsage` | Modifier |

---

### Task 1: Bornes Zod des nouveaux champs temporels, sur les DEUX schémas

Le blob `storyEffects` est entièrement contrôlé par le client. Les deux schémas d'objets de slide bornent **tous** leurs champs numériques puis terminent par `.passthrough()` — c'est ce `.passthrough()` qui laissera passer les nouveaux champs, et c'est précisément pourquoi il faut les borner explicitement. Le schéma **média** est aussi concerné : le spec ajoute `sourceStart` à `StoryMediaObject`, pas seulement à l'audio.

**Files:**
- Modify: `services/gateway/src/routes/posts/types.ts:79-103` (`StoryMediaObjectSchema`), `:139-158` (`StoryAudioObjectSchema`)
- Create: `services/gateway/src/routes/posts/__tests__/storySourceWindowSchema.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: rien de nouveau à l'exécution — une garde d'entrée. Les tâches suivantes supposent que `sourceStart` et `intrinsicDuration` traversent la validation quand ils sont dans `[0, 86400]` et sont **rejetés** hors de cet intervalle.

- [ ] **Step 1: Écrire les tests qui échouent**

Fichier neuf, un fichier pour la garde d'une feature. Il suit le patron du voisin `storyAudioSchema.test.ts` : `safeParse` + `expect(r.success)`, jamais `parse` + `toThrow`.

```ts
import { describe, it, expect } from '@jest/globals';
import { StoryAudioObjectSchema, StoryMediaObjectSchema } from '../types';

/** Fenêtre de SOURCE (où l'on entre dans le fichier), à ne pas confondre avec
 *  `startTime`, qui dit quand la piste démarre sur la timeline. Le blob vient
 *  entièrement du client et les deux schémas terminent par `.passthrough()` :
 *  un champ temporel non énuméré entrerait sans aucune borne. */
describe('bornes de la fenêtre de source', () => {
  const audioBase = { id: 'track-1', postMediaId: '507f1f77bcf86cd799439011' };
  const mediaBase = { id: 'media-1', postMediaId: '507f1f77bcf86cd799439011' };

  it('test_audio_sourceStartInRange_isAccepted', () => {
    const r = StoryAudioObjectSchema.safeParse({ ...audioBase, sourceStart: 12.5, intrinsicDuration: 90 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sourceStart).toBe(12.5);
      expect(r.data.intrinsicDuration).toBe(90);
    }
  });

  it('test_audio_negativeSourceStart_isRejected', () => {
    expect(StoryAudioObjectSchema.safeParse({ ...audioBase, sourceStart: -1 }).success).toBe(false);
  });

  it('test_audio_absurdSourceStart_isRejected', () => {
    // Même plafond que ses frères `startTime`/`duration` : 86400 s = 24 h.
    expect(StoryAudioObjectSchema.safeParse({ ...audioBase, sourceStart: 86401 }).success).toBe(false);
  });

  it('test_media_sourceStartIsBoundedToo', () => {
    // Le schéma MÉDIA est concerné autant que l'audio : le spec ajoute
    // `sourceStart` aux deux types d'objet.
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, sourceStart: 3 }).success).toBe(true);
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, sourceStart: -0.5 }).success).toBe(false);
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, sourceStart: 999999 }).success).toBe(false);
  });

  it('test_media_intrinsicDurationIsBounded', () => {
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, intrinsicDuration: 42 }).success).toBe(true);
    expect(StoryMediaObjectSchema.safeParse({ ...mediaBase, intrinsicDuration: 86401 }).success).toBe(false);
  });

  it('test_absentFields_stayUndefined', () => {
    const r = StoryAudioObjectSchema.safeParse(audioBase);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sourceStart).toBeUndefined();
      expect(r.data.intrinsicDuration).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd services/gateway && bun run test -- routes/posts/__tests__/storySourceWindowSchema.test.ts
```

Attendu : ÉCHEC. `sourceStart` et `intrinsicDuration` traversent aujourd'hui par `.passthrough()` sans validation — toutes les assertions attendant `success: false` obtiennent `true`.

- [ ] **Step 3: Ajouter les bornes — et l'`export` manquant**

**D'abord** : `StoryMediaObjectSchema` n'est **pas exporté** (`types.ts:79` — `const`, sans `export`, contrairement à `StoryAudioObjectSchema` `:139`). L'import du test échouerait en TS2305, qui n'est **pas** dans les `ignoreCodes` de ts-jest (`jest.config.json` : `[2307, 2322, 2339, 2345, 2740]`) — le fichier entier ne compilerait pas.

```ts
export const StoryMediaObjectSchema = z.object({
```

**Ensuite**, dans `StoryMediaObjectSchema`, juste après la ligne `duration: z.number().min(0).max(86400).optional(),` :

```ts
  // Fenêtre de SOURCE — où l'on entre dans le fichier. À ne pas confondre avec
  // `startTime`, qui dit quand la piste démarre sur la timeline. Bornées comme
  // leurs frères : le blob vient du client, `.passthrough()` ci-dessous ne
  // valide rien de ce qu'on n'énumère pas ici.
  sourceStart: z.number().min(0).max(86400).optional(),
  intrinsicDuration: z.number().min(0).max(86400).optional(),
```

Dans `StoryAudioObjectSchema`, juste après sa propre ligne `duration: z.number().min(0).max(86400).optional(),` :

```ts
  // Idem `StoryMediaObjectSchema` : fenêtre de SOURCE, pas fenêtre de timeline.
  sourceStart: z.number().min(0).max(86400).optional(),
  intrinsicDuration: z.number().min(0).max(86400).optional(),
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd services/gateway && bun run test -- routes/posts/__tests__/storySourceWindowSchema.test.ts
```

Attendu : PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/posts/types.ts services/gateway/src/routes/posts/__tests__/storySourceWindowSchema.test.ts
git commit -m "feat(gateway/story): borner sourceStart et intrinsicDuration sur les DEUX schemas d'objets de slide

Le blob storyEffects vient entierement du client et les deux schemas
terminent par .passthrough() : un champ temporel non enumere entrerait
sans aucune borne. Le schema MEDIA est concerne autant que l'audio."
```

---

### Task 2: `extractCaptureTracks` écrit des coordonnées de SOURCE

C'est la correction de production. `SoundUsage.startMs`/`endMs` sont censés dire *quelle part du son a été utilisée* ; ils reçoivent aujourd'hui `startTime` et `startTime + duration`, c'est-à-dire la position de la piste **sur la timeline**. Chaque story publiée écrit une ligne d'attribution fausse.

**Files:**
- Modify: `services/gateway/src/services/posts/captureTracks.ts:20-28`
- Test: `services/gateway/src/services/posts/__tests__/captureTracks.test.ts`

**Interfaces:**
- Consumes: `CaptureTrack` de `./SoundCaptureService` (champs actuels : `trackId`, `postMediaId?`, `soundId?`, `startMs?`, `endMs?`).
- Produces: `extractCaptureTracks(storyEffects?: Record<string, unknown>): CaptureTrack[]` — signature inchangée, **sémantique de `startMs`/`endMs` changée**. La tâche 6 s'appuie dessus.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `captureTracks.test.ts`, à la fin du `describe` existant :

```ts
  it('test_sourceWindow_isWrittenInSourceCoordinates', () => {
    // La piste démarre à 30 s SUR LA TIMELINE, mais n'utilise le son
    // qu'à partir de 12 s DANS LE FICHIER, sur 8 s.
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', soundId: 's1',
        startTime: 30, duration: 8,
        sourceStart: 12, intrinsicDuration: 90,
      }],
    });
    expect(track.startMs).toBe(12000);
    expect(track.endMs).toBe(20000);
  });

  it('test_legacyClientWithoutSourceStart_isExactlyCorrect', () => {
    // Un client antérieur entre la source à 0 : le nouveau calcul lui donne
    // 0 → duration, ce qui est EXACTEMENT juste pour lui. C'est la propriété
    // qui rend ce lot livrable avant le client.
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', soundId: 's1', startTime: 30, duration: 8 }],
    });
    expect(track.startMs).toBe(0);
    expect(track.endMs).toBe(8000);
  });

  it('test_excerptIsClampedToRemainingSource', () => {
    // Fenêtre de 60 s sur un extrait qui n'a que 10 s de source restante :
    // la piste BOUCLE. La part utilisée du son reste 10 s, pas 60.
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', soundId: 's1',
        startTime: 0, duration: 60,
        sourceStart: 80, intrinsicDuration: 90,
      }],
    });
    expect(track.startMs).toBe(80000);
    expect(track.endMs).toBe(90000);
  });

  it('test_sourceStartBeyondIntrinsic_yieldsEmptyExcerpt', () => {
    // Blob incohérent (client hostile) : jamais de durée négative en base.
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', soundId: 's1', duration: 5,
        sourceStart: 100, intrinsicDuration: 90,
      }],
    });
    expect(track.endMs).toBe(track.startMs);
  });

  it('test_nonFiniteValues_areTreatedAsAbsent', () => {
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{
        id: 't1', soundId: 's1',
        sourceStart: Number.NaN, duration: Number.POSITIVE_INFINITY,
      }],
    });
    expect(track.startMs).toBe(0);
    expect(track.endMs).toBeUndefined();
  });

  it('test_durationAbsent_leavesEndUndefined', () => {
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', soundId: 's1', sourceStart: 3 }],
    });
    expect(track.startMs).toBe(3000);
    expect(track.endMs).toBeUndefined();
  });
```

**Trois tests existants encodent l'ANCIENNE sémantique et doivent être réécrits dans le même geste** — sans quoi la tâche 3 démarre sur une suite rouge.

`captureTracks.test.ts:50-56` (`test_ownedTrack_convertsSecondsToMilliseconds`), entrée `{ startTime: 1.5, duration: 2.25 }` :

```ts
    expect(tracks).toEqual([{
      // Fenêtre de SOURCE : `startTime: 1.5` était la position sur la TIMELINE.
      trackId: 't1', postMediaId: 'm1', soundId: undefined, startMs: 0, endMs: 2250,
    }]);
```

`captureTracks.test.ts:57-63` (`test_durationWithoutStartTime_leavesEndUndefined`) — son nom même devient faux :

```ts
  it('test_durationWithoutSourceStart_entersTheSourceAtZero', () => {
    // Ancien contrat : `startMs` restait indéfini sans `startTime`. Nouveau :
    // c'est une coordonnée de SOURCE, et un client qui ne déclare pas
    // `sourceStart` entre le fichier à 0 — c'est 0, pas « inconnu ».
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', soundId: 's1', duration: 3 }],
    });
    expect(track.startMs).toBe(0);
    expect(track.endMs).toBe(3000);
  });
```

Et **un troisième fichier**, `services/gateway/src/services/posts/__tests__/SoundCaptureComposition.test.ts:68-71`, qui appelle `PostService.createPost` pour de vrai et assied un `toEqual` exact sur la sortie :

```ts
    expect(ctx.tracks).toEqual([
      // Coordonnées de SOURCE : `startTime: 2` est la position sur la TIMELINE
      // et n'entre plus dans `SoundUsage`. Sans `sourceStart`, l'entrée est 0.
      { trackId: 'track-a', postMediaId: 'media-a', soundId: undefined, startMs: 0, endMs: 4000 },
      { trackId: 'track-b', postMediaId: undefined, soundId: '507f1f77bcf86cd799439011', startMs: 0, endMs: undefined },
    ]);
```

`toEqual` ignore les propriétés `undefined` : ces trois blocs survivent à l'ajout de `waveform` (tâche 3) et `windowAdjusted` (tâche 6).

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd services/gateway && bun run test -- services/posts/__tests__/captureTracks.test.ts
```

Attendu : ÉCHEC. Le premier test rapporte `startMs: 30000` (la timeline) au lieu de `12000`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `captureTracks.ts`, remplacer le bloc `.map((o) => ({ … }))` par :

```ts
    .map((o) => {
      // Fenêtre de SOURCE, pas fenêtre de timeline. `SoundUsage.startMs/endMs`
      // disent QUELLE PART DU SON a été utilisée ; y ranger `startTime` (la
      // position de la piste sur la timeline) écrivait une attribution fausse
      // à chaque publication. Corrigé le 2026-08-02.
      //
      // Un client antérieur n'envoie pas `sourceStart` : il entre la source à
      // 0, donc `0 → duration` est exactement juste pour lui. C'est ce qui
      // permet de livrer cette correction avant le client.
      const sourceStart = finiteNumber(o['sourceStart']) ?? 0;
      const duration = finiteNumber(o['duration']);
      const intrinsic = finiteNumber(o['intrinsicDuration']);
      // La part réellement utilisée ne peut pas dépasser ce qui reste de
      // source après l'entrée : au-delà, la piste BOUCLE, elle ne consomme pas
      // plus de son.
      const excerpt = duration === undefined
        ? undefined
        : intrinsic === undefined
          ? duration
          : Math.min(duration, Math.max(0, intrinsic - sourceStart));
      return {
        trackId: String(o['id'] ?? ''),
        postMediaId: typeof o['postMediaId'] === 'string' && o['postMediaId'] ? o['postMediaId'] : undefined,
        soundId: typeof o['soundId'] === 'string' && o['soundId'] ? o['soundId'] : undefined,
        startMs: Math.round(sourceStart * 1000),
        endMs: excerpt === undefined ? undefined : Math.round((sourceStart + excerpt) * 1000),
      };
    })
```

Et ajouter, au-dessus de `extractCaptureTracks` :

```ts
/**
 * Un nombre exploitable, ou `undefined`. `typeof NaN === 'number'` et
 * `typeof Infinity === 'number'` : sans le test de finitude, un blob hostile
 * ferait entrer `NaN` en base par `Math.round`.
 */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd services/gateway && bun run test -- services/posts/__tests__/captureTracks.test.ts
```

Attendu : PASS, tous les tests du fichier.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/posts/captureTracks.ts services/gateway/src/services/posts/__tests__/captureTracks.test.ts services/gateway/src/services/posts/__tests__/SoundCaptureComposition.test.ts
git commit -m "fix(gateway/sounds): SoundUsage enregistre la part du SON, plus la position sur la timeline

startMs/endMs disent quelle part du son a ete utilisee. Ils recevaient
startTime et startTime+duration, c'est-a-dire la position de la piste sur
la timeline : chaque story publiee ecrivait une attribution fausse.

Un client anterieur n'envoie pas sourceStart et entre donc la source a 0 :
le nouveau calcul lui donne 0 -> duration, exactement juste. C'est ce qui
permet de livrer cette correction avant le client."
```

---

### Task 3: La forme d'onde traverse jusqu'au `CaptureTrack`

`Sound.waveform` est déclaré (`schema.prisma:3071`) et lu (`sounds.ts:56`) mais **n'a aucun écrivain** : il vaut `[]` pour 100 % de la bibliothèque en production. Le client publie pourtant ses échantillons dans `storyEffects.audioPlayerObjects[].waveformSamples` (plafonnés à 2048 par `types.ts:146`) — le serveur les jette.

**Files:**
- Create: `services/gateway/src/services/posts/waveformSamples.ts`
- Modify: `services/gateway/src/services/posts/SoundCaptureService.ts:13-22` (`CaptureTrack`)
- Modify: `services/gateway/src/services/posts/captureTracks.ts`
- Test: `services/gateway/src/services/posts/__tests__/captureTracks.test.ts`

**Interfaces:**
- Consumes: `extractCaptureTracks` de la tâche 2.
- Produces: `CaptureTrack.waveform?: number[]` — la tâche 4 le grave sur le `Sound`. Et le module `waveformSamples.ts` exportant `MAX_WAVEFORM_SAMPLES: number` et `cleanWaveformSamples(value: unknown): number[] | undefined` — la tâche 5 y ajoute `parseWaveformField`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
  it('test_waveformSamples_areCarriedThrough', () => {
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', postMediaId: 'm1', waveformSamples: [0.1, 0.9, 0.4] }],
    });
    expect(track.waveform).toEqual([0.1, 0.9, 0.4]);
  });

  it('test_waveformSamples_nonArrayOrEmpty_isUndefined', () => {
    const [a] = extractCaptureTracks({ audioPlayerObjects: [{ id: 't1', postMediaId: 'm1' }] });
    expect(a.waveform).toBeUndefined();
    const [b] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', postMediaId: 'm1', waveformSamples: 'nope' }],
    });
    expect(b.waveform).toBeUndefined();
    const [c] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', postMediaId: 'm1', waveformSamples: [] }],
    });
    expect(c.waveform).toBeUndefined();
  });

  it('test_waveformSamples_nonNumericEntriesAreDropped', () => {
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', postMediaId: 'm1', waveformSamples: [0.2, 'x', null, Number.NaN, 0.8] }],
    });
    expect(track.waveform).toEqual([0.2, 0.8]);
  });

  it('test_waveformSamples_areCappedAt2048', () => {
    // Même plafond que le schéma Zod d'entrée : une piste ne grave pas un blob
    // de plusieurs Mo dans une colonne Float[].
    const [track] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', postMediaId: 'm1', waveformSamples: new Array(5000).fill(0.5) }],
    });
    expect(track.waveform).toHaveLength(2048);
  });
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd services/gateway && bun run test -- services/posts/__tests__/captureTracks.test.ts
```

Attendu : ÉCHEC **d'assertion** — `track.waveform` vaut `undefined`. Surtout pas une erreur de compilation : ts-jest ignore TS2339 et TS2345 (`jest.config.json`, `ignoreCodes: [2307, 2322, 2339, 2345, 2740]`), donc une propriété absente ne casse pas le build du test. Deux des quatre tests passent déjà au RED (ceux qui attendent `undefined`) — c'est normal.

- [ ] **Step 3: Écrire l'implémentation**

Dans `SoundCaptureService.ts`, ajouter au champ `CaptureTrack` :

```ts
  /**
   * Échantillons de forme d'onde calculés par le client. `Sound.waveform`
   * n'avait AUCUN écrivain : la donnée arrivait ici et était jetée, et toute
   * la bibliothèque servait un tableau vide. Sans elle, un sélecteur de zone
   * s'ouvre sur du vide.
   */
  waveform?: number[];
```

Créer `services/gateway/src/services/posts/waveformSamples.ts` — module partagé, parce que les **deux** chemins de création d'un `Sound` en ont besoin (la capture ici, l'upload manuel en tâche 5) et qu'un plafond dupliqué finirait par diverger :

```ts
/** Plafond aligné sur `StoryAudioObjectSchema.waveformSamples` (`routes/posts/types.ts`). */
export const MAX_WAVEFORM_SAMPLES = 2048;

/**
 * Échantillons exploitables, ou `undefined`. Filtre les entrées non numériques
 * et non finies : `Float[]` en Prisma/Mongo n'accepte pas `NaN`, et le tableau
 * vient entièrement du client.
 */
export function cleanWaveformSamples(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const clean = value
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .slice(0, MAX_WAVEFORM_SAMPLES);
  return clean.length > 0 ? clean : undefined;
}
```

Puis dans `captureTracks.ts`, ajouter l'import et le champ dans le `return { … }` de la tâche 2 :

```ts
import { cleanWaveformSamples } from './waveformSamples';
```

```ts
        waveform: cleanWaveformSamples(o['waveformSamples']),
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd services/gateway && bun run test -- services/posts/__tests__/captureTracks.test.ts
```

Attendu : PASS.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/posts/waveformSamples.ts services/gateway/src/services/posts/captureTracks.ts services/gateway/src/services/posts/SoundCaptureService.ts services/gateway/src/services/posts/__tests__/captureTracks.test.ts
git commit -m "feat(gateway/sounds): la forme d'onde du client traverse jusqu'au CaptureTrack

Sound.waveform est declare et lu mais n'a aucun ecrivain : toute la
bibliotheque sert un tableau vide. Le client publie pourtant ses
echantillons dans storyEffects — le serveur les jetait."
```

---

### Task 4: `SoundCaptureService` grave la forme d'onde sur le `Sound`

**Files:**
- Modify: `services/gateway/src/services/posts/SoundCaptureService.ts:397-421` (`prisma.sound.create`)
- Test: `services/gateway/src/services/posts/__tests__/SoundCaptureService.test.ts`

**Interfaces:**
- Consumes: `CaptureTrack.waveform?: number[]` de la tâche 3.
- Produces: rien de nouveau — le `Sound` créé porte désormais `waveform`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `SoundCaptureService.test.ts`. **Réutiliser le montage existant du fichier** — `buildPrisma(overrides)` (`:9-33`), les répertoires temporaires posés par `beforeEach`, et `new SoundCaptureService(prisma, soundsDir, uploadsRoot)` (patron des lignes 89, 107, 123). Ne pas inventer de second harnais.

La capture n'écrit un `Sound` que si `postMedia.findMany` rend un média : reprendre l'`override` déjà utilisé par les tests voisins du fichier pour le fournir.

```ts
  it('test_captureWritesWaveformOnCreatedSound', async () => {
    const prisma = buildPrisma({
      postMedia: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: 'm1', filePath: 'a.m4a', mimeType: 'audio/mp4', duration: 12000, language: null },
        ]),
      },
    });
    await fs.writeFile(path.join(uploadsRoot, 'a.m4a'), Buffer.from('fake-audio'));

    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1', waveform: [0.1, 0.7, 0.3] }],
    });

    expect(prisma.sound.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ waveform: [0.1, 0.7, 0.3] }),
      }),
    );
  });

  it('test_captureWithoutWaveform_writesEmptyArray', async () => {
    // `Float[]` n'est pas nullable en Prisma : l'absence s'écrit `[]`, ce que
    // sert déjà toute la bibliothèque existante. Aucun changement pour une
    // piste sans échantillons — c'est la garde de non-régression.
    const prisma = buildPrisma({
      postMedia: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: 'm1', filePath: 'b.m4a', mimeType: 'audio/mp4', duration: 12000, language: null },
        ]),
      },
    });
    await fs.writeFile(path.join(uploadsRoot, 'b.m4a'), Buffer.from('fake-audio'));

    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', postMediaId: 'm1' }],
    });

    expect(prisma.sound.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ waveform: [] }) }),
    );
  });
```

Si la forme exacte du média attendu par `captureOne` diffère, la lire dans le fichier plutôt que de la deviner : le `select` de `postMedia.findMany` dans `SoundCaptureService.ts` en donne la liste exacte.

- [ ] **Step 2: Lancer le test pour le voir échouer**

```bash
cd services/gateway && bun run test -- services/posts/__tests__/SoundCaptureService.test.ts
```

Attendu : ÉCHEC — `waveform` absent de l'objet `data`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `SoundCaptureService.ts`, dans le `data:` du `prisma.sound.create`, juste après `durationMs: media.duration ?? 0,` :

```ts
          // `Float[]` n'est pas nullable en Prisma : l'absence s'écrit `[]`,
          // qui est exactement ce que sert déjà toute la bibliothèque
          // existante — donc aucun changement pour une piste sans échantillons.
          waveform: track.waveform ?? [],
```

- [ ] **Step 4: Lancer le test pour le voir passer**

```bash
cd services/gateway && bun run test -- services/posts/__tests__/SoundCaptureService.test.ts
```

Attendu : PASS.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/services/posts/SoundCaptureService.ts services/gateway/src/services/posts/__tests__/SoundCaptureService.test.ts
git commit -m "feat(gateway/sounds): la capture grave enfin la forme d'onde sur le Sound cree"
```

---

### Task 5: L'upload manuel accepte une forme d'onde

Le second chemin de création d'un `Sound`. Le client calcule déjà sa forme d'onde localement pour l'afficher ; il l'envoie ici en champ multipart plutôt que d'imposer un décodage audio côté serveur (qui exigerait ffmpeg dans le conteneur gateway — hors sujet pour ce lot).

**Files:**
- Modify: `services/gateway/src/services/posts/waveformSamples.ts` (créé en tâche 3)
- Modify: `services/gateway/src/routes/posts/audio.ts:80-83` (lecture des champs), `:117-134` (`prisma.sound.create`)
- Create: `services/gateway/src/services/posts/__tests__/waveformSamples.test.ts`
- Create: `services/gateway/src/routes/posts/__tests__/audio.waveform.test.ts`

**Interfaces:**
- Consumes: `cleanWaveformSamples` et `MAX_WAVEFORM_SAMPLES` de la tâche 3.
- Produces: `parseWaveformField(raw: unknown): number[]`, et le champ multipart optionnel `waveform` (JSON d'un tableau de nombres). Le client iOS l'enverra dans un lot ultérieur ; son absence est le cas nominal aujourd'hui.

> **Pourquoi pas un test d'intégration de route.** Le dépôt n'a **aucun** harnais Fastify pour `audio.ts` : son voisin `audio.duration.test.ts` est une **garde de source** qui lit le texte du fichier. Monter un envoi multipart authentifié pour ce lot serait de l'infrastructure neuve, hors sujet. On teste donc pour de vrai la fonction pure, et on ancre le câblage par une garde de source — le patron déjà en place, y compris son filtrage des commentaires.

- [ ] **Step 1: Écrire les tests qui échouent**

`services/gateway/src/services/posts/__tests__/waveformSamples.test.ts` :

```ts
import { describe, it, expect } from '@jest/globals';
import { parseWaveformField, MAX_WAVEFORM_SAMPLES } from '../waveformSamples';

/** Champ multipart de l'upload manuel — deuxième chemin de création d'un
 *  `Sound`. Purement décoratif : un champ malformé est ignoré, jamais une
 *  cause de rejet. On ne fait pas échouer l'envoi d'un fichier sur un ornement. */
describe('parseWaveformField', () => {
  it('test_validJSONArray_isParsed', () => {
    expect(parseWaveformField(JSON.stringify([0.2, 0.6, 0.9]))).toEqual([0.2, 0.6, 0.9]);
  });

  it('test_malformedJSON_yieldsEmptyArrayNotThrow', () => {
    expect(parseWaveformField('pas du json')).toEqual([]);
  });

  it('test_absentOrNonString_yieldsEmptyArray', () => {
    expect(parseWaveformField(undefined)).toEqual([]);
    expect(parseWaveformField('')).toEqual([]);
    expect(parseWaveformField(42)).toEqual([]);
  });

  it('test_jsonObjectNotArray_yieldsEmptyArray', () => {
    expect(parseWaveformField('{"a":1}')).toEqual([]);
  });

  it('test_nonNumericEntriesAreDropped', () => {
    expect(parseWaveformField('[0.2,"x",null,0.8]')).toEqual([0.2, 0.8]);
  });

  it('test_isCappedAtMaxSamples', () => {
    const big = JSON.stringify(new Array(5000).fill(0.5));
    expect(parseWaveformField(big)).toHaveLength(MAX_WAVEFORM_SAMPLES);
  });
});
```

`services/gateway/src/routes/posts/__tests__/audio.waveform.test.ts` — garde de source, patron d'`audio.duration.test.ts` (lecture du fichier + suppression des commentaires, sans quoi un commentaire mentionnant `waveform` ferait passer la garde à vide) :

```ts
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** `Sound.waveform` n'avait aucun écrivain : toute la bibliothèque servait un
 *  tableau vide. Cette garde ancre le câblage de l'upload manuel. */
describe('routes/posts/audio.ts — forme d\'onde', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'audio.ts'), 'utf-8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('test_audioRoute_readsWaveformField', () => {
    // Notation indifférente : ce qui compte est que le champ soit LU.
    expect(code).toMatch(/data\.fields\[['"]waveform['"]\]|data\.fields\.waveform/);
    expect(code).toContain('parseWaveformField');
  });

  it('test_audioRoute_writesWaveformOnSoundCreate', () => {
    const start = code.indexOf('prisma.sound.create');
    expect(start).toBeGreaterThan(-1);
    // Fenêtre BORNÉE au seul appel de création, ancrée sur deux repères du
    // code : `slice(start)` court jusqu'à la fin du fichier — deux routes de
    // plus — et n'importe quel `waveform` ailleurs la satisferait.
    const createBlock = code.slice(start, code.indexOf('include: soundUploaderInclude', start));
    // Le RACCOURCI d'objet, pas un littéral : `waveform: []` écrit en dur
    // satisferait un `toContain('waveform')` tout en gravant le tableau vide
    // que cette tâche existe pour corriger.
    expect(createBlock).toMatch(/^\s*waveform,\s*$/m);
  });
});
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd services/gateway && bun run test -- services/posts/__tests__/waveformSamples.test.ts routes/posts/__tests__/audio.waveform.test.ts
```

Attendu : ÉCHEC — `parseWaveformField` n'est pas exporté, et `audio.ts` ne mentionne pas `waveform`.

- [ ] **Step 3: Écrire l'implémentation**

Ajouter à `services/gateway/src/services/posts/waveformSamples.ts` :

```ts
/**
 * Lit le champ multipart `waveform` de l'upload manuel. Décoder l'audio côté
 * serveur imposerait ffmpeg dans le conteneur gateway pour une donnée
 * purement décorative, que le client possède déjà pour l'afficher.
 */
export function parseWaveformField(raw: unknown): number[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return cleanWaveformSamples(parsed) ?? [];
  } catch {
    return [];
  }
}
```

Dans `audio.ts`, ajouter l'import puis, après la ligne `const duration = isNaN(durationRaw) ? 0 : durationRaw;` :

```ts
import { parseWaveformField } from '../../services/posts/waveformSamples';
```

```ts
    // Forme d'onde calculée par le client. Un champ malformé est IGNORÉ,
    // jamais une cause de rejet : on ne fait pas échouer l'envoi d'un fichier
    // sur un ornement.
    const waveform = parseWaveformField((data.fields['waveform'] as { value?: unknown } | undefined)?.value);
```

Puis dans le `data:` du `prisma.sound.create`, après `durationMs: …,` :

```ts
        waveform,
```

Vérifier que le chemin relatif de l'import correspond à l'arborescence réelle depuis `routes/posts/`.

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd services/gateway && bun run test -- services/posts/__tests__/waveformSamples.test.ts routes/posts/__tests__/audio.waveform.test.ts
```

Attendu : PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/posts/audio.ts services/gateway/src/services/posts/waveformSamples.ts services/gateway/src/services/posts/__tests__/waveformSamples.test.ts services/gateway/src/routes/posts/__tests__/audio.waveform.test.ts
git commit -m "feat(gateway/sounds): l'upload manuel accepte une forme d'onde du client

Second chemin de creation d'un Sound. Un champ malforme est ignore, jamais
une cause de rejet : on ne fait pas echouer l'envoi d'un fichier sur un
ornement. Decoder l'audio ici imposerait ffmpeg dans le conteneur."
```

---

### Task 6: `SoundUsage.windowAdjustedAt` et plafond de `endMs` sur la durée réelle

Deux choses qui touchent la même écriture, donc une seule tâche.

**`windowAdjustedAt`** distingue « l'auteur a déplacé la fenêtre » de « il a accepté le défaut proposé ». Sans lui, le jour où le point d'entrée par défaut d'un son emprunté sera dérivé de l'agrégat des usages, **l'agrégat se nourrira de sa propre sortie** : le défaut se fige sur le premier maximum et plus rien ne peut apprendre qu'il était mauvais. Les lignes écrites entre-temps sont inétiquetables rétroactivement. Idiome nullable-`DateTime` du CLAUDE.md racine — surtout pas un booléen séparé.

**Le plafond** ferme le cas où le blob ne porte pas `intrinsicDuration` (client antérieur, fond legacy synthétisé) : `endMs` peut alors dépasser la longueur réelle du fichier pour une piste bouclée, et on réécrirait une attribution fausse — le bug même que la tâche 2 corrige. Ce plafond exige la base, il ne peut donc pas vivre dans la fonction pure.

**Files:**
- Modify: `packages/shared/prisma/schema.prisma:3090-3105` (modèle `SoundUsage`)
- Modify: `services/gateway/src/services/posts/SoundCaptureService.ts:13-22` (`CaptureTrack`), `:431-448` (`recordUsage`)
- Test: `services/gateway/src/services/posts/__tests__/SoundCaptureService.test.ts`

**Interfaces:**
- Consumes: `CaptureTrack` des tâches 2-3.
- Produces: `CaptureTrack.windowAdjusted?: boolean` (transporté depuis le blob), et la colonne `SoundUsage.windowAdjustedAt`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `captureTracks.test.ts` :

```ts
  it('test_windowAdjustedFlag_isCarriedThrough', () => {
    const [a] = extractCaptureTracks({
      audioPlayerObjects: [{ id: 't1', soundId: 's1', windowAdjusted: true }],
    });
    expect(a.windowAdjusted).toBe(true);
    const [b] = extractCaptureTracks({ audioPlayerObjects: [{ id: 't1', soundId: 's1' }] });
    expect(b.windowAdjusted).toBeUndefined();
  });
```

Dans `SoundCaptureService.test.ts`, avec le montage réel du fichier (`buildPrisma`, puis `new SoundCaptureService(prisma, soundsDir, uploadsRoot)`).

**Le chemin du son emprunté passe par `sound.findMany`, PAS `findFirst`** (`SoundCaptureService.ts:284-292`). Un mock qui ne peuple que `findFirst` laisse l'ensemble des sons autorisés vide : la piste est refusée par un `continue`, `soundUsage.create` n'est jamais appelé, et l'assertion meurt sur `calls[0]` indéfini. Le service ne rejette **jamais** — rien ne dira pourquoi.

```ts
  const borrowedPrisma = (durationMs: number | null) => buildPrisma({
    sound: {
      // Les TROIS gardes de `recordBorrowed` doivent être satisfaites :
      // `mutatedAt` nul, et `isPublic` OU `uploaderId === ctx.authorId`.
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
        { id: 's1', isPublic: true, uploaderId: 'u1', mutedAt: null, durationMs },
      ]),
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 's1' }),
      // Appelé DANS le `$transaction` de `recordUsage` : l'override remplace la
      // clé `sound` entière, donc il faut le remettre.
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
  });

  /// Évite `jest.Mock` comme type : le stub `PrismaClient` des tests est
  /// `[key: string]: any`, et la contrainte « aucun `any` » vaut aussi ici.
  type UsageArgs = { data: { startMs?: number; endMs?: number; windowAdjustedAt: Date | null } };
  const firstUsage = (prisma: unknown): UsageArgs['data'] =>
    (prisma as { soundUsage: { create: { mock: { calls: UsageArgs[][] } } } })
      .soundUsage.create.mock.calls[0][0].data;

  it('test_recordUsage_stampsWindowAdjustedAtOnlyWhenAuthorMovedIt', async () => {
    const prisma = borrowedPrisma(90000);
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: 's1', windowAdjusted: true }],
    });
    const create = prisma.soundUsage.create as unknown as jest.Mock;
    expect((create.mock.calls[0][0] as { data: { windowAdjustedAt: unknown } }).data.windowAdjustedAt)
      .toBeInstanceOf(Date);
  });

  it('test_recordUsage_leavesWindowAdjustedAtNullOnAcceptedDefault', async () => {
    const prisma = borrowedPrisma(90000);
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: 's1' }],
    });
    const create = prisma.soundUsage.create as unknown as jest.Mock;
    expect((create.mock.calls[0][0] as { data: { windowAdjustedAt: unknown } }).data.windowAdjustedAt)
      .toBeNull();
  });

  it('test_recordUsage_clampsEndMsToRealSoundDuration', async () => {
    // Blob sans `intrinsicDuration` (client antérieur, fond legacy) : la
    // fenêtre timeline de 60 s a produit endMs = 60000, mais le son ne dure
    // que 12 s. Sans plafond, on réécrit l'attribution fausse que ce lot
    // corrige — et ce plafond exige la base, donc il ne peut pas vivre dans
    // `extractCaptureTracks`, qui est pure.
    const prisma = borrowedPrisma(12000);
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: 's1', startMs: 0, endMs: 60000 }],
    });
    const create = prisma.soundUsage.create as unknown as jest.Mock;
    expect((create.mock.calls[0][0] as { data: { endMs: number } }).data.endMs).toBe(12000);
  });

  it('test_republication_updatesTheWindow_ratherThanSwallowingIt', async () => {
    // Le `catch` de doublon rendait la republication inerte : un auteur qui
    // deplace sa fenetre et republie ne modifiait jamais la ligne.
    const prisma = borrowedPrisma(90000);
    const service = new SoundCaptureService(prisma, soundsDir, uploadsRoot);
    const ctx = { postId: 'p1', authorId: 'u1', feedsLibrary: true };
    await service.captureSounds({ ...ctx, tracks: [{ trackId: 't1', soundId: 's1', startMs: 0, endMs: 5000 }] });
    await service.captureSounds({ ...ctx, tracks: [{ trackId: 't1', soundId: 's1', startMs: 12000, endMs: 20000, windowAdjusted: true }] });

    const upsert = prisma.soundUsage.upsert as unknown as jest.Mock;
    const second = upsert.mock.calls[1][0] as { update: { startMs: number; endMs: number } };
    expect(second.update.startMs).toBe(12000);
    expect(second.update.endMs).toBe(20000);
  });

  it('test_recordUsage_unknownSoundDuration_leavesEndMsUntouched', async () => {
    const prisma = borrowedPrisma(null);
    await new SoundCaptureService(prisma, soundsDir, uploadsRoot).captureSounds({
      postId: 'p1', authorId: 'u1', feedsLibrary: true,
      tracks: [{ trackId: 't1', soundId: 's1', startMs: 0, endMs: 60000 }],
    });
    const create = prisma.soundUsage.create as unknown as jest.Mock;
    expect((create.mock.calls[0][0] as { data: { endMs: number } }).data.endMs).toBe(60000);
  });
```

**Avant d'écrire ces tests, lire le chemin réel du son emprunté dans `SoundCaptureService.ts`** : la méthode qui résout un `soundId` existant et le `select` qu'elle utilise. Les mocks ci-dessus supposent `sound.findFirst` ; si le code appelle `findUnique`, adapter — ne pas forcer le code à suivre le test.

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd services/gateway && bun run test -- services/posts/__tests__/captureTracks.test.ts services/posts/__tests__/SoundCaptureService.test.ts
```

Attendu : ÉCHEC **d'assertion** (ts-jest ignore TS2339/TS2345 — voir tâche 3). `expect(b.windowAdjusted).toBeUndefined()` passe déjà ; ce sont les trois assertions de `SoundCaptureService.test.ts` qui rougissent.

- [ ] **Step 3: Écrire l'implémentation**

Dans `schema.prisma`, modèle `SoundUsage`, après `endMs Int?` :

```prisma
  /// Non-null = l'auteur a DÉPLACÉ la fenêtre ; null = il a accepté le défaut
  /// proposé. Sans cette distinction, un point d'entrée par défaut dérivé de
  /// l'agrégat se nourrirait de sa propre sortie et se figerait sur le premier
  /// maximum, sans moyen d'apprendre qu'il était mauvais.
  windowAdjustedAt DateTime?
```

Dans `SoundCaptureService.ts`, sur `CaptureTrack` :

```ts
  /** L'auteur a-t-il déplacé la fenêtre, ou accepté le défaut proposé ? */
  windowAdjusted?: boolean;
```

Dans `captureTracks.ts`, dans le `return { … }` :

```ts
        windowAdjusted: o['windowAdjusted'] === true ? true : undefined,
```

**`create` devient `upsert`.** Le `create` actuel est enveloppé dans un `catch`
qui avale le doublon `(postId, trackId)` au nom de l'idempotence
(`SoundCaptureService.ts:445-447`). Conséquence : un auteur qui déplace sa
fenêtre et republie ne modifie **jamais** `startMs`/`endMs`, et
`windowAdjustedAt` devient inécrivable après la première publication — ce qui
détruit l'argument qui le justifie. L'`upsert` porte sur
`@@unique([postId, trackId])`, et **l'incrément de `usageCount` reste dans la
branche création uniquement** : le rejouer sur une mise à jour gonflerait le
compteur à chaque republication.

Dans `recordUsage` (`SoundCaptureService.ts:431-448`), le `data:` de la branche
de création — et le `update:` de l'upsert — portent :

```ts
          data: {
            soundId, postId: ctx.postId, trackId: track.trackId,
            viaPostId: ctx.viaPostId,
            startMs: track.startMs,
            // Plafond sur la durée RÉELLE du son. Un blob sans
            // `intrinsicDuration` (client antérieur, fond legacy synthétisé)
            // produit un `endMs` dérivé de la fenêtre timeline, qui déborde
            // dès que la piste boucle — on réécrirait l'attribution fausse
            // que ce lot corrige. Ce plafond exige la base : il ne peut pas
            // vivre dans `extractCaptureTracks`, qui est pure.
            endMs: clampEndMs(track.endMs, soundDurationMs),
            windowAdjustedAt: track.windowAdjusted === true ? new Date() : null,
          },
```

et ajouter au niveau module :

```ts
/**
 * Borne `endMs` à la longueur réelle du son quand elle est connue. `undefined`
 * traverse tel quel : une piste sans fenêtre déclarée n'en gagne pas une.
 */
function clampEndMs(endMs: number | undefined, soundDurationMs: number | null | undefined): number | undefined {
  if (endMs === undefined) return undefined;
  if (soundDurationMs === null || soundDurationMs === undefined || soundDurationMs <= 0) return endMs;
  return Math.min(endMs, soundDurationMs);
}
```

`recordUsage` doit disposer de `soundDurationMs`, et le porter exige **trois** changements que le simple ajout de `durationMs: true` au `select` ne suffit pas à couvrir :

```ts
  private async recordBorrowed(ctx: CaptureContext): Promise<void> {
    const borrowed = ctx.tracks.filter((t) => t.soundId);
    if (borrowed.length === 0) return;

    const sounds = await this.prisma.sound.findMany({
      where: { id: { in: borrowed.map((t) => t.soundId!) } },
      // `durationMs` lue ICI, dans la requête d'autorisation déjà faite : le
      // plafond de `endMs` exige la durée RÉELLE du son, et une requête de plus
      // par piste la paierait à chaque publication.
      select: { id: true, isPublic: true, uploaderId: true, mutedAt: true, durationMs: true },
    });
    // Une Map, pas un Set : le Set jetait la durée qu'on vient de lire.
    const allowed = new Map<string, number | null>(
      sounds
        .filter((s) => !s.mutedAt && (s.isPublic || s.uploaderId === ctx.authorId))
        .map((s) => [s.id, s.durationMs ?? null] as [string, number | null]),
    );

    for (const track of borrowed) {
      if (!allowed.has(track.soundId!)) {
        log.warn('soundId refusé (privé, coupé ou inexistant)', { postId: ctx.postId, soundId: track.soundId });
        continue;
      }
      await this.recordUsage(ctx, track.soundId!, track, allowed.get(track.soundId!) ?? null);
    }
  }
```

La signature gagne un quatrième paramètre :

```ts
  private async recordUsage(
    ctx: CaptureContext,
    soundId: string,
    track: CaptureTrack,
    soundDurationMs: number | null,
  ): Promise<void> {
```

Et les **deux** sites d'appel de `captureOne` le passent — `media.duration ?? null` dans les deux cas (son déjà existant, et son fraîchement créé).

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared && npx prisma generate --generator client
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && bun run test -- services/posts/__tests__/captureTracks.test.ts services/posts/__tests__/SoundCaptureService.test.ts
```

Attendu : PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/prisma/schema.prisma services/gateway/src/services/posts/SoundCaptureService.ts services/gateway/src/services/posts/captureTracks.ts services/gateway/src/services/posts/__tests__/
git commit -m "feat(gateway/sounds): windowAdjustedAt, et endMs plafonne a la duree reelle du son

windowAdjustedAt distingue une fenetre choisie par l'auteur d'un defaut
accepte. Sans lui, un point d'entree par defaut derive de l'agregat se
nourrirait de sa propre sortie et se figerait sur le premier maximum.

Le plafond ferme le cas du blob sans intrinsicDuration : endMs derive de la
fenetre timeline debordait des que la piste boucle. Il exige la base, donc
il vit dans le service et non dans la fonction pure."
```

---

### Task 7: Gate complet et note de déploiement

**Files:**
- Create: `tasks/2026-08-02-lot-a-serveur-deploiement.md`

**Interfaces:**
- Consumes: tout le lot.
- Produces: la note qui fait foi pour les opérations manuelles de production.

- [ ] **Step 1: Lancer la suite gateway complète**

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared && npx prisma generate --generator client && bun run build
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && bun run test
```

Attendu : aucune régression. Si une suite rouge n'a aucun rapport avec ce lot, vérifier d'abord que les deux prérequis ci-dessus ont bien été exécutés — c'est la cause habituelle.

- [ ] **Step 2: Vérifier la compilation TypeScript**

```bash
cd services/gateway && npx tsc --noEmit
```

Attendu : 0 erreur. Les tests gateway ne remplacent pas `tsc` — une suite verte peut coexister avec un type cassé.

- [ ] **Step 3: Écrire la note de déploiement**

Créer `tasks/2026-08-02-lot-a-serveur-deploiement.md` contenant :

- Le champ `SoundUsage.windowAdjustedAt` est **additif et nullable** : aucune migration de données. Mais l'entrypoint de production ne lance **aucune** migration — la colonne apparaît d'elle-même en MongoDB, rien à faire, et c'est justement pour ça qu'aucun index n'est posé dans ce lot.
- `Sound.waveform` n'est **pas** rétro-rempli : la bibliothèque existante garde son tableau vide. Seuls les sons créés après ce déploiement portent une forme d'onde. Une passe rétroactive reste possible plus tard mais n'est pas dans ce lot.
- Les lignes `SoundUsage` existantes portent des coordonnées de **timeline** et sont inexploitables. On ne les migre pas : rien ne les lit aujourd'hui. Le lot cesse simplement d'en produire de fausses.
- Vérification post-déploiement : publier une story avec un son emprunté depuis un client **antérieur** au lot client, et vérifier que la ligne `SoundUsage` porte `startMs: 0` et `endMs` égal à la durée de la piste — c'est la propriété de compatibilité qui rend ce lot livrable seul.

- [ ] **Step 4: Commit**

```bash
git add tasks/2026-08-02-lot-a-serveur-deploiement.md
git commit -m "docs(tasks): note de deploiement du lot A (fenetre de source, serveur)"
```

---

## Couverture du spec par ce plan

| Exigence du spec | Tâche |
|---|---|
| § 9.1 — `SoundUsage` en coordonnées de source | 2 |
| § 9.1 — repli quand `intrinsicDuration` est absent | 6 |
| § 9.2 — `windowAdjustedAt` | 6 |
| § 9.3 — écrivain de `Sound.waveform`, chemin capture | 3, 4 |
| § 9.3 — écrivain de `Sound.waveform`, chemin upload manuel | 5 |
| § 9.4 — bornes Zod sur les **deux** schémas | 1 |
| § 12 test 14 — tests de la fonction pure et des bornes | 1, 2, 3, 6 |

Le reste du spec (§ 3 à § 8, § 10, § 11) relève des plans 2 à 7 de la série.
