# Plan Iteration 240 — Garde d'intervalle sur le `timing` d'objet du convertisseur v1→v3

## Objectifs
Fermer le dernier jumeau du bug `bounds` d'itération 236 : le convertisseur `convertV1ToV3`
ne doit JAMAIS émettre un `timing` d'objet inversé (`end < start`), au même titre que l'audio
`bounds` qu'il a appris à ne plus corrompre à l'itération 236.

## Modules affectés
- `services/gateway/src/services/posts/storyEffectsV3.ts` (fonction `baseObject`).
- `services/gateway/src/__tests__/unit/services/posts/canvasV3.fixtures.test.ts` (+4 tests).

## Phases d'implémentation
1. **RED** — +4 tests `convertV1ToV3 — le timing d'un objet ne sort jamais un intervalle
   corrompu` : ordre préservé, durée nulle acceptée, borne partielle préservée, inversion
   droppée. Confirmer le rouge sur l'inversion (`{start:4,end:1}` émis verbatim).
2. **GREEN** — Dans `baseObject`, n'émettre `timing.start`/`timing.end` que comme un intervalle
   valide : les deux bornes finies et `end >= start`. Une inversion dégrade en « pas de fenêtre »
   (l'objet reste visible tout du long) ; une borne unique reste préservée ; les keyframes/rate
   restent inchangés. Docstring citant le jumeau `bounds` + itérations 234/236.
3. **Validation** — Suite `canvasV3|storyEffects*` (134/134), `tsc --noEmit` gateway propre,
   golden `v1-legacy-full.v3.json` inchangé.

## Dépendances
- Aucun changement de types externes (`z.infer` inchangé).
- Aucune migration DB (convertisseur pur, chemin de lecture).
- Indépendant de #3243 (`time-range.ts` mutualise l'invariant des *segments*, pas le
  convertisseur story-effects) — zéro chevauchement de fichier.

## Risques estimés
- **Négligeable.** `baseObject` est le seul constructeur d'objet ; aucun fixture/test ne pose une
  timing inversée. La partialité (une borne) et la durée nulle restent acceptées. Le golden est
  ordonné → inchangé.

## Stratégie de rollback
- `git revert` du commit unique. Aucun changement d'API ni de wire format.

## Critères de validation
- [x] RED prouvé (inversion émise verbatim avant correctif).
- [x] GREEN : 134/134 sur `canvasV3|storyEffects*` (11 suites, 130 + 4 nouveaux).
- [x] `tsc --noEmit` gateway propre.
- [x] Golden `v1-legacy-full.v3.json` inchangé.
- [ ] CI verte sur la PR.

## Statut d'achèvement
**Complet.** 2 fichiers modifiés (1 production, 1 test). Aucune régression détectée localement.

## Progression
1. ✅ RED (test d'inversion rouge sur `main`)
2. ✅ GREEN (garde d'intervalle dans `baseObject` + `Number.isFinite`)
3. ✅ Validation étendue (134/134, tsc propre, golden inchangé)

## Améliorations futures
1. **Monotonie inter-keyframes** (`KeyframeSchema.time`) — arbitrage produit (trier vs refuser).
2. **Audit `num(v, 0)` restant** — clos : aucun autre champ ne corrompt son défaut.
3. **Parité renderers clients** (web + iOS) — tolérer l'intervalle corrompu silencieusement.
