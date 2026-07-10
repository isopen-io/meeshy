# Iteration 160 — Plan d'implémentation (2026-07-10)

## Objectifs
Aligner le `MENTION_REGEX` du composer web sur la frontière gauche `NAME_BOUNDARY_LEFT` de la
SSOT `mention-parser.ts`, pour que l'autocomplete de mention ne s'ouvre plus dans une adresse
e-mail et que la sélection ne réécrive plus l'e-mail.

## Modules affectés
- `apps/web/hooks/composer/useMentions.ts` (prod, 1 import + 1 regex dérivée)
- `apps/web/__tests__/hooks/composer/useMentions.test.tsx` (5 tests ajoutés)

## Phases d'implémentation
1. **RED** — ajouter le bloc `Email Left-Boundary` (5 tests). Vérifier l'échec sous l'ancienne
   regex (2 tests RED confirmés).
2. **GREEN** — importer `NAME_BOUNDARY_LEFT` + `MENTION_HANDLE_CHARS` de
   `@meeshy/shared/utils/mention-parser` et dériver `MENTION_REGEX` (flag `u`).
3. **VALIDATE** — suites mention (87/87), `tsc` (0 nouvelle erreur sur le fichier).

## Dépendances
- `packages/shared/dist` doit être buildé (moduleNameMapper jest → `dist`). Build effectué.

## Risques estimés
Très faibles. Lookbehind zéro-largeur → `detection.start` inchangé. `[\w-]` reste ASCII sous
`u`. Lookbehind négatif déjà en prod via la même SSOT (rendu de mentions).

## Stratégie de rollback
Revert du commit (2 fichiers). Aucune migration, aucun état persisté.

## Critères de validation
- [x] 2 tests RED sous l'ancienne regex.
- [x] 87/87 tests verts après le fix (useMentions + mentions.service + mention-display).
- [x] `tsc` web : 0 nouvelle erreur sur `useMentions.ts`.

## Statut de complétion
**COMPLET.** Fix implémenté, testé (RED→GREEN), typecheck propre.

## Suivi / améliorations futures
- Backlog inchangé : `PostService.recordView` duration clobber ; reaction self-echo
  Participant-vs-User ID.
