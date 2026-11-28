# Agents

La source est `.claude/agents/`. Ce fichier donne la correspondance avec les huit rôles du plan de contrôle.

| Rôle | Agent | Écrit du code |
|---|---|---|
| Architecte en chef | `architecte-systeme` | non |
| Ingénierie d'application | `ingenieur-application` | oui, dans une application |
| Plateforme partagée | `plateforme-partagee` | oui, dans `packages/` |
| Performance | `ingenieur-performance` | oui, sur preuve |
| Sécurité applicative | `securite-applicative` | non |
| QA et régression | `qa-regression` | tests seulement |
| DevOps et SRE | `sre-infra` (préexistant) | oui |
| Auditeur de release | `auditeur-release`, adossé à `auditeur-adversarial` (préexistant) | non |

Agents de domaine préexistants : `crypto-e2ee`, `conformite-juridique`, `jeu-saisons-ligues`, `lecture-media`.

Quatre flux d'écriture au plus, un worktree par flux, jamais deux flux sur le même fichier (`CLAUDE.md` § Parallel Worktree Strategy).
