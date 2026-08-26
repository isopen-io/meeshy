/**
 * `resolveMessageMentions` — la source unique de `Message.validatedMentions`,
 * des lignes `Mention` et du lot d'ids que l'éventail de notifications
 * transforme en push.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { resolveMessageMentions, replaceMessageMentions, reconcileEditedMentions } from '../../../../services/messaging/messageMentions';

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
    // Cycle 123 bis — la notification d'un ENTRANT relit les drapeaux de
    // PROTECTION du message édité, et la relecture est fail-CLOSED : sans ce
    // délégué, tout message passerait pour protégé et l'aperçu servi serait un
    // placeholder. Le double sert donc un message ORDINAIRE par défaut.
    message: {
      update: jest.fn<any>().mockResolvedValue(undefined),
      findUnique: jest.fn<any>().mockResolvedValue({
        messageType: 'text', isEncrypted: false, isViewOnce: false,
        isBlurred: false, effectFlags: 0, expiresAt: null,
        createdAt: new Date('2026-08-24T10:00:00Z'),
      }),
    },
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

  // Le plafond appartient à la RÉSOLUTION, pas au transport : l'extraction
  // depuis le contenu tronque à `MAX_MENTIONS_PER_MESSAGE` depuis toujours
  // (`MentionService`, deux sites), la liste EXPLICITE n'était bornée nulle
  // part. L'écart était sans conséquence tant qu'elle n'était honorée que par
  // REST ; le déclarer sur le transport socket — celui qui porte le trafic —
  // aurait ouvert une entrée non bornée de plus.
  //
  // Elle TRONQUE comme l'extraction plutôt que de rejeter l'envoi : les deux
  // sources décrivent la même intention, et un message ne doit pas échouer pour
  // avoir nommé trop de monde là où l'autre chemin en retient cinquante.
  it('tronque la liste explicite au même plafond que l’extraction', async () => {
    const explicit = Array.from({ length: 60 }, (_, i) => `u-${i}`);
    const prisma = makePrisma({
      user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    });
    const mentionService = makeMentionService({
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: [] }),
    });

    await resolveMessageMentions({
      prisma, mentionService, message: MESSAGE,
      content: 'sans arobase', explicitMentionedUserIds: explicit,
    });

    const candidates = mentionService.validateMentionPermissions.mock.calls[0][1];
    expect(candidates).toHaveLength(50);
    expect(candidates[0]).toBe('u-0');
    expect(candidates).not.toContain('u-50');
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

// ═══════════════════════════════════════════════════════════════════════════════
// `replaceMessageMentions` — l'édition. L'ancien lot doit disparaître, donc PAS
// de court-circuit : un contenu édité qui ne porte plus aucun `@` doit effacer
// le champ, pas le laisser tel quel.
// ═══════════════════════════════════════════════════════════════════════════════

describe('replaceMessageMentions — réconciliation', () => {
  // Purger pour recréer donnerait un `mentionedAt` neuf aux mentionnés
  // INCHANGÉS, or c'est l'axe de tri de l'inbox : une mention de trois jours
  // remonterait en tête parce que l'auteur a corrigé une faute de frappe.
  it('ne supprime que les partants et ne crée que les entrants', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-alice' },
          { mentionedUserId: 'u-bob' },
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

    const result = await replaceMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice et @carol',
    });

    expect(prisma.mention.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'msg-1', mentionedUserId: { in: ['u-bob'] } },
    });
    expect(mentionService.createMentions).toHaveBeenCalledWith('msg-1', ['u-carol']);
    expect(result.newlyMentionedUserIds).toEqual(['u-carol']);
  });

  it('ne touche à aucune ligne quand l’ensemble des mentionnés est inchangé', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const mentionService = makeMentionService();

    const result = await replaceMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice, typo corrigée',
    });

    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(mentionService.createMentions).toHaveBeenCalledWith('msg-1', []);
    expect(result.newlyMentionedUserIds).toEqual([]);
    expect(result.validatedUsernames).toEqual(['alice']);
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
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-john' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
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
    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: ['john'] },
    });
  });

  // Le contraire exact du chemin de création, où ne rien écrire est la bonne
  // réponse : ici le champ portait un lot qui n'est plus vrai.
  it('efface le champ quand le contenu édité ne porte plus aucune mention', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue([]),
    });

    const result = await replaceMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'plus de mention ici',
    });

    expect(result).toEqual({
      validatedUserIds: [], validatedUsernames: [], newlyMentionedUserIds: [], reconciled: true,
    });
    expect(prisma.mention.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'msg-1', mentionedUserId: { in: ['u-alice'] } },
    });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { validatedMentions: [] },
    });
  });
});

/**
 * Le bloc remplacé purgeait les lignes AVANT de tenter quoi que ce soit, puis
 * remettait `validatedMentions: []` sur service absent comme sur simple
 * exception. Une panne transitoire détruisait donc des mentions que rien ne
 * reconstruit — personne ne relit le texte après coup.
 */
