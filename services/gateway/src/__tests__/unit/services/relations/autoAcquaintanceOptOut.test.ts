/**
 * « Je peux refuser que Meeshy crée des Connaissances automatiquement » (#14406) :
 * le refus vaut TOUT DE SUITE. Écrire ses réglages de confidentialité relit les
 * Connaissances nées toutes seules de l'auteur et défait, en silence, celles que
 * son refus ne permet plus — sans attendre le rattrapage, qui ne relit que les
 * paires de la semaine glissante. Un lien monté par une demande n'est pas touché.
 *
 * Le témoin passe par la porte que les quatre verbes des alias et les trois
 * routes unifiées partagent (`PREFERENCE_REGISTRY.privacy.storage.afterWrite`)
 * et lit l'ÉTAT des liens.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PREFERENCE_REGISTRY } from '../../../../routes/me/preferences/preference-registry';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const ME = '5f0000000000000000000001';
const AUTO_PEER = '5f0000000000000000000002';
const FRIEND = '5f0000000000000000000003';
const ADULT = new Date('1990-01-01T00:00:00Z');
const MINOR = new Date('2012-01-01T00:00:00Z');

const link = (id: string, otherId: string, level: string, origin: string) => ({
  id, userLowId: ME, userHighId: otherId, grantedByLow: level, grantedByHigh: level,
  levelSince: new Date('2026-10-20T00:00:00Z'), origin, transitions: [],
});

function world(params: { myBirthDate?: Date; myPrivacy?: Record<string, unknown> }) {
  const store = pairInteractionStore({
    users: [
      { id: ME, birthDate: params.myBirthDate ?? ADULT, blockedUserIds: [] },
      { id: AUTO_PEER, birthDate: params.myBirthDate ?? ADULT, blockedUserIds: [] },
      { id: FRIEND, birthDate: ADULT, blockedUserIds: [] },
    ],
    relations: [link('aa0000000000000000000001', AUTO_PEER, 'ACQUAINTANCE', 'auto-acquaintance'), link('aa0000000000000000000002', FRIEND, 'FRIEND', 'request')],
    preferences: params.myPrivacy ? [{ userId: ME, privacy: params.myPrivacy }] : [],
  });
  const prisma = { ...store.prisma, userPreference: { deleteMany: jest.fn(async () => ({ count: 0 })) } };
  return { store, write: () => PREFERENCE_REGISTRY.privacy.storage!.afterWrite!(prisma as never, ME) };
}

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const levels = (store: ReturnType<typeof world>['store']) =>
  store.relations().map((row) => [row.userHighId, row.grantedByLow, row.grantedByHigh]);

describe('écrire ses réglages de confidentialité applique tout de suite le refus de la Connaissance automatique', () => {
  it('un refus défait ses Connaissances nées toutes seules, et épargne un lien monté par une demande', async () => {
    const { store, write } = world({ myPrivacy: { autoAcquaintance: false } });

    await write();
    await settle();

    expect(levels(store)).toEqual([
      [AUTO_PEER, 'PUBLIC', 'PUBLIC'],
      [FRIEND, 'FRIEND', 'FRIEND'],
    ]);
  });

  it('un réglage voisin, la préférence restant activée, ne défait rien', async () => {
    const { store, write } = world({ myPrivacy: { showReadReceipts: false } });

    await write();
    await settle();

    expect(levels(store)).toEqual([
      [AUTO_PEER, 'ACQUAINTANCE', 'ACQUAINTANCE'],
      [FRIEND, 'FRIEND', 'FRIEND'],
    ]);
  });

  it('un mineur déclaré sans choix est au défaut désactivé : sa Connaissance automatique tombe à sa prochaine écriture', async () => {
    const { store, write } = world({ myBirthDate: MINOR, myPrivacy: { showReadReceipts: true } });

    await write();
    await settle();

    expect(levels(store)[0]).toEqual([AUTO_PEER, 'PUBLIC', 'PUBLIC']);
  });
});
