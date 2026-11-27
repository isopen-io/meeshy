# `services/gateway` — 2026-11-27

Statut de release : **BLOCKED (#20730)**. Base : `dev` @ `467263ce24`, passe du 2026-11-27.

| Porte | Résultat | Preuve |
|---|---|---|
| Build, type-check | NOT VERIFIED | le client Prisma ne se génère pas dans le conteneur |
| Tests | NOT VERIFIED | suite complète non rejouée ; 514 suites sur 3 077 jouées, 3 rouges non triés |
| Image | BLOCKED | `zod` 4.6.7 contre 4.4.3 testé, `uuid`, `light-my-request`, `dompurify` hors épingles (#20730) |

Périmètre : `src/server.ts`, port 3000, API `/api/v1/`, Socket.IO, ZeroMQ vers le traducteur, HTTP vers l'agent, MongoDB, Redis, APNs et FCM. Sert les trois clients ; c'est le producteur de presque tous les contrats.

Changement de la passe : `fast-uri` et `node-forge` montés dans l'arbre de test (#20725).

Non regardé : autorisation route par route, requêtes MongoDB, limitation de débit, performance.
