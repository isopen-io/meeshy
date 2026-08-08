/**
 * `resolveMessageMentions` — la source unique de `Message.validatedMentions`,
 * des lignes `Mention` et du lot d'ids que l'éventail de notifications
 * transforme en push.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { resolveMessageMentions } from '../../../../services/messaging/messageMentions';

const MESSAGE = { id: 'msg-1', conversationId: 'conv-1', senderId: 'part-1' };

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([
        { userId: 'u-alice', displayName: 'Alice', user: { id: 'u-alice', username: 'alice', displayName: 'Alice' } },
      ]),
    },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { update: jest.fn<any>().mockResolvedValue(undefined) },
    mention: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  } as any;
}

function makeMentionService(overrides: Record<string, any> = {}) {
  return {
    extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['alice']),
    resolveUsernames: jest.fn<any>().mockResolvedValue(
      new Map([['alice', { id: 'u-alice', username: 'alice' }]])
    ),
    validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: ['u-alice'] }),
    createMentions: jest.fn<any>().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

describe('resolveMessageMentions — court-circuit', () => {
  it('ne touche NI la base NI le service quand le contenu ne porte aucun @', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'bonjour tout le monde',
    });

    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [], newlyMentionedUserIds: [], reconciled: true });
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
    expect(mentionService.extractMentionsWithParticipants).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  // La garde vit dans l'unité, pas chez l'appelant : un écrivain qui l'oublierait
  // ferait payer quatre requêtes à chaque message sans mention.
  it('travaille malgré un contenu sans @ dès que des mentions explicites sont fournies', async () => {
    const prisma = makePrisma({
      user: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'u-alice', username: 'alice' }]) },
    });
    const mentionService = makeMentionService();

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE,
      content: 'sans arobase', explicitMentionedUserIds: ['u-alice'],
    });

    expect(result.validatedUserIds).toEqual(['u-alice']);
    expect(result.validatedUsernames).toEqual(['alice']);
    expect(mentionService.extractMentionsWithParticipants).not.toHaveBeenCalled();
  });

  it('rend le lot vide sans service de mentions câblé', async () => {
    const prisma = makePrisma();

    const result = await resolveMessageMentions({
      prisma, mentionService: undefined, message: MESSAGE, content: 'salut @alice',
    });

    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [], newlyMentionedUserIds: [], reconciled: false });
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});

describe('resolveMessageMentions — chemin nominal', () => {
  it('crée les lignes Mention, persiste les usernames et rend les ids', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice',
    });

    expect(mentionService.createMentions).toHaveBeenCalledWith('msg-1', ['u-alice']);
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: ['alice'] },
    });
    expect(result).toEqual({
      validatedUserIds: ['u-alice'],
      validatedUsernames: ['alice'],
      newlyMentionedUserIds: ['u-alice'],
      reconciled: true,
    });
  });

  // Le parseur résout `@Display Name` autant que `@handle` : sans la liste des
  // participants il ne voit que les handles bruts.
  it('nourrit le parseur avec les participants inscrits de la conversation', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();

    await resolveMessageMentions({ prisma, mentionService, message: MESSAGE, content: 'salut @Alice' });

    expect(mentionService.extractMentionsWithParticipants).toHaveBeenCalledWith(
      'salut @Alice',
      [{ userId: 'u-alice', username: 'alice', displayName: 'Alice' }]
    );
  });

  it('valide les permissions contre la conversation et l’expéditeur du message', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();

    await resolveMessageMentions({ prisma, mentionService, message: MESSAGE, content: 'salut @alice' });

    expect(mentionService.validateMentionPermissions).toHaveBeenCalledWith('conv-1', ['u-alice'], 'part-1');
  });

  // `validatedMentions` est ce dont le client se sert pour SURLIGNER. Y laisser
  // un mentionné rejeté par la validation surlignerait quelqu'un qui n'a reçu
  // ni ligne `Mention` ni notification.
  it('ne persiste que les usernames retenus par la validation', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService({
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['alice', 'mallory']),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map([
        ['alice', { id: 'u-alice', username: 'alice' }],
        ['mallory', { id: 'u-mallory', username: 'mallory' }],
      ])),
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: ['u-alice'] }),
    });

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice et @mallory',
    });

    expect(result.validatedUsernames).toEqual(['alice']);
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: ['alice'] },
    });
  });

  it('n’écrit rien quand la validation ne retient personne', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService({
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: [] }),
    });

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @ghost',
    });

    expect(result.validatedUserIds).toEqual([]);
    expect(mentionService.createMentions).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('n’écrit rien quand aucun username extrait ne résout vers un utilisateur', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService({
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['ghost']),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @ghost',
    });

    expect(result.validatedUserIds).toEqual([]);
    expect(mentionService.validateMentionPermissions).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});

describe('resolveMessageMentions — dégradations', () => {
  // Perdre les mentions par nom d'affichage vaut mieux que perdre le message :
  // le parseur reste appelé, avec la seule liste vide.
  it('dégrade vers une liste de participants vide quand leur lecture échoue', async () => {
    const prisma = makePrisma({
      participant: { findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
    });
    const mentionService = makeMentionService();
    const onError = jest.fn();

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice', onError,
    });

    expect(mentionService.extractMentionsWithParticipants).toHaveBeenCalledWith('salut @alice', []);
    expect(result.validatedUserIds).toEqual(['u-alice']);
    expect(onError).toHaveBeenCalled();
  });

  it('ne lève jamais et signale par onError quand une écriture échoue', async () => {
    const prisma = makePrisma({
      message: { update: jest.fn<any>().mockRejectedValue(new Error('write failed')) },
    });
    const mentionService = makeMentionService();
    const onError = jest.fn();

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice', onError,
    });

    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [], newlyMentionedUserIds: [], reconciled: false });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('ne lève jamais sans onError fourni', async () => {
    const prisma = makePrisma({
      message: { update: jest.fn<any>().mockRejectedValue(new Error('write failed')) },
    });

    await expect(
      resolveMessageMentions({ prisma, mentionService: makeMentionService(), message: MESSAGE, content: 'salut @alice' })
    ).resolves.toEqual({ validatedUserIds: [], validatedUsernames: [], newlyMentionedUserIds: [], reconciled: false });
  });
});

/**
 * Mode `'replace'` — l'édition d'un message.
 *
 * Une édition n'est pas une re-création : elle RÉCONCILIE. Les mentionnés qui
 * restent ne doivent pas bouger (leur `mentionedAt` est l'axe de tri de
 * l'inbox), ceux qui partent doivent partir, et seuls les entrants sont à
 * notifier.
 */
