/**
 * `POST /account/deletion/resolve` — la porte qui remplace trois `GET` mutants (#4183).
 *
 * Ce qui la distingue de ce qu'elle remplace, et que ces témoins attestent :
 * le jeton PÉRIME, les essais se COMPTENT, et la réponse dit ce que la
 * suppression fait RÉELLEMENT — le compte est désactivé et daté, rien n'est
 * purgé, contrairement à ce qu'affirmait la page rendue.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../socketio/disconnectRevokedSessions', () => ({
  disconnectRevokedSessions: jest.fn(async () => 0),
}));

import { accountDeletionRoutes, MAX_RESOLVE_ATTEMPTS } from '../../../routes/account-deletion';

const PREFIXE = '/api/v1/account/deletion';
const JETON = 'un-jeton-de-courriel';
const HASH = crypto.createHash('sha256').update(JETON).digest('hex');

type EtatDemande = {
  status: string;
  tokenExpiresAt: Date | null;
  resolveAttempts?: number;
};

function buildApp(etat: EtatDemande | null) {
  let ligne = etat
    ? { id: 'req-1', userId: 'u-1', resolveAttempts: 0, confirmTokenHash: HASH, cancelTokenHash: HASH, ...etat }
    : null;
  const ecritures: Array<Record<string, unknown>> = [];

  const prisma = {
    accountDeletionRequest: {
      findFirst: jest.fn(async () => ligne),
      update: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        ecritures.push(data);
        if (ligne) {
          for (const [champ, valeur] of Object.entries(data)) {
            if (valeur && typeof valeur === 'object' && 'increment' in valeur) {
              (ligne as any)[champ] = ((ligne as any)[champ] ?? 0) + valeur.increment;
            } else {
              (ligne as any)[champ] = valeur;
            }
          }
        }
        return ligne ?? {};
      }),
    },
    user: {
      findUnique: jest.fn(async () => ({ isActive: false })),
      update: jest.fn(async (a: unknown) => { ecritures.push({ user: a }); return {}; }),
    },
  };

  return { prisma, ecritures, ligne: () => ligne };
}

async function monter(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', undefined as never);
  app.decorate('socketIOHandler', {} as never);
  await app.register(accountDeletionRoutes, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const dans = (ms: number) => new Date(Date.now() + ms);

describe('POST /account/deletion/resolve — le jeton PÉRIME', () => {
  it('refuse en 410 un jeton dont la date est passée', async () => {
    const { prisma, ecritures } = buildApp({ status: 'PENDING_EMAIL_CONFIRMATION', tokenExpiresAt: dans(-1000) });
    const app = await monter(prisma);

    const res = await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'confirm' } });

    expect(res.statusCode).toBe(410);
    // L'enveloppe du dépôt est PLATE : `code` à la racine, `error` en chaîne.
    // Un témoin qui lirait `error.code` passerait sur un handler qui compose
    // un objet imbriqué — que le schéma retirerait ensuite en silence.
    expect(res.json().code).toBe('TOKEN_EXPIRED');
    // Un lien mort n'écrit rien du tout.
    expect(ecritures).toEqual([]);

    await app.close();
  });

  it('traite une demande SANS date comme périmée — se tromper vers « le lien est mort » ne coûte qu’une nouvelle demande', async () => {
    const { prisma } = buildApp({ status: 'PENDING_EMAIL_CONFIRMATION', tokenExpiresAt: null });
    const app = await monter(prisma);

    const res = await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'confirm' } });

    expect(res.statusCode).toBe(410);
    await app.close();
  });
});

describe('POST … /resolve — les effets', () => {
  it('confirme et rend la date de fin de grâce', async () => {
    const { prisma } = buildApp({ status: 'PENDING_EMAIL_CONFIRMATION', tokenExpiresAt: dans(3600_000) });
    const app = await monter(prisma);

    const res = await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'confirm' } });

    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.status).toBe('CONFIRMED');
    expect(new Date(d.gracePeriodEndsAt).getTime()).toBeGreaterThan(Date.now());
    expect(d.canCancelUntil).toBe(d.gracePeriodEndsAt);

    await app.close();
  });

  it('consomme le jeton par une valeur UNIQUE, jamais par la constante « used »', async () => {
    const { prisma, ecritures } = buildApp({ status: 'PENDING_EMAIL_CONFIRMATION', tokenExpiresAt: dans(3600_000) });
    const app = await monter(prisma);

    await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'confirm' } });

    // `confirmTokenHash` porte `@unique` : y écrire une constante ferait entrer
    // la DEUXIÈME demande résolue de la base en collision sur l'index.
    const marque = ecritures.find((e) => 'confirmTokenHash' in e)?.confirmTokenHash;
    expect(marque).not.toBe('used');
    expect(String(marque)).toContain('req-1');

    await app.close();
  });

  it('annule depuis n’importe quel état vivant, y compris après expiration de la grâce', async () => {
    for (const statut of ['PENDING_EMAIL_CONFIRMATION', 'CONFIRMED', 'GRACE_PERIOD_EXPIRED']) {
      const { prisma } = buildApp({ status: statut, tokenExpiresAt: dans(3600_000) });
      const app = await monter(prisma);

      const res = await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'cancel' } });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('CANCELLED');
      await app.close();
    }
  });

  it('RÉACTIVE un compte déjà désactivé — sinon l’annulation laisse la personne dehors', async () => {
    // Après l'expiration de la grâce, le job de maintenance a déjà posé
    // `isActive: false`. Une annulation qui « réussit » sans rendre le compte
    // serait pire qu'un refus : elle affirme avoir tout remis en état.
    const { prisma, ecritures } = buildApp({ status: 'GRACE_PERIOD_EXPIRED', tokenExpiresAt: dans(3600_000) });
    const app = await monter(prisma);

    await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'cancel' } });

    const reactivation = ecritures.find((e) => 'user' in e) as { user: { data: Record<string, unknown> } } | undefined;
    expect(reactivation?.user.data).toMatchObject({ isActive: true, deletedAt: null });

    await app.close();
  });

  it('DIT que rien n’est purgé — la page affirmait le contraire', async () => {
    const { prisma } = buildApp({ status: 'GRACE_PERIOD_EXPIRED', tokenExpiresAt: dans(3600_000) });
    const app = await monter(prisma);

    const res = await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'purge' } });

    expect(res.statusCode).toBe(200);
    // Le code ne fait qu'un `isActive: false` + `deletedAt`. Annoncer une
    // suppression définitive était une promesse que rien ne tenait.
    expect(res.json().data.dataPurged).toBe(false);
    expect(res.json().data.status).toBe('COMPLETED');

    await app.close();
  });

  it('refuse une purge tant que la grâce n’a pas expiré', async () => {
    const { prisma, ecritures } = buildApp({ status: 'CONFIRMED', tokenExpiresAt: dans(3600_000) });
    const app = await monter(prisma);

    const res = await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'purge' } });

    expect(res.statusCode).toBe(410);
    // Aucune écriture sur l'UTILISATEUR — seul le compteur d'essais bouge.
    expect(ecritures.some((e) => 'user' in e)).toBe(false);

    await app.close();
  });
});

describe('POST … /resolve — les essais se comptent', () => {
  it('invalide la demande au plafond d’essais', async () => {
    const { prisma, ligne } = buildApp({ status: 'CONFIRMED', tokenExpiresAt: dans(3600_000), resolveAttempts: MAX_RESOLVE_ATTEMPTS - 1 });
    const app = await monter(prisma);

    // `confirm` sur une demande déjà confirmée : un essai qui ne correspond à
    // aucun état attendu — la seule forme de devinette possible ici.
    const res = await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'confirm' } });

    expect(res.statusCode).toBe(410);
    expect(ligne()?.status).toBe('CANCELLED');
    expect(String(ligne()?.confirmTokenHash)).toContain('revoked');

    await app.close();
  });

  it('ne révoque PAS avant le plafond', async () => {
    const { prisma, ligne } = buildApp({ status: 'CONFIRMED', tokenExpiresAt: dans(3600_000), resolveAttempts: 0 });
    const app = await monter(prisma);

    await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action: 'confirm' } });

    expect(ligne()?.status).toBe('CONFIRMED');
    expect(ligne()?.resolveAttempts).toBe(1);

    await app.close();
  });
});
