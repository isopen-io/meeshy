/**
 * `resolveMessageMentions` — la source unique de `Message.validatedMentions`,
 * des lignes `Mention` et du lot d'ids que l'éventail de notifications
 * transforme en push.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { resolveMessageMentions, replaceMessageMentions } from '../../../../services/messaging/messageMentions';

const MESSAGE = { id: 'msg-1', conversationId: 'conv-1', senderId: 'part-1' };

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([
        { userId: 'u-alice', displayName: 'Alice', user: { id: 'u-alice', username: 'alice', displayName: 'Alice' } },
      ]),
      findUnique: jest.fn<any>().mockResolvedValue({ userId: 'u-sender' }),
    },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { update: jest.fn<any>().mockResolvedValue(undefined) },
    mention: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
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

    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [] });
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

    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [] });
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
    expect(result).toEqual({ validatedUserIds: ['u-alice'], validatedUsernames: ['alice'] });
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

  // `message.senderId` est un `Participant.id` (c'est ce que la colonne
  // `Message.senderId` référence), mais la validation compare l'expéditeur aux
  // `Participant.userId` des membres — donc à des `User.id`. Lui passer le
  // `Participant.id` compare deux espaces disjoints : la règle « on ne se
  // mentionne pas soi-même » d'une conversation directe ne se déclenche jamais.
  it('valide les permissions contre l’identité UTILISATEUR de l’expéditeur, pas son participant', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();

    await resolveMessageMentions({ prisma, mentionService, message: MESSAGE, content: 'salut @alice' });

    expect(prisma.participant.findUnique).toHaveBeenCalledWith({
      where: { id: 'part-1' },
      select: { userId: true },
    });
    expect(mentionService.validateMentionPermissions).toHaveBeenCalledWith('conv-1', ['u-alice'], 'u-sender');
  });

  // Un expéditeur anonyme n'a aucun `User.id` : il ne peut être personne des
  // mentionnés, et la validation doit le savoir plutôt que de recevoir un id
  // d'un autre espace qui ne correspondra jamais par hasard.
  it('passe null quand l’expéditeur est anonyme', async () => {
    const prisma = makePrisma({
      participant: {
        findMany: jest.fn<any>().mockResolvedValue([
          { userId: 'u-alice', displayName: 'Alice', user: { id: 'u-alice', username: 'alice', displayName: 'Alice' } },
        ]),
        findUnique: jest.fn<any>().mockResolvedValue({ userId: null }),
      },
    });
    const mentionService = makeMentionService();

    await resolveMessageMentions({ prisma, mentionService, message: MESSAGE, content: 'salut @alice' });

    expect(mentionService.validateMentionPermissions).toHaveBeenCalledWith('conv-1', ['u-alice'], null);
  });

  // La résolution est une requête de plus : elle ne doit être payée que par les
  // messages qui nomment réellement quelqu'un.
  it('ne résout pas l’expéditeur quand l’extraction ne retient personne', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService({
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue([]),
    });

    await resolveMessageMentions({ prisma, mentionService, message: MESSAGE, content: 'salut @fantome' });

    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
    expect(mentionService.validateMentionPermissions).not.toHaveBeenCalled();
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

    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [] });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('ne lève jamais sans onError fourni', async () => {
    const prisma = makePrisma({
      message: { update: jest.fn<any>().mockRejectedValue(new Error('write failed')) },
    });

    await expect(
      resolveMessageMentions({ prisma, mentionService: makeMentionService(), message: MESSAGE, content: 'salut @alice' })
    ).resolves.toEqual({ validatedUserIds: [], validatedUsernames: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// `replaceMessageMentions` — l'édition. L'ancien lot doit disparaître, donc PAS
// de court-circuit : un contenu édité qui ne porte plus aucun `@` doit effacer
// le champ, pas le laisser tel quel.
// ═══════════════════════════════════════════════════════════════════════════════

describe('replaceMessageMentions', () => {
  it('purge les anciennes lignes Mention avant de recomposer le lot', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();

    await replaceMessageMentions({ prisma, mentionService, message: MESSAGE, content: 'salut @alice' });

    expect(prisma.mention.deleteMany).toHaveBeenCalledWith({ where: { messageId: 'msg-1' } });
    expect(mentionService.createMentions).toHaveBeenCalledWith('msg-1', ['u-alice']);
  });

  // Le défaut que cette unité corrige : le chemin d'édition extrayait les
  // handles bruts seulement, donc éditer un message contenant `@John Doe`
  // détruisait la mention que la création avait validée.
  it('résout les mentions par nom d’affichage, comme le chemin de création', async () => {
    const prisma = makePrisma({
      participant: {
        findMany: jest.fn<any>().mockResolvedValue([
          { userId: 'u-john', displayName: 'John Doe', user: { id: 'u-john', username: 'john', displayName: 'John Doe' } },
        ]),
      },
    });
    const mentionService = makeMentionService({
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['john']),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map([['john', { id: 'u-john', username: 'john' }]])),
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: ['u-john'] }),
    });

    const result = await replaceMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @John Doe, corrigé',
    });

    expect(mentionService.extractMentionsWithParticipants).toHaveBeenCalledWith(
      'salut @John Doe, corrigé',
      [{ userId: 'u-john', username: 'john', displayName: 'John Doe' }]
    );
    expect(result.validatedUsernames).toEqual(['john']);
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: ['john'] },
    });
  });

  // Le contraire exact du chemin de création, où ne rien écrire est la bonne
  // réponse : ici le champ portait un lot qui n'est plus vrai.
  it('efface le champ quand le contenu édité ne porte plus aucune mention', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService({
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue([]),
    });

    const result = await replaceMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'plus de mention ici',
    });

    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [] });
    expect(prisma.mention.deleteMany).toHaveBeenCalled();
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: [] },
    });
    expect(mentionService.createMentions).not.toHaveBeenCalled();
  });

  it('efface le champ quand aucun service de mentions n’est câblé', async () => {
    const prisma = makePrisma();

    const result = await replaceMessageMentions({
      prisma, mentionService: null, message: MESSAGE, content: 'salut @alice',
    });

    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [] });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: [] },
    });
  });

  // Laisser un lot périmé serait pire que le vider : les lignes `Mention` ont
  // déjà été purgées, donc le champ décrirait des mentions qui n'existent plus.
  it('vide le champ et signale quand la résolution échoue', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService({
      resolveUsernames: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
    });
    const onError = jest.fn();

    const result = await replaceMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice', onError,
    });

    expect(result).toEqual({ validatedUserIds: [], validatedUsernames: [] });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(prisma.message.update).toHaveBeenLastCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: [] },
    });
  });

  it('ne lève jamais quand même l’effacement de secours échoue', async () => {
    const prisma = makePrisma({
      mention: { deleteMany: jest.fn<any>().mockRejectedValue(new Error('down')) },
      message: { update: jest.fn<any>().mockRejectedValue(new Error('down too')) },
    });
    const onError = jest.fn();

    await expect(
      replaceMessageMentions({ prisma, mentionService: makeMentionService(), message: MESSAGE, content: 'salut @alice', onError })
    ).resolves.toEqual({ validatedUserIds: [], validatedUsernames: [] });
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
