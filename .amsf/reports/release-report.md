# Rapport de livraison (2026-11-28)

Statut par application : `../RELEASE-STATUS.md`. Déploiement : `deployment-report.md`. Non-régression : `regression-report.md`.

## Ce que la branche contient
| Commit | Lot | Issue |
|---|---|---|
| `8675a97c` | l'artefact `andp-state` n'emporte plus la clé App Store Connect | #20758 |
| `3310dacf`, `ce0cdf6e` | contrat ZMQ passerelle ↔ agent à source unique | #20759 |
| `39ed8a61`, `bec220b1`, `d6f81617` et suivants | plan de contrôle `.amsf/`, agents, skills, hooks | #20763 |
| `isopen-io/andp` `35f6a13` | délai d'expiration et origine du JWT | — (branche du même nom) |

## Verdict
- **Livrable sur staging** (fusion dans `dev`) : oui pour shared, gateway, agent — gates rejoués, contrats inchangés sur le fil, revue indépendante faite et ses constats corrigés.
- **Production** : BLOCKED par construction tant que la recette sur staging n'a pas eu lieu.
- **Non prouvé** : jobs natifs de la PR ; comportement réel de l'étape d'artefact iOS.
- Aucune régression critique ou haute connue ; aucun secret exposé par le diff.
