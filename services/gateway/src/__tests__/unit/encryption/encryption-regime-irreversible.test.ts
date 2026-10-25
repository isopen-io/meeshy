/**
 * LA SEULE ÉCRITURE DU RÉGIME NE QUITTE JAMAIS LE BOUT EN BOUT (#12949).
 *
 * Décision porteur du 2026-10-25 : une conversation chiffrée de bout en bout ne
 * repasse jamais en clair. La garde vit DANS la condition de l'écriture
 * (`switchEncryptionRegime`), pas seulement dans la route : un appelant qui
 * oublierait de regarder le mode, ou deux requêtes concurrentes, ne peuvent
 * pas l'écrire. Le double évalue le `where` avec la sémantique MongoDB (un
 * champ absent n'est pas un champ nul, une négation exige la clé présente).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';
import {
  regimeIsEndToEnd,
  regimeMayBeLeft,
  switchEncryptionRegime,
  type RegimeActivation,
} from '../../../services/conversations/encryptionRegime';
import { composeConversationUpdate } from '../../../services/conversations/conversation-metadata-update';

const ID = '507f1f77bcf86cd799439013';

function store(row: MongoDocument) {
  const doc: MongoDocument = { id: ID, ...row };
  const updateMany = jest.fn(async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
    if (!matchesMongoWhere(doc, where)) return { count: 0 };
    Object.assign(doc, data);
    return { count: 1 };
  });
  return { doc, prisma: { conversation: { updateMany } } as never };
}

const E2EE: RegimeActivation = { mode: 'e2ee', protocol: 'signal_v3', enabledBy: 'u1', serverEncryptionKeyId: null };
const SERVER: RegimeActivation = { mode: 'server', protocol: 'aes-256-gcm', enabledBy: 'u1', serverEncryptionKeyId: 'k1' };
const HYBRID: RegimeActivation = { ...SERVER, mode: 'hybrid' };

const at = new Date('2026-10-25T12:00:00Z');

describe('une conversation e2ee ne se réécrit vers AUCUN régime', () => {
  it.each([
    ['désactivée', null],
    ['reposée en server', SERVER],
    ['reposée en hybrid', HYBRID],
    ['réactivée en e2ee (rien à poser)', E2EE],
  ])('%s : rien n’est écrit', async (_label, target) => {
    const { doc, prisma } = store({ encryptionMode: 'e2ee', encryptionEnabledAt: at, encryptionEpoch: 4 });
    const before = { ...doc };

    const switched = await switchEncryptionRegime(prisma, { conversationId: ID, observedEpoch: 4, target, at });

    expect(switched).toBeNull();
    expect(doc).toEqual(before);
  });

  it.each(['E2EE', 'E2ee'])('le mode écrit %s par un ancien client compte comme e2ee', async (mode) => {
    const { doc, prisma } = store({ encryptionMode: mode, encryptionEnabledAt: at });

    expect(await switchEncryptionRegime(prisma, { conversationId: ID, observedEpoch: 0, target: null, at })).toBeNull();
    expect(doc.encryptionMode).toBe(mode);
  });

  it('un mode inconnu ne se quitte pas : la liste de ce qui se quitte est fermée', async () => {
    const { doc, prisma } = store({ encryptionMode: 'signal_v3', encryptionEnabledAt: at });

    expect(await switchEncryptionRegime(prisma, { conversationId: ID, observedEpoch: 0, target: null, at })).toBeNull();
    expect(doc.encryptionMode).toBe('signal_v3');
  });
});

describe('ce que l’écriture laisse passer', () => {
  it('une conversation jamais chiffrée (champ absent) devient e2ee', async () => {
    const { doc, prisma } = store({});

    const switched = await switchEncryptionRegime(prisma, { conversationId: ID, observedEpoch: 0, target: E2EE, at });

    expect(switched).toMatchObject({ epoch: 1, mode: 'e2ee' });
    expect(doc).toMatchObject({ encryptionMode: 'e2ee', encryptionEpoch: 1 });
  });

  it('une conversation au mode nul devient e2ee', async () => {
    const { doc, prisma } = store({ encryptionMode: null, encryptionEpoch: 2 });

    expect(await switchEncryptionRegime(prisma, { conversationId: ID, observedEpoch: 2, target: E2EE, at })).toMatchObject({ epoch: 3 });
    expect(doc.encryptionMode).toBe('e2ee');
  });

  it.each(['server', 'hybrid'])('une conversation %s se désactive (chiffrement au repos, le serveur la lisait déjà)', async (mode) => {
    const { doc, prisma } = store({ encryptionMode: mode, encryptionEnabledAt: at, serverEncryptionKeyId: 'k1' });

    expect(await switchEncryptionRegime(prisma, { conversationId: ID, observedEpoch: 0, target: null, at })).toMatchObject({ epoch: 1, mode: null });
    expect(doc).toMatchObject({ encryptionMode: null, serverEncryptionKeyId: 'k1' });
  });

  it('une époque périmée n’écrit rien, même depuis le clair', async () => {
    const { prisma } = store({ encryptionEpoch: 3 });

    expect(await switchEncryptionRegime(prisma, { conversationId: ID, observedEpoch: 2, target: E2EE, at })).toBeNull();
  });
});

describe('les deux prédicats du régime', () => {
  it.each([
    ['e2ee', true],
    ['E2EE', true],
    ['server', false],
    ['hybrid', false],
    [null, false],
  ])('regimeIsEndToEnd(%s) = %s', (encryptionMode, expected) => {
    expect(regimeIsEndToEnd({ encryptionMode })).toBe(expected);
  });

  it.each([
    [{ encryptionMode: 'server', encryptionEnabledAt: at }, true],
    [{ encryptionMode: 'hybrid', encryptionEnabledAt: at }, true],
    [{ encryptionMode: 'e2ee', encryptionEnabledAt: at }, false],
    [{ encryptionMode: 'signal', encryptionEnabledAt: at }, false],
    [{ encryptionMode: null, encryptionEnabledAt: at }, false],
    [{ encryptionMode: null, encryptionEnabledAt: null }, false],
  ])('regimeMayBeLeft(%o) = %s', (regime, expected) => {
    expect(regimeMayBeLeft(regime)).toBe(expected);
  });
});

describe('le PATCH de conversation, utilisateur ou admin, ne porte jamais le régime', () => {
  it('un corps qui nomme les champs du régime n’en écrit aucun : la composition est une liste fermée', () => {
    const body = {
      title: 'Nouveau titre',
      encryptionMode: null,
      encryptionEnabledAt: null,
      encryptionEnabledBy: null,
      encryptionProtocol: null,
      encryptionEpoch: 9,
    } as unknown as Parameters<typeof composeConversationUpdate>[0];

    const { updateData } = composeConversationUpdate(body);

    expect(Object.keys(updateData)).toEqual(['title']);
  });
});
