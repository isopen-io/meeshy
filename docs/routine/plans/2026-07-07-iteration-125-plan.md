# Iteration 125 — Plan d'implémentation (2026-07-07)

## Objectifs
Restaurer une couverture de test **réelle** sur `normalizeMarkdown` (prétraitement de tout message
markdown web) en éliminant la copie de test dérivée, via une extraction pure behavior-preserving.

## Modules affectés
- `apps/web/components/messages/normalize-markdown.ts` (**nouveau** module pur exporté)
- `apps/web/components/messages/MarkdownMessage.tsx` (import + suppression définition inline)
- `apps/web/components/messages/__tests__/normalizeMarkdown.test.ts` (import réel + 3 attentes réalignées)

## Phases d'implémentation
1. **[fait]** Capturer la sortie de production sur les cas divergents (ground-truth via bun).
2. **[fait]** Créer `normalize-markdown.ts` en reproduisant la fonction (avec espaces insécables ` `).
3. **[fait]** Vérifier l'équivalence byte-à-byte production ↔ module extrait (39 entrées).
4. **[fait]** Câbler `MarkdownMessage.tsx` sur le module ; supprimer la définition inline.
5. **[fait]** Pointer le test sur le module réel ; réaligner les 3 attentes obsolètes.
6. **[fait]** Exécuter la suite complète (`bun test`) : 36/36, 72 assertions.

## Dépendances
Aucune. Module pur, aucun nouvel import runtime, aucune migration.

## Risques estimés
- **Faibles.** Extraction behavior-preserving prouvée byte-identique ; seules des attentes de test
  obsolètes (jamais reliées au code réel) sont corrigées.

## Stratégie de rollback
`git revert` du commit unique. Le composant retrouve sa définition inline ; aucun état persistant.

## Critères de validation
- [x] Équivalence byte-à-byte production ↔ module (39 entrées).
- [x] `normalizeMarkdown.test.ts` : 36 pass / 0 fail (72 assertions) contre le module réel.
- [x] API publique `MarkdownMessage` inchangée ; mock Jest existant intact.
- [ ] CI verte (jest web) après push.

## Statut de complétion
**Implémentation complète, validée localement (bun : équivalence + suite complète).** En attente de CI.

## Suivi de progression / prochaines priorités
- Backlog : F87 (unification sanitizers), F88 (clamp `truncateFilename`), F90 (extraction/couverture de
  `preprocessContent`).
