# Fenêtre de source — Lot B (miroir web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre au web sa parité avec iOS sur les fenêtres de piste — il en ignore aujourd'hui la moitié — et lui faire lire la fenêtre de source.

**Architecture:** Deux fonctions de `apps/web/lib/story-transforms.ts`. `parseAudioObjects` ne lit **ni** `startTime`, **ni** `duration`, **ni** `loop` : le lecteur web ne peut donc représenter aucune fenêtre temporelle audio. `computeStoryDurationMs` se veut le miroir de `StorySlide.contentDerivedDuration()` côté iOS, mais diverge sur trois points indépendants de ce chantier. On répare d'abord la parité, puis on ajoute `sourceStart`.

**Tech Stack:** TypeScript strict, Next.js 15, Jest.

## Global Constraints

- Commandes depuis `apps/web/`.
- **Aucun `any`.** Les objets d'effets viennent du serveur mais transitent par un blob JSON non typé : chaque champ est vérifié, jamais coercé. Le fichier utilise déjà ce style — le suivre.
- Le miroir de référence est `StoryEffects.contentDerivedDuration` dans `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1298-1338`. **Toute divergence est un bug**, y compris celles qui préexistent à ce lot.
- Ce lot est **indépendant** des lots A et K et de tout le travail iOS. Il peut être livré en parallèle.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `apps/web/components/v2/StoryViewer.tsx:66-74` | Type `StoryAudioObjectData` | Modifier |
| `apps/web/lib/story-transforms.ts:107-129` | `parseMediaObjects` | Modifier |
| `apps/web/lib/story-transforms.ts:131-149` | `parseAudioObjects` | Modifier |
| `apps/web/lib/story-transforms.ts:222-269` | `computeStoryDurationMs` | Modifier |
| `apps/web/__tests__/lib/story-transforms.test.ts` | Tests | Modifier |

---

### Task 1: `computeStoryDurationMs` redevient le miroir d'iOS

Trois divergences, toutes préexistantes à ce chantier, toutes visibles à l'œil nu une fois les deux fonctions côte à côte. Elles se corrigent ensemble parce qu'elles portent sur le même calcul.

| | iOS (`StoryModels.swift:1323-1337`) | Web (`story-transforms.ts:263-268`) |
|---|---|---|
| Fenêtre d'un média | `(startTime ?? 0) + duration` | `duration` seule — `startTime` ignoré |
| Fenêtres audio | comptées comme les médias | **totalement ignorées** |
| Cible du texte | `max(textDur, 6 s, plus longue fenêtre)` | `max(textDur, 6 s)` — la plus longue fenêtre n'entre pas |

**Files:**
- Modify: `apps/web/lib/story-transforms.ts:222-269`
- Test: `apps/web/__tests__/lib/story-transforms.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `computeStoryDurationMs(effects: Record<string, unknown> | undefined): number` — signature inchangée, valeurs corrigées.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
describe('computeStoryDurationMs — parité avec contentDerivedDuration (iOS)', () => {
  it('test_foregroundMediaWindow_countsItsStartTime', () => {
    // iOS mesure la FENÊTRE `startTime + duration`. Le web ne comptait que
    // `duration` : une vidéo de 4 s posée à 10 s donnait 6 s de slide au lieu
    // de 14 s, et se faisait couper à la lecture.
    expect(computeStoryDurationMs({
      mediaObjects: [{ id: 'm1', mediaType: 'video', startTime: 10, duration: 4 }],
    })).toBe(14000);
  });

  it('test_audioWindow_isCounted', () => {
    // Les fenêtres audio n'entraient dans AUCUN terme du calcul web.
    expect(computeStoryDurationMs({
      audioPlayerObjects: [{ id: 'a1', startTime: 2, duration: 20 }],
    })).toBe(22000);
  });

  it('test_longestWindow_raisesTheTextTarget', () => {
    // iOS : `target = max(textDur, 6, longestData)`. Sans le troisième terme,
    // l'arrondi de boucle du fond se calculait sur une cible trop basse.
    expect(computeStoryDurationMs({
      audioPlayerObjects: [
        { id: 'bg', isBackground: true, duration: 5 },
        { id: 'a1', startTime: 0, duration: 17 },
      ],
    })).toBe(20000); // ceil(17 / 5) * 5 = 20
  });

  it('test_staticSlide_stillDefaultsToSixSeconds', () => {
    // Garde de non-régression du comportement nominal.
    expect(computeStoryDurationMs({})).toBe(6000);
    expect(computeStoryDurationMs(undefined)).toBe(6000);
  });

  it('test_pinnedTimelineDuration_stillWinsOverEverything', () => {
    // Priorité 0 inchangée (`StoryModels.swift:1376`).
    expect(computeStoryDurationMs({
      timelineDuration: 3,
      audioPlayerObjects: [{ id: 'a1', duration: 60 }],
    })).toBe(3000);
  });
});
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd apps/web && bun run test -- story-transforms
```

