# Iteration 126 — Plan d'implémentation (2026-07-07)

## Objectifs
Restaurer une couverture de test **réelle** sur `preprocessContent` (prétraitement des liens de tout
message markdown web) via une extraction pure behavior-preserving, et supprimer une branche morte.

## Modules affectés
- `apps/web/components/messages/preprocess-content.ts` (**nouveau** module pur exporté)
- `apps/web/components/messages/MarkdownMessage.tsx` (import + suppression définition inline, −22 l.)
- `apps/web/components/messages/__tests__/preprocessContent.test.ts` (**nouveau**, 8 cas)

## Phases d'implémentation
1. **[fait]** Analyser `preprocessContent` : identifier la branche morte `tracking-link`
   (deux chemins renvoyant `part.content`).
2. **[fait]** Créer `preprocess-content.ts` — expression pure conservant l'unique transformation
   `m+TOKEN` → `[m+TOKEN](trackingUrl)`.
3. **[fait]** Câbler `MarkdownMessage.tsx` sur le module ; supprimer la définition inline ; conserver
   l'import `parseMessageLinks` (encore utilisé pour les clics href).
4. **[fait]** Écrire `preprocessContent.test.ts` (8 cas) contre la vraie fonction + le vrai
   `parseMessageLinks` (env `jsdom` → `window.location.origin = http://localhost`).
5. **[fait]** Valider : jest (8/8, puis 68/68 sur `components/messages`), tsc (1203 inchangé).

## Dépendances
Aucune. Module pur, aucun nouvel import runtime, aucune migration.

## Risques estimés
- **Faibles.** Extraction behavior-preserving ; la branche supprimée était prouvée sans effet
  observable ; le module vit hors du chemin mocké par Jest.

## Stratégie de rollback
`git revert` du commit unique. `MarkdownMessage.tsx` retrouve sa définition inline ; aucun état
persistant, aucune migration.

## Critères de validation
- [x] `preprocessContent.test.ts` : 8 pass / 0 fail.
- [x] Suite `components/messages` : 68 pass / 0 fail (3 suites).
- [x] `tsc --noEmit` : 1203 erreurs pré-existantes, 0 nouvelle (parité `origin/main`).
- [ ] CI verte (jest web) après push.

## Statut de complétion
**Implémentation complète, validée localement (jest + tsc parité main).** En attente de CI.

## Suivi de progression / prochaines priorités
- Backlog : F88 (clamp `truncateFilename`), F91 (test direct de `parseMessageLinks` :
  priorité mshy > tracking > url, dédoublonnage par index).
