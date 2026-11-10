/**
 * #17117 — une conversation EXTERNE naît chiffrée de bout en bout, adressée par
 * le numéro de l'ami, et seulement pour un utilisateur au numéro VÉRIFIÉ. Le
 * double Prisma tient les documents en mémoire ; la conversation créée est
 * ensuite remise aux règles VIVANTES de la passerelle (admission d'un envoi,
 * bascule de régime) : c'est la conversation telle qu'elle naît qui refuse un
 * clair et une rétrogradation, pas une copie de sa forme.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  EXTERNAL_CONVERSATION_ACTIVE_CAP,
  EXTERNAL_CONVERSATION_TYPE,
  EXTERNAL_PEER_HANDLE_RETENTION_DAYS,
  EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS,
} from '@meeshy/shared/types/external-conversation';
import { openExternalConversation, type ExternalConversationDeps } from '../open-external-conversation';
import { admitSendUnderRegime } from '../../messaging/e2eeSendAdmission';
import { isE2eePlaintextRefusal } from '../../messaging/e2eePlaintextAdmission';
import { switchEncryptionRegime, regimeEpochOf } from '../../conversations/encryptionRegime';
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';

const ALICE = '507f1f77bcf86cd799439a01';
const NEW_CONVERSATION = '507f1f77bcf86cd799439c01';
const FRIEND = '+33612345678';
const NOW = new Date('2026-11-10T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

type User = {
  readonly id: string;
  readonly phoneVerifiedAt: Date | null;
  readonly displayName: string;
  readonly username: string;
  readonly role: string;
};

const verifiedAlice: User = { id: ALICE, phoneVerifiedAt: new Date('2026-10-01T00:00:00Z'), displayName: 'Alice', username: 'alice', role: 'ANALYST' };

type World = {
  readonly users: readonly User[];
  readonly conversations: MongoDocument[];
  readonly peers: MongoDocument[];
  creates: number;
  raceBeforeCreate?: MongoDocument;
};

const worldWith = (users: readonly User[]): World => ({ users, conversations: [], peers: [], creates: 0 });

const triple = (peer: MongoDocument) => `${peer.openedByUserId}|${peer.network}|${peer.handle}`;

function depsFor(world: World, ids: readonly string[] = [NEW_CONVERSATION]): ExternalConversationDeps {
  const pending = [...ids];
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => world.users.find((user) => user.id === where.id) ?? null,
    },
    externalConversationPeer: {
      findUnique: async ({ where }: { where: { openedByUserId_network_handle: MongoDocument } }) => {
        const key = triple(where.openedByUserId_network_handle);
        return world.peers.find((peer) => triple(peer) === key) ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: MongoDocument }) => {
        const peer = world.peers.find((row) => row.id === where.id);
        if (!peer) throw Object.assign(new Error('not found'), { code: 'P2025' });
        Object.assign(peer, data);
        return peer;
      },
      deleteMany: async ({ where }: { where: MongoDocument }) => {
        const doomed = world.peers.filter((peer) => matchesMongoWhere(peer, where));
        doomed.forEach((peer) => world.peers.splice(world.peers.indexOf(peer), 1));
        return { count: doomed.length };
      },
      count: async ({ where }: { where: MongoDocument }) => world.peers.filter((peer) => matchesMongoWhere(peer, where)).length,
    },
    conversation: {
      findUnique: async ({ where, select }: { where: { id: string }; select: { participants: { where: MongoDocument } } }) => {
        const found = world.conversations.find((row) => row.id === where.id);
        if (!found) return null;
        const participants = (found.participants as MongoDocument[]).filter((row) => matchesMongoWhere(row, select.participants.where));
        return { isActive: found.isActive ?? true, closedAt: found.closedAt ?? null, participants };
      },
      create: async ({ data }: { data: MongoDocument }) => {
        world.creates += 1;
        if (world.raceBeforeCreate) world.peers.push(world.raceBeforeCreate);
        const { participants, externalPeer, ...conversation } = data as MongoDocument & {
          participants: { create: MongoDocument[] };
          externalPeer: { create: MongoDocument };
        };
        const peer = { id: `peer-${world.peers.length}`, conversationId: conversation.id, ...externalPeer.create };
        if (world.peers.some((row) => triple(row) === triple(peer))) throw Object.assign(new Error('unique'), { code: 'P2002' });
        world.peers.push(peer);
        world.conversations.push({ ...conversation, participants: participants.create.map((row) => ({ isActive: true, ...row })) });
        return { id: conversation.id };
      },
    },
  };
  return {
    prisma: prisma as unknown as ExternalConversationDeps['prisma'],
    regime: {
      newConversationId: () => pending.shift() ?? 'unexpected',
      now: () => NOW,
      serverKeyIdFor: async () => {
        throw new Error('une conversation externe ne demande jamais de clé serveur');
      },
    },
  };
}

const open = (world: World, handle = FRIEND) =>
  openExternalConversation(depsFor(world), { userId: ALICE, network: 'whatsapp', handle });

describe('ouvrir une conversation externe', () => {
  it('refuse un utilisateur sans numéro vérifié, et ne crée rien', async () => {
    const world = worldWith([{ ...verifiedAlice, phoneVerifiedAt: null }]);

    await expect(open(world)).resolves.toEqual({ kind: 'refused', refusal: 'phone-unverified' });
    expect(world.creates).toBe(0);
    expect(world.peers).toEqual([]);
  });

  it('refuse un compte introuvable comme un numéro non vérifié', async () => {
    const world = worldWith([]);

    await expect(open(world)).resolves.toEqual({ kind: 'refused', refusal: 'phone-unverified' });
    expect(world.creates).toBe(0);
  });

  it('crée une conversation externe chiffrée de bout en bout dès sa naissance, à un seul membre Meeshy', async () => {
    const world = worldWith([verifiedAlice]);

    const opening = await open(world);

    expect(opening).toMatchObject({ kind: 'opened', conversationId: NEW_CONVERSATION, created: true });
    const [conversation] = world.conversations;
    expect(conversation).toMatchObject({
      id: NEW_CONVERSATION,
      type: EXTERNAL_CONVERSATION_TYPE,
      encryptionMode: 'e2ee',
      encryptionProtocol: 'signal_v3',
      encryptionEnabledAt: NOW,
      encryptionEnabledBy: ALICE,
      encryptionEpoch: 1,
      autoTranslateEnabled: false,
    });
    expect(conversation.serverEncryptionKeyId).toBeUndefined();
    expect(conversation.participants).toEqual([
      expect.objectContaining({ userId: ALICE, type: 'user', role: 'creator' }),
    ]);
  });

  it('ne pose le numéro que dans l’adresse du pair : ni titre, ni identifiant, ni nom ne le portent', async () => {
    const world = worldWith([verifiedAlice]);

    await open(world);

    const [conversation] = world.conversations;
    expect(conversation.title ?? null).toBeNull();
    expect(JSON.stringify(conversation)).not.toContain(FRIEND.slice(1));
    expect(world.peers).toEqual([
      {
        id: 'peer-0',
        conversationId: NEW_CONVERSATION,
        network: 'whatsapp',
        handle: FRIEND,
        openedByUserId: ALICE,
        purgeAfter: new Date(NOW.getTime() + EXTERNAL_PEER_HANDLE_RETENTION_DAYS * DAY_MS),
      },
    ]);
  });

  it('borne la conservation du numéro : l’échéance stockée ne dépasse jamais la borne maximale', async () => {
    const world = worldWith([verifiedAlice]);

    await open(world);

    const purgeAfter = world.peers[0].purgeAfter as Date;
    expect(purgeAfter.getTime()).toBeGreaterThan(NOW.getTime());
    expect(purgeAfter.getTime() - NOW.getTime()).toBeLessThanOrEqual(EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS * DAY_MS);
  });

  it('rouvrir le même ami rend la même conversation et repousse l’échéance, sans rien créer', async () => {
    const world = worldWith([verifiedAlice]);
    await open(world);
    const later = new Date(NOW.getTime() + 10 * DAY_MS);
    const deps = depsFor(world, []);

    const again = await openExternalConversation(
      { ...deps, regime: { ...deps.regime, now: () => later } },
      { userId: ALICE, network: 'whatsapp', handle: FRIEND },
    );

    expect(again).toMatchObject({ kind: 'opened', conversationId: NEW_CONVERSATION, created: false });
    expect(world.creates).toBe(1);
    expect(world.peers[0].purgeAfter).toEqual(new Date(later.getTime() + EXTERNAL_PEER_HANDLE_RETENTION_DAYS * DAY_MS));
  });

  it('deux ouvertures simultanées : la perdante rend la conversation de la gagnante', async () => {
    const world = worldWith([verifiedAlice]);
    world.raceBeforeCreate = {
      id: 'peer-winner',
      conversationId: '507f1f77bcf86cd799439c99',
      network: 'whatsapp',
      handle: FRIEND,
      openedByUserId: ALICE,
      purgeAfter: NOW,
    };

    const opening = await open(world);

    expect(opening).toMatchObject({ kind: 'opened', conversationId: '507f1f77bcf86cd799439c99', created: false });
    expect(world.conversations).toEqual([]);
  });
});

describe('rouvrir une conversation morte en ouvre une neuve (audit du 2026-11-10)', () => {
  const SECOND = '507f1f77bcf86cd799439c02';
  const reopenLater = (world: World) => {
    const deps = depsFor(world, [SECOND]);
    const later = new Date(NOW.getTime() + 10 * DAY_MS);
    return openExternalConversation(
      { ...deps, regime: { ...deps.regime, now: () => later } },
      { userId: ALICE, network: 'whatsapp', handle: FRIEND },
    );
  };

  it.each([
    ['close (sortie du dernier membre)', (conversation: MongoDocument) => Object.assign(conversation, { isActive: false, closedAt: NOW })],
    ['supprimée sans closedAt (ligne héritée)', (conversation: MongoDocument) => Object.assign(conversation, { isActive: false })],
    ['dont l’ouvreur n’est plus membre actif', (conversation: MongoDocument) => {
      (conversation.participants as MongoDocument[]).forEach((row) => Object.assign(row, { isActive: false }));
    }],
  ] as const)('une conversation %s : une neuve, et l’ancienne adresse est effacée au lieu d’être repoussée', async (_label, kill) => {
    const world = worldWith([verifiedAlice]);
    await open(world);
    kill(world.conversations[0]);

    const again = await reopenLater(world);

    expect(again).toMatchObject({ kind: 'opened', conversationId: SECOND, created: true });
    expect(world.peers).toHaveLength(1);
    expect(world.peers[0]).toMatchObject({ conversationId: SECOND, handle: FRIEND });
  });

  it('une adresse dont la conversation a disparu est effacée, et une neuve s’ouvre', async () => {
    const world = worldWith([verifiedAlice]);
    await open(world);
    world.conversations.splice(0, 1);

    const again = await reopenLater(world);

    expect(again).toMatchObject({ kind: 'opened', conversationId: SECOND, created: true });
    expect(world.peers.map((peer) => peer.conversationId)).toEqual([SECOND]);
  });
});

describe('les bornes d’un compte (audit du 2026-11-10)', () => {
  it(`refuse une ouverture NEUVE au-delà de ${EXTERNAL_CONVERSATION_ACTIVE_CAP} adresses gardées, sans rien créer`, async () => {
    const world = worldWith([verifiedAlice]);
    Array.from({ length: EXTERNAL_CONVERSATION_ACTIVE_CAP }, (_unused, index) => world.peers.push({
      id: `peer-old-${index}`, conversationId: `c-${index}`, network: 'whatsapp', handle: `+3361000${String(index).padStart(4, '0')}`,
      openedByUserId: ALICE, purgeAfter: NOW,
    }));

    await expect(open(world)).resolves.toEqual({ kind: 'refused', refusal: 'limit-reached' });
    expect(world.creates).toBe(0);
  });

  it('le plafond ne compte que les adresses de CE compte', async () => {
    const world = worldWith([verifiedAlice]);
    Array.from({ length: EXTERNAL_CONVERSATION_ACTIVE_CAP }, (_unused, index) => world.peers.push({
      id: `peer-other-${index}`, conversationId: `c-${index}`, network: 'whatsapp', handle: `+3361000${String(index).padStart(4, '0')}`,
      openedByUserId: '507f1f77bcf86cd799439a99', purgeAfter: NOW,
    }));

    await expect(open(world)).resolves.toMatchObject({ kind: 'opened', created: true });
  });

  it.each(['USER', 'UNKNOWN_ROLE'])('un compte %s ne choisit pas le bout en bout pendant la phase de test : refusé, rien créé', async (role) => {
    const world = worldWith([{ ...verifiedAlice, role }]);

    await expect(open(world)).resolves.toEqual({ kind: 'refused', refusal: 'end-to-end-reserved' });
    expect(world.creates).toBe(0);
  });

  it.each(['ANALYST', 'MODERATOR', 'BIGBOSS'])('un compte %s l’ouvre', async (role) => {
    const world = worldWith([{ ...verifiedAlice, role }]);

    await expect(open(world)).resolves.toMatchObject({ kind: 'opened', created: true });
  });
});

describe('la conversation externe, telle qu’elle naît, face aux règles vivantes', () => {
  const born = async (): Promise<MongoDocument> => {
    const world = worldWith([verifiedAlice]);
    await open(world);
    return world.conversations[0];
  };

  const admissionPrisma = (conversation: MongoDocument) =>
    ({
      conversation: { findUnique: async () => conversation },
      messageAttachment: { findMany: async () => [] },
    }) as never;

  const refusal = async (send: Record<string, unknown>) =>
    admitSendUnderRegime(admissionPrisma(await born()), { conversationId: NEW_CONVERSATION, content: '', ...send }).then(
      () => 'admis',
      (error: unknown) => (isE2eePlaintextRefusal(error) ? error.code : String(error)),
    );

  it('refuse un message en clair (fail-closed, #9229)', async () => {
    await expect(refusal({ content: 'Bonjour, c’est Alice' })).resolves.toBe('E2EE_PLAINTEXT_REFUSED');
  });

  it('refuse une pièce jointe que le serveur aurait lue', async () => {
    await expect(refusal({ attachmentIds: ['507f1f77bcf86cd799439d01'] })).resolves.toBe('E2EE_PLAINTEXT_REFUSED');
  });

  it('refuse un lieu en clair', async () => {
    await expect(refusal({ location: { latitude: 48.85, longitude: 2.35 } })).resolves.toBe('E2EE_PLAINTEXT_REFUSED');
  });

  it.each([
    ['vers le clair', null],
    ['vers le chiffrement au repos', { mode: 'server', protocol: 'aes-256-gcm', enabledBy: ALICE, serverEncryptionKeyId: 'k1' }],
  ] as const)('ne se rétrograde jamais %s (#12949)', async (_label, target) => {
    const conversation = await born();
    const before = { ...conversation };
    const prisma = {
      conversation: {
        updateMany: async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
          if (!matchesMongoWhere(conversation, where)) return { count: 0 };
          Object.assign(conversation, data);
          return { count: 1 };
        },
      },
    };

    const switched = await switchEncryptionRegime(prisma as never, {
      conversationId: NEW_CONVERSATION,
      observedEpoch: regimeEpochOf(conversation as never),
      target: target as never,
      at: new Date(NOW.getTime() + DAY_MS),
    });

    expect(switched).toBeNull();
    expect(conversation).toEqual(before);
  });
});
