/**
 * `POST /admin/broadcasts/:id/preview` — ciblage et rapport de langue (#5161).
 *
 * FICHIER SÉPARÉ — `admin-routes-group3.test.ts` est un fichier hérité hors
 * budget (§ `gateway-test-file-size-budget.test.ts`) : un comportement neuf
 * rejoint un fichier à sa taille plutôt que le tas.
 *
 * `User.systemLanguage` est persisté VERBATIM (`fr`, `fr-FR`, `FR`, `fr_FR`
 * coexistent) : un `in` cru sur les codes canoniques saisis dans l'UI admin
 * rate toute variante région/casse, et un `groupBy` brut fragmente le rapport
 * en autant de buckets que de variantes. Ces témoins prouvent que le ciblage
 * ATTEINT les variantes (`resolveSystemLanguageVariants`) et que le rapport
 * les REPLIE sur leur code canonique en ADDITIONNANT les comptes — même SSOT
 * (`normalizeLanguageForDedup`) que #5146/#5155.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

const mockTranslateContent = jest.fn<any>();
jest.mock('../../../../services/admin/broadcast-translation.service', () => ({
  BroadcastTranslationService: jest.fn<any>().mockImplementation(() => ({
    translateContent: mockTranslateContent,
  })),
}));

jest.mock('../../../../jobs/broadcast-sender', () => ({
  BroadcastSenderJob: jest.fn<any>().mockImplementation(() => ({ execute: jest.fn<any>() })),
}));
jest.mock('../../../../jobs/broadcast-inapp-sender', () => ({
  BroadcastInAppSenderJob: jest.fn<any>().mockImplementation(() => ({ execute: jest.fn<any>() })),
}));
jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn<any>().mockImplementation(() => ({})),
}));

import { broadcastRoutes } from '../../../../routes/admin/broadcasts';

const VALID_ID = '507f1f77bcf86cd799439011';
const VALID_ADMIN_ID = '507f1f77bcf86cd799439099';

const mockPrisma: any = {
  adminBroadcast: {
    findUnique: jest.fn<any>(),
    update: jest.fn<any>(),
  },
  adminAuditLog: { create: jest.fn<any>() },
  user: {
    count: jest.fn<any>(),
    groupBy: jest.fn<any>(),
    // #5334 — le rapport par langue résout désormais le Prisme (rangs 1→4)
    // via un `findMany` sur les colonnes de `RECIPIENT_LANG_SELECT`, la MÊME
    // fonction que l'envoi réel — plus un `groupBy` brut sur `systemLanguage`
    // seul (rang 1).
    findMany: jest.fn<any>(),
  },
};

function fakeBroadcast(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_ID,
    name: 'Test broadcast',
    subject: 'Hello',
    body: 'Body text',
    sourceLanguage: 'fr',
    targeting: {},
    status: 'DRAFT',
    createdById: VALID_ADMIN_ID,
    translatedSubjects: null,
    translatedBodies: null,
    targetLanguages: [],
    totalRecipients: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('notificationService', { createSystemNotification: jest.fn<any>() });
  app.decorate('authenticate', async (request: any) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: VALID_ADMIN_ID, role: 'ADMIN', username: 'admin' } };
  });
  app.register(broadcastRoutes);
  return app;
}

type RecipientLangRow = {
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  deviceLocale?: string | null;
};

function setupPreviewMocks(opts: {
  targeting?: any;
  languageVariants?: string[];
  recipientLangUsers?: RecipientLangRow[];
} = {}) {
  const {
    targeting = {},
    languageVariants = [],
    recipientLangUsers = [
      { systemLanguage: 'en' }, { systemLanguage: 'en' }, { systemLanguage: 'en' },
      { systemLanguage: 'en' }, { systemLanguage: 'en' },
    ],
  } = opts;
  mockPrisma.adminBroadcast.findUnique.mockResolvedValue(fakeBroadcast({ targeting, status: 'DRAFT' }));
  mockPrisma.user.count.mockResolvedValue(10);
  // Le seul `groupBy` restant est celui du pays — le rapport de langue (#5334)
  // descend désormais le Prisme par-utilisateur, via `findMany`.
  mockPrisma.user.groupBy.mockResolvedValueOnce([{ registrationCountry: 'US', _count: 10 }]);
  // Deux appels `findMany` distincts partagent le même mock, discriminés par
  // leur forme : `resolveSystemLanguageVariants` (#5161) demande les valeurs
  // VERBATIM distinctes (`distinct: ['systemLanguage']`) pour élargir le
  // FILTRE ; le rapport de langue (#5334) demande les quatre colonnes du
  // Prisme (`RECIPIENT_LANG_SELECT`) pour chaque destinataire ciblé.
  mockPrisma.user.findMany.mockImplementation((args: any) => {
    if (args?.distinct?.includes('systemLanguage')) {
      return Promise.resolve(languageVariants.map(systemLanguage => ({ systemLanguage })));
    }
    return Promise.resolve(recipientLangUsers);
  });
  mockTranslateContent.mockResolvedValue({ subjects: {}, bodies: {} });
  mockPrisma.adminBroadcast.update.mockResolvedValue(fakeBroadcast({ status: 'READY' }));
}

describe('POST /:id/preview — ciblage et rapport de langue (#5161)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("widens the language targeting filter to every verbatim variant that folds to a targeted canonical code", async () => {
    setupPreviewMocks({ targeting: { languages: ['fr'] }, languageVariants: ['fr', 'FR', 'fr-CA', 'en'] });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
    expect(whereArg.systemLanguage.in).toEqual(expect.arrayContaining(['fr', 'FR', 'fr-CA']));
    expect(whereArg.systemLanguage.in).not.toContain('en');
  });

  it("resolves the language filter against every distinct variant present, even when none match", async () => {
    setupPreviewMocks({ targeting: { languages: ['de'] }, languageVariants: ['fr', 'en'] });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    const whereArg = mockPrisma.user.count.mock.calls[0][0].where;
    expect(whereArg.systemLanguage).toEqual({ in: [] });
  });

  it('folds recipientsByLanguage buckets onto their canonical code and sums their counts', async () => {
    setupPreviewMocks({
      recipientLangUsers: [
        { systemLanguage: 'fr' }, { systemLanguage: 'fr' }, { systemLanguage: 'fr' },
        { systemLanguage: 'FR' }, { systemLanguage: 'FR' },
        { systemLanguage: 'en' }, { systemLanguage: 'en' }, { systemLanguage: 'en' },
        { systemLanguage: 'en' }, { systemLanguage: 'en' },
      ],
    });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.recipientsByLanguage).toHaveLength(2);
    expect(body.data.recipientsByLanguage).toEqual(
      expect.arrayContaining([{ language: 'fr', count: 5 }, { language: 'en', count: 5 }])
    );
  });

  /**
   * #5334 — le défaut que #5161 ne pouvait pas voir : un compte dont la langue
   * applicative vit à un rang ≠ 1 (ici `regionalLanguage`, rang 2, faute de
   * `systemLanguage`) doit être compté dans SA langue résolue, pas perdu ou
   * mal rangé par un `groupBy` brut sur `systemLanguage` seul. Au rang 1, la
   * règle simple et la règle juste rendent le même verdict (leçon 261) — ce
   * témoin pose donc un compte dont le rang 1 est VIDE pour pouvoir tomber.
   */
  it('compte un destinataire par sa langue RÉSOLUE (Prisme), pas seulement systemLanguage (#5334)', async () => {
    setupPreviewMocks({
      recipientLangUsers: [
        { systemLanguage: null, regionalLanguage: 'es', customDestinationLanguage: null, deviceLocale: null },
        { systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
      ],
    });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.recipientsByLanguage).toEqual(
      expect.arrayContaining([{ language: 'es', count: 1 }, { language: 'en', count: 1 }])
    );
  });

  // La fixture cible l'ANGLAIS, pas le français : la diffusion est en `fr`
  // (`sourceLanguage`), et les cibles EXCLUENT la langue source (#5247). Le
  // repli `en-US`/`en_US` → `en` reste ce que ce témoin mesure ; l'écrire sur
  // `fr` faisait passer l'exclusion de la source pour une régression alors
  // qu'elle est le correctif.
  it('derives targetLanguages (sent to translation and persisted) from the CANONICAL buckets, not the verbatim ones', async () => {
    setupPreviewMocks({
      recipientLangUsers: [
        { systemLanguage: 'en' },
        { systemLanguage: 'en-US' },
        { systemLanguage: 'en_US' },
      ],
    });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    expect(mockTranslateContent).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), ['en']
    );
    expect(mockPrisma.adminBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetLanguages: ['en'] }) })
    );
  });

  /**
   * L'EXCLUSION DE LA SOURCE (#5247), et pourquoi elle n'est pas cosmétique :
   * demander `fr → fr` à NLLB ne rend pas le texte, il en rend une PARAPHRASE,
   * et la passerelle la range comme une traduction. Le lecteur francophone
   * reçoit alors une réécriture machine du texte de l'admin, présentée comme
   * l'original. C'est la règle que `MessageTranslationService` applique déjà —
   * « la langue source est retirée pour éviter une auto-traduction NLLB ».
   *
   * Le repli VERBATIM se fait AVANT l'exclusion : un destinataire en `fr-FR`
   * doit être exclu comme un destinataire en `fr`, sans quoi la variante
   * région-taguée rouvrirait la porte que la canonicalisation vient de fermer.
   */
  it('exclut la langue SOURCE des cibles — y compris sous ses variantes verbatim', async () => {
    setupPreviewMocks({
      recipientLangUsers: [
        { systemLanguage: 'fr' },
        { systemLanguage: 'FR' },
        { systemLanguage: 'fr-FR' },
        { systemLanguage: 'en' },
        { systemLanguage: 'en' },
      ],
    });

    const res = await app.inject({ method: 'POST', url: `/${VALID_ID}/preview` });

    expect(res.statusCode).toBe(200);
    expect(mockTranslateContent).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), ['en']
    );
    expect(mockPrisma.adminBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetLanguages: ['en'] }) })
    );
  });
});
