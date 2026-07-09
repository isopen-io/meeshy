# Iteration 157 — Plan d'implémentation (2026-07-09)

## Objectifs
Éliminer le dernier drift de frontière gauche des mentions côté web : le composer
d'autocomplete (`useMentions`) déclenche le pop sur le `@` interne d'une adresse e-mail et sa
sélection réécrit l'e-mail. Aligner `MENTION_REGEX` sur la SSOT `NAME_BOUNDARY_LEFT` /
`MENTION_HANDLE_CHARS` de `packages/shared/utils/mention-parser.ts`.

## Modules affectés
- `apps/web/hooks/composer/useMentions.ts` (prod — 1 import + 1 constante regex)
- `apps/web/__tests__/hooks/composer/useMentions.test.tsx` (tests RED)

## Phases d'implémentation
1. **RED** — ajouter 3 tests dans `useMentions.test.tsx` :
   - `contact@ali` (curseur en fin) → pas d'autocomplete.
   - `café@bob` (frontière non-latine) → pas d'autocomplete.
   - `mail contact@x.com @ali` → autocomplete ouvert, query `ali`.
2. **GREEN** — remplacer `MENTION_REGEX` par une regex construite depuis les constantes
   partagées avec le flag `u` :
   ```ts
   import { MENTION_HANDLE_CHARS, NAME_BOUNDARY_LEFT } from '@meeshy/shared/utils/mention-parser';
   const MENTION_REGEX = new RegExp(`${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]{0,30})$`, 'u');
   ```
3. **REFACTOR** — vérifier qu'aucune autre occurrence locale du charset ne subsiste (la
   re-validation ligne ~205 `/^[\w-]{0,30}$/` reste correcte : elle valide la query déjà
   capturée, invariant inchangé).

## Dépendances
- `packages/shared` doit être buildé en `dist/` (jest web mappe `@meeshy/shared/*` →
  `packages/shared/dist/*`).

## Risques estimés
Très faibles. Le lookbehind ne restreint que les `@` collés après un caractère de nom.
Compatibilité `u` + `\w`/`-`/`$` vérifiée.

## Stratégie de rollback
Revert du commit unique (changement isolé à un fichier de prod + un fichier de test).

## Critères de validation
- 3 tests RED passent après le fix.
- Suite `useMentions.test.tsx` intégralement verte (aucune régression).
- Lint/type-check du fichier modifié OK.

## Statut de complétion
- [x] RED tests ajoutés (2/3 échouent sans le fix — vérifié via `git stash`)
- [x] Fix appliqué (import SSOT + regex avec lookbehind Unicode, flag `u`)
- [x] Suite verte (`useMentions` 46/46 ; suites mention/composer 259/259)
- [ ] Commit + push + merge main
- [ ] Branche supprimée

## Suivis / améliorations futures
- `PostService.recordView` clobber du `duration` (choix produit à trancher).
- Reaction self-echo Participant ID vs User ID (confiance basse).
