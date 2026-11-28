---
name: regression-validation
description: Validation de non-régression d'un lot sur le monorepo Meeshy : projets touchés, consommateurs en aval, voie de parité. À utiliser avant d'ouvrir ou de fusionner une PR.
---
# Validation de non-régression

1. `git fetch origin dev` et fusionner `origin/dev` dans la branche ; garder les corrections de `dev`.
2. Zones touchées : `CI_EVENT=pull_request CI_BASE=<base> CI_HEAD=<tête> node scripts/ci-affected.mjs`.
3. Un changement de `packages/shared` rejoue shared, passerelle, agent, web ET la voie de parité (`node scripts/ci/voie-parite.mjs --liste web|gateway`). Ne jamais supposer qu'une application non modifiée n'est pas touchée.
4. Préparer l'arbre : client Prisma et `packages/shared/dist` à jour, sinon le rouge ment (#20315).
5. Rejouer sous bun 1.3.14 quand un rouge ne se reproduit pas en CI.
6. Séparer les rouges préexistants des rouges introduits, et le dire dans l'issue avec le SHA de `dev` contenu.
