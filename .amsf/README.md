# .amsf — plan de contrôle d'ingénierie du monorepo

Ce dossier porte la CARTE du dépôt (inventaire, graphe, portes de qualité, statut de release) et les comptes rendus datés des passes d'audit. Il a été créé le 2026-11-27 à la demande du porteur (#20734).

## Ce que ce dossier n'est pas

Le `CLAUDE.md` racine tranche : l'état d'une tâche vit dans une issue GitHub, jamais dans un fichier. Ce dossier s'y tient.

- `BACKLOG.md` et `RISK-REGISTER.md` sont des INDEX : ils nomment les issues, ils n'en recopient pas l'état.
- `STATE.md` est un compte rendu DATÉ de la dernière passe, pour qu'une session reprenne sans l'historique de conversation. En cas d'écart, l'issue a raison.
- Les rapports de `reports/` sont datés et ne se réécrivent pas : une nouvelle passe ajoute un rapport.

## Plan

| Fichier | Ce qu'il porte |
|---|---|
| `STATE.md` | où en est la dernière passe, ce qui est prouvé, ce qui ne l'est pas |
| `CONFIG.md` | outillage détecté, commandes de vérification, limites des conteneurs de session |
| `INVENTORY.md` | les neuf produits, leurs entrées, leurs livrables |
| `DEPENDENCY-GRAPH.md` | qui dépend de qui, à la construction et à l'exécution |
| `ARCHITECTURE.md` | topologie des services et des contrats, avec renvoi aux documents qui font foi |
| `BACKLOG.md` | index des issues ouvertes par les passes |
| `RISK-REGISTER.md` | index des risques, chacun adossé à une issue |
| `DECISIONS.md` | décisions prises par les passes, et celles laissées au porteur |
| `RELEASE-STATUS.md` | statut de release par application |
| `quality-gates/` | inventaire des portes existantes et de leurs trous |
| `baselines/` | mesures de référence datées |
| `contracts/` | inventaire des contrats entre applications et de leurs gardes |
| `scripts/` | contrôles exécutables |
| `reports/` | comptes rendus datés |
| `agents/`, `workflows/` | correspondance avec `.claude/agents/` et `.claude/workflows/`, qui restent la source |
| `benchmarks/` | vide tant qu'aucun banc reproductible n'a été mesuré |
