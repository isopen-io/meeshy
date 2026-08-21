# Plan d'implémentation — Iteration 237

## Objectifs
Éliminer la fuite `"NaNm"` / `"Infinityh"` de `formatTimeRemaining` en ajoutant une garde de
finitude en tête, alignée sur ses jumelles `formatClock` et `isExpired`. Un `expiresAt` absent ou
malformé doit retomber sur le repli `null` (« pas de compte à rebours ») des appelants.

## Modules affectés
- `packages/shared/utils/time-remaining.ts` (garde + doc).
- `packages/shared/__tests__/utils/time-remaining.test.ts` (test non-fini).

Aucun consommateur (`v2/StatusBar.tsx`, `v2/StoryViewer.tsx`, `lib/story-transforms.ts`) n'est
modifié : ils gèrent déjà `null` (repli `Expire` / rendu conditionnel).

## Phases d'implémentation
1. **RED** — ajouter un test prouvant que `formatTimeRemaining(NaN|Infinity, …)` renvoie `"NaNm"`
   au lieu de `null`. ✅ (rouge confirmé sur `"NaNm"`)
2. **GREEN** — `if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return null;` en tête. ✅
3. **DOC** — consigner le contrat non-fini dans le JSDoc (renvoi aux jumelles). ✅
4. **Validation** — suite ciblée, suite shared complète, `tsc`, `build`. ✅

## Dépendances
Aucune. Changement purement local à une fonction pure.

## Risques estimés
- **Très faibles.** La garde n'intercepte que des entrées déjà cassées (`"NaNm"`). Aucun chemin
  fini (les 6 tests existants) n'est touché. Type de retour inchangé.

## Stratégie de rollback
- `git revert` du commit unique. Aucun changement d'API, de wire format, ni de schéma.

## Critères de validation
- [x] RED prouvé (`"NaNm"` avant correctif).
- [x] GREEN : `time-remaining.test.ts` 7/7.
- [x] Suite shared vitest : 2329/2329 verts (96 fichiers).
- [x] `tsc --noEmit` propre (`packages/shared`).
- [x] `bun run build` (shared) propre.
- [ ] CI verte sur la branche.

## Statut d'achèvement
**Complet.** 2 fichiers modifiés (1 ligne de garde + doc + 1 test à 4 assertions). Aucune régression
détectée localement.

## Progression
1. ✅ RED (test non-fini rouge sur `"NaNm"`)
2. ✅ GREEN (garde `Number.isFinite`)
3. ✅ DOC (JSDoc contrat non-fini)
4. ✅ Validation (2329/2329 shared, tsc + build propres)

## Améliorations futures
1. **Parité miroir Swift/Kotlin.** Si une loi équivalente « temps restant » existe côté iOS/Android
   (peaux consommant un `expiresAt`), auditer qu'un `Date?` nil ou une date invalide y dégrade aussi
   en « pas de compte à rebours ». À faire dès que les targets sont accessibles.
2. **Plafond « jours ».** Un lien à TTL multi-jours rend `"72h"` (dans le contrat actuel `Xh`) —
   peser un format `Xj` au-delà de 24 h si le produit le souhaite (UX, non défectueux).
