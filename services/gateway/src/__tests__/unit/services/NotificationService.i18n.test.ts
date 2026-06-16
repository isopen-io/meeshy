import {
  NotificationService,
  formatSingleAttachmentLabelI18n,
  buildMessageNotificationBodyI18n,
} from '../../../services/notifications/NotificationService';

function makeService(users: Record<string, any>) {
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) =>
        users[where.id] ? { ...users[where.id] } : null,
      findMany: async ({ where }: any) =>
        (where.id.in as string[])
          .map(id => (users[id] ? { id, ...users[id] } : null))
          .filter(Boolean),
    },
  };
  return new NotificationService(prisma as any);
}

describe('resolveRecipientLang', () => {
  it('retourne systemLanguage (priorité Prisme 1)', async () => {
    const svc = makeService({ u1: { systemLanguage: 'en', deviceLocale: 'fr' } });
    expect(await (svc as any).resolveRecipientLang('u1')).toBe('en');
  });
  it('ne laisse pas deviceLocale supplanter systemLanguage', async () => {
    const svc = makeService({ u1: { systemLanguage: 'fr', deviceLocale: 'en' } });
    expect(await (svc as any).resolveRecipientLang('u1')).toBe('fr');
  });
  it('retombe sur fr si destinataire introuvable', async () => {
    const svc = makeService({});
    expect(await (svc as any).resolveRecipientLang('ghost')).toBe('fr');
  });
});

describe('resolveRecipientLangs (batch)', () => {
  it('mappe chaque destinataire à sa langue', async () => {
    const svc = makeService({
      a: { systemLanguage: 'en' },
      b: { systemLanguage: 'de' },
    });
    const map = await (svc as any).resolveRecipientLangs(['a', 'b', 'missing']);
    expect(map.get('a')).toBe('en');
    expect(map.get('b')).toBe('de');
    expect(map.get('missing')).toBe('fr');
  });
});

describe('attachments i18n', () => {
  it('localise le label d’un attachment unique', () => {
    expect(formatSingleAttachmentLabelI18n('en', { type: 'video', duration: 135000, fileSize: 15_000_000 }))
      .toMatch(/^🎬 Video · /);
    expect(formatSingleAttachmentLabelI18n('de', { type: 'image', width: 1920, height: 1080 }))
      .toMatch(/^📷 Foto · 1920×1080/);
  });
  it('localise le corps message avec badges multi-fichiers', () => {
    const body = buildMessageNotificationBodyI18n('es', {
      attachments: [{ type: 'image' }, { type: 'audio' }, { type: 'video' }],
    });
    expect(body).toContain('+1🎵');
    expect(body).toContain('📷 Foto');
  });
});
