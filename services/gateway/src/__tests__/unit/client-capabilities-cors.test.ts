/**
 * `X-Meeshy-Capabilities` (#9927) franchit la pré-vérification CORS d'un client
 * web d'une autre origine. `server.ts` monte `@fastify/cors` sans
 * `allowedHeaders` : la passerelle reflète les en-têtes demandés
 * (`Access-Control-Request-Headers`), comme elle le fait déjà pour
 * `X-Device-Locale`. Ce témoin exerce la même configuration que la production
 * et tombe le jour où une liste `allowedHeaders` fermée oublierait l'en-tête.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { CORS_METHODS, CORS_EXPOSED_HEADERS } from '../../config/cors-methods';
import { fastifyCorsOrigin } from '../../config/cors-origins';
import { CLIENT_CAPABILITIES_HEADER } from '../../utils/client-capabilities';

const FOREIGN_ORIGIN = 'https://web.example.test';

describe('CORS — X-Meeshy-Capabilities admis en pré-vérification (#9927)', () => {
  it('une pré-vérification qui demande l’en-tête le reçoit dans access-control-allow-headers', async () => {
    const app = Fastify({ logger: false });
    await app.register(cors, {
      origin: fastifyCorsOrigin({ env: { NODE_ENV: 'production', CORS_ORIGINS: FOREIGN_ORIGIN } }),
      credentials: true,
      methods: CORS_METHODS,
      exposedHeaders: CORS_EXPOSED_HEADERS,
    });
    app.get('/api/v1/me/onboarding', async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/me/onboarding',
      headers: {
        origin: FOREIGN_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': `authorization, ${CLIENT_CAPABILITIES_HEADER}`,
      },
    });

    expect(res.statusCode).toBeLessThan(300);
    expect(String(res.headers['access-control-allow-headers'] ?? '').toLowerCase()).toContain(CLIENT_CAPABILITIES_HEADER);
    await app.close();
  });

  it('server.ts ne ferme pas la liste des en-têtes admis sans y nommer celui-ci', () => {
    const serverSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'server.ts'), 'utf8');
    const corsBlock = serverSource.slice(serverSource.indexOf('register(cors'), serverSource.indexOf('register(swagger'));
    expect(/allowedHeaders/.test(corsBlock) ? /capabilit/i.test(corsBlock) : true).toBe(true);
  });
});
