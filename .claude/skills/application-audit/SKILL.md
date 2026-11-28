---
name: application-audit
description: Auditer UNE application ou UN service du monorepo Meeshy de bout en bout (périmètre, contrats, qualité, tests, déploiement) et produire son rapport dans .amsf/reports/application-reports/. À utiliser quand on demande l'audit, l'état ou le rapport d'un projet précis.
---

# Auditer un projet

Argument : le chemin du projet (`apps/web`, `services/gateway`, …). Le rapport va dans `.amsf/reports/application-reports/<nom>.md` et suit le gabarit des rapports existants.

1. **Périmètre** — points d'entrée, dépendances d'exécution, paquets du dépôt consommés (`node .amsf/scripts/inventaire.mjs --json`), contrats produits et consommés (`.amsf/contracts/`).
2. **Base** — `bash .amsf/scripts/baseline.sh <chemin>` ; pour iOS, Android et le traducteur, le dernier run CI sur `dev` (identifiant cité).
3. **Qualité** — code mort, logique dupliquée, promesses non attendues, typage faible, fichiers hors budget (1 200 lignes). Chaque constat : `fichier:ligne` + comment il a été vérifié. Une fonctionnalité « qui a l'air inutilisée » se retire seulement après recherche de ses consommateurs.
4. **Sécurité** — skill `security-audit` sur le périmètre.
5. **Performance** — skill `performance-audit` ; pas de chiffre sans mesure.
6. **Déploiement** — image, port, sonde de santé, variables requises, ordre de promotion, retour arrière.
7. **Verdict** — statut de livraison et risques restants ; chaque constat à traiter devient une issue GitHub.

Une décision déjà écrite dans un `decisions.md` ou un commentaire daté n'est pas un défaut : la citer, ne pas la rouvrir.
