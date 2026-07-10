# Iteration 160 — Plan d'implémentation (2026-07-10)

## Objectifs
Aligner le hook composer `useMentions` sur la SSOT de frontière de mention pour supprimer le
faux positif d'autocomplete sur les adresses e-mail et le drift structurel restant.

## Modules affectés
- `apps/web/hooks/composer/useMentions.ts` (prod, 1 import + 1 regex dérivée)
- `apps/web/__tests__/hooks/composer/useMentions.test.tsx` (3 tests)
- `packages/shared/utils/mention-parser.ts` (source de vérité — inchangée, consommée)

## Phases d'implémentation

### Phase 1 — RED
Ajouter dans « Edge Cases » de `useMentions.test.tsx` :
- `contact@ali` (cursor fin) → `showMentionAutocomplete === false` (échoue avant le fix).
- `café@ali` (frontière Unicode) → `false`.
- `(@john` (ponctuation gauche) → `true`, query `john` (non-régression).

### Phase 2 — GREEN
`useMentions.ts` : importer `MENTION_HANDLE_CHARS`, `NAME_BOUNDARY_LEFT` de
`@meeshy/shared/utils/mention-parser` ; remplacer la regex littérale par
`new RegExp(\`${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]{0,30})$\`, 'u')`.

### Phase 3 — Validation
`bun run build` du package `shared` (jest mappe `@meeshy/shared/*` → `dist/`) puis suites
composer + mention.

## Dépendances
Aucune. Pas de changement de schéma, de type partagé, ni d'API. La SSOT exporte déjà les deux
constantes.

## Risques estimés
Très faibles. Charset et longueur inchangés ; seule la frontière gauche s'ajoute. Aucun impact
sur les mentions légitimes.

## Stratégie de rollback
Revert du commit unique (1 ligne prod + tests).

## Critères de validation
- `useMentions.test.tsx` : 46/46 verts (3 nouveaux passent, RED prouvé sur l'ancienne regex).
- Suites voisines composer + mention : 225/225 verts.
- Typecheck web : aucune nouvelle erreur sur les fichiers touchés.

## Statut
- [x] Phase 1 — RED
- [x] Phase 2 — GREEN
- [x] Phase 3 — Validation

## Améliorations futures
Voir « Suivis » de l'analyse (recordView duration, reaction self-echo ID).
