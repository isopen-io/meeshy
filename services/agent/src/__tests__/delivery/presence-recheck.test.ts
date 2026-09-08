import { peutEncoreParler } from '../../delivery/presence-recheck';

const HEURE = 3_600_000;
const MAINTENANT = 1_800_000_000_000;

describe('peutEncoreParler() — la question posée au moment de livrer', () => {
  it('refuse quand la personne est revenue EN LIGNE', () => {
    expect(peutEncoreParler({
      isOnline: true, derniereConnexionMs: null, seuilHeures: 72, maintenantMs: MAINTENANT,
    })).toBe(false);
  });

  it('refuse même en ligne avec une connexion très ancienne', () => {
    expect(peutEncoreParler({
      isOnline: true,
      derniereConnexionMs: MAINTENANT - 5_000 * HEURE,
      seuilHeures: 72,
      maintenantMs: MAINTENANT,
    })).toBe(false);
  });

  it('refuse quand elle s\'est reconnectée depuis la mise en file', () => {
    expect(peutEncoreParler({
      isOnline: false,
      derniereConnexionMs: MAINTENANT - 2 * HEURE,
      seuilHeures: 72,
      maintenantMs: MAINTENANT,
    })).toBe(false);
  });

  it('accepte quand elle est toujours absente', () => {
    expect(peutEncoreParler({
      isOnline: false,
      derniereConnexionMs: MAINTENANT - 200 * HEURE,
      seuilHeures: 72,
      maintenantMs: MAINTENANT,
    })).toBe(true);
  });

  it('accepte quand elle n\'a AUCUNE session vivante', () => {
    expect(peutEncoreParler({
      isOnline: false, derniereConnexionMs: null, seuilHeures: 72, maintenantMs: MAINTENANT,
    })).toBe(true);
  });

  it('respecte le seuil CONFIGURÉ, pas une constante', () => {
    const connexion = MAINTENANT - 100 * HEURE;
    expect(peutEncoreParler({ isOnline: false, derniereConnexionMs: connexion, seuilHeures: 72, maintenantMs: MAINTENANT })).toBe(true);
    expect(peutEncoreParler({ isOnline: false, derniereConnexionMs: connexion, seuilHeures: 168, maintenantMs: MAINTENANT })).toBe(false);
  });

  it('refuse pile au seuil — la borne appartient à la présence', () => {
    expect(peutEncoreParler({
      isOnline: false,
      derniereConnexionMs: MAINTENANT - 72 * HEURE,
      seuilHeures: 72,
      maintenantMs: MAINTENANT,
    })).toBe(false);
  });
});

import { MongoPersistence } from '../../memory/mongo-persistence';

describe('getPresenceForDelivery() — la connexion se lit sur une session VIVANTE', () => {
  it('exige isValid ET une échéance non dépassée', async () => {
    const findFirst = jest.fn().mockResolvedValue({ lastActivityAt: new Date(1_000) });
    const findUnique = jest.fn().mockResolvedValue({ isOnline: false });
    const persistence = new MongoPersistence({
      userSession: { findFirst }, user: { findUnique },
    } as never);

    const p = await persistence.getPresenceForDelivery('u1');

    const where = findFirst.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(where.isValid).toBe(true);
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(p.derniereConnexionMs).toBe(1_000);
    expect(p.isOnline).toBe(false);
  });

  it('rend null quand aucune session ne vit', async () => {
    const persistence = new MongoPersistence({
      userSession: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue({ isOnline: false }) },
    } as never);

    expect((await persistence.getPresenceForDelivery('u1')).derniereConnexionMs).toBeNull();
  });

  it('ne lit JAMAIS User.lastActiveAt', async () => {
    const findUnique = jest.fn().mockResolvedValue({ isOnline: true });
    const persistence = new MongoPersistence({
      userSession: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique },
    } as never);

    await persistence.getPresenceForDelivery('u1');

    expect(findUnique.mock.calls[0][0].select).toEqual({ isOnline: true });
  });
});
