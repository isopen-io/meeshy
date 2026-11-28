---
name: application-audit
description: Audit d'UNE application ou d'UN service de Meeshy, en cinq phases : fonctionnel, qualité, performance, sécurité, vérification. À utiliser avec le nom du répertoire à auditer.
---
# Audit d'une application

Entrée : un répertoire (`apps/web`, `services/gateway`, …). Sortie : `.amsf/reports/application-reports/<nom>.md` et une issue par constat.

- **A. Fonctionnel.** Fonctionnalités, parcours, règles métier, points d'accès, modèles, dépendances externes. Ne rien déclarer mort sans avoir cherché ses consommateurs.
- **B. Qualité.** Code mort, logique dupliquée, complexité, typage faible, erreurs non gérées, promesses flottantes, fuites de ressources, validation manquante.
- **C. Performance.** Seulement des goulots mesurés : passer la main à `ingenieur-performance`.
- **D. Sécurité.** Passer la main à `securite-applicative` ; `crypto-e2ee` pour le chiffrement.
- **E. Vérification.** Build, type-check, tests, contrats, chacun avec sa commande et sa sortie.

Le rapport sépare trois colonnes : prouvé, constaté sans preuve rejouée, non regardé.
