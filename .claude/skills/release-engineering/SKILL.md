---
name: release-engineering
description: Préparation d'une release de Meeshy : statut par application, ordre de déploiement, retour arrière. À utiliser avant une promotion vers la production.
---
# Préparer une release

1. Dire si la release est indépendante ou coordonnée : un changement de `packages/shared`, du schéma Prisma ou d'un contrat est coordonné.
2. Statut par application dans `.amsf/RELEASE-STATUS.md`, porte par porte, sur preuve. BLOCKED et NOT VERIFIED ne deviennent jamais PASS.
3. Vérifier que l'image contient ce qui a été testé (`.amsf/scripts/check-image-resolution.mjs`).
4. Ordre pour un lot coordonné : base et Redis, traducteur, passerelle, agent, web, puis clients natifs. La passerelle reste rétrocompatible avec les anciens clients (#9223).
5. Staging d'abord : `dev` se déploie seul à CI verte. Recette, santé, journaux.
6. Retour arrière prêt et nommé (`promote-production.yml`) avant toute promotion.
7. Migrations et purges de production : sauvegarde vérifiée, puis feu vert du porteur. S'arrêter là.
