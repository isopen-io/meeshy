/**
 * Vérifier un numéro ne dit plus s'il appartient à un compte (#4239).
 *
 * `POST /auth/phone-transfer/check` est PUBLIQUE, et rendait `exists: boolean` :
 * le même oracle que #4158 vient de fermer sur `/auth/check-availability`, par
 * la porte voisine. Fermer l'une sans l'autre ne change rien à la mesure.
 *
 * Elle rendait aussi `maskedInfo` — pseudo, nom d'affichage et adresse masqués
 * du titulaire — **sans condition**, dès lors que le compte existe.
 *
 * Ce qui rend le défaut net : `recoverySuggested`, dans la MÊME réponse, est
 * correctement conçu, et sa propre description le dit — « requires the caller to
 * already know the real name, so no account state is disclosed on its own ». La
 * bonne doctrine était écrite à huit lignes de la fuite.
 *
 * > Une réponse peut porter deux champs sous une seule garde et n'en protéger
 * > qu'un. La question n'est pas « cette route a-t-elle une doctrine ? » mais
 * > « chacun de ses champs la respecte-t-il ? »
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createPhoneTransferRateLimiter: () => ({ middleware: () => async () => {} }),
  createPhoneTransferCodeRateLimiter: () => ({ middleware: () => async () => {} }),
  createPhoneTransferResendRateLimiter: () => ({ middleware: () => async () => {} }),
}));

// Le service est INJECTÉ par le contexte de route, pas construit dans le
// fichier : un double du module ne serait jamais consulté.
const verdict = jest.fn() as jest.Mock<any>;

import { registerPhoneTransferRoutes } from '../../../routes/auth/phone-transfer';

const PREFIXE = '/api/v1/auth';

/** Le titulaire existe, et son identité NE correspond PAS à celle déclarée. */
const INCONNU = {
  exists: true,
  ownerId: 'u-1',
  maskedInfo: { displayName: 'J*** D**', username: 'j***n', email: 'j***@e***.test' },
  dormant: false,
  nameSimilarity: 'different',
  recoverySuggested: false,
};

/** Le titulaire existe, et l'appelant a PROUVÉ qu'il connaît son vrai nom. */
const RECONNU = { ...INCONNU, dormant: true, nameSimilarity: 'exact', recoverySuggested: true };

async function monter(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as never);
  app.decorate('redis', undefined as never);
  app.decorate('authenticate', async () => {});
  await app.register(async (i) => {
    registerPhoneTransferRoutes({
      fastify: i,
      redis: undefined,
      phoneTransferService: { checkPhoneOwnership: (...a: any[]) => verdict(...a) },
    } as never);
  }, { prefix: PREFIXE });
  await app.ready();
  return app;
}

const verifier = (app: FastifyInstance, corps: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `${PREFIXE}/phone-transfer/check`, payload: corps });

describe('La réponse ne dit plus qu’un compte existe', () => {
  it('ne porte AUCUN champ `exists`, compte présent ou non', async () => {
    verdict.mockResolvedValue(INCONNU);
    const app = await monter();

    const res = await verifier(app, { phoneNumber: '+33612345678', countryCode: 'FR' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).not.toHaveProperty('exists');

    await app.close();
  });

  it('ne porte aucun `exists` non plus quand le numéro est LIBRE — la réponse est identique', async () => {
    verdict.mockResolvedValue({ exists: false });
    const app = await monter();

    const res = await verifier(app, { phoneNumber: '+33612345678', countryCode: 'FR' });

    const data = res.json().data;
    expect(data).not.toHaveProperty('exists');
    // Le point : les deux cas sont INDISCERNABLES. Un témoin qui n'exercerait
    // que le cas « pris » resterait vert si le cas « libre » divergeait.
    expect(data.recoverySuggested).toBe(false);
    expect(data.maskedInfo ?? null).toBeNull();

    await app.close();
  });
});

describe('… et ne livre l’identité masquée qu’à qui a prouvé la connaître', () => {
  it('TAIT `maskedInfo` quand l’identité déclarée ne correspond pas', async () => {
    verdict.mockResolvedValue(INCONNU);
    const app = await monter();

    const res = await verifier(app, {
      phoneNumber: '+33612345678',
      countryCode: 'FR',
      firstName: 'Quelquun',
      lastName: 'Dautre',
    });

    const data = res.json().data;
    // `j***n` restreint énormément, et sur une liste de numéros c'est une
    // empreinte. Masqué ne veut pas dire anodin.
    expect(data.maskedInfo ?? null).toBeNull();
    expect(data.recoverySuggested).toBe(false);

    await app.close();
  });

  it('LIVRE `maskedInfo` quand la récupération est suggérée', async () => {
    verdict.mockResolvedValue(RECONNU);
    const app = await monter();

    const res = await verifier(app, {
      phoneNumber: '+33612345678',
      countryCode: 'FR',
      firstName: 'John',
      lastName: 'Doe',
    });

    const data = res.json().data;
    expect(data.recoverySuggested).toBe(true);
    // Le parcours de récupération de compte doit continuer de fonctionner :
    // le correctif ne doit pas resserrer ce qui est déjà juste.
    expect(data.maskedInfo.username).toBe('j***n');

    await app.close();
  });
});
