/**
 * Cycle 124 — la langue de CADRAGE d'un destinataire NOMMÉ.
 *
 * `NotificationService.resolveRecipientPrism` en porte la règle, et son
 * doc-comment l'énonce : la langue de cadrage est « le rang le plus haut
 * RENSEIGNÉ », ce que rend `resolveUserLanguage` — pas `systemLanguage`.
 *
 * Cette SSOT ne servait que les éventails de messages. Les JOBS qui écrivent
 * vers un destinataire nommé — l'e-mail de réengagement, les deux canaux de
 * diffusion admin, le rappel de suppression de compte — lisaient
 * `user.systemLanguage` en direct. Trois conséquences distinctes, une famille
 * de témoins pour chacune :
 *
 *  1. RANG — un rang 1 vide ne fait pas tomber au rang 2, il fait tomber au
 *     REPLI : un lecteur qui n'a renseigné que `regionalLanguage: 'es'` (ou
 *     dont seule la `deviceLocale` est connue, rang 4) reçoit de l'anglais.
 *  2. NORMALISATION — les prefs sont persistées verbatim. Aux deux canaux de
 *     diffusion, la langue sert de CLÉ dans `translatedSubjects` /
 *     `translatedBodies` : `'pt-BR'` ne matche aucune entrée, et la diffusion
 *     retombe sur la langue de l'AUTEUR alors qu'une traduction `pt` existe.
 *  3. SELECT — la descente est impossible en aval, silencieusement, si la
 *     requête ne ramène pas les colonnes du Prisme. C'est le seul témoin de ce
 *     lot qui regarde la requête plutôt que le rendu : un mock rend ce qu'on
 *     lui dit quel que soit le `select`, donc aucun témoin de RANG ne peut
 *     attraper une projection trop étroite.
 *
 * Le REPLI terminal de chaque site est PRÉSERVÉ ('en' ici, là où
 * `resolveUserLanguage` rendrait 'fr') : le correctif ajoute la descente, il ne
 * trancheZ pas la question produit « quelle langue pour un compte sans AUCUNE
 * préférence ». Un témoin d'anti-régression le fixe.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
  notificationLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  securityLogger: { logViolation: jest.fn(), logAttempt: jest.fn(), logSuccess: jest.fn() },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { NotificationDigestJob } from '../../../jobs/notification-digest';
import { BroadcastInAppSenderJob } from '../../../jobs/broadcast-inapp-sender';
import { BroadcastSenderJob } from '../../../jobs/broadcast-sender';
import { MaintenanceService } from '../../../services/MaintenanceService';

/** Les quatre colonnes SANS lesquelles la descente du Prisme est impossible. */
const PRISM_COLUMNS = [
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'deviceLocale',
] as const;

function expectSelectsThePrism(select: Record<string, unknown> | undefined): void {
  for (const column of PRISM_COLUMNS) {
    expect(select?.[column]).toBe(true);
  }
}

/** Un lecteur dont le rang 1 est VIDE et dont seul un rang inférieur parle. */
const RANK_2_ONLY = {
  systemLanguage: null,
  regionalLanguage: 'es',
  customDestinationLanguage: null,
  deviceLocale: null,
};

const RANK_4_ONLY = {
  systemLanguage: null,
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: 'de-DE',
};

const NO_PREFERENCE_AT_ALL = {
  systemLanguage: null,
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
};

// ============================================================
// 1. E-mail de réengagement (NotificationDigestJob)
// ============================================================

