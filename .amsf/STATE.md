# État de la dernière passe

Compte rendu daté du 2026-11-27, base `dev @ 467263ce24 (2026-11-27)`. L'issue GitHub fait foi sur l'état de chaque tâche.

## Fait et prouvé

| Étape | Preuve |
|---|---|
| Découverte | `INVENTORY.md`, `DEPENDENCY-GRAPH.md` |
| Référence TS | `baselines/2026-11-27.md` |
| Épingles de sécurité montées (#20725) | PR #20736, `reports/regression-report.md` |
| Fuseau des témoins web (#20729) | PR #20735, témoin rouge puis vert |
| Contrôle des versions résolues par les images | `scripts/check-image-resolution.mjs`, 20 écarts mesurés |

## Ouvert

Voir `BACKLOG.md`. Le point qui bloque un feu vert de release est #20730.

## Non fait, et dit

- Audit fonctionnel, qualité, performance et sécurité application par application (phases A à E) : non commencé.
- Aucune mesure de performance : `benchmarks/` est vide.
- Type-check de la passerelle et de l'agent, suite de l'agent, traducteur, iOS, SDK, Android : non rejoués dans le conteneur (voir `CONFIG.md`), ils reposent sur la CI.
- Revue indépendante des deux lots : non faite.
- Aucun déploiement.

## Pour reprendre

1. `git fetch origin dev` puis lire les issues de `BACKLOG.md`.
2. Rejouer `baselines/` selon `CONFIG.md`.
3. Prendre la première issue ouverte de `BACKLOG.md` qui n'a pas de branche vivante.
