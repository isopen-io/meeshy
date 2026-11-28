# Agents et périmètres

Définitions : `.claude/agents/`. Un lot d'écriture a UN propriétaire et un périmètre de fichiers ; deux lots ne partagent jamais un fichier.

| Rôle | Agent | Écrit ? | Périmètre |
|---|---|---|---|
| Architecte en chef | `architecte-en-chef` | non | tout le dépôt, en lecture |
| Ingénierie d'application | `ingenieur-application` | oui | UN de : `apps/web`, `apps/ios`, `apps/android`, `services/gateway`, `services/agent`, `services/translator` |
| Plateforme partagée | `plateforme-partagee` | oui | `packages/*`, contrats, générateurs — en séquence, jamais en parallèle d'un consommateur |
| Performance | `ingenieur-performance` | oui, après mesure | le projet mesuré |
| Sécurité applicative | `securite-applicative` | non | revue indépendante |
| QA et non-régression | `qa-regression` | tests seulement | validation indépendante |
| DevOps / SRE | `sre-infra` (existant) | oui | `infrastructure/`, workflows, déploiements |
| Auditeur de livraison | `auditeur-release` | non | diff final ; jamais auteur de ce qu'il approuve |
| Spécialistes du dépôt | `crypto-e2ee`, `auditeur-adversarial`, `conformite-juridique`, `lecture-media`, `jeu-saisons-ligues` | selon le cas | leur domaine |

Limites : quatre lots d'écriture et quatre worktrees au plus (`.claude/hooks/worktree-limit.sh`).
