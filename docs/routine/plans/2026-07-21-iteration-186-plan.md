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
