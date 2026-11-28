# Décisions de l'orchestrateur

| Date | Décision | Pourquoi |
|---|---|---|
| 2026-11-28 | Ne pas introduire de second orchestrateur de monorepo. | Turborepo + workspaces couvre les six workspaces JS ; les projets natifs ont leur outil. L'écart réel est la détection « touché », pas l'orchestration. |
| 2026-11-28 | `.amsf/` est un relevé, pas un tracker ; chaque correctif a son issue. | `CLAUDE.md` § Pilotage : l'état d'une tâche ne vit que dans GitHub. |
| 2026-11-28 | Réutiliser `sre-infra` pour le rôle DevOps/SRE au lieu de créer un agent jumeau ; écrire les nouveaux agents en français. | Un rôle, un agent ; cohérence avec les six agents existants. |
| 2026-11-28 | Hooks de garde étroits et fail-open. | Le dépôt porte de nombreuses sessions en parallèle : un faux positif les arrêterait toutes. La frontière reste la protection de branche et les environnements GitHub. |
| 2026-11-28 | Contrat ZMQ agent : source unique dans `packages/shared/agent/`, schémas déplacés à l'identique. | Additif, aucun changement sur le fil ; les deux seuls consommateurs de `./agent/*` sont validés. |
| 2026-11-28 | Ne pas toucher aux épingles de dépendances ni à `bun.lock`. | `bun.lock` ne se committe que depuis bun 1.3.14, dans un lot dédié (#20026) ; `zod` est tenu par #6235. |
| 2026-11-28 | Aucun déploiement, aucune promotion, aucune PR. | Rien n'a été demandé en ce sens ; la production exige recette sur staging et, pour les données, le feu vert du porteur. |
| 2026-11-28 | Ne pas « corriger » le déploiement staging après build partiel. | Décision documentée du dépôt, signalée à tort comme défaut par un agent de découverte. |