describe('resolveMessageMentions — mode replace : réconciliation', () => {
  it('ne supprime que les partants et ne crée que les entrants', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedParticipantId: 'u-alice' },
          { mentionedParticipantId: 'u-bob' },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['alice', 'carol']),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map([
        ['alice', { id: 'u-alice', username: 'alice' }],
        ['carol', { id: 'u-carol', username: 'carol' }],
      ])),
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: ['u-alice', 'u-carol'] }),
    });

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice et @carol', mode: 'replace',
    });

    expect(prisma.mention.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'msg-1', mentionedParticipantId: { in: ['u-bob'] } },
    });
    expect(mentionService.createMentions).toHaveBeenCalledWith('msg-1', ['u-carol']);
    expect(result.validatedUserIds).toEqual(['u-alice', 'u-carol']);
    expect(result.newlyMentionedUserIds).toEqual(['u-carol']);
  });

  // `mentionedAt` est l'axe de tri de l'inbox : recréer la ligne d'un mentionné
  // inchangé remonterait une mention de trois jours en tête parce que l'auteur
  // a corrigé une faute de frappe.
  it('ne touche à rien quand l’ensemble des mentionnés est inchangé', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedParticipantId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const mentionService = makeMentionService();

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice, corrigé', mode: 'replace',
    });

    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    // Lot d'entrants vide : aucune ligne créée. La garde du lot vide appartient
    // à `createMentions`, qui la porte déjà (leçon 86) — l'unité ne la recopie
    // pas, contrairement à la suppression, où un `in: []` serait une vraie
    // requête.
    expect(mentionService.createMentions).toHaveBeenCalledWith('msg-1', []);
    expect(result.validatedUserIds).toEqual(['u-alice']);
    expect(result.newlyMentionedUserIds).toEqual([]);
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: ['alice'] },
    });
  });

  // D1 : le chemin d'édition appelait `extractMentions` (handles bruts seuls).
  // Éditer « salut @John Doe » effaçait John alors que le texte le nomme encore.
  it('résout les mentions par nom d’affichage, comme le chemin de création', async () => {
    const prisma = makePrisma({
      participant: {
        findMany: jest.fn<any>().mockResolvedValue([
          { userId: 'u-john', displayName: 'John Doe', user: { id: 'u-john', username: 'johndoe', displayName: 'John Doe' } },
        ]),
      },
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedParticipantId: 'u-john' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['johndoe']),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map([['johndoe', { id: 'u-john', username: 'johndoe' }]])),
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: ['u-john'] }),
    });

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @John Doe, virgule corrigée', mode: 'replace',
    });

    expect(mentionService.extractMentionsWithParticipants).toHaveBeenCalledWith(
      'salut @John Doe, virgule corrigée',
      [{ userId: 'u-john', username: 'johndoe', displayName: 'John Doe' }]
    );
    expect(result.validatedUsernames).toEqual(['johndoe']);
    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
  });
});