Attendu : ÉCHEC des trois premiers. Le premier rapporte 6000 au lieu de 14000.

- [ ] **Step 3: Écrire l'implémentation**

Remplacer le bloc qui va de `const target = …` jusqu'au `return` final de `computeStoryDurationMs` par :

```ts
  // MIROIR EXACT de `StoryEffects.contentDerivedDuration`
  // (packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1323-1337).
  // Toute divergence se voit à la lecture : la slide se coupe avant la fin
  // d'un média, ou s'étire au-delà. Trois termes, dans cet ordre.

  // 1. La plus longue FENÊTRE, tous types confondus. `startTime + duration`,
  //    et non `duration` seule : une vidéo posée à 10 s finit à 14 s, pas à 4.
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
```

`positiveNumber` et `DEFAULT_STATIC_DURATION_S` existent déjà dans le fichier ; ne pas les redéfinir. La variable `fgMediaMax` disparaît — la supprimer, elle n'a plus d'usage.

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd apps/web && bun run test -- story-transforms
```

Attendu : PASS, y compris les suites existantes `story-transforms-extended` et `story-transforms-fidelity`. **Si l'une d'elles rougit, la lire avant de la modifier** : elle encode peut-être la divergence qu'on vient de corriger, auquel cas c'est son attente qui est fausse — mais elle peut aussi protéger un comportement légitime.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/story-transforms.ts apps/web/__tests__/lib/story-transforms.test.ts
git commit -m "fix(web/story): computeStoryDurationMs redevient le miroir exact d'iOS

Trois divergences, toutes anterieures a ce chantier : startTime ignore sur
la fenetre d'un media, fenetres audio pas comptees du tout, et la plus
longue fenetre absente de la cible sur laquelle s'arrondit la boucle du
fond. Une video de 4 s posee a 10 s donnait 6 s de slide au lieu de 14."
```

---

### Task 2: `parseAudioObjects` lit enfin les fenêtres

Cette fonction alimente le lecteur web (`postToStoryData` → `StoryViewer`). Elle ne retient que la position et le volume : aucune fenêtre temporelle n'atteint la vue. Ajouter `sourceStart` sans réparer ça n'aurait aucun sens.

**Files:**
- Modify: `apps/web/components/v2/StoryViewer.tsx:66-74` (`StoryAudioObjectData`)
- Modify: `apps/web/lib/story-transforms.ts:131-149`
- Test: `apps/web/__tests__/lib/story-transforms.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `StoryAudioObjectData` gagne `startTime?: number`, `duration?: number`, `loop?: boolean`, `sourceStart?: number`, `intrinsicDuration?: number`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
describe('parseAudioObjects — fenêtres', () => {
  const base = { id: 'a1', postMediaId: 'pm1' };

  it('test_timelineWindowAndLoop_areRead', () => {
    const [audio] = postToStoryData(makePostWithEffects({
      audioPlayerObjects: [{ ...base, startTime: 2, duration: 8, loop: true }],
    })).slides[0].audioObjects!;
    expect(audio.startTime).toBe(2);
    expect(audio.duration).toBe(8);
    expect(audio.loop).toBe(true);
  });

  it('test_sourceWindow_isRead', () => {
    // Fenêtre de SOURCE : où l'on entre dans le fichier. À ne pas confondre
    // avec `startTime`, qui dit quand la piste démarre sur la timeline.
    const [audio] = postToStoryData(makePostWithEffects({
      audioPlayerObjects: [{ ...base, sourceStart: 12, intrinsicDuration: 90 }],
    })).slides[0].audioObjects!;
    expect(audio.sourceStart).toBe(12);
    expect(audio.intrinsicDuration).toBe(90);
  });

  it('test_absentOrNonNumericFields_stayUndefined', () => {
    const [audio] = postToStoryData(makePostWithEffects({
      audioPlayerObjects: [{ ...base, startTime: 'x', duration: null, loop: 'yes' }],
    })).slides[0].audioObjects!;
    expect(audio.startTime).toBeUndefined();
    expect(audio.duration).toBeUndefined();
    // `loop` n'est vrai que sur un booléen `true` strict, jamais sur une
    // chaîne : le blob vient du réseau.
    expect(audio.loop).toBeUndefined();
  });
});
```

