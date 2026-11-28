# packages/shared — `@meeshy/shared` 1.49.0

**Rôle** : source unique des types, du schéma Prisma, des contrats (REST généré, Socket.IO, ZMQ agent), du chiffrement et des résolveurs (Prisme, présence). Génère du code pour Swift, Kotlin et Python.

Consommateurs directs : `apps/web`, `services/gateway`, `services/agent`. Générés : `packages/MeeshySDK`, `apps/android`, `services/translator`. Détail : `DEPENDENCY-GRAPH.md`.

## Vérification (2026-11-28)
Typage PASS · build PASS · tests **469 fichiers, 11 097 / 11 097** · `action-policy-vectors:check` PASS · `translator-languages:check` PASS.

## Changements de la session (#20759)
- **Ajout** `agent/zmq-contract.ts` : les cinq schémas ZMQ passerelle ↔ agent et leurs types. Additif : aucun export existant ne change ; servi par l'export `./agent/*` déjà déclaré.
- **Ajout** `__tests__/agent-zmq-contract.test.ts` : 8 témoins — les deux sens du contrat passés par le fil, les refus, et l'interdiction d'une copie locale dans les deux services.
- Consommateurs revalidés : gateway et agent (les deux seuls importeurs de `./agent/*`), web (typage et build).

## Risques restants
- R1 : ce que le paquet génère n'apparaît dans aucun graphe de build.
- `./providers/*` : export sans importeur trouvé.
