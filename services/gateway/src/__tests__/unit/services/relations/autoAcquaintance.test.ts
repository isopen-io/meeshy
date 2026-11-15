/**
 * LA CONNAISSANCE NAÎT TOUTE SEULE (#13932, D-1 : une semaine glissante).
 * Chaque témoin lit l'ÉTAT du lien après coup ; les entrées sont des lignes
 * d'agrégat, jamais un appel de service simulé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  evaluateAutoAcquaintance,
  type AcquaintanceNotice,
} from '../../../../services/relations/autoAcquaintance';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';
const NOW = new Date('2026-10-31T10:00:00Z');
const ADULT = new Date('1990-01-01T00:00:00Z');
const MINOR = new Date('2012-01-01T00:00:00Z');

const qualifying = { Message: 4, Reaction: 2, PostView: 2, Audio: 2 };

const dayRow = (daysAgo: number, low: Record<string, number>, high: Record<string, number>) => ({
  id: `dd${daysAgo}${Object.keys(low).length}${Object.keys(high).length}`.padEnd(24, '0'),
  userLowId: LOW,
  userHighId: HIGH,
  day: new Date(Date.UTC(2026, 9, 31 - daysAgo)),
  ...Object.fromEntries(Object.entries(low).map(([k, v]) => [`byLow${k}`, v])),
  ...Object.fromEntries(Object.entries(high).map(([k, v]) => [`byHigh${k}`, v])),
});

const user = (id: string, over: Record<string, unknown> = {}) => ({ id, birthDate: ADULT, blockedUserIds: [], ...over });

const choice = (userId: string, autoAcquaintance: unknown) => ({ userId, privacy: { showOnlineStatus: true, autoAcquaintance } });

const setup = (over: { days?: unknown[]; users?: unknown[]; relations?: unknown[]; preferences?: unknown[] } = {}) => {
  const store = pairInteractionStore({
    days: (over.days ?? [dayRow(0, qualifying, qualifying)]) as never,
    users: (over.users ?? [user(LOW), user(HIGH)]) as never,
    relations: (over.relations ?? []) as never,
    preferences: (over.preferences ?? []) as never,
  });
  const notices: AcquaintanceNotice[] = [];
  const notify = jest.fn(async (notice: AcquaintanceNotice) => {
    notices.push(notice);
  });
  const evaluate = () => evaluateAutoAcquaintance({ prisma: store.prisma, notify, now: () => NOW }, { userA: HIGH, userB: LOW });
  return { store, notices, notify, evaluate };
};

describe('evaluateAutoAcquaintance — les seuils tenus dans CHAQUE sens créent le lien chez les deux', () => {
  it('crée la paire ACQUAINTANCE/ACQUAINTANCE, origine auto-acquaintance, datée de l’évaluation', async () => {
    const { store, evaluate } = setup();

    expect(await evaluate()).toBe('created');
    expect(store.relations()).toHaveLength(1);
    expect(store.relations()[0]).toMatchObject({
      userLowId: LOW, userHighId: HIGH, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE',
      origin: 'auto-acquaintance', levelSince: NOW,
    });
  });

  it('prévient les DEUX personnes, une fois chacune, avec l’autre pour sujet', async () => {
    const { notices, evaluate } = setup();
    await evaluate();

    expect(notices).toHaveLength(2);
    expect(notices.map((n) => [n.recipientId, n.otherId]).sort()).toEqual([[HIGH, LOW], [LOW, HIGH]].sort());
  });

  it('rejouée, ne change rien et ne prévient pas deux fois (deux passes = même état)', async () => {
    const { store, notify, evaluate } = setup();
    await evaluate();
    const once = store.relations();

    expect(await evaluate()).toBe('unchanged');
    expect(store.relations()).toEqual(once);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('ne crée rien quand un sens manque d’audio, même avec dix interactions', async () => {
    const { store, notify, evaluate } = setup({ days: [dayRow(0, qualifying, { Message: 6, Reaction: 2, PostView: 2 })] });

    expect(await evaluate()).toBe('insufficient');
    expect(store.relations()).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('ne crée rien à sens unique : l’un parle, l’autre non', async () => {
    const { store, evaluate } = setup({ days: [dayRow(0, qualifying, {})] });

    expect(await evaluate()).toBe('insufficient');
    expect(store.relations()).toHaveLength(0);
  });

  it('compte la semaine glissante : des jours différents du même sens s’additionnent', async () => {
    const { evaluate } = setup({
      days: [dayRow(6, { Message: 4, Reaction: 2 }, { Message: 4, Reaction: 2 }), dayRow(1, { PostView: 2, Audio: 2 }, { PostView: 2, Audio: 2 })],
    });
    expect(await evaluate()).toBe('created');
  });

  it('ne compte pas ce qui a quitté la fenêtre de sept jours', async () => {
    const { evaluate } = setup({ days: [dayRow(7, qualifying, qualifying)] });
    expect(await evaluate()).toBe('insufficient');
  });
});

describe('evaluateAutoAcquaintance — ce qui l’empêche', () => {
  it('un blocage l’annule : rien n’est créé, personne n’est prévenu', async () => {
    const { store, notify, evaluate } = setup({ users: [user(LOW, { blockedUserIds: [HIGH] }), user(HIGH)] });

    expect(await evaluate()).toBe('blocked');
    expect(store.relations()).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('un blocage dans l’autre sens l’annule aussi', async () => {
    const { evaluate } = setup({ users: [user(LOW), user(HIGH, { blockedUserIds: [LOW] })] });
    expect(await evaluate()).toBe('blocked');
  });

  it('un blocage défait, en silence, une Connaissance née toute seule', async () => {
    const auto = {
      id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE',
      levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'auto-acquaintance', transitions: [],
    };
    const { store, notify, evaluate } = setup({ relations: [auto], users: [user(LOW, { blockedUserIds: [HIGH] }), user(HIGH)] });

    expect(await evaluate()).toBe('cancelled');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('un blocage ne touche PAS un lien monté par une demande acceptée (Ami reste Ami)', async () => {
    const friends = {
      id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND',
      levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'request', transitions: [],
    };
    const { store, evaluate } = setup({ relations: [friends], users: [user(LOW, { blockedUserIds: [HIGH] }), user(HIGH)] });

    await evaluate();
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
  });

  it('désactivée entre un mineur déclaré et un majeur', async () => {
    const { store, evaluate } = setup({ users: [user(LOW, { birthDate: MINOR }), user(HIGH)] });

    expect(await evaluate()).toBe('minor');
    expect(store.relations()).toHaveLength(0);
  });

  it('désactivée entre un mineur déclaré et un âge inconnu (fail-closed)', async () => {
    const { evaluate } = setup({ users: [user(LOW, { birthDate: MINOR }), user(HIGH, { birthDate: null })] });
    expect(await evaluate()).toBe('minor');
  });

  it('#14406 — entre deux mineurs déclarés, elle attend que chacun l’ait activée : désactivée par défaut', async () => {
    const minors = [user(LOW, { birthDate: MINOR }), user(HIGH, { birthDate: MINOR })];

    expect(await setup({ users: minors }).evaluate()).toBe('opted-out');
    expect(await setup({ users: minors, preferences: [choice(LOW, true)] }).evaluate()).toBe('opted-out');
    expect(await setup({ users: minors, preferences: [choice(LOW, true), choice(HIGH, true)] }).evaluate()).toBe('created');
  });

  it('un utilisateur introuvable : rien, fail-closed', async () => {
    const { store, evaluate } = setup({ users: [user(LOW)] });

    expect(await evaluate()).toBe('ignored');
    expect(store.relations()).toHaveLength(0);
  });

  it('ne ressuscite pas un lien que l’une des personnes a baissé : la sortie reste une sortie (RG-07)', async () => {
    const dropped = {
      id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'PUBLIC', grantedByHigh: 'FRIEND',
      levelSince: new Date('2026-10-25T00:00:00Z'), origin: 'request',
      transitions: [{ actorId: LOW, from: 'FRIEND', to: 'PUBLIC', at: new Date('2026-10-25T00:00:00Z') }],
    };
    const { store, notify, evaluate } = setup({ relations: [dropped] });

    expect(await evaluate()).toBe('unchanged');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'FRIEND' });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('evaluateAutoAcquaintance — « je refuse que Meeshy crée des Connaissances automatiquement » (#14406, art. 21)', () => {
  it('un seul refus suffit : rien n’est créé, personne n’est prévenu', async () => {
    const { store, notify, evaluate } = setup({ preferences: [choice(HIGH, false)] });

    expect(await evaluate()).toBe('opted-out');
    expect(store.relations()).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('le refus ne relève pas non plus son côté d’un lien monté par une demande', async () => {
    const mixed = {
      id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'CLOSE', grantedByHigh: 'PUBLIC',
      levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'request', transitions: [],
    };
    const { store, evaluate } = setup({ relations: [mixed], preferences: [choice(HIGH, false)] });

    expect(await evaluate()).toBe('opted-out');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'PUBLIC' });
  });

  it('le refus défait, en silence, une Connaissance née toute seule', async () => {
    const auto = {
      id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE',
      levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'auto-acquaintance', transitions: [],
    };
    const { store, notify, evaluate } = setup({ relations: [auto], preferences: [choice(LOW, false)] });

    expect(await evaluate()).toBe('cancelled');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('le choix d’un mineur déclaré l’emporte sur son défaut, et un majeur qui l’active explicitement reste ouvert', async () => {
    const { evaluate } = setup({
      users: [user(LOW, { birthDate: MINOR }), user(HIGH, { birthDate: MINOR })],
      preferences: [choice(LOW, true), choice(HIGH, true)],
    });
    expect(await evaluate()).toBe('created');
    expect(await setup({ preferences: [choice(LOW, true)] }).evaluate()).toBe('created');
  });

  it('une valeur illisible vaut absence de choix : ouverte pour un majeur, fermée pour un mineur', async () => {
    expect(await setup({ preferences: [choice(LOW, 'non')] }).evaluate()).toBe('created');
    const minors = [user(LOW, { birthDate: MINOR }), user(HIGH, { birthDate: MINOR })];
    expect(await setup({ users: minors, preferences: [choice(LOW, 'oui'), choice(HIGH, true)] }).evaluate()).toBe('opted-out');
  });
});

const autoRow = () => ({
  id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE',
  levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'auto-acquaintance', transitions: [],
});

describe('evaluateAutoAcquaintance — une annulation par la préférence est RÉVERSIBLE (audit #14464 C2, décision du porteur)', () => {
  it('un majeur qui retire son opposition retrouve sa Connaissance automatique, les échanges restant qualifiants', async () => {
    const first = setup({ relations: [autoRow()], preferences: [choice(LOW, false)] });
    expect(await first.evaluate()).toBe('cancelled');

    const second = setup({ relations: first.store.relations() as unknown[], preferences: [choice(LOW, true)] });
    expect(await second.evaluate()).toBe('raised');
    expect(second.store.relations()[0]).toMatchObject({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' });
    expect(second.notify).toHaveBeenCalledTimes(2);
  });

  it('l’annulation système ne grave aucune sortie : l’historique n’attribue de baisse à personne', async () => {
    const { store, evaluate } = setup({ relations: [autoRow()], preferences: [choice(HIGH, false)] });
    await evaluate();

    expect(store.relations()[0].transitions).toEqual([]);
  });

  it('une sortie VOLONTAIRE reste respectée : la préférence rallumée ne la défait pas', async () => {
    const dropped = {
      ...autoRow(), grantedByLow: 'PUBLIC',
      transitions: [{ actorId: LOW, from: 'ACQUAINTANCE', to: 'PUBLIC', at: new Date('2026-10-25T00:00:00Z') }],
    };
    const { store, evaluate } = setup({ relations: [dropped], preferences: [choice(LOW, true)] });

    expect(await evaluate()).toBe('unchanged');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'ACQUAINTANCE' });
  });

  it('le défaut ne défait RIEN : deux mineurs sans choix gardent la Connaissance automatique née avant ce lot', async () => {
    const minors = [user(LOW, { birthDate: MINOR }), user(HIGH, { birthDate: MINOR })];
    const { store, notify, evaluate } = setup({ users: minors, relations: [autoRow()] });

    expect(await evaluate()).toBe('opted-out');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('seul un refus EXPLICITE de l’un des deux défait celle de deux mineurs', async () => {
    const minors = [user(LOW, { birthDate: MINOR }), user(HIGH, { birthDate: MINOR })];
    const { store, evaluate } = setup({ users: minors, relations: [autoRow()], preferences: [choice(HIGH, false)] });

    expect(await evaluate()).toBe('cancelled');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
  });
});

describe('evaluateAutoAcquaintance — ce que le retrait laisse derrière lui (contre-audit #14464 N10, N11)', () => {
  it('N10 — un retrait par refus oublie le cercle mis en cache des DEUX personnes', async () => {
    const { store } = setup({ relations: [autoRow()], preferences: [choice(LOW, false)] });
    const forgotten: string[][] = [];
    const outcome = await evaluateAutoAcquaintance(
      { prisma: store.prisma, now: () => NOW, forgetCircles: async (ids) => { forgotten.push([...ids]); } },
      { userA: HIGH, userB: LOW },
    );

    expect(outcome).toBe('cancelled');
    expect(forgotten).toEqual([[LOW, HIGH]]);
  });

  it('N10 — une panne du cache ne fait pas échouer le retrait', async () => {
    const { store } = setup({ relations: [autoRow()], preferences: [choice(LOW, false)] });
    const outcome = await evaluateAutoAcquaintance(
      { prisma: store.prisma, now: () => NOW, forgetCircles: async () => { throw new Error('redis down'); } },
      { userA: HIGH, userB: LOW },
    );

    expect(outcome).toBe('cancelled');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
  });

  it('N11 — une annulation pour blocage grave une cause « system », jamais « explicit »', async () => {
    const { store, evaluate } = setup({ relations: [autoRow()], users: [user(LOW, { blockedUserIds: [HIGH] }), user(HIGH)] });

    expect(await evaluate()).toBe('cancelled');
    expect((store.relations()[0].transitions as Array<{ cause?: string }>).map((t) => t.cause)).toEqual(['system', 'system']);
  });
});

describe('evaluateAutoAcquaintance — la préférence est relue juste avant l’écriture (audit #14464 C3)', () => {
  it('un refus posé pendant l’évaluation empêche la naissance, et personne n’est prévenu', async () => {
    const { store, notify, evaluate } = setup();
    const read = store.prisma.userPreferences.findMany;
    let calls = 0;
    store.prisma.userPreferences.findMany = (args) => {
      calls += 1;
      return calls === 1 ? read(args) : Promise.resolve([choice(LOW, false)]);
    };

    expect(await evaluate()).toBe('opted-out');
    expect(store.relations()).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('contre-audit N6 — un refus posé PENDANT l’écriture retire le lien juste écrit, sans annonce', async () => {
    const { store, notify, evaluate } = setup();
    const read = store.prisma.userPreferences.findMany;
    let calls = 0;
    store.prisma.userPreferences.findMany = (args) => {
      calls += 1;
      return calls <= 2 ? read(args) : Promise.resolve([choice(HIGH, false)]);
    };

    expect(await evaluate()).toBe('opted-out');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('evaluateAutoAcquaintance — elle monte, elle ne baisse jamais', () => {
  it('relève seulement le côté sous ACQUAINTANCE et ne touche pas un lien déjà plus haut', async () => {
    const mixed = {
      id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'CLOSE', grantedByHigh: 'PUBLIC',
      levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'request', transitions: [],
    };
    const { store, evaluate } = setup({ relations: [mixed] });

    expect(await evaluate()).toBe('raised');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'CLOSE', grantedByHigh: 'ACQUAINTANCE', origin: 'request' });
  });

  it('laisse en paix une paire déjà Ami : unchanged, sans notification', async () => {
    const friends = {
      id: 'aa0000000000000000000099', userLowId: LOW, userHighId: HIGH, grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND',
      levelSince: new Date('2026-10-20T00:00:00Z'), origin: 'request', transitions: [],
    };
    const { store, notify, evaluate } = setup({ relations: [friends] });

    expect(await evaluate()).toBe('unchanged');
    expect(store.relations()[0]).toMatchObject({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('un échec de notification ne défait pas le lien : il est créé, la notification est perdue', async () => {
    const { store, notify, evaluate } = setup();
    notify.mockRejectedValue(new Error('push down'));

    expect(await evaluate()).toBe('created');
    expect(store.relations()).toHaveLength(1);
  });
});
