# Iteration 237 — CanvasV3 : deux intervalles temporels sans invariant `end ≥ start` (schéma) et un convertisseur v1→v3 qui pouvait émettre `bounds: {start:N, end:0}`

> **Note de renumérotation (collision de numéro).** Ce travail a été mené et mergé (PR #3240) sous
> le numéro « itération 236 », en parallèle d'une autre session qui portait AUSSI le numéro 236
> (PR #3237, `socketTranscriptionSegmentSchema`). #3237 ayant mergé en premier, le merge add/add a
> concaténé les deux documents dans les mêmes fichiers `iteration-236-*.md` sur `main`. Cette passe
> (itération 237) répare la corruption : #3237 conserve le numéro 236, ce travail CanvasV3 est
> renuméroté 237. Contenu inchangé par ailleurs.

## Protocole (démarrage)
`main` @ `794dd88e` (dernier commit : `Merge remote-tracking branch 'origin/main'`).
Branche `claude/brave-archimedes-9e4nuc` alignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts`, puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite vitest
partagée verte au départ (2320/2320 après merges), suite `canvasV3` gateway verte au départ.

**Audit anti-doublon** (9 PRs ouvertes au départ) : les PRs jcnm en vol portent les itérations
236→239 (composer attachment-ladder Android, message-summary-kind, un fix transcription live,
picker de transfert iOS) + 5 PRs Dependabot. **Aucune PR ouverte ne touche
`packages/shared/types/canvas-v3.ts` ni `services/gateway/src/services/posts/storyEffectsV3.ts`** —
zéro chevauchement de fichier. La cible n'apparaît pas non plus dans les « Améliorations futures »
des itérations 234/235.

## Sélection : **Priorité 1 — durcissement de contrat sur une feature récente (Canvas V3, feature-flag)**

Canvas V3 est la feature de story/reel la plus récente (`45ae1777 feat(shared): CanvasV3 dans types/`,
`0b8e588d feat(gateway): convertisseur v1 vers v3 a la lecture`, `9c31d1ca feat(gateway): ecriture
stricte storyEffects sous CANVAS_V3_WRITE_STRICT`, `2d27e5da feat(gateway): lecture v3 branchee`) —
un pipeline de conversion tolérant + un schéma Zod utilisé comme frontière de confiance à l'écriture
stricte (`400 CANVAS_INVALID`). C'est exactement la classe « feature récemment développée » que la
stratégie priorise.

L'itération 234 avait établi comme **norme du codebase** l'invariant temporel `end ≥ start` sur
les segments (`transcriptionSegmentSchema`, `packages/shared/utils/attachment-validators.ts`). Ce
correctif étend la même norme à **deux autres intervalles temporels dans un fichier différent** —
et referme au passage un bug latent du convertisseur v1→v3 qui pouvait produire des intervalles
corrompus.

## Current state (avant correctif)

### 1) `TimingSchema` (objets de canvas, `packages/shared/types/canvas-v3.ts:21-26`)

```ts
const TimingSchema = z.object({
  start: z.number().min(0).optional(),
  end:   z.number().min(0).optional(),
  rate:  z.number().min(0.25).max(4).optional(),
  keyframes: z.array(KeyframeSchema).max(60).optional(),
});
```

Les deux bornes sont contraintes `min(0)` **individuellement**, mais **aucune relation entre elles**
n'est vérifiée. Un objet `{ timing: { start: 4, end: 1 } }` — un intervalle qui se termine AVANT
de commencer — passait la validation.

### 2) `BackgroundSoundSchema.bounds` (fond sonore, `canvas-v3.ts:59`)

```ts
bounds: z.object({ start: z.number().min(0), end: z.number().min(0) }).optional(),
```

Mêmes bornes, mêmes garanties verticales, mais aucune contrainte relationnelle. Un trim
d'audio `{ bounds: { start: 17, end: 2 } }` passait sans broncher.

### 3) `convertV1ToV3` (`services/gateway/src/services/posts/storyEffectsV3.ts:195-197`)

```ts
...(typeof blob.backgroundAudioStart === 'number' || typeof blob.backgroundAudioEnd === 'number'
  ? { bounds: { start: num(blob.backgroundAudioStart, 0), end: num(blob.backgroundAudioEnd, 0) } }
  : {}),
```

`num(..., 0)` remplit toute borne manquante par `0`. Conséquence : un blob v1 qui porte
`backgroundAudioStart: 5` mais AUCUN `backgroundAudioEnd` produisait `bounds: { start: 5, end: 0 }`.
`end` avant `start`. Un intervalle corrompu, servi à des clients v3 sur le chemin de lecture
(`convertStoryEffectsForWire` → `negotiateWireStoryEffects`).

## Problems identified

1. **Invariant temporel absent — schéma.** `end ≥ start` est une propriété DÉFINITIONNELLE d'un
   intervalle de temps ; sa violation décrit une donnée corrompue. La sanité numérique était
   affirmée verticalement (chaque borne `min(0)`) mais pas relationnellement — même diagnostic
   que l'itération 234, appliqué à deux intervalles différents dans un fichier différent.

2. **Convertisseur v1→v3 pouvait fabriquer un intervalle corrompu.** Le pattern
   `num(x, 0)` masquait « borne absente » derrière « borne = 0 », un choix DESTRUCTEUR pour un
   intervalle : `start: 5, end: 0` n'a aucun sens temporel. Ce chemin était NON couvert par les
   tests existants (le seul fixture v1→v3 golden porte les deux bornes présentes et ordonnées).

3. **Interaction schéma×convertisseur.** Poser l'invariant `end ≥ start` au schéma SANS corriger
   le convertisseur ferait immédiatement échouer la validation d'un blob v1 légitime servi via
   `negotiateWireStoryEffects` sous `CANVAS_V3_WRITE_STRICT`. Les deux se corrigent nécessairement
   ensemble — d'où un correctif unique qui referme les deux gaps en un mouvement.

## Root causes

- **Schéma.** Écrit champ-par-champ, sans clause `.refine` cross-field — même schéma d'omission
  qu'itération 234, dans un fichier plus récent (Canvas V3 date du lot A).
- **Convertisseur.** Le helper `num(v, d)` est TROP tolérant sur un contexte où la « donnée
  manquante » ne peut PAS se replier sur `0` sans corrompre le sens du champ. Les deux bornes
  d'un intervalle sont couplées : l'omission de l'une doit propager à l'omission de l'objet
  entier, pas à un défaut arbitraire.

## Business impact

- **Faible mais réel.** `bounds` corrompu = un client v3 tenterait de jouer un audio « de 5s à 0s »,
  soit ignoré (comportement client dépendant), soit joué en entier (défaut), soit affiché comme
  erreur silencieuse. Sur `timing.end < start` d'un objet texte : l'objet ne s'affiche jamais (sa
  fenêtre est vide/négative). Le gain est **défensif** : fermer la porte avant qu'un backend
  futur / un éditeur mal codé / un blob v1 partiel ne fasse passer une donnée corrompue jusqu'aux
  clients.

## Technical impact

- **Aucun comportement observable ne change pour les données valides existantes.** Le fixture
  golden (`v1-legacy-full.json`) porte les deux bornes ordonnées (2, 17) — l'or reste vert.
  `end === start` (durée nulle) reste accepté partout — la borne est `≥`, pas `>`.
- **Blast radius identique en nature** à la contrainte `min(0)` préexistante : le schéma est
  utilisé via `safeParse` dans le rejet `CANVAS_INVALID`, il ne throw jamais.
- **Convertisseur tolérant.** Une borne manquante ou inversée dégrade en « pas de trim » (le clip
  audio entier joue), jamais en donnée corrompue. Ce comportement est ALIGNÉ sur le style annoncé
  par le convertisseur (« tolérant, golden gelé », `0b8e588d`).
- **Types inchangés.** `z.infer<typeof CanvasV3Schema>` inchangé — `.refine` préserve le type
  inféré, et le `.optional()` reste après le refine pour `bounds`.

## Risk assessment

- **Négligeable.** Recherche exhaustive :
  - **Fixtures.** Aucun fixture v3 ne pose `end < start` (grep exhaustif sur `bounds`/`timing`).
    Le fixture v1 golden porte les deux bornes ordonnées.
  - **Tests.** Aucun test ne pose `end < start`. Les tests d'écriture stricte (`storyEffectsUpgradeGate`,
    `storyEffectsMediaClaim`, `storyEffectsWire`) et de traduction texte (`storyTextObjectTranslationV3`)
    restent verts — 130/130 sur le pattern `storyEffects|storyTextObject|canvasV3`.
  - **Extend/pick.** Aucun consommateur n'appelle `.extend()`/`.shape`/`.merge()`/`.pick()` sur
    `TimingSchema` ou `BackgroundSoundSchema`.
- **Le refine préserve la structure `z.optional()`** pour `bounds` (le `.refine` s'applique à
  l'objet interne AVANT le `.optional()` extérieur) — un `sound` sans `bounds` reste valide.

## Proposed improvements

### Schéma (`packages/shared/types/canvas-v3.ts`)

```ts
const TimingSchema = z.object({ start, end, rate, keyframes })
  .refine((t) => t.start === undefined || t.end === undefined || t.end >= t.start, {
    path: ['end'],
    message: 'TIMING_END_BEFORE_START',
  });

BackgroundSoundSchema.bounds:
  z.object({ start: min(0), end: min(0) })
    .refine((b) => b.end >= b.start, { path: ['end'], message: 'BOUNDS_END_BEFORE_START' })
    .optional();
```

Le refine sur `TimingSchema` est **conditionnel** (les deux bornes sont optionnelles individuellement ;
une timing partielle `{ start }` seule ou `{ keyframes }` seule reste valide). Le refine sur `bounds`
est **inconditionnel** (les deux bornes sont requises). Durée nulle acceptée dans les deux cas.

### Convertisseur (`services/gateway/src/services/posts/storyEffectsV3.ts`)

`bounds` ne s'émet QUE comme un intervalle complet et valide :
- les deux bornes doivent être des `number` finis
- `end >= start`

Sinon → pas de `bounds` (dégradation en « pas de trim », le clip entier joue).

## Expected benefits

- Contrat CanvasV3 complet et interne-cohérent sur les intervalles temporels (schéma × convertisseur).
- Rejet défensif des données corrompues au JSON boundary, gracieusement (safeParse).
- Convertisseur v1→v3 qui n'émet plus jamais de donnée corrompue, même sur blob v1 partiel.
- Norme du codebase (`end ≥ start`, itération 234) étendue au fichier le plus récent du lot A.

## Implementation complexity

- **Faible.** 1 fichier schéma (+2 clauses `.refine`), 1 fichier convertisseur (+garde de validité),
  8 nouveaux tests (5 schéma + 3 convertisseur).

## Validation criteria

- [x] RED : 2 tests schéma prouvent l'acceptation actuelle de `end < start` (timing objet + bounds
      audio) AVANT correctif.
- [x] GREEN schéma : 13/13 tests `canvasV3.schema` verts (5 existants + 5 timing + 3 bounds).
- [x] GREEN convertisseur : 3 nouveaux tests `convertV1ToV3 — bounds audio ne sortent jamais un
      intervalle corrompu` verts (ordre préservé, borne unique droppée, borne inversée droppée).
- [x] Suite étendue `storyEffects|storyTextObject|canvasV3` : **130/130 verts** (11 suites, aucune
      régression sur wire negotiation / strict-write / media claim / text-object translation).
- [x] Suite shared vitest complète : **2328/2328 verts** (aucune régression au niveau des
      exports canvas-v3 côté shared).
- [x] `tsc --noEmit` propre sur `packages/shared` et `services/gateway` — types inchangés.
- [x] Fixture golden `v1-legacy-full.v3.json` inchangé (bornes ordonnées → validation inchangée).
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)

- **Parité web/iOS.** Les clients web (`apps/web`) et iOS (`packages/MeeshySDK` renderer canvas)
  qui consommeront `CanvasV3` doivent également refuser un intervalle corrompu à l'affichage —
  au moins par tolérance silencieuse (borne inversée → pas de trim, pas de crash). Le schéma Zod
  côté serveur est le premier rempart ; le rendu côté client reste à auditer une fois les targets
  Swift/TS accessibles.
- **Monotonie inter-keyframes.** `KeyframeSchema.time` n'est pas contraint d'être monotone dans un
  tableau. Idem `transcriptionSegmentSchema[]` (itération 234, améliorations futures). Contrainte
  de collection, plus lourde, à peser séparément.
- **Défauts arbitraires dans le convertisseur.** Le pattern `num(v, 0)` reste utilisé pour d'autres
  champs (volume, position, échelle). Un audit dédié pourrait identifier lesquels tolèrent `0` comme
  défaut sémantique valide et lesquels devraient dégrader en « champ absent » comme `bounds` ici.
