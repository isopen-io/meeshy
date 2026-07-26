# Plan d'implémentation — Iteration 209

## Objectifs
Converger 6 réimplémentations inline de la résolution de nom d'affichage vers le
SSOT `getUserDisplayName` (`apps/web/utils/user-display-name.ts`), corrigeant au
passage le bug « undefined undefined », le bug whitespace-`displayName` et une
absence de fallback `username`. Web-only, non-overlap avec les PRs ouvertes.

## Modules affectés
- `apps/web/services/messages.service.ts` (`getAuthorDisplayName`) — anchor testable
- `apps/web/hooks/use-contacts-actions.ts`
- `apps/web/components/conversations/invite-user-modal.tsx` (×2)
- `apps/web/components/links/link-details-modal.tsx`
- `apps/web/components/conversations/conversation-participants.tsx`
- `apps/web/__tests__/services/messages.service.test.ts` (tests)

## Phases
1. **RED** — `messages.service.test.ts` : +2 tests (whitespace `displayName` →
   `John Doe` ; trim du nom). Prouver l'échec sur le code inline actuel.
2. **GREEN** — `getAuthorDisplayName` → `getUserDisplayName(author, author.username)` + import.
3. **Convergence** — 4 sites de rendu/hook substitués + imports ajoutés.
4. **Validation** — jest ciblé + périmètre `{services,utils,hooks}` + 3 suites
   composants + `tsc --noEmit` diff (0 nouvelle erreur).

## Dépendances
`bun install` + `packages/shared` build (`tsc`) pour la résolution `@meeshy/shared`
dans le jest web.

## Risques estimés
Faible. Substitutions comportement-préservantes hors des chemins buggés. Types
`link.creator` / `User` compatibles avec `UserLike` (vérifié par `tsc`).

## Stratégie de rollback
`git revert` du commit unique. Aucun schéma / migration / API / clé i18n touché.

## Validation criteria
- 85/85 (`messages.service` + `user-display-name`), dont 2 RED.
- 79/79 (3 suites composants) sans modification.
- 194 suites / 4896 tests verts (`{services,utils,hooks}`).
- `tsc` : 1193 = 1193 (0 nouvelle erreur).

## Completion status
- [x] Phase 1 — RED (whitespace displayName)
- [x] Phase 2 — GREEN (getAuthorDisplayName délègue)
- [x] Phase 3 — 4 sites convergés + imports
- [x] Phase 4 — validation complète verte

## Progress tracking
Terminé. Commit unique sur `claude/brave-archimedes-pu8q4q`.

## Future improvements
- `getUserDisplayName` → `getUserDisplayNameOrNull(user) ?? fallback` (micro-dedup).
- Convergence des sites `|| ''`-gardés (corrects, verbeux) — polish optionnel.
- `use-conversation-creation.ts` : ordre de priorité divergent — vérifier l'intention.
