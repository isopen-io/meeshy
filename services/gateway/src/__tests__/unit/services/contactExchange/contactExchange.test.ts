/**
 * LE PARTAGE SANS CONTACT (#19205). L'émetteur choisit ce qu'il donne et reçoit un jeton bref,
 * signé, à usage unique, qui ne porte aucune donnée personnelle en clair. Le lecteur inscrit
 * l'accepte : il reçoit la vitrine si elle était offerte, la demande d'ami part si elle l'était
 * (sous blocage, comptes utilisables, préférence de réception), et l'émetteur apprend que c'est
 * reçu. Expiré, rejoué, contrefait, bloqué ou parti : le MÊME refus.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  CONTACT_EXCHANGE_ERROR_CODES,
  CONTACT_EXCHANGE_TOKEN_PATTERN,
  CONTACT_EXCHANGE_TTL_SECONDS,
} from '@meeshy/shared/types/contact-exchange';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  acceptContactExchange,
  issueContactExchange,
  type ContactExchangeDeps,
} from '../../../../services/contactExchange/contactExchange';

const EMETTEUR = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const LECTEUR = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const T0 = Date.UTC(2026, 10, 17, 12, 0, 0);

type Compte = {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  blockedUserIds: string[];
  isActive: boolean;
  deletedAt: Date | null;
  deactivatedAt: Date | null;
};

const compte = (id: string, username: string, overrides: Partial<Compte> = {}): Compte => ({
  id, username, displayName: username.toUpperCase(), avatar: null, blockedUserIds: [], isActive: true, deletedAt: null, deactivatedAt: null, ...overrides,
});

function guichet(options: { comptes?: Compte[]; acceptsRequests?: boolean; befriends?: boolean | 'panne'; vitrineServie?: boolean } = {}) {
  let clock = T0;
  const comptes = new Map((options.comptes ?? [compte(EMETTEUR, 'sofia'), compte(LECTEUR, 'aissa')]).map((c) => [c.id, c]));
  const cache = new Map<string, { value: string; until: number }>();
  const live = (key: string) => {
    const entry = cache.get(key);
    return entry && entry.until > clock ? entry : undefined;
  };
  const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
  const amities: Array<{ issuerId: string; readerId: string }> = [];
  const vitrines: string[] = [];
  const deps: ContactExchangeDeps = {
    prisma: {
      user: {
        findMany: async (args: { where: { id: { in: string[] } } }) => args.where.id.in.flatMap((id) => (comptes.has(id) ? [comptes.get(id)!] : [])),
      },
    } as never,
    io: { to: (room: string) => ({ emit: (event: string, payload: unknown) => { emissions.push({ room, event, payload }); return true; } }) } as never,
    now: () => clock,
    store: {
      put: async (key, value, ttlSeconds) => { cache.set(key, { value, until: clock + ttlSeconds * 1000 }); },
      read: async (key) => live(key)?.value ?? null,
      claim: async (key, ttlSeconds) => {
        if (live(key)) return false;
        cache.set(key, { value: '1', until: clock + ttlSeconds * 1000 });
        return true;
      },
    },
    vitrine: async (issuerId) => {
      vitrines.push(issuerId);
      return options.vitrineServie === false ? null : { id: issuerId, username: 'sofia', bio: 'Programmatrice de festival.' };
    },
    acceptsRequests: async () => options.acceptsRequests ?? true,
    befriend: async (pair) => {
      amities.push(pair);
      if (options.befriends === 'panne') throw new Error('base indisponible');
      return options.befriends ?? true;
    },
  };
  return {
    deps, emissions, amities, vitrines, cache,
    avance: (ms: number) => { clock += ms; },
    emettre: (offers: unknown, issuerId = EMETTEUR) => issueContactExchange(deps, { issuerId, payload: { offers } }),
    accepter: (token: string, readerId = LECTEUR) => acceptContactExchange(deps, { readerId, token }),
  };
}

const jeton = async (g: ReturnType<typeof guichet>, offers: unknown = ['vitrine', 'friendRequest']) => {
  const issued = await g.emettre(offers);
  if (!issued.success) throw new Error('émission refusée');
  return issued.data.token;
};

const REFUS = { success: false, error: 'Partage indisponible', code: CONTACT_EXCHANGE_ERROR_CODES.UNAVAILABLE };

describe('émettre un jeton de partage sans contact (#19205)', () => {
  it('rend un jeton bref qui ne contient ni identifiant, ni pseudo, et dit le verrou du numéro', async () => {
    const g = guichet();
    const issued = await g.emettre(['friendRequest', 'vitrine']);
    expect(issued).toEqual({
      success: true,
      data: {
        token: expect.stringMatching(CONTACT_EXCHANGE_TOKEN_PATTERN),
        expiresAt: new Date(T0 + CONTACT_EXCHANGE_TTL_SECONDS * 1000).toISOString(),
        offers: ['vitrine', 'friendRequest'],
        locked: ['phone'],
      },
    });
    const token = issued.success ? issued.data.token : '';
    expect(token).not.toContain(EMETTEUR);
    expect(token).not.toContain('sofia');
  });

  it('aucune offre, une offre inconnue ou le numéro : refusé, rien n\'est rangé', async () => {
    const g = guichet();
    for (const offers of [[], ['phone'], undefined]) {
      expect(await g.emettre(offers)).toMatchObject({ success: false, code: CONTACT_EXCHANGE_ERROR_CODES.INVALID });
    }
    expect(g.cache.size).toBe(0);
  });
});

describe('accepter un jeton (#19205)', () => {
  it('vitrine et demande d\'ami : la vitrine est rendue, la demande part de l\'émetteur vers le lecteur, l\'émetteur reçoit l\'accusé', async () => {
    const g = guichet();
    const token = await jeton(g);
    g.avance(30_000);
    const res = await g.accepter(token);

    expect(res).toEqual({
      success: true,
      data: {
        issuer: { id: EMETTEUR, username: 'sofia', displayName: 'SOFIA', avatar: null },
        offers: ['vitrine', 'friendRequest'],
        profile: { id: EMETTEUR, username: 'sofia', bio: 'Programmatrice de festival.' },
        friendRequest: 'sent',
        locked: ['phone'],
      },
    });
    expect(g.amities).toEqual([{ issuerId: EMETTEUR, readerId: LECTEUR }]);
    expect(g.emissions).toEqual([
      {
        room: ROOMS.user(EMETTEUR),
        event: SERVER_EVENTS.CONTACT_EXCHANGE_RECEIVED,
        payload: { reader: { id: LECTEUR, username: 'aissa', displayName: 'AISSA', avatar: null }, received: ['vitrine', 'friendRequest'], receivedAt: new Date(T0 + 30_000).toISOString() },
      },
    ]);
  });

  it('la vitrine seule : aucune demande d\'ami, aucun champ `friendRequest`', async () => {
    const g = guichet();
    const res = await g.accepter(await jeton(g, ['vitrine']));
    expect(res.success).toBe(true);
    expect(res.success && 'friendRequest' in res.data).toBe(false);
    expect(g.amities).toEqual([]);
  });

  it('la demande seule : ni vitrine composée, ni `profile`', async () => {
    const g = guichet();
    const res = await g.accepter(await jeton(g, ['friendRequest']));
    expect(res.success && 'profile' in res.data).toBe(false);
    expect(g.vitrines).toEqual([]);
    expect(res.success && res.data.friendRequest).toBe('sent');
  });

  it('le lecteur ne reçoit pas de demandes : la demande ne part pas, l\'accusé ne la compte pas', async () => {
    const g = guichet({ acceptsRequests: false });
    const res = await g.accepter(await jeton(g));
    expect(res.success && res.data.friendRequest).toBe('not-sent');
    expect(g.amities).toEqual([]);
    expect(g.emissions).toHaveLength(1);
    expect((g.emissions[0].payload as { received: string[] }).received).toEqual(['vitrine']);
  });

  it('la demande n\'a pas pu partir (déjà liés, demande existante) : `not-sent`, sans dire pourquoi', async () => {
    const g = guichet({ befriends: false });
    const res = await g.accepter(await jeton(g, ['friendRequest']));
    expect(res.success && res.data.friendRequest).toBe('not-sent');
    expect((g.emissions[0].payload as { received: string[] }).received).toEqual([]);
  });

  it('le cœur des demandes tombe en panne : le jeton déjà consommé rend quand même la vitrine, la demande dite `not-sent`', async () => {
    const g = guichet({ befriends: 'panne' });
    const res = await g.accepter(await jeton(g));
    expect(res).toMatchObject({ success: true, data: { friendRequest: 'not-sent' } });
    expect(res.success && 'profile' in res.data).toBe(true);
    expect((g.emissions[0].payload as { received: string[] }).received).toEqual(['vitrine']);
  });

  it('rejoué : le second passage reçoit le refus générique, rien ne repart', async () => {
    const g = guichet();
    const token = await jeton(g);
    expect((await g.accepter(token)).success).toBe(true);
    expect(await g.accepter(token, LECTEUR)).toEqual(REFUS);
    expect(g.amities).toHaveLength(1);
    expect(g.emissions).toHaveLength(1);
  });

  it('expiré après deux minutes : le refus générique', async () => {
    const g = guichet();
    const token = await jeton(g);
    g.avance(CONTACT_EXCHANGE_TTL_SECONDS * 1000 + 1_000);
    expect(await g.accepter(token)).toEqual(REFUS);
    expect(g.emissions).toEqual([]);
  });

  it('contrefait (offres réécrites, signature fausse, forme illisible) : le refus générique', async () => {
    const g = guichet();
    const token = await jeton(g, ['vitrine']);
    const parts = token.split('.');
    const reecrit = [parts[0], parts[1], '3', parts[3], parts[4]].join('.');
    const signature = [...parts.slice(0, 4), 'A'.repeat(22)].join('.');
    for (const faux of [reecrit, signature, 'nimporte', '', `${token}x`]) {
      expect(await g.accepter(faux)).toEqual(REFUS);
    }
    expect(g.amities).toEqual([]);
    expect(g.vitrines).toEqual([]);
  });

  it('l\'émetteur bloque le lecteur, ou le lecteur l\'émetteur : le refus générique, rien ne part', async () => {
    for (const comptes of [
      [compte(EMETTEUR, 'sofia', { blockedUserIds: [LECTEUR] }), compte(LECTEUR, 'aissa')],
      [compte(EMETTEUR, 'sofia'), compte(LECTEUR, 'aissa', { blockedUserIds: [EMETTEUR] })],
    ]) {
      const g = guichet({ comptes });
      expect(await g.accepter(await jeton(g))).toEqual(REFUS);
      expect(g.amities).toEqual([]);
      expect(g.vitrines).toEqual([]);
      expect(g.emissions).toEqual([]);
    }
  });

  it('un émetteur désactivé, supprimé ou introuvable : le refus générique', async () => {
    for (const comptes of [
      [compte(EMETTEUR, 'sofia', { deactivatedAt: new Date(T0) }), compte(LECTEUR, 'aissa')],
      [compte(EMETTEUR, 'sofia', { deletedAt: new Date(T0) }), compte(LECTEUR, 'aissa')],
      [compte(LECTEUR, 'aissa')],
    ]) {
      const g = guichet({ comptes });
      expect(await g.accepter(await jeton(g))).toEqual(REFUS);
      expect(g.emissions).toEqual([]);
    }
  });

  it('l\'émetteur qui lit son propre jeton : le refus générique', async () => {
    const g = guichet();
    expect(await g.accepter(await jeton(g), EMETTEUR)).toEqual(REFUS);
  });

  it('une vitrine que la fiche publique refuse de servir : le refus générique, aucune demande', async () => {
    const g = guichet({ vitrineServie: false });
    expect(await g.accepter(await jeton(g))).toEqual(REFUS);
    expect(g.amities).toEqual([]);
    expect(g.emissions).toEqual([]);
  });
});
