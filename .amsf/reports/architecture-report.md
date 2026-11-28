# Rapport d'architecture (2026-11-28)

Description : `../ARCHITECTURE.md`, `../DEPENDENCY-GRAPH.md`, `../contracts/README.md`.

## Ce qui tient
- Sens des dépendances propre : applications et services → paquets, aucun cycle, aucun code de production d'un service qui importe un autre service ou une application.
- Contrat REST à source unique, généré pour trois langages et tenu par cliquets ; sept cliquets sur les événements Socket.IO.
- Une seule version de libsignal sur toutes les plateformes, vérifiée.
- Promotion en production par digests que staging exécute, avec ordre et retour arrière codés.

## Ce qui ne tient qu'à la discipline
1. **Les dépendances générées et de lecture ne sont dans aucun graphe** : ni turbo ni `ci-affected.mjs` ne savent qu'un changement de `packages/shared/api` concerne Swift et Kotlin. La couverture repose sur des listes de chemins tenues à la main dans les workflows (R1).
2. **Deux contrats ZMQ sur trois sans source unique** avant cette session ; il en reste un (traducteur, B2b).
3. **Miroirs tenus à la main** en Swift et Kotlin (Prisme, présence, noms d'événements) : corrects tant que les témoins de parité couvrent chaque famille.
4. **Deux modèles de version cohabitent** : changesets/`release.yml` sur `main`, et la production réellement servie depuis des images de `dev` (B15).

## Recommandations (incrémentales, aucune nouvelle couche)
- Étendre les déclencheurs de `ios.yml` et `sdk-tests.yml` aux fichiers de contrat, comme `android.yml` le fait déjà.
- Donner au contrat ZMQ du traducteur un schéma commun généré vers Python.
- Écrire dans `infrastructure/CLAUDE.md` lequel des deux modèles de version fait foi.
