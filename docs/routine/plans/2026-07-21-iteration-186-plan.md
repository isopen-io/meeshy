# Iteration 186 — Plan : durcir `deepCleanTranslationOutput` (apostrophe FR + `\n`/`\t`)

## Objectives
Corriger deux corruptions de texte reproductibles dans l'util exporté
`deepCleanTranslationOutput` (chemin de nettoyage de la sortie de traduction
Prisme) et créer la couverture de test absente :
1. L'apostrophe ASCII ne doit JAMAIS être traitée comme un guillemet
   (`d'accord` doit rester `d'accord`).
2. Le strip des caractères de contrôle doit préserver `\t`/`\n`/`\r`
   (`ligne un\nligne deux` ne doit pas devenir `ligne unligne deux`).

## Affected modules
- `apps/web/utils/translation-cleaner.ts` (2 littéraux regex + docstrings)
- `apps/web/__tests__/utils/translation-cleaner.test.ts` (NEW, 13 tests)

## Implementation phases
1. **RED** — Écrire 13 tests : caractérisation du comportement correct
   (tokens NLLB, `▁`, espacement ponctuation) + 4 cas qui échouent sous le code
   actuel (apostrophe double, `\n`, `\t`, guillemets `« »`/`“ ”`). Vérifier
   4 fail / 9 pass.
2. **GREEN** —
   - `/["']([^"']*?)["']/g` → `/[«»“”"]([^«»“”"]*?)[«»“”"]/g`
   - `/[\x00-\x1F\x7F-\x9F]/g` → `/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g`
   - Docstrings expliquant les deux invariants (apostrophe FR, whitespace de contrôle).
   Vérifier 13/13.
3. **REFACTOR** — Aucun (changement minimal, fonctions déjà pures).

## Dependencies
- `bun install` + Prisma client + `dist` shared (prérequis harnais, déjà en place).

## Estimated risks
Très faible. Deux classes de caractères dans une fonction sans importeur (dead
code exporté) → aucune régression cross-module. Comportement légitime préservé
et désormais testé.

## Rollback strategy
Revert du commit (2 fichiers). Aucune migration, aucun schéma, aucun impact API.

## Validation criteria
- `npx jest __tests__/utils/translation-cleaner.test.ts` → 13/13.
- 4 RED confirmés avant fix.
- `tsc --noEmit` : zéro erreur sur les fichiers touchés.

## Completion status
- [x] Phase 1 RED (4 tests échouent)
- [x] Phase 2 GREEN (fix appliqué, 13/13)
- [x] Analyse + plan documentés
- [ ] Commit + push + PR vers main

## Progress tracking
Fix implémenté et validé localement (13/13, tsc propre sur les fichiers touchés).
Commit / push / PR en cours.

## Future improvements
Voir la section « Future improvements » de l'analyse : divergence `.max(5)` des
schémas de langue dead-code (`VoiceModelSchemas`, `AnonymousParticipantSchemas`)
et suppression éventuelle de `translation-cleaner.ts` s'il reste non câblé.