describe('replaceMessageMentions — une panne ne détruit rien', () => {
  it('préserve les mentions existantes quand aucun service n’est câblé', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });

    const result = await replaceMessageMentions({
      prisma, mentionService: null, message: MESSAGE, content: 'salut @alice',
    });

    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      validatedUserIds: [], validatedUsernames: [], newlyMentionedUserIds: [], reconciled: false,
    });
  });

  it('préserve les mentions existantes quand la résolution échoue', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const mentionService = makeMentionService({
      resolveUsernames: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
    });
    const onError = jest.fn();

    const result = await replaceMessageMentions({
      prisma, mentionService, message: MESSAGE, content: 'salut @alice', onError,
    });

    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(result.reconciled).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  // La lecture de l'ensemble précédent est la SEULE source de « qui est
  // nouveau » et de « qui est parti ». En échec, la réconciliation ne peut plus
  // garantir qu'elle ne détruit rien : elle s'abstient.
  it('s’abstient quand l’ensemble précédent est illisible', async () => {
    const prisma = makePrisma({
      mention: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const onError = jest.fn();

    const result = await replaceMessageMentions({
      prisma, mentionService: makeMentionService(), message: MESSAGE, content: 'salut @alice', onError,
    });

    expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(result.reconciled).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('ne lève jamais, même sans onError fourni', async () => {
    const prisma = makePrisma({
      message: { update: jest.fn<any>().mockRejectedValue(new Error('down')) },
    });

    await expect(
      replaceMessageMentions({ prisma, mentionService: makeMentionService(), message: MESSAGE, content: 'salut @alice' })
    ).resolves.toEqual({
      validatedUserIds: [], validatedUsernames: [], newlyMentionedUserIds: [], reconciled: false,
    });
  });
});

/**
 * `reconcileEditedMentions` — la réconciliation ET le push aux entrants, soudés.
 *
 * Les deux moitiés n'ont de sens qu'ensemble : `newlyMentionedUserIds` est le
 * seul produit de la réconciliation que rien d'autre ne consomme. Les avoir
 * laissées séparées, c'est ce qui a permis au chemin socket — le transport
 * d'édition PRIMAIRE — de n'en appeler aucune des deux.
 */
describe('reconcileEditedMentions', () => {
  function makeEditPrisma(overrides: Record<string, any> = {}) {
    return makePrisma({
      conversation: {
        findUnique: jest.fn<any>().mockResolvedValue({
          participants: [{ userId: 'u-alice' }, { userId: 'u-sender' }, { userId: null }],
        }),
      },
      user: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        findUnique: jest.fn<any>().mockResolvedValue({
          username: 'sender', displayName: 'Sender', avatar: null,
        }),
      },
      ...overrides,
    });
  }

  function makeNotifier() {
    return { createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(1) } as any;
  }

  it('réconcilie et ne notifie QUE les entrants', async () => {
    const prisma = makeEditPrisma();
    const notificationService = makeNotifier();

    const result = await reconcileEditedMentions({
      prisma, mentionService: makeMentionService(), notificationService,
      message: MESSAGE, content: 'salut @alice', editorUserId: 'u-sender',
    });

    expect(result.reconciled).toBe(true);
    expect(result.newlyMentionedUserIds).toEqual(['u-alice']);
    expect(notificationService.createMentionNotificationsBatch).toHaveBeenCalledWith(
      ['u-alice'],
      {
        senderId: 'u-sender',
        senderProfile: { username: 'sender', displayName: 'Sender', avatar: null },
        messageContent: 'salut @alice',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        // Témoin : un message ordinaire transmet `null`, jamais une échéance
        // inventée — le champ voyage TOUJOURS, pour que son absence ne puisse
        // pas se confondre avec « ce chemin ne le sait pas ».
        messageExpiresAt: null,
      },
      ['u-alice', 'u-sender']
    );
  });

  it('une mention ajoutée en ÉDITANT un message éphémère hérite de son échéance', async () => {
    const prisma = makeEditPrisma();
    const notificationService = makeNotifier();
    const expiresAt = new Date('2026-08-10T12:00:00Z');
    // Le double dit la MÊME chose que le paramètre : depuis le cycle 123 bis,
    // la protection se relit en base, et un harnais où le paramètre annonce un
    // éphémère pendant que la ligne dit « ordinaire » atteste un message qui
    // n'existe pas.
    prisma.message.findUnique.mockResolvedValue({
      messageType: 'text', isEncrypted: false, isViewOnce: false,
      isBlurred: false, effectFlags: 0, expiresAt,
      createdAt: new Date('2026-08-09T12:00:00Z'),
    });

    await reconcileEditedMentions({
      prisma, mentionService: makeMentionService(), notificationService,
      message: { ...MESSAGE, expiresAt }, content: 'salut @alice', editorUserId: 'u-sender',
    });

    expect(notificationService.createMentionNotificationsBatch).toHaveBeenCalledWith(
      ['u-alice'],
      expect.objectContaining({ messageExpiresAt: expiresAt }),
      expect.anything()
    );
  });

  /**
   * Cycle 123 bis — le contenu ÉDITÉ d'un message PROTÉGÉ ne part pas vers un
   * ENTRANT. Ce sont des TIERS, et l'éventail d'ENVOI masque exactement ce
   * texte : éditer un message à vue unique pour y nommer quelqu'un lui poussait
   * le texte en clair sur son écran verrouillé.
   */
  it('ne pousse pas le texte d\u2019un message PROT\u00c9G\u00c9 \u00e0 l\u2019entrant', async () => {
    const prisma = makeEditPrisma();
    const notificationService = makeNotifier();
    prisma.message.findUnique.mockResolvedValue({
      messageType: 'text', isEncrypted: false, isViewOnce: true,
      isBlurred: false, effectFlags: 0, expiresAt: null,
      createdAt: new Date('2026-08-24T10:00:00Z'),
    });

    await reconcileEditedMentions({
      prisma, mentionService: makeMentionService(), notificationService,
      message: MESSAGE, content: 'salut @alice, le code est 4242', editorUserId: 'u-sender',
    });

    const commonData = notificationService.createMentionNotificationsBatch.mock.calls[0][1];
    expect(commonData.messageContent).not.toContain('4242');
    // Le masque du TEXTE ne suffit pas : sans base déclarée, le Prisme
    // réinjecterait la TRADUCTION du même secret dans le corps servi.
    expect(commonData.previewBasis).toEqual({ kind: 'protected-placeholder' });
  });

  it('fail-CLOSED \u2014 une relecture de protection qui L\u00c8VE masque quand m\u00eame', async () => {
    const prisma = makeEditPrisma();
    const notificationService = makeNotifier();
    prisma.message.findUnique.mockRejectedValue(new Error('mongo down'));

    await reconcileEditedMentions({
      prisma, mentionService: makeMentionService(), notificationService,
      message: MESSAGE, content: 'salut @alice, le code est 4242', editorUserId: 'u-sender',
    });

    const commonData = notificationService.createMentionNotificationsBatch.mock.calls[0][1];
    expect(commonData.messageContent).not.toContain('4242');
  });

  // Dix corrections de frappe ne valent pas dix pushes à quelqu'un déjà nommé
  // au premier envoi.
  it('ne notifie personne quand le mentionné était DÉJÀ mentionné', async () => {
    const prisma = makeEditPrisma({
      mention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const notificationService = makeNotifier();

    const result = await reconcileEditedMentions({
      prisma, mentionService: makeMentionService(), notificationService,
      message: MESSAGE, content: 'salut @alice corrigé', editorUserId: 'u-sender',
    });

    expect(result.newlyMentionedUserIds).toEqual([]);
    expect(notificationService.createMentionNotificationsBatch).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
  });

  // Une réconciliation qui s'abstient n'a établi AUCUN entrant : notifier
  // quiconque à partir de là serait inventer.
  it('ne notifie personne quand rien n’a pu être établi', async () => {
    const prisma = makeEditPrisma();
    const notificationService = makeNotifier();

    const result = await reconcileEditedMentions({
      prisma, mentionService: null, notificationService,
      message: MESSAGE, content: 'salut @alice', editorUserId: 'u-sender',
    });

    expect(result.reconciled).toBe(false);
    expect(notificationService.createMentionNotificationsBatch).not.toHaveBeenCalled();
  });

  // Le push est APRÈS l'écriture, et son échec ne la défait pas : `reconciled`
  // continue de décrire la base, qui a bel et bien été réconciliée.
  it('garde la réconciliation acquise quand la notification échoue', async () => {
    const prisma = makeEditPrisma();
    const notificationService = {
      createMentionNotificationsBatch: jest.fn<any>().mockRejectedValue(new Error('push down')),
    } as any;
    const onError = jest.fn();

    const result = await reconcileEditedMentions({
      prisma, mentionService: makeMentionService(), notificationService,
      message: MESSAGE, content: 'salut @alice', editorUserId: 'u-sender', onError,
    });

    expect(result.reconciled).toBe(true);
    expect(result.validatedUsernames).toEqual(['alice']);
    expect(prisma.message.update).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('réconcilie sans service de notifications câblé', async () => {
    const prisma = makeEditPrisma();

    const result = await reconcileEditedMentions({
      prisma, mentionService: makeMentionService(), notificationService: null,
      message: MESSAGE, content: 'salut @alice', editorUserId: 'u-sender',
    });

    expect(result.reconciled).toBe(true);
    expect(prisma.message.update).toHaveBeenCalled();
  });
});
