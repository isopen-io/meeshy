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

const setup = (over: { days?: unknown[]; users?: unknown[]; relations?: unknown[] } = {}) => {
  const store = pairInteractionStore({
    days: (over.days ?? [dayRow(0, qualifying, qualifying)]) as never,
    users: (over.users ?? [user(LOW), user(HIGH)]) as never,
    relations: (over.relations ?? []) as never,
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

  it('permise entre deux mineurs déclarés', async () => {
    const { evaluate } = setup({ users: [user(LOW, { birthDate: MINOR }), user(HIGH, { birthDate: MINOR })] });
    expect(await evaluate()).toBe('created');
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
