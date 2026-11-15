/**
 * Les relais TURN joignables en TLS sur un port QUELCONQUE, 443 par défaut
 * (#11278) — pour l'appelant derrière un pare-feu qui ne laisse sortir que le
 * 443.
 *
 * `TURN_SERVERS` × `TURN_TLS_PORT` dérive un `turns:` par hôte TURN sur le
 * port TLS de coturn (5349). Ce port-là est fermé par les pare-feu
 * d'entreprise et d'hôtel qui n'ouvrent que le web. `TURN_TLS_SERVERS` déclare
 * EN PLUS des adresses TLS dont le nom et le port sont libres : un routeur TCP
 * Traefik `HostSNI(turn.<domaine>)` sur 443, qui termine le TLS et relaie du
 * TURN-sur-TCP vers coturn. Le nom compte : c'est l'indication SNI que le
 * client envoie, et le certificat que Traefik présente.
 *
 * Format : `hôte[:port]` séparés par des virgules ; port absent ⇒ 443. Une
 * entrée illisible est écartée, jamais réparée : une adresse TLS fausse ferait
 * attendre l'ICE sur un candidat qui ne répondra pas.
 */

export type TurnTlsServer = { readonly host: string; readonly port: number };

export const DEFAULT_TURN_TLS_SERVER_PORT = 443;

const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

function parseEntry(entry: string): TurnTlsServer | null {
  const [rawHost, rawPort, ...extra] = entry.trim().split(':');
  const host = (rawHost ?? '').trim();
  if (extra.length > 0 || !HOST_PATTERN.test(host)) return null;
  if (rawPort === undefined) return { host, port: DEFAULT_TURN_TLS_SERVER_PORT };
  if (!/^\d+$/.test(rawPort.trim())) return null;
  const port = Number(rawPort.trim());
  return port >= 1 && port <= 65535 ? { host, port } : null;
}

export function parseTurnTlsServers(env: string | undefined): {
  readonly servers: readonly TurnTlsServer[];
  readonly rejected: readonly string[];
} {
  const entries = (env ?? '').split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const parsed = entries.map((entry) => ({ entry, server: parseEntry(entry) }));
  return {
    servers: parsed.flatMap(({ server }) => (server ? [server] : [])),
    rejected: parsed.flatMap(({ entry, server }) => (server ? [] : [entry])),
  };
}

export function turnTlsUrl(server: TurnTlsServer): string {
  return `turns:${server.host}:${server.port}?transport=tcp`;
}
