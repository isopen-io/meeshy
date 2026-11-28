# Registre de risques (2026-11-28)

| # | Risque | Probabilité | Impact | Atténuation en place | Reste à faire |
|---|---|---|---|---|---|
| R1 | Une dépendance GÉNÉRÉE ou de LECTURE casse un consommateur que le graphe de build ne voit pas (Swift, Kotlin, Python). | Moyenne | Haut | Cliquets de génération, `android.yml --check`, gardes de parité | B16 : déclencher iOS/SDK sur les fichiers de contrat |
| R2 | Staging et production partagent un hôte : disque plein ou `image prune` de staging touche la production. | Moyenne | Haut | Réseaux, bases et secrets séparés ; sauvegardes par minuteries systemd | Surveillance du disque ; décision d'hébergement à 100 000 utilisateurs |
| R3 | L'interprète Python livré (3.11) n'est pas celui que la CI teste (3.10). | Moyenne | Moyen | — | B4 |
| R4 | La chaîne de publication iOS dépend d'une référence flottante d'un autre dépôt. | Basse | Haut | Porte d'approbation `appstore-submit` | B3 |
| R5 | Le traducteur n'a aucune authentification : toute brèche du réseau Docker donne accès au calcul ML et aux gardes de chemins. | Basse | Moyen | Réseau interne, gardes de chemins et d'URL | Signer les trames ZMQ comme pour l'agent |
| R6 | Les contrats ZMQ avec le traducteur n'ont pas de source unique. | Moyenne | Moyen | Un témoin ciblé | B2b |
| R7 | Actions tierces flottantes dans des jobs qui manipulent des secrets. | Basse | Haut | Jetons de PR en lecture seule | B12 |
| R8 | Beaucoup de sessions parallèles sur les mêmes espaces de noms (leçons, cliquets, registres générés). | Haute | Moyen | Branche poussée tôt, limite de 4 worktrees, fusion de `dev` avant PR | — |
| R9 | L'environnement de session n'est pas celui de la CI (bun 1.4.4, pas de PyTorch, pas de macOS) : un vert ou un rouge local peut mentir. | Haute | Moyen | `--no-save`, garde de parité du lockfile, `baseline.sh` note la version de bun | B19 |
| R10 | Pas de migration ni de sauvegarde attachée à une promotion ; la porte « données » est une heuristique. | Basse | Haut | Accord écrit du porteur exigé | Lier la sauvegarde vérifiée à la promotion |
