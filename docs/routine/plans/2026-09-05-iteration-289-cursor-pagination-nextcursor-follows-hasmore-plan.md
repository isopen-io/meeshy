# Plan — Itération 289 : `buildCursorPaginationMeta.nextCursor` suit `hasMore`

## Objectifs
Réconcilier `buildCursorPaginationMeta`
(`services/gateway/src/utils/pagination.ts`) avec la loi de curseur que ses deux
sœurs appliquent déjà (`sliceByIdCursor`, même fichier ; `cursorPage`,
`utils/cursor-pagination.ts`) : `nextCursor` se dérive de `hasMore`, jamais du
seul `resultCount > 0`, pour qu'aucune page finale ne rende un curseur qui force
un aller-retour vide.

## Modules affectés
- `services/gateway/src/utils/pagination.ts` (production)
- `services/gateway/src/__tests__/unit/utils/pagination.test.ts` (témoins)
- `services/gateway/src/__tests__/unit/routes/links-user.test.ts` (témoin de
  route qui encodait l'ancien comportement)

## Phases
1. RED — ajouter 3 témoins à `pagination.test.ts` (page pleine, page finale
   partielle, page vide) ; prouver l'échec du cas partiel contre l'implémentation
   verbatim.
2. GREEN — dériver `nextCursor` de `hasMore` ; doc-comment.
3. Régression — corriger le témoin de route incident ; relancer les suites
   consommatrices + `tsc --noEmit`.

## Dépendances
- `packages/shared` généré (prisma client) + construit — requis par les suites du
  gateway.

## Risques estimés
Très faibles : comportement inchangé sur page pleine et page vide ; seule la page
finale partielle change, dans le sens qui supprime une contradiction. `hasMore`
inchangé.

## Stratégie de rollback
Un seul fichier de production, trois lignes ; `git revert` du commit restaure
l'ancienne forme.

## Critères de validation
- RED prouvé par exécution (cas partiel rouge, deux autres verts avant fix).
- 18/18 (`pagination.test.ts`), suites consommatrices vertes, `tsc` EXIT=0.

## Statut de complétion
LIVRÉ. RED prouvé, GREEN 18/18, suites consommatrices vertes, tsc 0.

## Améliorations futures
- `buildCursorPaginationMeta` garde la limite structurelle de `hasMore:
  resultCount === limit` : une page finale qui contient EXACTEMENT `limit` lignes
  se déclare `hasMore: true` et force UN aller-retour vide. Le `cursorPage`
  canonique l'évite par une ligne-sonde `limit + 1`. Migrer les deux
  consommateurs (`core-list`, `links/user`) vers `cursorPage` fermerait ce
  dernier cas — lot séparé, car il change la requête (fetch `limit + 1`) et la
  forme du jeton (opaque vs `lastId`).
