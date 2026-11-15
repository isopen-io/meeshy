/**
 * Visiter un lien de suppression ne supprime plus un compte (#4183).
 *
 * `GET /me/delete-account/confirm` écrivait `status: 'CONFIRMED'` et
 * `gracePeriodEndsAt` à J+90 — une MUTATION destructrice déclenchée par une
 * requête que n'importe quoi peut émettre : un antivirus de messagerie, un
 * pré-chargeur de liens, un scanner d'URL. La personne qui a lancé la
 * suppression puis s'est ravisée et n'a rien cliqué croyait avoir tout arrêté ;
 * quatre-vingt-dix jours plus tard, son compte était désactivé et ses sessions
 * coupées. Aucun courriel n'est émis entre la confirmation et l'expiration :
 * rien ne l'aurait prévenue.
 *
 * Le tirage n'est pas un coup de dé unique — le rappel hebdomadaire porte LES
 * DEUX liens, et l'ordre de visite du scanner décide de l'issue, toutes les
 * semaines.
 *
 * CE QUE CES TÉMOINS ASSERTENT, et pourquoi : l'ABSENCE d'écriture, pas le
 * code de redirection. Un handler qui muterait PUIS redirigerait passerait un
 * témoin qui ne regarde que le 302 — c'est précisément la forme du défaut
 * qu'on ferme.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendAccountDeletionConfirmEmail: jest.fn(async () => undefined),
  })),
}));

import { deleteAccountRoutes } from '../../../routes/me/delete-account';

const PREFIXE_PRODUCTION = '/api/v1/me';

/** Les trois portes qui mutaient sur un simple GET. */
const PORTES = [
  '/delete-account/confirm',
  '/delete-account/cancel',
  '/delete-account/delete-now',
] as const;

function buildApp() {
  const ecritures: Array<{ methode: string; args: unknown }> = [];
  const tracer = (methode: string) =>
    jest.fn(async (args: unknown) => {
      ecritures.push({ methode, args });
      return { id: 'req-1', userId: 'u-1', status: 'CONFIRMED' };
    });

  const prisma = {
    accountDeletionRequest: {
      // La demande EXISTE et le jeton est valide : c'est le cas où la version
      // fautive écrivait. Un double qui rendrait `null` ne prouverait rien.
      findFirst: jest.fn(async () => ({
        id: 'req-1',
        userId: 'u-1',
        status: 'PENDING_EMAIL_CONFIRMATION',
        confirmTokenHash: 'peu-importe',
        cancelTokenHash: 'peu-importe',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        resolveAttempts: 0,
      })),
      update: tracer('accountDeletionRequest.update'),
      updateMany: tracer('accountDeletionRequest.updateMany'),
      count: jest.fn(async () => 0),
      create: tracer('accountDeletionRequest.create'),
    },
    user: {
      findUnique: jest.fn(async () => ({ email: 'a@b.c', displayName: 'A' })),
      update: tracer('user.update'),
    },
    $transaction: jest.fn(async (ops: unknown[]) => {
      ecritures.push({ methode: '$transaction', args: ops });
      return [];
    }),
  };

  return { prisma, ecritures };
}

async function monter(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', prisma as never);
  await app.register(async (instance) => { await deleteAccountRoutes(instance); }, { prefix: PREFIXE_PRODUCTION });
  await app.ready();
  return app;
}

describe('GET sur un lien de suppression — inerte', () => {
  it.each(PORTES)('%s n’écrit RIEN', async (porte) => {
    const { prisma, ecritures } = buildApp();
    const app = await monter(prisma);

    await app.inject({ method: 'GET', url: `${PREFIXE_PRODUCTION}${porte}?token=un-jeton-quelconque` });

    // L'affirmation centrale : aucune écriture, quelle qu'elle soit.
    expect(ecritures).toEqual([]);

    await app.close();
  });

  it.each(PORTES)('%s redirige vers une page qui DIT la conséquence', async (porte) => {
    const { prisma } = buildApp();
    const app = await monter(prisma);

    const res = await app.inject({ method: 'GET', url: `${PREFIXE_PRODUCTION}${porte}?token=jeton-abc` });

    expect(res.statusCode).toBe(302);
    const destination = res.headers.location as string;
    // Le jeton voyage jusqu'à la page, qui fera le POST au clic — c'est le
    // CLIC humain qui devient le consentement, plus la requête HTTP.
    expect(destination).toContain('/account/deletion');
    expect(destination).toContain('token=jeton-abc');
    expect(destination).toMatch(/action=(confirm|cancel|purge)/);

    await app.close();
  });

  it('conserve les trois portes — un lien déjà envoyé ne meurt pas', async () => {
    const { prisma } = buildApp();
    const app = await monter(prisma);

    for (const porte of PORTES) {
      const res = await app.inject({ method: 'GET', url: `${PREFIXE_PRODUCTION}${porte}?token=t` });
      expect(res.statusCode).not.toBe(404);
    }

    await app.close();
  });
});
