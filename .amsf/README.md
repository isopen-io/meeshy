# .amsf — plan de contrôle d'ingénierie du monorepo

Relevé persistant de l'orchestrateur (issue #20763). Il permet à une session de reprendre sans la conversation qui l'a précédée.

**Ce que ce dossier est** : un inventaire redécouvrable, une base mesurée, les contrats entre applications, les gates, et des rapports DATÉS appuyés sur des sorties réelles.

**Ce qu'il n'est pas** : un tracker. Le `CLAUDE.md` racine fait de GitHub (issues, milestones, projet « Meeshy — pilotage ») la seule source d'état d'une tâche. `BACKLOG.md` et `STATE.md` sont des relevés qui renvoient aux issues ; en cas d'écart, l'issue a raison.

| Fichier | Rôle | Se régénère par |
|---|---|---|
| `STATE.md` | où en est l'orchestration, SHA de base, lots en vol | la session, à chaque étape |
| `CONFIG.md` | outillage détecté, versions épinglées, limites de l'environnement | relecture des manifestes |
| `INVENTORY.md` | applications, services, bibliothèques, pipelines | `node .amsf/scripts/inventaire.mjs` |
| `DEPENDENCY-GRAPH.md` | qui consomme quoi, y compris le généré | idem + lecture des générateurs |
| `ARCHITECTURE.md` | topologie d'exécution et de déploiement | lecture du code |
| `BACKLOG.md` | constats classés, avec leur issue | audit |
| `RISK-REGISTER.md` | risques d'architecture et d'exploitation | audit |
| `DECISIONS.md` | décisions prises par l'orchestrateur | la session |
| `RELEASE-STATUS.md` | statut de livraison par application | relevé + CI |
| `contracts/` | contrats entre applications et leurs témoins | lecture du code |
| `quality-gates/` | gates par projet, commande exacte | lecture de la CI |
| `baselines/` | relevés de base datés | `bash .amsf/scripts/baseline.sh` |
| `benchmarks/` | mesures datées | skill `performance-audit` |
| `reports/` | rapports global, transverses et par application | audit |
| `agents/`, `workflows/` | qui fait quoi, dans quel ordre | — |
| `scripts/` | `inventaire.mjs`, `baseline.sh`, `test-hooks.sh` | — |

Statuts employés partout : **PASS · FAIL · BLOCKED · NOT VERIFIED · NOT APPLICABLE**. Un BLOCKED ou un NOT VERIFIED ne devient jamais un PASS.
