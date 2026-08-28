/**
 * Le limiteur compte les appels qui arrivent par le proxy.
 *
 * En production le gateway tourne derrière Traefik, sur un réseau Docker
 * bridge sans `subnet` déclaré : `request.ip` vaut donc une adresse du pool
 * par défaut (`172.16.0.0/12`) pour TOUS les appelants, y compris un
 * attaquant sur Internet.
 *
 * `RateLimiter.middleware()` ouvrait par `if (isLocalIp(request.ip)) return;`
 * — une exemption « adresse locale » écrite pour le développement, mais dont
 * `isLocalIp` couvre exactement ce pool. Conséquence : les limiteurs nommés
 * (login, inscription, réinitialisation, transfert de téléphone) rendaient la
 * main avant de compter quoi que ce soit.
 *
 * La suite voisine `auth-rate-limiters.test.ts` prouvait bien les seuils —
 * mais avec `const IP = '203.0.113.42'` et le commentaire « Non-local IP so
 * middleware() doesn't skip via isLocalIp() ». Elle CONTOURNAIT la porte au
 * lieu de l'exercer, ce qui est précisément la raison pour laquelle le défaut
 * a survécu : ce qui ne s'exécute pas ne se signale pas.
 *
 * Ces témoins exercent les adresses RÉELLES de la production. Ils rougissent
 * si l'exemption revient, sous quelque forme que ce soit.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { FastifyRequest, FastifyReply } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => {
  const child = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return { enhancedLogger: { ...child, child: () => child } };
});

import { RateLimiter, isLocalIp } from '../../../utils/rate-limiter';

/** Les adresses que Traefik présente réellement au gateway en Docker. */
const PROXY_IPS = ['172.18.0.5', '172.17.0.1', '10.0.1.7', '192.168.16.3'];

function makeReq(ip: string): FastifyRequest {
  return { ip, body: {} } as unknown as FastifyRequest;
}

function makeReply(): FastifyReply & { statusCode: number } {
  const state = { statusCode: 200 };
  return {
    header: jest.fn().mockReturnThis(),
    status(code: number) {
      state.statusCode = code;
      (this as unknown as { statusCode: number }).statusCode = code;
      return this;
    },
    send() {
      return this;
    },
    get statusCode() {
      return state.statusCode;
    },
  } as unknown as FastifyReply & { statusCode: number };
}

async function callsUntilRefused(ip: string, max: number, attempts: number): Promise<number> {
  const limiter = new RateLimiter({
    max,
    windowMs: 60_000,
    keyPrefix: `proxy-ip-witness:${ip}:${Math.random()}`,
  });
  const middleware = limiter.middleware();
  let refused = 0;
  for (let i = 0; i < attempts; i += 1) {
    const reply = makeReply();
    await middleware(makeReq(ip), reply);
    if (reply.statusCode === 429) refused += 1;
  }
  return refused;
}

describe('RateLimiter.middleware — appels arrivant par le proxy', () => {
  it.each(PROXY_IPS)(
    'compte et refuse au-delà du seuil pour une requête vue en %s',
    async (ip) => {
      const refused = await callsUntilRefused(ip, 2, 5);

      expect(refused).toBeGreaterThan(0);
    }
  );

  it('applique EXACTEMENT le seuil à une adresse de réseau Docker', async () => {
    const refused = await callsUntilRefused('172.18.0.5', 3, 10);

    expect(refused).toBe(7);
  });

  it("n'exempte plus personne sur la seule forme de son adresse", async () => {
    const parProxy = await callsUntilRefused('172.18.0.5', 2, 6);
    const parInternet = await callsUntilRefused('203.0.113.42', 2, 6);

    expect(parProxy).toBe(parInternet);
  });
});

describe('RATE_LIMIT_DISABLED — la seule échappatoire, et elle est déclarative', () => {
  const initial = { disabled: process.env.RATE_LIMIT_DISABLED, env: process.env.NODE_ENV };

  afterEach(() => {
    process.env.RATE_LIMIT_DISABLED = initial.disabled;
    process.env.NODE_ENV = initial.env;
  });

  it('désarme la limitation hors production quand elle est posée', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';
    process.env.NODE_ENV = 'development';

    expect(await callsUntilRefused('203.0.113.42', 2, 6)).toBe(0);
  });

  it('est IGNORÉE en production — une commodité de poste ne désarme pas le service', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';
    process.env.NODE_ENV = 'production';

    expect(await callsUntilRefused('172.18.0.5', 2, 6)).toBe(4);
  });

  it("ne s'active sur aucune autre valeur que la chaîne « true »", async () => {
    process.env.NODE_ENV = 'development';
    for (const valeur of ['1', 'yes', 'TRUE', 'on']) {
      process.env.RATE_LIMIT_DISABLED = valeur;

      expect(await callsUntilRefused('203.0.113.42', 2, 6)).toBe(4);
    }
  });
});

describe('isLocalIp — la fonction reste juste, seul son USAGE était fautif', () => {
  it('reconnaît toujours les plages privées', () => {
    expect(isLocalIp('172.18.0.5')).toBe(true);
    expect(isLocalIp('10.0.1.7')).toBe(true);
    expect(isLocalIp('127.0.0.1')).toBe(true);
    expect(isLocalIp('203.0.113.42')).toBe(false);
  });
});
