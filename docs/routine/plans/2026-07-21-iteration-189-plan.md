# Iteration 189 — Plan : aligner le `trim` de `validateMessageContent` (vacuité ↔ longueur ↔ envoi)

## Objectifs
Éliminer le faux rejet « trop long » d'un message valide dû à des espaces /
retours de ligne périphériques, en mesurant la borne de longueur sur la chaîne
**trimmée** — celle qui est effectivement envoyée.

## Modules affectés
- `apps/web/utils/messaging-utils.ts` — `validateMessageContent` (fix).
- `apps/web/__tests__/utils/messaging-utils.test.ts` — 2 tests RED/GREEN.

## Phases d'implémentation
1. **RED** — ajouter deux tests : (a) `'   ' + 'a'×MAX + '\n\n'` doit être
   valide ; (b) `'  ' + 'a'×(MAX+1) + '  '` doit rester rejeté.
2. **GREEN** — extraire `const trimmed = content.trim()` ; mesurer vacuité **et**
   longueur (`trimmed.length > maxLength`) sur `trimmed`.
3. **Non-régression** — suite `messaging-utils` + `__tests__/utils`.

## Dépendances
`bun install` (deps web). Aucune dépendance shared/prisma (surface purement web).

## Risques estimés
Minimal — fonction pure, élargissement strict de l'ensemble valide borné par
`maxLength` sur le contenu réel ; aucun message auparavant accepté ne devient
rejeté (`trimmed.length ≤ content.length`).

## Stratégie de rollback
Revert du commit unique — 2 fichiers, aucune migration, aucun état persistant.

## Critères de validation
- RED → GREEN prouvé (test « measure length after trimming » : 1 failed sans fix
  → 37 passed avec fix).
- 37/37 `messaging-utils` ; 975/975 sur les 37 suites `__tests__/utils`
  exécutables (`user-language-preferences` hors périmètre — prérequis dist shared).

## Statut : COMPLETED

## Suivi de progression
- [x] RED tests (whitespace + longueur limite ; longueur trimmée > max)
- [x] GREEN fix (const trimmed, mesure unifiée)
- [x] Non-régression 975/975 (hors prérequis dist shared)
- [x] Analyse + plan
- [ ] Commit + push + PR

## Améliorations futures (itération 190+)
- `getLanguageInfo` : normaliser la casse du `code` inconnu retourné comme `name`/`flag`.
- `MAX_LINK_NAME_LENGTH` : constante inutilisée + docstring 32≠60 (nettoyage doc).
- `validateMessageContent` : évaluer une mesure en points de code (alignement
  « caractères » perçus) contre la borne gateway.
