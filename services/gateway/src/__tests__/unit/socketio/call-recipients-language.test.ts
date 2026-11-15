/**
 * La langue dans laquelle une poussée d'appel ADRESSE son destinataire (#8074).
 *
 * « Maria vous appelle » est du CADRAGE : il se descend par le site unique
 * `recipient-language.ts`, sur les quatre rangs du Prisme. Les témoins sont
 * écrits sur des rangs AUTRES que le premier — au rang 1, une descente amputée
 * rendrait le même verdict (leçon 261).
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { resolveNotificationLangs } from '../../../socketio/call-recipients';
import { buildIncomingCallPushes } from '../../../services/call-incoming-push';

type Row = {
  id: string;
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  deviceLocale?: string | null;
};

const prismaReturning = (rows: Row[]) => {
  const findMany = jest.fn(async (_query: unknown) => rows);
  return { prisma: { user: { findMany } } as unknown as PrismaClient, findMany };
};

const pushInput = (language: string | undefined) => ({
  calleeUserId: 'callee',
  callId: 'call-1',
  conversationId: 'conv-1',
  callerUserId: 'caller',
  callerName: 'Maria',
  callerAvatar: undefined,
  isVideo: false,
  language,
  iceServersJson: '[]',
  isChinaDevice: false,
  voipCapable: true,
});

describe('resolveNotificationLangs — la langue de cadrage d’un callee', () => {
  it('descend au rang 2 quand la langue système est absente', async () => {
    const { prisma } = prismaReturning([{ id: 'u1', systemLanguage: null, regionalLanguage: 'de' }]);

    const langs = await resolveNotificationLangs(prisma, ['u1']);

    expect(langs.get('u1')).toBe('de');
  });

  it('descend jusqu’à la locale de l’appareil (rang 4)', async () => {
    const { prisma } = prismaReturning([{ id: 'u1', deviceLocale: 'es-MX' }]);

    const langs = await resolveNotificationLangs(prisma, ['u1']);

    expect(langs.get('u1')).toBe('es');
  });

  it('charge les quatre colonnes du Prisme — une projection étroite amputerait la descente', async () => {
    const { prisma, findMany } = prismaReturning([]);

    await resolveNotificationLangs(prisma, ['u1']);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        systemLanguage: true,
        regionalLanguage: true,
        customDestinationLanguage: true,
        deviceLocale: true,
      }),
    }));
  });

  it('rend une carte vide sur erreur — la sonnerie part quand même, en repli', async () => {
    const findMany = jest.fn(async () => { throw new Error('db down'); });
    const prisma = { user: { findMany } } as unknown as PrismaClient;

    const langs = await resolveNotificationLangs(prisma, ['u1']);

    expect(langs.size).toBe(0);
  });
});

describe('la poussée VoIP parle la langue de SON destinataire', () => {
  it.each(['en', 'es', 'pt', 'de', 'it', 'ar', 'zh-Hans'])('%s — titre et corps de la famille Apple', (lang) => {
    const [apple] = buildIncomingCallPushes(pushInput(lang));

    expect(apple?.payload.title).toBe(notificationString(lang, 'call.incoming.title', { actor: 'Maria' }));
    expect(apple?.payload.body).toBe(notificationString(lang, 'call.incoming.body', { callType: 'audio' }));
    expect(apple?.payload.title).not.toBe('Maria vous appelle');
    expect(apple?.payload.body).not.toBe('');
  });
});
