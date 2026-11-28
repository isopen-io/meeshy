---
name: security-audit
description: Revue de sécurité d'un périmètre du monorepo Meeshy (diff, route, workflow, projet) — autorisations, entrées, secrets, dépendances, pipelines. À utiliser avant de livrer un lot sensible ou pour l'audit de sécurité d'un projet.
---

# Revue de sécurité

Déléguer à l'agent `securite-applicative` (lecture seule) ; pour la cryptographie, `crypto-e2ee` ; pour un lot d'auth, de contrôle d'accès ou de migration avant fusion, `auditeur-adversarial`.

## Passes
1. **Surface** : routes et événements du périmètre (`services/gateway/route-manifest.json`, `packages/shared/types/socketio-events/`).
2. **Autorisation** : chaque route lit-elle l'identité, puis le droit sur LA ressource ? Qu'est-ce qui part à côté du champ gardé ?
3. **Entrées** : schéma à chaque frontière ; chemins, URL et fichiers reçus de l'extérieur ou par ZMQ.
4. **Secrets** : `git grep` des motifs de `.claude/hooks/garde-ecritures.sh` ; artefacts et journaux de CI ; variables requises des compose.
5. **Dépendances** : `bun audit` (ou `pnpm audit`), épingles `overrides`, résultat Trivy du dernier run CI.
6. **Pipelines** : actions tierces sur `@main`/`@master`, secrets accessibles à du code de PR, artefacts.

## Règles
- Un secret se cite par son nom, jamais par sa valeur, y compris dans le rapport.
- Aucun test destructif, jamais contre la production.
- Critique ou haute introduite par le lot ⇒ pas de livraison. Le reste ⇒ issues.
- Consigner dans `.amsf/reports/security-report.md`.