describe('resolveMessageMentions — mode replace : effacement', () => {
  // Le court-circuit « pas de @ » de `'create'` est une optimisation ; en
  // `'replace'` il masquerait un retrait de mention.
  it('efface les mentions quand l’édition a retiré tous les @', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedParticipantId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService();

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'plus personne ici', mode: 'replace',
    });

    expect(prisma.mention.deleteMany).toHaveBeenCalledWith({ where: { messageId: 'msg-1' } });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: [] },
    });
    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [], newlyMentionedUserIds: [], reconciled: true });
    expect(mentionService.extractMentionsWithParticipants).not.toHaveBeenCalled();
  });

  it('efface quand plus aucun @ ne résout vers un utilisateur', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedParticipantId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['ghost']),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @ghost', mode: 'replace',
    });

    expect(prisma.mention.deleteMany).toHaveBeenCalledWith({ where: { messageId: 'msg-1' } });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: [] },
    });
    expect(result.validatedUserIds).toEqual([]);
  });

  it('efface quand la validation ne retient plus personne', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedParticipantId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: [] }),
    });

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice', mode: 'replace',
    });

    expect(prisma.mention.deleteMany).toHaveBeenCalledWith({ where: { messageId: 'msg-1' } });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: [] },
    });
    expect(result.validatedUserIds).toEqual([]);
  });

  // Un effacement déjà à blanc n'a rien à écrire.
  it('n’écrit rien quand il n’y avait aucune mention et qu’il n’y en a toujours pas', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'toujours personne', mode: 'replace',
    });

    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(result.validatedUserIds).toEqual([]);
  });
});

/**
 * Le chemin d'édition remettait `validatedMentions: []` sur service absent ET
 * sur exception — et il avait déjà supprimé les lignes `Mention` AVANT de
 * tenter quoi que ce soit. Une panne transitoire détruisait donc des mentions
 * que rien ne reconstruit : personne ne relit le texte après coup.
 */
describe('resolveMessageMentions — mode replace : une panne ne détruit rien', () => {
  it('préserve les mentions existantes sans service de mentions câblé', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedParticipantId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });

    const result = await resolveMessageMentions({
      prisma, mentionService: null, message: MESSAGE, content: 'salut @alice', mode: 'replace',
    });

    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [], newlyMentionedUserIds: [], reconciled: false });
  });

  it('préserve les mentions existantes quand la résolution lève', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedParticipantId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const mentionService = makeMentionService({
      resolveUsernames: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
    });
    const onError = jest.fn();

    const result = await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice', mode: 'replace', onError,
    });

    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(result.validatedUserIds).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  // La lecture de l'ensemble précédent est la SEULE source de « qui est
  // nouveau ». En échec, la réconciliation ne peut plus être sûre de ne pas
  // détruire : elle s'abstient.
  it('s’abstient quand l’ensemble précédent est illisible', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const onError = jest.fn();

    const result = await resolveMessageMentions({
      prisma, mentionService: makeMentionService(), message: MESSAGE, content: 'salut @alice', mode: 'replace', onError,
    });

    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(result.validatedUserIds).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

// Les trois appelants du cycle 20 n'ont pas à connaître le nouveau paramètre.
describe('resolveMessageMentions — le mode par défaut reste create', () => {
  it('ne lit jamais l’ensemble précédent sans mode explicite', async () => {
    const prisma = makePrisma();

    await resolveMessageMentions({
      prisma, mentionService: makeMentionService(), message: MESSAGE, content: 'salut @alice',
    });

    expect(prisma.mention.findMany).not.toHaveBeenCalled();
    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
  });
});
