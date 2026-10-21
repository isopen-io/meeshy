/**
 * `GET /calls/active` est une SONDE de reprise (#11462) : iOS et le web
 * l'appellent à chaque (re)connexion de socket et à chaque retour au premier
 * plan, sur chaque appareil du compte. Mesuré en production le 2026-10-21 :
 * 18 sondes en une minute pour un compte (web + iOS pendant une tempête de
 * reconnexion), puis quinze 429 — la reprise d'appel refusée précisément au
 * moment où elle sert.
 *
 * Le témoin monte la VRAIE route sur le VRAI plugin : c'est le seau que la
 * route épand qui décide, pas une constante lue à côté.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { registerCallsConsultationRoutes } from '../../../routes/calls-consultation';
import { RATE_LIMITS } from '../../../middleware/rate-limit';
import type { CallRouteDeps } from '../../../routes/calls-shared';

const COMPTE = '507f1f77bcf86cd799439022';

async function statutsDeSondes(nombre: number): Promise<number[]> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: false, skipOnError: true });

  const prisma = { callSession: { findFirst: jest.fn<any>().mockResolvedValue(null) } };
  const requiredAuth = async (request: { authContext?: unknown }) => {
    request.authContext = { userId: COMPTE, type: 'registered', hasFullAccess: true };
  };
  registerCallsConsultationRoutes(app, { prisma, callService: {}, requiredAuth } as unknown as CallRouteDeps);
  await app.ready();

  const statuts: number[] = [];
  for (let i = 0; i < nombre; i += 1) {
    const reponse = await app.inject({ method: 'GET', url: '/calls/active' });
    statuts.push(reponse.statusCode);
  }
  await app.close();
  return statuts;
}

describe('GET /calls/active — la sonde de reprise a son propre seau (#11462)', () => {
  it("un compte multi-appareils peut sonder bien au-delà du plafond des opérations d'appel", async () => {
    const sondes = RATE_LIMITS.CALL_OPERATIONS.max * 3;
    const statuts = await statutsDeSondes(sondes);
    expect(statuts.filter((s) => s === 429)).toEqual([]);
    expect(statuts.every((s) => s === 404)).toBe(true);
  }, 20_000);

  it('le plafond existe toujours : la sonde au-delà de son crédit est refusée', async () => {
    const max = RATE_LIMITS.ACTIVE_CALL_PROBE.max;
    const statuts = await statutsDeSondes(max + 1);
    expect(statuts.slice(0, max).every((s) => s === 404)).toBe(true);
    expect(statuts[max]).toBe(429);
  }, 20_000);
});