`makePostWithEffects` : reprendre le helper de construction de `Post` déjà utilisé par `story-transforms.test.ts`. **Le lire dans le fichier avant d'écrire ces tests** ; s'il n'existe pas sous ce nom, utiliser la fabrique qui s'y trouve plutôt que d'en créer une seconde.

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd apps/web && bun run test -- story-transforms
```

Attendu : ÉCHEC de compilation TypeScript — `startTime` n'existe pas sur `StoryAudioObjectData`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `StoryViewer.tsx`, ajouter à `StoryAudioObjectData` :

```ts
  /** Fenêtre TIMELINE : quand la piste joue sur la slide. */
  startTime?: number;
  duration?: number;
  loop?: boolean;
  /** Fenêtre de SOURCE : où l'on entre dans le fichier. `undefined` ≡ 0. */
  sourceStart?: number;
  intrinsicDuration?: number;
```

Dans `parseAudioObjects`, ajouter au `result.push({ … })` :

```ts
      startTime: typeof r.startTime === 'number' ? r.startTime : undefined,
      duration: typeof r.duration === 'number' ? r.duration : undefined,
      loop: r.loop === true ? true : undefined,
      sourceStart: typeof r.sourceStart === 'number' ? r.sourceStart : undefined,
      intrinsicDuration: typeof r.intrinsicDuration === 'number' ? r.intrinsicDuration : undefined,
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd apps/web && bun run test -- story-transforms
```

Attendu : PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/v2/StoryViewer.tsx apps/web/lib/story-transforms.ts apps/web/__tests__/lib/story-transforms.test.ts
git commit -m "feat(web/story): parseAudioObjects lit les fenetres timeline ET source

La fonction ne retenait que position et volume : aucune fenetre temporelle
n'atteignait le lecteur web. Ajouter sourceStart sans reparer ca n'aurait
eu aucun sens."
```

---

### Task 3: `parseMediaObjects` lit la fenêtre de source

**Files:**
- Modify: `apps/web/lib/story-transforms.ts:107-129`
- Modify: `apps/web/components/v2/StoryViewer.tsx` (`StoryMediaObjectData`)
- Test: `apps/web/__tests__/lib/story-transforms.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `StoryMediaObjectData` gagne `sourceStart?: number`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
  it('test_mediaObject_sourceStart_isRead', () => {
    const [media] = postToStoryData(makePostWithEffects({
      mediaObjects: [{ id: 'm1', postMediaId: 'pm1', x: 0.5, y: 0.5, mediaType: 'video', sourceStart: 3.5 }],
    })).slides[0].mediaObjects!;
    expect(media.sourceStart).toBe(3.5);
  });

  it('test_mediaObject_absentSourceStart_isUndefined', () => {
    const [media] = postToStoryData(makePostWithEffects({
      mediaObjects: [{ id: 'm1', postMediaId: 'pm1', x: 0.5, y: 0.5, mediaType: 'video' }],
    })).slides[0].mediaObjects!;
    expect(media.sourceStart).toBeUndefined();
  });
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

```bash
cd apps/web && bun run test -- story-transforms
```

Attendu : ÉCHEC de compilation — `sourceStart` inconnu sur `StoryMediaObjectData`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `StoryViewer.tsx`, sur `StoryMediaObjectData` :

```ts
  /** Fenêtre de SOURCE : où l'on entre dans le fichier. `undefined` ≡ 0. */
  sourceStart?: number;
```

Dans `parseMediaObjects`, au `result.push({ … })` :

```ts
      sourceStart: typeof r.sourceStart === 'number' ? r.sourceStart : undefined,
```

- [ ] **Step 4: Lancer le test pour le voir passer**

```bash
cd apps/web && bun run test -- story-transforms
```

Attendu : PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/v2/StoryViewer.tsx apps/web/lib/story-transforms.ts apps/web/__tests__/lib/story-transforms.test.ts
git commit -m "feat(web/story): parseMediaObjects lit sourceStart"
```

---

### Task 4: Gate

- [ ] **Step 1: Suite web complète**

```bash
cd apps/web && bun run test
```

Attendu : aucune régression. `tsc` n'est **pas** un gate propre sur ce paquet (erreurs préexistantes) — ne pas s'en servir pour juger ce lot ; s'appuyer sur la suite Jest et sur `next build` si un doute subsiste.

- [ ] **Step 2: Commit s'il reste quoi que ce soit**

```bash
git status --porcelain
```

---

## Couverture du spec par ce plan

| Exigence du spec | Tâche |
|---|---|
| § 2.12 / § 10 — `parseAudioObjects` lit `startTime`, `duration`, `loop` | 2 |
| § 10 — `parseAudioObjects` lit `sourceStart` | 2 |
| § 10 — `parseMediaObjects` lit `sourceStart` | 3 |
| § 2.12 / § 10 — `computeStoryDurationMs` redevient le miroir | 1 |
| § 5.2 — période de boucle = `excerptDuration` côté web | **hors de ce lot** : la période reste `duration` tant qu'iOS ne l'a pas changée non plus (lot F). À faire dans le même geste que le lot F pour que les deux miroirs bougent ensemble. |
