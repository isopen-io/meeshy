# État de l'orchestration (relevé — le travail en cours se lit dans les issues et les branches)

Dernière mise à jour : 2026-11-28, fin de la première session.

## Repères
| | |
|---|---|
| Branche | `claude/monorepo-engineering-discovery-tu6gw9` (meeshy et andp) |
| Base auditée | `dev` @ 829707d0 |
| `dev` contenue | 1d56c70f |
| Issues de la session | #20758 (artefact iOS), #20759 (contrat ZMQ agent), #20763 (plan de contrôle) |
| PR | aucune — non demandée |

## Phases
| Phase | Statut | Preuve |
|---|---|---|
| Découverte | faite | `INVENTORY.md`, `DEPENDENCY-GRAPH.md`, `ARCHITECTURE.md`, `contracts/` |
| Base | faite | `baselines/2026-11-28-dev-829707d0.md` |
| Plan de contrôle, agents, skills, hooks | fait | `.claude/`, `scripts/`, `bash .amsf/scripts/test-hooks.sh` |
| Audit | fait au niveau projet et pipeline ; **pas** route par route | `BACKLOG.md`, `reports/` |
| Implémentation | 3 lots livrés sur la branche | `reports/release-report.md` |
| Validation | faite sur l'arbre fusionné | `reports/regression-report.md` |
| Revue indépendante | faite, constats corrigés | idem |
| Intégration (PR, fusion dans `dev`) | **non faite** | attend le porteur |
| Déploiement | **non fait** | `reports/deployment-report.md` |

## Pour reprendre
1. `git fetch origin && git merge origin/dev` dans la branche ; rejouer `bash .amsf/scripts/baseline.sh packages/shared services/agent services/gateway`.
2. Si le porteur veut la PR : l'ouvrir vers `dev`, suivre les jobs iOS, Android, SDK et traducteur.
3. Transformer en issues les lignes ouvertes de `BACKLOG.md` que le porteur retient, en commençant par B3 et B4.
4. Sur andp : ouvrir la PR de la branche, puis monter la référence épinglée dans meeshy.

## Limites connues de ce relevé
- Les agents et skills ajoutés ne sont chargés qu'au démarrage d'une session : ils n'ont pas servi dans celle-ci (la revue a été faite par `auditeur-adversarial`).
- Les hooks sont des filets fail-open et se contournent ; ils ne remplacent pas la protection de branche.
- `#20758`, `#20759` et `#20763` n'ont ni milestone ni champs de projet : la session n'y a pas accès.
