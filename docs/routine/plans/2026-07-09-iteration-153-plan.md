# Iteration 153 — Plan d'implémentation (2026-07-09)

## Objectifs
Aligner `resolveMentionedUsers` (gateway) sur la frontière gauche SSOT `NAME_BOUNDARY_LEFT`
pour ne plus extraire de handle à l'intérieur d'une adresse e-mail / mot collé (F119).

## Modules affectés
- `services/gateway/src/services/MentionService.ts` (prod : 1 regex).
- `services/gateway/src/__tests__/unit/services/MentionService.test.ts` (4 tests de régression).

## Phases d'implémentation
1. **RED** — Ajouter au bloc `resolveMentionedUsers (module export)` :
   - `john@example.com` → `[]`, `findMany` non appelé (fausse mention `example`).
   - `adrià@example.io` (mot accentué/non-latin collé) → `[]`.
   - `@example` après un espace → résolu (garde anti-régression).
   - `@example` en début de contenu → résolu (frontière `(?<!...)` OK au début de chaîne).
2. **GREEN** — Préfixer la regex par `${NAME_BOUNDARY_LEFT}` et ajouter le flag `u` :
   `new RegExp(`${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]{1,30})`, 'gu')`.
3. **REFACTOR** — Aucun (déjà 1 ligne, aligné SSOT).

## Dépendances
`NAME_BOUNDARY_LEFT` et `MENTION_HANDLE_CHARS` déjà importés (ligne 11) depuis
`@meeshy/shared/utils/mention-parser`.

## Risques estimés
Très faibles. Regex identique à `parseMentions`/`MENTION_REGEX`. Aucune signature modifiée.

## Stratégie de rollback
Revert du commit unique.

## Critères de validation
- `MentionService.test.ts` : 109/109 (dont 4 nouveaux).
- Aucune régression sur les tests d'instance existants (email-boundary déjà couvert pour
  `extractMentions`).

## Statut de complétion
✅ Implémenté et validé (109/109). Prêt à merger.

## Suivi de progression
- [x] RED (2 tests email-boundary échouent, 2 anti-régression passent)
- [x] GREEN (fix regex, 109/109)
- [x] Analyse + plan documentés
- [ ] Commit + push + PR

## Améliorations futures
- **iter 154** : F120 — même garde `\w`→`[\w-]` dans `EditMessageView.tsx:128`.
- F121 (MediaVideoCard case-sensitivity), F122 (frontière au curseur, UX).
