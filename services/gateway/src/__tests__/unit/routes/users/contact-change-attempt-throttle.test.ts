/**
 * Un code à six chiffres se devine si personne ne compte les essais (#4184).
 *
 * `POST /users/me/verify-phone-change` compare un code SMS à six chiffres et,
 * sur échec, rendait 400 — sans rien consommer. Aucun compteur, aucun débit
 * dédié : l'espace de recherche entier tenait en quelques minutes d'appels.
 * Et son jumeau `POST /users/me/change-phone` envoyait un SMS vers un numéro
 * CHOISI PAR L'APPELANT sans aucune limite — une primitive d'épuisement de
 * budget SMS, payée par le produit.
 *
 * ## Pourquoi le témoin compte les ÉCHECS
 *
 * L'issue le dit et c'est le piège exact : « le compteur s'incrémente SUR
 * L'ÉCHEC — aujourd'hui rien n'est consommé, donc un témoin qui ne compte que
 * les succès resterait vert ». Une garde qui ne se déclenche que sur le chemin
 * réussi ne garde rien : c'est le chemin RATÉ que l'attaquant emprunte, mille
 * fois de suite.
 *
 * ## Pourquoi l'invalidation est écrite en BASE
 *
 * Le compteur vit dans le cache — comme le limiteur de renvoi voisin. Un cache
 * peut se vider, et un compteur qui repart à zéro n'est pas un compteur. Le
 * plafond atteint écrit donc son verdict là où il DURE : la demande en attente
 * est effacée de la ligne `User`. Même cache vidé, le code deviné n'ouvre plus
 * rien — il n'y a plus de demande à confirmer.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/normalize', () => ({
  normalizeEmail: (e: string) => e.toLowerCase(),
  normalizePhoneNumber: (p: string) => `+33${p.replace(/\D/g, '').slice(-9)}`,
}));
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({ sendEmailChangeVerification: jest.fn<any>().mockResolvedValue(undefined) })),
}));
jest.mock('../../../../services/SmsService', () => ({
  smsService: { sendVerificationCode: jest.fn<any>().mockResolvedValue({ success: true, provider: 'test' }) },
}));

/** Un cache STATEFUL : sans état, un compteur ne peut pas être observé. */
const memoire = new Map<string, string>();
let cacheLeve = false;
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    get: async (k: string) => { if (cacheLeve) throw new Error('cache indisponible'); return memoire.get(k) ?? null; },
    set: async (k: string, v: string) => { if (cacheLeve) throw new Error('cache indisponible'); memoire.set(k, v); },
    del: async (k: string) => { memoire.delete(k); },
  }),
}));

import { verifyPhoneChange, resendEmailChangeVerification } from '../../../../routes/users/contact-change';

const USER_ID = '507f1f77bcf86cd799439011';
const CODE_JUSTE = '123456';

import { createHash } from 'crypto';
const hache = (v: string) => createHash('sha256').update(v).digest('hex');

function prismaAvecDemandeEnAttente() {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: USER_ID,
        phoneNumber: '+33600000000',
        pendingPhoneNumber: '+33611111111',
        pendingPhoneVerificationCode: hache(CODE_JUSTE),
        pendingPhoneVerificationExpiry: new Date(Date.now() + 900_000),
        pendingEmail: 'nouveau@test.com',
      }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  } as any;
}

async function monter(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  await verifyPhoneChange(app);
  await resendEmailChangeVerification(app);
  await app.ready();
  return app;
}

beforeEach(() => { memoire.clear(); cacheLeve = false; });

describe('#4184 — les essais sur le code SMS sont COMPTÉS, et le compte est celui des échecs', () => {
  /**
   * « Cinq essais PUIS invalidation » : les cinq essais sont le crédit, et
   * c'est leur épuisement — le cinquième échec — qui annule la demande. Le
   * témoin fixe cette lecture, parce que l'autre (« cinq échecs tolérés, le
   * sixième annule ») accorde un essai de plus sans que rien ne le dise.
   */
  it('annule la demande au CINQUIÈME échec, après quatre refus ordinaires', async () => {
    const prisma = prismaAvecDemandeEnAttente();
    const app = await monter(prisma);

    for (let i = 0; i < 4; i++) {
      const res = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '000000' } });
      expect(res.statusCode).toBe(400);
    }

    const cinquieme = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '000000' } });
    expect(cinquieme.statusCode).toBe(429);

    // Le verdict est écrit LÀ OÙ IL DURE : un cache vidé ne doit pas rendre
    // le code de nouveau devinable.
    const effacements = prisma.user.update.mock.calls.filter(
      (appel: any[]) => appel[0]?.data?.pendingPhoneNumber === null
    );
    expect(effacements.length).toBeGreaterThan(0);

    await app.close();
  });

  it('laisse passer le BON code tant que le plafond n\'est pas atteint', async () => {
    const prisma = prismaAvecDemandeEnAttente();
    const app = await monter(prisma);

    await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '000000' } });
    const bon = await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: CODE_JUSTE } });

    expect(bon.statusCode).toBe(200);

    await app.close();
  });

  /**
   * Sans ce témoin, un compteur qui ne se remet jamais à zéro passerait le
   * premier test et enfermerait un utilisateur légitime pour une faute de
   * frappe — une garde qui protège en cassant le produit n'est pas une garde.
   */
  it('remet le compteur à zéro après une vérification réussie', async () => {
    const prisma = prismaAvecDemandeEnAttente();
    const app = await monter(prisma);

    await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: '000000' } });
    await app.inject({ method: 'POST', url: '/users/me/verify-phone-change', payload: { code: CODE_JUSTE } });

    const cles = [...memoire.keys()].filter((k) => k.includes('verify-phone'));
    expect(cles).toEqual([]);

    await app.close();
  });
});

describe('#4184 — le limiteur de renvoi échoue FERMÉ', () => {
  /**
   * Il lisait le cache et laissait passer quand la lecture ne rendait rien.
   * Un cache indisponible ouvrait donc l'envoi d'e-mails en boucle : la panne
   * du gardien devenait l'absence de garde.
   */
  it('refuse le renvoi quand le cache est indisponible, au lieu d\'envoyer', async () => {
    const prisma = prismaAvecDemandeEnAttente();
    const app = await monter(prisma);
    cacheLeve = true;

    const res = await app.inject({ method: 'POST', url: '/users/me/resend-email-change-verification', payload: {} });

    expect(res.statusCode).toBe(429);

    await app.close();
  });
});
