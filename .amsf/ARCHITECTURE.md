# Architecture

Ce fichier est une carte. Les documents qui font foi sont le `CLAUDE.md` racine, les `CLAUDE.md` et `decisions.md` de chaque répertoire, et `docs/superpowers/specs/2026-03-17-architecture-bible-design.md`.

## Topologie

Trois clients (web, iOS, Android) parlent à une passerelle unique en REST (`/api/v1/`) et en Socket.IO. La passerelle délègue la traduction, la transcription et la synthèse vocale au traducteur par ZeroMQ (PUSH 5555, SUB 5558), et les réponses automatiques à l'agent par HTTP interne. MongoDB 8 (Prisma) et Redis 8 portent l'état.

## Contrats

Voir `contracts/README.md` : chaque contrat y est nommé avec sa source de vérité et la garde qui le tient.

## Frontières

- Types, schémas et lois partagées : `packages/shared`, source unique.
- Orchestration d'expérience : dans les applications, jamais dans le SDK (`packages/MeeshySDK/CLAUDE.md`).
- Présence, Prisme, accent : une loi côté TypeScript, des miroirs Swift et Kotlin tenus par des gardes.

## Environnements

`dev` est le staging et se déploie seul à CI verte. La production ne reçoit que ce que le staging a validé (`promote-production.yml`). Staging et production partagent un hôte sans partager base, Redis, réseau ni secrets (#9232).
