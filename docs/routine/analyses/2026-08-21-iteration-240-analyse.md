# Iteration 240 — `resolveRiverLivingLanes` rendait les couloirs vivants en ordre de NAISSANCE, pas « par colonne croissante » (bug de navigation latérale de la Rivière, miroir TS+Swift)

## Protocole (démarrage)
`main` @ `c49ebe61` (`feat(android/chat): debounce the sub-200ms sending clock glyph (parity iOS) (#3256)`).
Branche `claude/brave-archimedes-do385b` réalignée sur `origin/main` au départ (0 avance / 0 retard).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface **testable localement** =
TypeScript (shared/gateway/web). Setup parité : `bun install --ignore-scripts` (3861 paquets),
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite vitest
partagée verte au départ (2328/2328), suite `services/gateway/.../call-schemas.test.ts` verte (78).

**Note de continuité :** `docs/routine/` n'a jamais été commité sur `main` (les analyses/plans des
itérations antérieures vivaient en fichiers de travail éphémères du conteneur, perdus au reclonage).
Cette itération RÉTABLIT le répertoire dans git pour que l'historique persiste désormais.

**Audit anti-doublon** (10 PRs jcnm + Dependabot ouvertes) : #3255 (MyMentionsQuerySchema),
#3253 (chunk), #3249 (rôles casse), #3245 (v1→v3 timing), #3243 (`time-range.ts` brique partagée
`endMs>=startMs`), #3242 (écoute continue endMs). **Aucune ne touche `packages/shared/utils/river-lanes.ts`
ni le miroir Swift `RiverLaneResolver.swift`** — zéro chevauchement.

## Sélection : **Priorité 1 — bug de correction sur une feature RÉCENTE (la Rivière, livrée 2026-08-17)**

La Rivière (`R-130` + amendement R2, `tasks/lentille-workshop-execution.md` §7bis) est la loi de
lecture de conversation la plus récente. Un balayage de la surface pure a écarté plusieurs faux
positifs (le code partagé est très durci) ; le seul défaut de comportement confirmé,
**empiriquement reproduit**, est un ordre de sortie de `resolveRiverLivingLanes` qui contredit son
propre contrat et casse la navigation latérale dans le layout à colonnes partagées.

## Current state (avant correctif)

`resolveRiverLivingLanes(geometry, rank)` documente rendre « les branches VIVANTES à ce rang,
**par colonne croissante** » — ce que la navigation latérale traverse. L'implémentation ne triait
PAS :

```ts
return geometry.lanes
  .filter((lane) => spanCovering(lane, rank) !== undefined)
  .map((lane) => lane.laneIndex);   // ← ordre de geometry.lanes = ordre de NAISSANCE
```

`geometry.lanes` est en ordre de naissance (`orderLaneIds` : lecteur, puis rang de naissance, puis
id). Cet ordre COÏNCIDE avec l'ordre de colonne **tant que la rivière n'a pas partagé de colonnes**
(`assignColumns` identité, ≤ `maxLanes` voix). Mais dans le layout à **colonnes PARTAGÉES**
(`packColumns`, plus de voix que de couloirs mais jamais plus de `maxLanes` vivantes à la fois —
layout reste `'lanes'`, PAS `'serialized'`), une voix tardive réutilise une colonne basse libérée :
un rang peut alors présenter ses vivantes comme `[1, 2, 0]`.

`resolveRiverStep` (navigation latérale) dépend de l'ordre croissant :

```ts
const reachable = direction === 'right'
  ? living.filter((laneIndex) => laneIndex > cursor.laneIndex)          // [0] = plus proche à droite
  : living.filter((laneIndex) => laneIndex < cursor.laneIndex).reverse(); // [0] = plus proche à gauche
```

Sur `living = [1, 2, 0]`, un pas depuis la colonne 2 vers la gauche calcule
`filter(<2) = [1, 0]`, `reverse() = [0, 1]`, `[0] = 0` — il **saute par-dessus la colonne 1
(la voisine immédiate)** pour se poser sur la colonne 0. Bug de navigation observable.

### Preuve empirique

Recherche exhaustive (`scripts` de probe, 300k tirages) → scénario minimal 6 messages,
`maxLanes 3, minVoices 2` : `c@0 d@1 b@2 a@3 c@4 d@5`. `geometry.lanes` = `c:0, d:1, b:2, a:0`
(naissance). Au rang 3, `c` est morte ; vivantes = `d(1), b(2), a(0)` → **`[1, 2, 0]`** avant
correctif. Un pas « gauche » depuis la colonne 2 atterrissait sur `{laneIndex:0, rank:3}` au lieu de
`{laneIndex:1, rank:1}` (la voisine immédiate `d`).

## Problems identified
1. **Contrat violé.** Le docstring promet « par colonne croissante » ; l'implémentation rend l'ordre
   de naissance. Faux dès qu'une colonne se partage.
2. **Navigation latérale erronée.** Le pas gauche/droite peut sauter une branche adjacente.
3. **Dérive de loi jumelle (drift TS↔Swift).** Le miroir Swift (`RiverLaneResolver.swift`) avait
   COPIÉ le code TS non trié ET RATIONALISÉ le défaut dans son docstring
   (« ce n'est un ordre de colonne strictement croissant que tant que la rivière n'a pas partagé de
   colonnes ») + un commentaire de `resolveRiverStep` décrivant une sémantique « ordre de naissance ».
   Les deux plateformes portaient donc le même bug de façon cohérente — exactement le piège de
   « deux jumeaux qui dérivent en silence » que le repo interdit.

