import { httpTransport } from './client';
import { apiConfig } from './config';
import type { ConversationsDeps } from './conversations';

/**
 * L'ADAPTATEUR UNIQUE (#6151) — le SEUL endroit du dépôt qui résout
 * `apiConfig.source` en dépendances d'appel. `apiDeps` est une constante de
 * MODULE : la source est figée à la CONSTRUCTION (`VITE_DATA_SOURCE`), jamais
 * relue à l'exécution — donc jamais recalculée à chaque rendu (même garantie
 * que l'ex-`deps` de `query.ts`, dont ce module reprend le rôle).
 *
 * Module DÉLIBÉRÉMENT léger — seuls `client.ts` et `config.ts` en
 * dépendances RUNTIME (`ConversationsDeps` n'est qu'un TYPE, effacé à la
 * compilation) — pour rester importable depuis un socle qui ne doit rien au
 * runtime de requêtes (`main.tsx`, `realtime.ts`) sans y traîner
 * `@tanstack/react-query` ni le reste du graphe de `query.ts`.
 *
 * `scripts/check-api-source.mjs` interdit tout autre site du dépôt qui
 * reconstruirait `source: apiConfig.source` — un huitième site rougit le
 * gate au lieu de diverger en silence.
 */
export const apiDeps: ConversationsDeps = { source: apiConfig.source, transport: httpTransport };
