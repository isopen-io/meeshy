---
name: release-engineering
description: Préparer et vérifier une livraison du monorepo Meeshy — statut par application, ordre de promotion staging → production, retour arrière, migrations. À utiliser quand on demande si quelque chose est livrable, ou pour préparer une promotion en production.
---

# Livrer

Le modèle de livraison est décrit dans `.amsf/RELEASE-STATUS.md` et `.amsf/reports/deployment-report.md` ; les règles du porteur sont dans le `CLAUDE.md` racine (bandeau « STAGING D'ABORD »).

1. **Ce qui part** : `node .amsf/scripts/inventaire.mjs --affected <dernier SHA promu>` — images touchées et consommateurs.
2. **Staging** : une fusion dans `dev` construit et déploie (`docker.yml`). Vérifier la santé, le commit servi et le test de fumée des routes.
3. **Recette** sur staging, consignée dans une issue.
4. **Production** : `promote-production.yml` uniquement — digests que staging exécute, CI verte sur le commit, ordre `translator → agent → gateway → webapp`, passerelle et agent toujours ensemble, retour arrière automatique sur test de fumée rouge.
5. **Données** : une migration ou une purge de production attend le feu vert du porteur et une sauvegarde VÉRIFIÉE. S'arrêter à cette porte, tout préparé.
6. **Mobile** : iOS par `ios-release.yml` / fastlane (porte d'approbation `appstore-submit`), Android par `android-release.yml`. Un ancien client doit fonctionner contre le nouveau serveur.
7. **Verdict** par application via l'agent `auditeur-release`, consigné dans `.amsf/reports/release-report.md`.

Ne jamais contourner une branche protégée, un environnement GitHub ou une approbation.
