/**
 * Unit tests for BroadcastSenderJob.execute.
 * Covers: broadcast not found, wrong status, no recipients (→ SENT),
 * happy path (email sent, final SENT), email failure (success:false),
 * email exception (continue to next user), all-fail (→ FAILED),
 * emailEnabled:false preference (skip user), language fallback resolution,
 * DB crash in outer try (→ FAILED with errorMessage).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { BroadcastSenderJob } from '../../../jobs/broadcast-sender';

// ─── Factories ────────────────────────────────────────────────────────────────

const BASE_BROADCAST = {
  id: 'bc-1',
  status: 'SENDING',
  subject: 'Default subject',
  body: 'Default body',
  sourceLanguage: 'en',
  translatedSubjects: {},
  translatedBodies: {},
  targeting: {},
};

const USER_FR = {
  id: 'u-fr',
  email: 'alice@example.com',
  displayName: 'Alice',
  username: 'alice',
  systemLanguage: 'fr',
};

const USER_EN = {
  id: 'u-en',
  email: 'bob@example.com',
  displayName: 'Bob',
  username: 'bob',
  systemLanguage: 'en',
};

function makePrisma(opts: {
  broadcast?: unknown;
  userCount?: number;
  users?: unknown[];
  userPrefs?: unknown;
  systemLanguageVariants?: readonly { systemLanguage: string }[];
} = {}) {
  const {
    broadcast = BASE_BROADCAST,
    userCount = 1,
    users = [USER_EN],
    userPrefs = null,
    systemLanguageVariants = [{ systemLanguage: 'fr' }, { systemLanguage: 'en' }],
  } = opts;

  const batchFindMany = jest.fn<any>()
    .mockResolvedValueOnce(users) // first batch
    .mockResolvedValue([]);        // subsequent batches → break

  return {
    adminBroadcast: {
      findUnique: jest.fn<any>().mockResolvedValue(broadcast),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      count: jest.fn<any>().mockResolvedValue(userCount),
      // #5161 — `buildBroadcastRecipientFilter` interroge d'abord les valeurs
      // `systemLanguage` verbatim distinctes (`findMany({ distinct: [...] })`)
      // avant de construire le filtre `in` ; ce n'est PAS le même appel que le
      // `findMany` de batch d'envoi, qui suit — brancher sur la PRÉSENCE de
      // `distinct` dans les arguments, jamais sur l'ordre d'appel.
      findMany: jest.fn<any>().mockImplementation((args: any) =>
        args?.distinct ? Promise.resolve(systemLanguageVariants) : batchFindMany(args)
      ),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(userPrefs),
    },
  };
}

function makeEmailService(sendResult: { success: boolean; error?: string } = { success: true }) {
  return {
    sendBroadcastEmail: jest.fn<any>().mockResolvedValue(sendResult),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── execute ─────────────────────────────────────────────────────────────────

describe('BroadcastSenderJob.execute', () => {
  it('returns early when broadcast is not found', async () => {
    const prisma = makePrisma({ broadcast: null });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    await sut.execute('bc-missing');

    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(emailService.sendBroadcastEmail).not.toHaveBeenCalled();
  });

  it('returns early when broadcast status is not SENDING', async () => {
    const prisma = makePrisma({ broadcast: { ...BASE_BROADCAST, status: 'SENT' } });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    await sut.execute('bc-1');

    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('marks broadcast as SENT immediately when there are no recipients', async () => {
    const prisma = makePrisma({ userCount: 0, users: [] });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    await sut.execute('bc-1');

    expect(prisma.adminBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT', completedAt: expect.any(Date) }),
      }),
    );
    expect(emailService.sendBroadcastEmail).not.toHaveBeenCalled();
  });

  it('sends an email to each recipient and marks broadcast as SENT', async () => {
    const prisma = makePrisma({ userCount: 1, users: [USER_EN] });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(emailService.sendBroadcastEmail).toHaveBeenCalledTimes(1);
    const lastCall = (prisma.adminBroadcast.update as jest.Mock<any>).mock.calls.at(-1)![0];
    expect(lastCall.data.status).toBe('SENT');
    expect(lastCall.data.sentCount).toBe(1);
    expect(lastCall.data.failedCount).toBe(0);
  });

  it('uses the user language to resolve subject/body from translations', async () => {
    const broadcast = {
      ...BASE_BROADCAST,
      translatedSubjects: { fr: 'Objet en français' },
      translatedBodies: { fr: 'Corps en français' },
    };
    const prisma = makePrisma({ broadcast, userCount: 1, users: [USER_FR] });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(emailService.sendBroadcastEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Objet en français', body: 'Corps en français' }),
    );
  });

  it('serves the ORIGINAL (source text) when no rank of the reader has a translation', async () => {
    // Prisme règle #1 : sans traduction vers une langue du lecteur, on affiche
    // le contenu ORIGINAL (`broadcast.subject`), jamais une entrée source→source
    // de la carte. Le lecteur est FR, seule une entrée `en` existe.
    const broadcast = {
      ...BASE_BROADCAST,
      sourceLanguage: 'en',
      translatedSubjects: { en: 'English subject' },
      translatedBodies: { en: 'English body' },
    };
    const prisma = makePrisma({ broadcast, userCount: 1, users: [USER_FR] });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(emailService.sendBroadcastEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Default subject', body: 'Default body' }),
    );
  });

  it('falls back to base subject/body when no translation exists', async () => {
    const prisma = makePrisma();
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(emailService.sendBroadcastEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Default subject', body: 'Default body' }),
    );
  });

  it('skips a user when emailEnabled preference is false', async () => {
    const prisma = makePrisma({
      userCount: 1,
      users: [USER_EN],
      userPrefs: { notification: { emailEnabled: false } },
    });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(emailService.sendBroadcastEmail).not.toHaveBeenCalled();
  });

  it('proceeds when user preferences are not found (prefs DB error)', async () => {
    const prisma = makePrisma();
    (prisma.userPreferences.findUnique as jest.Mock<any>).mockRejectedValue(new Error('DB error'));
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(emailService.sendBroadcastEmail).toHaveBeenCalledTimes(1);
  });

  it('increments failedCount when emailService returns success:false', async () => {
    const prisma = makePrisma();
    const emailService = makeEmailService({ success: false, error: 'SMTP timeout' });
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    const lastCall = (prisma.adminBroadcast.update as jest.Mock<any>).mock.calls.at(-1)![0];
    expect(lastCall.data.failedCount).toBe(1);
    expect(lastCall.data.sentCount).toBe(0);
  });

  it('increments failedCount and continues when emailService throws', async () => {
    const prisma = makePrisma({ userCount: 2, users: [USER_EN, USER_FR] });
    const emailService = makeEmailService();
    (emailService.sendBroadcastEmail as jest.Mock<any>)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ success: true });
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    const lastCall = (prisma.adminBroadcast.update as jest.Mock<any>).mock.calls.at(-1)![0];
    expect(lastCall.data.sentCount).toBe(1);
    expect(lastCall.data.failedCount).toBe(1);
    expect(lastCall.data.status).toBe('SENT'); // at least 1 succeeded
  });

  it('marks broadcast as FAILED when all emails fail', async () => {
    const prisma = makePrisma();
    const emailService = makeEmailService({ success: false, error: 'bad' });
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    const lastCall = (prisma.adminBroadcast.update as jest.Mock<any>).mock.calls.at(-1)![0];
    expect(lastCall.data.status).toBe('FAILED');
    expect(lastCall.data.errorMessage).toMatch(/failed/i);
  });

  it('marks broadcast as FAILED and persists error message when outer try block crashes', async () => {
    const prisma = makePrisma();
    (prisma.adminBroadcast.findUnique as jest.Mock<any>).mockRejectedValue(new Error('DB down'));
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    const lastCall = (prisma.adminBroadcast.update as jest.Mock<any>).mock.calls.at(-1)![0];
    expect(lastCall.data.status).toBe('FAILED');
    expect(lastCall.data.errorMessage).toBe('DB down');
  });

  it('passes unsubscribeUrl from FRONTEND_URL env var', async () => {
    const original = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://myapp.test';
    const prisma = makePrisma();
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(emailService.sendBroadcastEmail).toHaveBeenCalledWith(
      expect.objectContaining({ unsubscribeUrl: 'https://myapp.test/settings/notifications' }),
    );
    process.env.FRONTEND_URL = original;
  });

  it('includes totalRecipients in the first adminBroadcast.update call', async () => {
    const prisma = makePrisma({ userCount: 3, users: [USER_EN] });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(prisma.adminBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { totalRecipients: 3 } }),
    );
  });

  it('applies language filter to the user query when targeting.languages is set', async () => {
    const broadcast = {
      ...BASE_BROADCAST,
      targeting: { languages: ['fr', 'es'] },
    };
    const prisma = makePrisma({
      broadcast,
      userCount: 0,
      users: [],
      systemLanguageVariants: [{ systemLanguage: 'fr' }, { systemLanguage: 'es' }],
    });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ systemLanguage: { in: ['fr', 'es'] } }),
      }),
    );
  });

  it('expands a canonical language target to its verbatim systemLanguage variants (#5161)', async () => {
    // 'fr' est choisi dans l'UI admin ; en base, trois variantes verbatim
    // convergent vers 'fr' et une ne convergent pas ('en') — seules les trois
    // premières doivent entrer dans le filtre `in`.
    const broadcast = {
      ...BASE_BROADCAST,
      targeting: { languages: ['fr'] },
    };
    const prisma = makePrisma({
      broadcast,
      userCount: 0,
      users: [],
      systemLanguageVariants: [
        { systemLanguage: 'fr' },
        { systemLanguage: 'FR' },
        { systemLanguage: 'fr-FR' },
        { systemLanguage: 'en' },
      ],
    });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    const where = (prisma.user.count as jest.Mock<any>).mock.calls[0][0].where;
    expect([...where.systemLanguage.in].sort()).toEqual(['FR', 'fr', 'fr-FR']);
  });

  it('applies country filter when targeting.countries is set', async () => {
    const broadcast = {
      ...BASE_BROADCAST,
      targeting: { countries: ['FR', 'DE'] },
    };
    const prisma = makePrisma({ broadcast, userCount: 0, users: [] });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ registrationCountry: { in: ['FR', 'DE'] } }),
      }),
    );
  });

  it('always filters to emailVerifiedAt:not-null and isActive:true', async () => {
    const prisma = makePrisma({ userCount: 0, users: [] });
    const emailService = makeEmailService();
    const sut = new BroadcastSenderJob(prisma as any, emailService as any);

    const promise = sut.execute('bc-1');
    await jest.runAllTimersAsync();
    await promise;

    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailVerifiedAt: { not: null },
          isActive: true,
        }),
      }),
    );
  });
});
