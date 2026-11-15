/**
 * #9600 (audit L1-B) — l'adresse SIGNÉE d'un fichier protégé n'entre pas dans
 * le journal d'accès de Traefik.
 *
 * Traefik (v3.6) journalise chaque requête avec son chemin COMPLET
 * (`--accesslog=true`, `docker-compose.prod.yml`) ; staging passe par le même
 * Traefik. Le chemin d'une adresse signée porte un jeton qui suffit, pendant sa
 * vie, à lire les octets à la place de son lecteur. Traefik ne sait pas
 * masquer UN segment de chemin : la route `/api/v1/attachments/signed/` a donc
 * son PROPRE routeur, plus spécifique que celui de la passerelle, dont le
 * journal d'accès est coupé (`observability.accessLogs=false`). Les autres
 * requêtes restent journalisées.
 *
 * Lit le FICHIER du dépôt, sans parseur YAML — même patron que
 * `sounds-volume-never-public.test.ts`.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

const DEPLOIEMENTS = [
  { compose: 'docker-compose.prod.yml', gatewayRouter: 'gateway', host: 'gate.${DOMAIN:-localhost}' },
  { compose: 'docker-compose.staging.yml', gatewayRouter: 'gateway-staging', host: 'gate.staging.${DOMAIN:-meeshy.me}' },
] as const;

const labelsOf = (source: string): readonly string[] =>
  [...source.matchAll(/^\s*-\s*"(traefik\.[^"]+)"\s*$/gm)].map((m) => m[1] as string);

describe.each(DEPLOIEMENTS)('$compose — adresses signées hors du journal d’accès', ({ compose, gatewayRouter, host }) => {
  const labels = labelsOf(fs.readFileSync(path.join(COMPOSE_DIR, compose), 'utf8'));
  const value = (key: string) => labels.find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);
  const router = `${gatewayRouter}-signed-files`;

  it('donne aux adresses signées un routeur propre, sur le même hôte que la passerelle', () => {
    expect(value(`traefik.http.routers.${router}.rule`)).toBe(`Host(\`${host}\`) && PathPrefix(\`/api/v1/attachments/signed/\`)`);
  });

  it('coupe le journal d’accès de ce routeur seulement', () => {
    expect(value(`traefik.http.routers.${router}.observability.accessLogs`)).toBe('false');
    expect(value(`traefik.http.routers.${gatewayRouter}.observability.accessLogs`)).toBeUndefined();
  });

  it('lui garde tout ce que porte le routeur de la passerelle (TLS, entrée, limites) et le même service', () => {
    for (const field of ['entrypoints', 'tls.certresolver', 'middlewares']) {
      expect(value(`traefik.http.routers.${router}.${field}`)).toBe(value(`traefik.http.routers.${gatewayRouter}.${field}`));
    }
    expect(value(`traefik.http.routers.${router}.service`)).toBe(gatewayRouter);
    expect(value(`traefik.http.routers.${gatewayRouter}.service`)).toBe(gatewayRouter);
  });
});