## Root causes
- La coïncidence « ordre de naissance = ordre de colonne » tient dans le cas NON partagé (le seul
  couvert par les tests et les vecteurs jusqu'ici). Le layout à colonnes partagées (amendement §7ter,
  `RIVER_MAX_LANES`) est arrivé après, et le tri manquant n'a jamais été rattrapé — le cas partagé
  n'avait aucun témoin sur `resolveRiverLivingLanes`/`resolveRiverStep`.

## Business impact
- **Faible mais réel et user-facing** : sur une conversation animée lue en Rivière (≥ 3 voix
  simultanées dans une fenêtre qui partage ses colonnes), le balayage horizontal saute une branche.
  Nul rapport terrain à ce jour (la Rivière est encore derrière son drapeau `riviere_mode`, défaut
  OFF), donc **durcissement d'une feature pré-GA** — le moment idéal pour corriger, avant tout
  consommateur runtime.

## Technical impact
- **TS :** 1 ligne (`.sort((a, b) => a - b)`) + docstring étoffé (le POURQUOI du tri). Corrige d'un
  coup `resolveRiverLivingLanes` ET `resolveRiverStep` (qui en dépend) — aucun changement de
  `resolveRiverStep` lui-même.
- **Vecteurs inter-plateformes :** AUCUN vecteur existant ne change (vérifié : 0 vecteur `river-step`
  n'exerce un pas latéral sur une géométrie à colonnes partagées ; `resolveRiverLivingLanes` n'entre
  pas dans la sortie de `resolveRiverLanes` stockée). Les 4 suites river (146 cas) restent vertes.
- **Swift :** miroir `.sorted()` + réécriture des deux blocs de doc devenus faux (docstring
  `resolveRiverLivingLanes`, commentaire de `resolveRiverStep`) + 1 XCTest packed transposé. Les
  tests Swift existants (`_inColumnOrder`, sérialisé) restent verts (cas non partagés). iOS CI valide.
- **Android :** aucun miroir river-lanes (phase 2, non implémenté) — rien à toucher.
- **`tsc` :** 0 nouvelle erreur (aucun type inféré ne change).

## Risk assessment
- **Faible.** Le tri est un ordre total déterministe : les colonnes vivantes à un même rang sont
  distinctes par construction (`packColumns` n'installe jamais deux segments qui se croisent dans une
  même colonne). Le layout sérialisé (`[0]`/`[]`) et le cas non partagé (déjà croissant) sont
  inchangés. Full shared suite 2330/2330 verte après correctif.
- **Rollback :** retirer le `.sort()` (TS) / `.sorted()` (Swift) + les 2 tests TS + 1 test Swift.

## Proposed improvements (exécutées)
1. **RED** : +2 cas dans `packages/shared/__tests__/river-lanes.test.ts` — l'ordre croissant des
   vivantes en colonnes partagées, et l'atterrissage d'un pas latéral sur la voisine immédiate. Les
   deux tombent rouge sur `main` (`[1,2,0]`, atterrissage col 0/rang 3).
2. **GREEN** : `.sort((a, b) => a - b)` dans `resolveRiverLivingLanes` (TS) + `.sorted()` (Swift).
3. **Cohérence** : docstrings TS + Swift réécrits pour dire la vérité (tri PORTANT, pas cosmétique) ;
   commentaire Swift de `resolveRiverStep` réaligné. +1 XCTest packed côté Swift.

## Expected benefits
- **Navigation latérale correcte** en Rivière à colonnes partagées (aucun saut de branche).
- **Contrat honoré et jumeaux réalignés** : TS et Swift portent la même loi, documentée à
  l'identique — fin de la dérive silencieuse.
- **Couverture du cas partagé** gelée par témoins TS (validés) et Swift (miroir).

## Implementation complexity
- **Triviale.** 1 ligne de prod TS + 1 ligne de prod Swift, 3 blocs de doc, 2 tests TS + 1 test Swift.

## Validation criteria
- [x] `npx vitest run __tests__/river-lanes.test.ts` → 66/66 (les 2 nouveaux verts après fix).
- [x] `npx vitest run` (suites river vectorisées incluses) → 146/146 river, 2330/2330 shared.
- [x] `bun run build` (shared, `tsc`) → 0 erreur.
- [ ] iOS CI (`.sorted()` + XCTest) — vert attendu, hors toolchain locale.

## Améliorations futures (hors périmètre)
- **Vecteur inter-plateforme packed pour `resolveRiverStep`.** Les fixtures `river-step.vectors.json`
  sont « générées en exécutant la loi » (jamais à la main) et n'ont pas de générateur commité. Un cas
  packed y ajouterait une preuve rejouée par les trois plateformes — à poser quand le générateur de
  vecteurs revient au dépôt (aujourd'hui, le témoin packed vit en test unitaire TS+Swift).
- **Miroir Android phase 2** : quand `RiverLaneResolver.kt` arrivera, il doit naître trié.
