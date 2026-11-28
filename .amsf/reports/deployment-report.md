# Rapport de déploiement (2026-11-28)

**Aucun déploiement ni promotion n'a été lancé par cette session.** Rien n'a été fusionné dans `dev`.

## Modèle relevé
- **Staging** : chaque poussée sur `dev` qui touche un service reconstruit son image (`docker.yml`) et la déploie par SSH restreint (`prune → pull → up -d --no-deps`), puis test de fumée des routes. Un build partiel déploie ce qui a réussi (décision documentée).
- **Production** : `promote-production.yml`, déclenché à la main dans l'environnement protégé `production`.
  1. N'accepte que des digests sha256 que staging exécute.
  2. Exige une URL de recette, un commit ancêtre de `origin/dev` et un `ci.yml` vert sur ce commit.
  3. Si le diff touche Prisma, des migrations ou des tâches de reprise : accord écrit du porteur.
  4. Ordre : `translator → agent → gateway → webapp`, un service à la fois, attente de `healthy` ; passerelle et agent toujours ensemble.
  5. Tests de fumée (santé, commit servi, routes GET, configuration du web) ; échec ⇒ retour arrière automatique ; retour arrière manuel disponible.
- **Schéma** : aucune migration automatique ; scripts nommés embarqués dans l'image de la passerelle et lancés à la main.
- **Sauvegardes** : minuteries systemd séparées (`infrastructure/scripts/production-backup/`), non liées à une promotion (R10).
- **Mobile** : iOS par Xcode Cloud / fastlane / andp avec porte d'approbation ; Android par `android-release.yml`.

## Pour livrer les lots de cette session
1. PR vers `dev` (non ouverte : le porteur ne l'a pas demandée). Aucun des lots ne touche le schéma ni une forme sur le fil.
2. #20759 touche gateway et agent : ils se promeuvent ensemble de toute façon. Retour arrière : le digest précédent des deux.
3. #20758 ne se déploie pas : c'est un workflow.
4. andp : PR séparée sur `isopen-io/andp`, puis montée de la référence épinglée dans meeshy.

Portes où s'arrêter : fusion dans `dev`, puis promotion en production — préparées, non franchies.
