# Plan d'implémentation — Iteration 212

## Objectifs
Faire converger les deux derniers sites de résolution de nom de la **liste de
conversations** (`conversation-item/`) sur le SSOT `getUserDisplayName`
(displayName > firstName+lastName > username), corrigeant l'ordre `username`-first
divergent.

## Modules affectés
- `apps/web/components/conversations/conversation-item/conversation-utils.tsx`
- `apps/web/components/conversations/conversation-item/ConversationItem.tsx`
- `apps/web/__tests__/components/conversations/conversation-utils.test.tsx` (nouveau)

## Phases
1. **RED** — écrire `conversation-utils.test.tsx` verrouillant la priorité SSOT
   pour `getConversationNameOnly` et `getMessageSenderName` (dont le cas
   `firstName+lastName` > `username`). ✅
2. **GREEN** —
   - `conversation-utils.tsx` : importer `getUserDisplayNameOrNull` ; réécrire
     `getConversationNameOnly` ; extraire le helper pur `getMessageSenderName`. ✅
   - `ConversationItem.tsx` : `getSenderName` délègue au helper + fallback i18n,
     branche morte `isAnonymous` retirée, deps `useCallback` corrigées. ✅
3. **REFACTOR / VALIDATION** — suite dédiée verte, suite conversations complète
   verte, `tsc` sans nouvelle erreur (−10). ✅

## Dépendances
`packages/shared/dist` construit (`bun run build`) pour la suite conversations qui
mocke `@meeshy/shared/types/role-types`.

## Risques estimés
Faible. Chemins bien formés inchangés ; aucun fichier partagé avec une PR ouverte.

## Stratégie de rollback
Revert du commit unique ; 2 fichiers source + 1 test isolés.

## Critères de validation
- [x] `conversation-utils.test.tsx` 11/11 (2 RED prouvés)
- [x] `__tests__/components/conversations` 30 suites / 591 tests
- [x] `tsc --noEmit` 1184 (baseline 1194, 0 nouvelle erreur)

## Statut de complétion
**Terminé** — prêt pour PR.

## Suivi de progression
Prolonge #2305 / #2311 / #2313 (vague display-name). Cible « Future Considerations »
explicite de #2313. Reste : dedup interne `getUserDisplayName`, intention
`languageCode` dans `transform-conversation.ts`.
