# Iteration 74 — Plan d'implémentation (2026-07-02)

## Objectives
Résoudre F31 : consolider la troncature de texte `apps/web` sur une **source unique** (`utils/truncate.ts`),
éliminer la collision de nom `truncateText` (truncate.ts vs xss-protection.ts), retirer le code mort et la
réimplémentation locale.

## Affected modules
- `apps/web/components/contacts/ConversationDropdown.tsx`
- `apps/web/utils/xss-protection.ts`
- `apps/web/utils/__tests__/xss-protection.test.ts`

## Implementation phases
1. `ConversationDropdown` : import source unique, suppression fonction locale, `.truncated` aux 2 appels. ✅
2. `xss-protection.ts` : suppression de `truncateText` (code mort, hors périmètre XSS). ✅
3. `xss-protection.test.ts` : retrait import + describe correspondant. ✅
4. Validation `jest` + `tsc`. ✅

## Dependencies
Aucune. Changements auto-contenus à `apps/web`.

## Estimated risks
Faible. `ConversationDropdown` gagne un `.trim()` avant l'ellipse (amélioration cosmétique). Suppression de
code sans consommateur prod.

## Rollback strategy
Revert du commit unique de l'itération (3 fichiers).

## Validation criteria
- `truncate.test.ts` + `xss-protection.test.ts` verts (51/51). ✅
- `tsc --noEmit` sans erreur neuve (1198 → 1196). ✅

## Completion status
**Terminé.** Poussé sur `claude/brave-archimedes-snwo1e`.

## Progress tracking
- [x] Phase 1
- [x] Phase 2
- [x] Phase 3
- [x] Phase 4

## Future improvements
- F32 (reste) : `formatDuration` local dans `AttachmentDetails.tsx`, `AudioPostComposer.tsx`.
- F2 : flip `SOCKET_LANG_FILTER` (validation staging requise, non autonome).