describe('digest de réengagement — la langue de l\'e-mail descend le Prisme', () => {
  function makeDigestJob(user: Record<string, unknown>) {
    const pending = [{
      id: 'n1',
      context: { conversationId: 'conv-1' },
      createdAt: new Date('2026-08-24T10:00:00Z'),
      delivery: { emailSent: false },
      userId: 'user-1',
    }];

    const prisma = {
      notification: {
        findMany: jest.fn<any>().mockImplementation((args: any) =>
          args?.select?.userId && !args?.orderBy
            ? Promise.resolve([{ userId: 'user-1', delivery: { emailSent: false } }])
            : Promise.resolve(pending)
        ),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      userPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({
          email: 'lector@example.test',
          displayName: 'Lector',
          username: 'lector',
          isActive: true,
          ...user,
        }),
      },
    } as any;

    const sendNotificationDigestEmail = jest.fn<any>().mockResolvedValue({ success: true });
    const emailService = { sendNotificationDigestEmail } as any;
    const magicLinkService = {
      issueLoginTokenForUser: jest.fn<any>().mockResolvedValue('tok'),
    } as any;

    return {
      job: new NotificationDigestJob(prisma, emailService, magicLinkService),
      prisma,
      sendNotificationDigestEmail,
    };
  }

  it('rang 2 servi quand le rang 1 est vide (regionalLanguage: es)', async () => {
    const { job, sendNotificationDigestEmail } = makeDigestJob(RANK_2_ONLY);

    await job.runNow();

    expect(sendNotificationDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'es' })
    );
  });

  it('rang 4 servi quand seule la locale appareil est connue', async () => {
    const { job, sendNotificationDigestEmail } = makeDigestJob(RANK_4_ONLY);

    await job.runNow();

    expect(sendNotificationDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'de' })
    );
  });

  it('la préférence est normalisée : « pt-BR » atteint les traductions « pt »', async () => {
    const { job, sendNotificationDigestEmail } = makeDigestJob({
      ...NO_PREFERENCE_AT_ALL,
      systemLanguage: 'pt-BR',
    });

    await job.runNow();

    expect(sendNotificationDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'pt' })
    );
  });

  it('repli du SITE préservé quand aucun rang n\'est renseigné', async () => {
    const { job, sendNotificationDigestEmail } = makeDigestJob(NO_PREFERENCE_AT_ALL);

    await job.runNow();

    expect(sendNotificationDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' })
    );
  });

  it('la requête ramène les quatre colonnes du Prisme', async () => {
    const { job, prisma } = makeDigestJob(RANK_2_ONLY);

    await job.runNow();

    expectSelectsThePrism(prisma.user.findUnique.mock.calls.at(-1)?.[0]?.select);
  });
});

// ============================================================
// 2. Diffusion admin — canal IN-APP
// ============================================================

describe('diffusion admin in-app — le sujet/corps descend le Prisme', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  function makeInAppJob(user: Record<string, unknown>, broadcast: Record<string, unknown> = {}) {
    const prisma = {
      adminBroadcast: {
        findUnique: jest.fn<any>().mockResolvedValue({
          id: 'bc-1',
          status: 'READY',
          subject: 'Default subject',
          body: 'Default body',
          sourceLanguage: 'en',
          translatedSubjects: { es: 'Asunto ES', pt: 'Assunto PT', de: 'Betreff DE' },
          translatedBodies: { es: 'Cuerpo ES', pt: 'Corpo PT', de: 'Inhalt DE' },
          targeting: {},
          ...broadcast,
        }),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      user: {
        count: jest.fn<any>().mockResolvedValue(1),
        findMany: jest.fn<any>()
          .mockResolvedValueOnce([{ id: 'u-1', ...user }])
          .mockResolvedValue([]),
      },
    } as any;

    const createSystemNotification = jest.fn<any>().mockResolvedValue({ id: 'n-1' });

    return {
      job: new BroadcastInAppSenderJob(prisma, { createSystemNotification } as any),
      prisma,
      createSystemNotification,
    };
  }

  it('rang 2 servi quand le rang 1 est vide', async () => {
    const { job, createSystemNotification } = makeInAppJob(RANK_2_ONLY);

    await job.execute('bc-1');

    expect(createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'es', title: 'Asunto ES', content: 'Cuerpo ES' })
    );
  });

  it('rang 4 servi quand seule la locale appareil est connue', async () => {
    const { job, createSystemNotification } = makeInAppJob(RANK_4_ONLY);

    await job.execute('bc-1');

    expect(createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'de', title: 'Betreff DE', content: 'Inhalt DE' })
    );
  });

  it('« pt-BR » atteint la traduction « pt » plutôt que la langue de l\'auteur', async () => {
    const { job, createSystemNotification } = makeInAppJob({
      ...NO_PREFERENCE_AT_ALL,
      systemLanguage: 'pt-BR',
    });

    await job.execute('bc-1');

    expect(createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'pt', title: 'Assunto PT', content: 'Corpo PT' })
    );
  });

  it('repli du SITE préservé quand aucun rang n\'est renseigné', async () => {
    const { job, createSystemNotification } = makeInAppJob(NO_PREFERENCE_AT_ALL);

    await job.execute('bc-1');

    expect(createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en' })
    );
  });

  it('la requête ramène les quatre colonnes du Prisme', async () => {
    const { job, prisma } = makeInAppJob(RANK_2_ONLY);

    await job.execute('bc-1');

    expectSelectsThePrism(prisma.user.findMany.mock.calls[0]?.[0]?.select);
  });
});

// ============================================================
// 3. Diffusion admin — canal E-MAIL
// ============================================================

