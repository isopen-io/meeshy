# services/agent — `@meeshy/agent` 1.0.78

**Rôle** : agents conversationnels (LangGraph) qui animent ou imitent ; reçoit les messages de la passerelle par ZMQ, publie réponses et réactions.

| | |
|---|---|
| Entrée | `src/server.ts` ; image `isopen/meeshy-agent` (port 3200, sonde `/health`, aucun port public) |
| Dépend de | `@meeshy/shared` (Prisma, archétypes, contrat ZMQ, signature) ; MongoDB, Redis ; OpenAI |
| Sécurité | toutes les routes `/api/agent/*` derrière le jeton interne (comparaison à temps constant) ; trames ZMQ signées HMAC ; `PARTICIPATION_VIVANTE` sur toute lecture de `Participant` |
| Tests | Jest, 52 suites, 505 tests |

## Vérification (2026-11-28)
Typage PASS · build PASS · tests **52 / 52 suites, 505 / 505** — à la base et après le lot #20759.

## Changements de la session
- `src/zmq/types.ts` réexporte le contrat partagé au lieu de le redéclarer (#20759).

## Risques restants
- B10 : le fournisseur Anthropic charge un paquet absent de `package.json`.
- B15 : absent de `sync-versions.js`, `auto-changeset.js` et `release.yml`.
- Le maintien du service est un arbitrage ouvert de la roadmap (`services/agent/CLAUDE.md`).
