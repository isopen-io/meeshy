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
# Plan — Iteration 186 : handle anonyme robuste (repliement accents + garde non-dégénérescence)

## Objectives
Corriger la génération du username auto pour participant anonyme afin qu'elle
(1) replie les accents latins plutôt que les supprimer, et (2) ne produise jamais
un handle dégénéré (`_437`) pour un nom entièrement non-latin. Même root cause que
l'itération 185, côté génération.

## Affected modules
- `services/gateway/src/utils/anonymous-nickname.ts` (NOUVEAU — fonction pure extraite)
- `services/gateway/src/routes/anonymous.ts` (import + suppression du helper local)
- `services/gateway/src/__tests__/unit/utils/anonymous-nickname.test.ts` (NOUVEAU)

## Implementation phases
1. **RED** — Écrire `anonymous-nickname.test.ts` (format, accent folding, fallback non-latin).
2. **GREEN** — Créer `utils/anonymous-nickname.ts` (`asciiFold` + `|| 'user'`).
3. **REFACTOR** — Retirer le helper local de `anonymous.ts`, importer le util.
4. **VALIDATE** — jest util dir complet, type-check isolé.

## Dependencies
Aucune nouvelle dépendance. `String.prototype.normalize('NFD')` + regex `\p{M}`/`u`
déjà utilisés par `name-similarity.ts` (précédent établi, es2018+).

## Estimated risks
Très faible. Signature inchangée, parité bit-à-bit sur les noms latins simples.
Contrat ASCII du username (`sanitizeUsername`) préservé (sortie `[a-z0-9_]`).

## Rollback strategy
Revert du commit : réintroduit le helper inline. Aucun schéma DB / API / migration
touché. Aucune donnée persistée n'est affectée rétroactivement (handles déjà en base
inchangés — le changement ne s'applique qu'aux nouvelles jonctions sans username).

## Validation criteria
- [x] Suite `anonymous-nickname` : 8/8.
- [x] RED prouvé (ancienne logique → `jos_nl000` / `_000`).
- [x] Non-régression `src/__tests__/unit/utils/` : 29 suites / 918 tests.
- [x] Type-check isolé du util (es2022) : 0 erreur.
- [x] `grep generateNickname routes/anonymous.ts` : 5 call-sites intacts, 0 déclaration locale.

## Completion status
**COMPLETED** — implémenté, testé, prêt pour push sur `claude/brave-archimedes-1b05qn`.

## Progress tracking
- Iteration 185 : `name-similarity.normalizeName` ASCII-only → Unicode-aware (comparaison).
- Iteration 186 : `generateNickname` ASCII-only → accent-folded + non-dégénéré (génération).

## Future improvements
- `call-session-response.ts:69` fallback `participantId` → `userId` (tracer l'atteignabilité).
- Boucles `suggestedUsername` : déduplication déterministe (figer base, incrémenter compteur)
  au lieu de régénérer un suffixe aléatoire par itération.
