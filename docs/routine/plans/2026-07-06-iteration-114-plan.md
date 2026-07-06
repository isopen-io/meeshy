# Iteration 114 — Plan d'implémentation (2026-07-06)

## Objectives
Corriger F84 : la liste de conversations V2 doit afficher le nom canonique de l'autre participant
(`displayName` > `firstName + lastName` > `username`) via le SSOT `getUserDisplayName`, au lieu d'une
chaîne inline qui préférait `username` et ignorait `lastName`.

## Affected modules
- `apps/web/utils/v2/transform-conversation.ts` (import + 1 chaîne remplacée + commentaire).
- `apps/web/utils/v2/__tests__/transform-conversation.test.ts` (5 tests neufs).
- `docs/routine/analyses/2026-07-06-iteration-114-analyse.md`, ce plan.

## Implementation phases
1. **RED** — tests de priorité (`firstName+lastName` avant `username` ; `firstName` seul) échouant sur la
   chaîne inline.
2. **GREEN** — `getUserDisplayNameOrNull(otherUser)` en tête de la cascade, fallbacks participant préservés.
3. **Validation** — suite `transform-conversation.test.ts`, puis suite web, puis CI.

## Dependencies
`bun install` (déjà fait). Test jsdom next/jest ; `Conversation` importé en `import type` (erasé).

## Estimated risks
Très faibles : `getUserDisplayNameOrNull` renvoie `null` sur user vide → cascade de fallbacks intacte.

## Rollback strategy
Revert du commit (changement isolé, sans schéma ni migration).

## Validation criteria
- 5/5 tests neufs verts ; RED prouvé (2 échecs) sur l'ancien code.
- CI web verte.

## Completion status
- [x] Fix source appliqué.
- [x] Tests neufs écrits + RED/GREEN prouvés.
- [ ] Push + PR.

## Future improvements
F85 (stats incrémentales messageType), F86 (video → file), reports antérieurs.
</content>
