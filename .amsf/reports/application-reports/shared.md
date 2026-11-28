# `packages/shared` — 2026-11-27

Statut de release : **FAIL**. Base : `dev` @ `467263ce24`, passe du 2026-11-27.

| Porte | Résultat | Preuve |
|---|---|---|
| Build | PASS | `bun run build`, sortie 0 |
| Type-check | PASS | `bun run type-check`, sortie 0 |
| Tests | FAIL | 11 096 sur 11 097 ; `swift-socket-payload-shape-gate.test.ts` demande de retirer `user:preferences-updated` de son inventaire (PR #20719) |

Consommateurs : passerelle, agent, web par le workspace ; traducteur par génération ; iOS, SDK et Android par miroirs. Voir `../../DEPENDENCY-GRAPH.md`.

Constat : demande `typescript ^7.0.2` et `prisma ^6.15.0` quand ses consommateurs demandent `^6.0.3` et `^6.19.3`.