describe('diffusion admin e-mail — le sujet/corps descend le Prisme', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  function makeEmailJob(user: Record<string, unknown>) {
    const prisma = {
      adminBroadcast: {
        findUnique: jest.fn<any>().mockResolvedValue({
          id: 'bc-1',
          status: 'SENDING',
          subject: 'Default subject',
          body: 'Default body',
          sourceLanguage: 'en',
          translatedSubjects: { es: 'Asunto ES', pt: 'Assunto PT', de: 'Betreff DE' },
          translatedBodies: { es: 'Cuerpo ES', pt: 'Corpo PT', de: 'Inhalt DE' },
          targeting: {},
        }),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      user: {
        count: jest.fn<any>().mockResolvedValue(1),
        findMany: jest.fn<any>()
          .mockResolvedValueOnce([{
            id: 'u-1',
            email: 'lector@example.test',
            displayName: 'Lector',
            username: 'lector',
            ...user,
          }])
          .mockResolvedValue([]),
      },
      userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    } as any;

    const sendBroadcastEmail = jest.fn<any>().mockResolvedValue({ success: true });

    return {
      job: new BroadcastSenderJob(prisma, { sendBroadcastEmail } as any),
      prisma,
      sendBroadcastEmail,
    };
  }

  it('rang 2 servi quand le rang 1 est vide', async () => {
    const { job, sendBroadcastEmail } = makeEmailJob(RANK_2_ONLY);

    await job.execute('bc-1');

    expect(sendBroadcastEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'es', subject: 'Asunto ES', body: 'Cuerpo ES' })
    );
  });

  it('« pt-BR » atteint la traduction « pt » plutôt que la langue de l\'auteur', async () => {
    const { job, sendBroadcastEmail } = makeEmailJob({
      ...NO_PREFERENCE_AT_ALL,
      systemLanguage: 'pt-BR',
    });

    await job.execute('bc-1');

    expect(sendBroadcastEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'pt', subject: 'Assunto PT', body: 'Corpo PT' })
    );
  });

  it('la requête ramène les quatre colonnes du Prisme', async () => {
    const { job, prisma } = makeEmailJob(RANK_2_ONLY);

    await job.execute('bc-1');

    expectSelectsThePrism(prisma.user.findMany.mock.calls[0]?.[0]?.select);
  });
});

// ============================================================
// 4. Rappel de suppression de compte (MaintenanceService)
// ============================================================

describe('rappel de suppression — langue ET format de date suivent le lecteur', () => {
  function makeMaintenance(user: Record<string, unknown>) {
    const prisma = {
      accountDeletionRequest: {
        findMany: jest.fn<any>()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{
            id: 'req-1',
            userId: 'u-1',
            reminderCount: 0,
            gracePeriodEndsAt: new Date('2026-09-15T00:00:00Z'),
            user: {
              email: 'lector@example.test',
              displayName: 'Lector',
              firstName: 'Lector',
              ...user,
            },
          }]),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      $transaction: jest.fn<any>().mockResolvedValue([]),
      user: { update: jest.fn<any>().mockResolvedValue({}) },
    } as any;

    const sendAccountDeletionReminderEmail = jest.fn<any>().mockResolvedValue({ success: true });
    const service = new MaintenanceService(
      prisma,
      {} as any,
      { sendAccountDeletionReminderEmail } as any,
    );

    return { service, sendAccountDeletionReminderEmail, prisma };
  }

  it('rang 2 servi quand le rang 1 est vide', async () => {
    const { service, sendAccountDeletionReminderEmail } = makeMaintenance(RANK_2_ONLY);

    await (service as any).processAccountDeletionRequests();

    expect(sendAccountDeletionReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'es' })
    );
  });

  it('la date de fin de grâce est formatée dans la langue SERVIE, pas en fr-FR', async () => {
    const { service, sendAccountDeletionReminderEmail } = makeMaintenance(RANK_4_ONLY);

    await (service as any).processAccountDeletionRequests();

    const sent = sendAccountDeletionReminderEmail.mock.calls.at(-1)?.[0] as
      { language: string; gracePeriodEndDate: string };

    expect(sent.language).toBe('de');
    // « 15. September 2026 » en allemand — jamais « 15 septembre 2026 ».
    expect(sent.gracePeriodEndDate).toContain('September');
    expect(sent.gracePeriodEndDate).not.toContain('septembre');
  });

  it('la requête ramène les quatre colonnes du Prisme', async () => {
    const { service, prisma } = makeMaintenance(RANK_2_ONLY);

    await (service as any).processAccountDeletionRequests();

    const reminderQuery = prisma.accountDeletionRequest.findMany.mock.calls.at(-1)?.[0];
    expectSelectsThePrism(reminderQuery?.include?.user?.select);
  });
});
