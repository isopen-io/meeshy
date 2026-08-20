# Iteration 237 — Plan : invariant `end ≥ start` sur CanvasV3 (schéma + convertisseur)

> **Note de renumérotation (collision de numéro).** Mergé sous PR #3240 en parallèle de PR #3237
> qui portait aussi le numéro 236 ; #3237 ayant mergé en premier garde 236, ce plan CanvasV3 est
> renuméroté 237. Voir l'analyse jumelle pour le détail.

## Objectifs
1. Étendre l'invariant temporel `end ≥ start` (norme du codebase, itération 234) aux deux
   intervalles temporels de `CanvasV3Schema` : `TimingSchema` (objets) et `BackgroundSoundSchema.bounds`
   (fond sonore).
2. Corriger le convertisseur `convertV1ToV3` qui pouvait émettre `bounds: { start: N, end: 0 }`
   quand un blob v1 ne portait qu'une seule borne — un intervalle qui finit avant de commencer.

## Modules affectés
- `packages/shared/types/canvas-v3.ts` — schéma Zod (+ 2 refines).
- `services/gateway/src/services/posts/storyEffectsV3.ts` — convertisseur v1→v3 (`convertV1ToV3`,
  bloc bounds).
- `services/gateway/src/__tests__/unit/services/posts/canvasV3.schema.test.ts` — 8 tests
  additionnels (5 timing + 3 bounds).
- `services/gateway/src/__tests__/unit/services/posts/canvasV3.fixtures.test.ts` — 3 tests
  `convertV1ToV3` (round-trip vers le schéma).

## Phases d'implémentation
1. **RED** — Écrire les 5 tests schéma (`end < start` refusé, `end === start` accepté, timing
   partielle acceptée, bounds inversé refusé, bounds durée nulle accepté). Confirmer le rouge sur
   les deux cas `end < start` (les autres passent déjà, ce sont les gardes de non-régression).
2. **GREEN schéma** — Ajouter les deux `.refine` sur `TimingSchema` (conditionnel, deux bornes
   optionnelles) et `BackgroundSoundSchema.bounds` (inconditionnel, deux bornes requises). Rebuild
   `packages/shared`.
3. **RED convertisseur** — Écrire les 3 tests `convertV1ToV3`. Le cas « une seule borne » et « borne
   inversée » échoueraient contre la garde ajoutée en phase 2 si le convertisseur n'est pas corrigé.
4. **GREEN convertisseur** — Remplacer le pattern `num(x, 0)` par une garde qui n'émet `bounds`
   QUE si les deux bornes sont des `number` finis et forment un intervalle valide (`end >= start`).
5. **Validation** — Suite `canvasV3` (18/18), suite étendue `storyEffects|storyTextObject|canvasV3`
   (130/130), suite shared vitest (2328/2328). `tsc --noEmit` propre sur shared + gateway.

## Dépendances
- Aucun changement de types externes (`z.infer` inchangé).
- Aucun changement de comportement runtime pour les données valides existantes.
- Aucune migration DB (schéma Zod uniquement).

## Risques estimés
- **Négligeable.** Aucun fixture ni test existant ne pose `end < start`. Le golden `v1-legacy-full.v3.json`
  porte des bornes ordonnées (2, 17), inchangé. Le refine préserve le type Zod inféré.
- **Interaction schéma × convertisseur.** Le refine schéma sans correctif convertisseur ferait
  échouer la validation d'un blob v1 partiel : les deux se corrigent nécessairement ensemble
  (phase 2 + phase 4 dans le même commit).

## Stratégie de rollback
- Un `git revert` du commit unique suffit. Aucun changement d'API, aucun changement de wire format.
- Le fixture golden reste inchangé : aucun risque de désynchronisation cross-lot.

## Critères de validation
- [x] Tests RED prouvés (2 cas `end < start` refusés seulement après refine).
- [x] Tests GREEN schéma : 13/13 canvasV3.schema (5 nouveaux ordre-temporel + 8 existants).
- [x] Tests GREEN convertisseur : 3 nouveaux `convertV1ToV3` (bornes ordonnées / borne unique
      droppée / borne inversée droppée).
- [x] Suite étendue `storyEffects|storyTextObject|canvasV3` : 130/130 verts (11 suites).
- [x] Suite shared vitest : 2328/2328 verts (aucune régression au niveau exports canvas-v3).
- [x] `tsc --noEmit` propre sur `packages/shared` et `services/gateway`.
- [x] Fixture golden `v1-legacy-full.v3.json` inchangé.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Statut d'achèvement
**Complet.** 4 fichiers modifiés, 85 lignes ajoutées, 3 lignes supprimées. Aucune régression
détectée localement.

## Progression
1. ✅ RED schéma (2 tests `end < start` refusés — rouge confirmé)
2. ✅ GREEN schéma (`.refine` sur `TimingSchema` et `BackgroundSoundSchema.bounds`)
3. ✅ RED/GREEN convertisseur (garde de validité + 3 tests round-trip)
4. ✅ Validation étendue (130/130 gateway sur `storyEffects*`, 2328/2328 shared)
5. ✅ `tsc --noEmit` propre sur les deux packages

## Améliorations futures
1. **Parité clients (web + iOS).** Les renderers CanvasV3 côté client doivent tolérer un intervalle
   corrompu à l'affichage (silencieusement) — audit à faire dès que les targets accessibles.
2. **Monotonie inter-keyframes.** `KeyframeSchema.time` dans un tableau `keyframes` n'est pas
   contraint d'être monotone. Idem pour `transcriptionSegmentSchema[]` (itération 234, futures).
   Contrainte de collection, à peser séparément.
3. **Audit du pattern `num(v, 0)`.** D'autres champs du convertisseur (volume, position, échelle)
   utilisent le même défaut arbitraire. Identifier lesquels tolèrent `0` comme défaut sémantique
   valide et lesquels devraient dégrader en « champ absent ».
