/**
 * LES NOTIFICATIONS DU PARTAGE DE POSITION (#19204) — `location_share_started` (prévenir) et
 * `location_share_requested` (prolonger, redemander), cadrées dans la langue du LECTEUR. Un nom,
 * une durée ou une demande : jamais une position. Le pipeline (`createNotification`) décide du
 * reste : la préférence `locationShareEnabled`, le blocage, la sourdine.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { sharedLocationNoticesOf, type SharedLocationNotifier } from '../../../../services/sharedLocation/sharedLocationNotices';
import { refusesActorContent } from '../../../../services/notifications/blocked-actor-content';
import { table } from '../../../helpers/messaging-circle-world';

const EMETTEUR = '6800000000000000000000e1';
const LECTEUR = '6800000000000000000000b1';
const AT = '2026-11-17T10:00:00.000Z';
const TERME = '2026-11-17T18:00:00.000Z';

function monde(readerLang: Record<string, string | null> = { systemLanguage: 'fr' }) {
  const created: Array<Parameters<SharedLocationNotifier['createNotification']>[0]> = [];
  const notifications: SharedLocationNotifier = {
    createNotification: async (params) => {
      created.push(params);
      return { id: 'n1' } as never;
    },
  };
  const lang = { regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null };
  const prisma = {
    user: table([
      { id: EMETTEUR, username: 'leo', displayName: 'Léo', avatar: null, systemLanguage: 'fr', ...lang },
      { id: LECTEUR, username: 'awa', displayName: null, avatar: null, ...lang, ...readerLang },
    ]),
  };
  const claimed = new Set<string>();
  const claim = async (key: string) => (claimed.has(key) ? false : (claimed.add(key), true));
  return { notices: sharedLocationNoticesOf({ prisma: prisma as never, notifications, claim, now: () => Date.parse(AT) }), created };
}

describe('prévenu d\'un partage (#19204)', () => {
  it('le destinataire lit le nom et la durée, dans sa langue, et rien d\'autre', async () => {
    const m = monde();

    await m.notices.started([{ emitterId: EMETTEUR, readerId: LECTEUR, durationMinutes: 480, expiresAt: TERME }]);

    expect(m.created).toHaveLength(1);
    expect(m.created[0]).toMatchObject({
      userId: LECTEUR,
      type: 'location_share_started',
      priority: 'normal',
      lang: 'fr',
      title: 'Léo partage sa position avec toi',
      content: 'Pendant 8 h — touche pour le voir sur la carte',
      metadata: { action: 'view_profile', userId: EMETTEUR, durationMinutes: 480 },
      collapseId: `location-share-${EMETTEUR}`,
      context: {},
    });
    expect(m.created[0]?.expiresAt).toEqual(new Date(TERME));
    expect(JSON.stringify(m.created)).not.toMatch(/latitude|longitude|precision/);
  });

  it('la langue de cadrage descend le prisme du lecteur (rang 2)', async () => {
    const m = monde({ systemLanguage: null, regionalLanguage: 'en' });

    await m.notices.started([{ emitterId: EMETTEUR, readerId: LECTEUR, durationMinutes: 60, expiresAt: TERME }]);

    expect(m.created[0]).toMatchObject({ lang: 'en', title: 'Léo is sharing their location with you', content: 'For 1 h — tap to see them on the map' });
  });

  it('une durée qui n\'est pas une heure pleine se dit en minutes', async () => {
    const m = monde();

    await m.notices.started([{ emitterId: EMETTEUR, readerId: LECTEUR, durationMinutes: 10, expiresAt: TERME }]);

    expect(m.created[0]).toMatchObject({ content: 'Pendant 10 min — touche pour le voir sur la carte', metadata: { durationMinutes: 10 } });
  });

  it('un compte introuvable n\'est pas prévenu, sans arrêter les autres', async () => {
    const m = monde();

    await m.notices.started([
      { emitterId: EMETTEUR, readerId: '6800000000000000000000ff', durationMinutes: 60, expiresAt: TERME },
      { emitterId: EMETTEUR, readerId: LECTEUR, durationMinutes: 60, expiresAt: TERME },
    ]);

    expect(m.created.map((c) => c.userId)).toEqual([LECTEUR]);
  });

  it('arrêter puis relancer ne prévient pas deux fois dans la fenêtre : un avis par paire, jamais une rafale', async () => {
    const m = monde();
    const avis = { emitterId: EMETTEUR, readerId: LECTEUR, durationMinutes: 60, expiresAt: TERME };

    await m.notices.started([avis]);
    await m.notices.started([avis]);
    await m.notices.started([avis]);

    expect(m.created).toHaveLength(1);
  });

  it('le plafond est par paire : un autre destinataire du même émetteur est prévenu', async () => {
    const m = monde();

    await m.notices.started([{ emitterId: EMETTEUR, readerId: LECTEUR, durationMinutes: 60, expiresAt: TERME }]);
    await m.notices.started([{ emitterId: LECTEUR, readerId: EMETTEUR, durationMinutes: 60, expiresAt: TERME }]);

    expect(m.created.map((c) => c.userId)).toEqual([LECTEUR, EMETTEUR]);
  });

  it('un compte introuvable ne consomme pas le plafond de la paire', async () => {
    const created: unknown[] = [];
    const claimed: string[] = [];
    const notices = sharedLocationNoticesOf({
      prisma: { user: table([]) } as never,
      notifications: { createNotification: async (p) => (created.push(p), { id: 'n' } as never) },
      claim: async (key) => (claimed.push(key), true),
    });

    await notices.started([{ emitterId: EMETTEUR, readerId: LECTEUR, durationMinutes: 60, expiresAt: TERME }]);

    expect(claimed).toEqual([]);
    expect(created).toEqual([]);
  });
});

describe('un avis qui ne part pas ne consomme pas la fenêtre de la paire (#19204)', () => {
  const avecCreation = (createNotification: SharedLocationNotifier['createNotification']) => {
    const claimed = new Set<string>();
    const lang = { regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null };
    const notices = sharedLocationNoticesOf({
      prisma: { user: table([
        { id: EMETTEUR, username: 'leo', displayName: 'Léo', avatar: null, systemLanguage: 'fr', ...lang },
        { id: LECTEUR, username: 'awa', displayName: null, avatar: null, systemLanguage: 'fr', ...lang },
      ]) } as never,
      notifications: { createNotification },
      claim: async (key) => (claimed.has(key) ? false : (claimed.add(key), true)),
      release: async (key) => { claimed.delete(key); },
    });
    return { notices, claimed };
  };
  const notice = { emitterId: EMETTEUR, readerId: LECTEUR, durationMinutes: 60, expiresAt: TERME };

  it('la création lève : la clé est rendue, le démarrage suivant prévient', async () => {
    const created: unknown[] = [];
    let panne = true;
    const m = avecCreation(async (p) => {
      if (panne) throw new Error('panne');
      created.push(p);
      return { id: 'n' } as never;
    });

    await m.notices.started([notice]);
    panne = false;
    await m.notices.started([notice]);

    expect(created).toHaveLength(1);
  });

  it('la création rend null : la clé est rendue', async () => {
    const m = avecCreation(async () => null);

    await m.notices.started([notice]);

    expect(m.claimed.size).toBe(0);
  });
});

describe('une demande adressée à l\'émetteur (#19204)', () => {
  it('« prolonger » : l\'émetteur lit qui demande et que rien ne change sans lui', async () => {
    const m = monde();

    const sent = await m.notices.requested({ emitterId: LECTEUR, requesterId: EMETTEUR, kind: 'extend', requestedAt: AT });

    expect(sent).toBe(true);
    expect(m.created[0]).toMatchObject({
      userId: LECTEUR,
      type: 'location_share_requested',
      title: 'Léo te demande de prolonger ton partage de position',
      content: 'Rien ne change tant que tu ne relances pas le partage',
      metadata: { action: 'view_profile', userId: EMETTEUR, requestKind: 'extend' },
      collapseId: `location-request-${EMETTEUR}`,
    });
  });

  it('« redemander » a son propre titre', async () => {
    const m = monde();

    await m.notices.requested({ emitterId: LECTEUR, requesterId: EMETTEUR, kind: 'reask', requestedAt: AT });

    expect(m.created[0]?.title).toBe('Léo te demande de partager de nouveau ta position');
    expect(m.created[0]?.metadata).toEqual({ action: 'view_profile', userId: EMETTEUR, requestKind: 'reask' });
  });

  it('sans service de notification, rien ne part et rien ne lève', async () => {
    const prisma = { user: table([]) };
    const notices = sharedLocationNoticesOf({ prisma: prisma as never, notifications: null, claim: async () => true });

    await notices.started([{ emitterId: EMETTEUR, readerId: LECTEUR, durationMinutes: 60, expiresAt: TERME }]);
    expect(await notices.requested({ emitterId: LECTEUR, requesterId: EMETTEUR, kind: 'extend', requestedAt: AT })).toBe(false);
  });
});

describe('le dernier recours du blocage tient les deux types (#19204)', () => {
  it('une personne bloquée ne reçoit ni l\'avis ni la demande', async () => {
    const prisma = {
      user: table([
        { id: EMETTEUR, isActive: true, deletedAt: null, blockedUserIds: [LECTEUR] },
        { id: LECTEUR, isActive: true, deletedAt: null, blockedUserIds: [] },
      ]),
    };
    for (const type of ['location_share_started', 'location_share_requested'] as const) {
      expect(await refusesActorContent(prisma as never, { type, recipientId: LECTEUR, actorId: EMETTEUR })).toBe(true);
    }
  });
});
