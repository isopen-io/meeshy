# Iteration 155 — Plan d'implémentation (2026-07-10)

## Objectifs
Aligner le composer web de mention (`useMentions.ts`) sur la frontière gauche Unicode de la
SSOT `mention-parser.ts`, pour que le `@` interne d'une adresse e-mail n'ouvre plus
l'autocomplete et ne réécrive plus l'adresse.

## Modules affectés
- `apps/web/hooks/composer/useMentions.ts` (prod — 1 import + 1 regex)
- `apps/web/__tests__/hooks/composer/useMentions.test.tsx` (4 tests)

## Phases
1. **RED** — Ajouter 3 cas de frontière gauche (e-mail, accent, mention après whitespace).
2. **GREEN** — Importer `MENTION_HANDLE_CHARS` + `NAME_BOUNDARY_LEFT` de la SSOT ;
   remplacer la regex littérale par `new RegExp(\`${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]{0,30})$\`, 'u')`.
3. **VALIDATE** — Suites composer/mention + `tsc --noEmit` (delta 0).

## Dépendances
Aucune. `NAME_BOUNDARY_LEFT` / `MENTION_HANDLE_CHARS` déjà exportés par la SSOT et déjà
consommés par `apps/web/utils/mention-display.ts`.

## Risques estimés
Très faibles. Regex de détection locale ; comportement de mention nominal préservé
(vérifié par cas standalone + suite).

## Stratégie de rollback
Revert du commit unique (1 fichier prod + 1 fichier test).

## Critères de validation
- `useMentions.test.tsx` : 46/46.
- Suites composer + `mention-display` : 228/228.
- `tsc --noEmit` : 1193 → 1193 (aucune erreur ajoutée).

## Statut
**Complété.** Tests verts, delta tsc nul. Prêt pour push sur
`claude/brave-archimedes-z4dvmg`.

## Progress tracking
- [x] RED tests
- [x] Fix prod (SSOT constants)
- [x] Validation suites + tsc
- [x] Analyse + plan documentés
- [x] Commit + push

## Améliorations futures
- Extraire un helper SSOT `matchTrailingMention(textBeforeCursor)` dans `@meeshy/shared` si un
  3e consommateur de « mention en cours de frappe » apparaît (iOS/Android composer).
- Backlog iter 154 : `PostService.recordView` duration ; reaction self-echo Participant vs User ID.
