/**
 * `resolvePostMentions` / `reconcilePostMentions` — la source unique des lignes
 * `PostMention` et du lot d'ids qu'une notification de mention doit atteindre.
 *
 * Miroir de `messageMentions` pour le domaine social : une édition RÉCONCILIE,
 * elle ne re-crée pas. Ce que ces tests verrouillent, c'est précisément ce que
 * la route ne faisait pas — supprimer les partants, et ne prévenir QUE les
 * entrants.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { resolvePostMentions, reconcilePostMentions } from '../../../../services/posts/postMentions';

// `visibility` voyage jusqu'au lot de notification, qui décide qui a le droit
// d'être prévenu. PUBLIC ici : ces cas portent sur la RÉCONCILIATION des lignes
// `PostMention` (partants, entrants, panne), pas sur l'audience — le filtrage
// est verrouillé par `postAudience.test.ts` et
// `NotificationService.mentionaudience.test.ts`.
const POST = { id: 'post-1', authorId: 'u-author', type: 'POST' as const, visibility: 'PUBLIC' };

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    postMention: {
      // `display` fait partie du `select` de la réconciliation : un double qui
      // l'omet ferait passer des lignes PINNED pour du texte.
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    // La rétractation des notifications s'appelle dans la foulée du retrait des
    // lignes : sans ce délégué, tout cas qui fait partir quelqu'un lèverait.
    notification: {
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  } as any;
}

function makeMentionService(overrides: Record<string, any> = {}) {
  return {
    extractMentions: jest.fn<any>().mockReturnValue(['alice']),
    resolveUsernames: jest.fn<any>().mockResolvedValue(
      new Map([['alice', { id: 'u-alice', username: 'alice' }]])
    ),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function makeNotifier() {
  return {
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  } as any;
}

describe('resolvePostMentions — création', () => {
  it('ne touche NI la base NI le service quand le contenu ne porte aucun @', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    const result = await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST, content: 'bonjour tout le monde',
    });

    expect(result).toEqual({ mentionedUserIds: [], newlyMentionedUserIds: [], reconciled: true });
    expect(mentionService.extractMentions).not.toHaveBeenCalled();
    expect(mentionService.createPostMentions).not.toHaveBeenCalled();
    expect(notificationService.createPostMentionNotificationsBatch).not.toHaveBeenCalled();
  });

  it('persiste les lignes PostMention et prévient tous les mentionnés', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    const result = await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST, content: 'salut @alice',
    });

    expect(result.mentionedUserIds).toEqual(['u-alice']);
    expect(result.newlyMentionedUserIds).toEqual(['u-alice']);
    expect(result.reconciled).toBe(true);
    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-alice'], 'INLINE');
    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'post-1',
        posterId: 'u-author',
        mentionedUserIds: ['u-alice'],
        postType: 'POST',
      })
    );
  });

  // Une création n'a pas d'ensemble précédent : lire `PostMention` serait une
  // requête pour rien sur le chemin d'écriture le plus chaud du domaine social.
  it('ne lit jamais les mentions précédentes — une création n\'en a pas', async () => {
    const prisma = makePrisma();

    await resolvePostMentions({
      prisma, mentionService: makeMentionService(), notificationService: makeNotifier(),
      post: POST, content: 'salut @alice',
    });

    expect(prisma.postMention.findMany).not.toHaveBeenCalled();
    expect(prisma.postMention.deleteMany).not.toHaveBeenCalled();
  });

  it('rend un lot vide sans rien écrire quand aucun @handle ne résout', async () => {
    const mentionService = makeMentionService({
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });
    const notificationService = makeNotifier();

    const result = await resolvePostMentions({
      prisma: makePrisma(), mentionService, notificationService, post: POST, content: 'salut @fantome',
    });

    expect(result).toEqual({ mentionedUserIds: [], newlyMentionedUserIds: [], reconciled: true });
    expect(mentionService.createPostMentions).not.toHaveBeenCalled();
    expect(notificationService.createPostMentionNotificationsBatch).not.toHaveBeenCalled();
  });

  it('ne conclut rien sans service de mentions câblé', async () => {
    const result = await resolvePostMentions({
      prisma: makePrisma(), mentionService: undefined, notificationService: makeNotifier(),
      post: POST, content: 'salut @alice',
    });

    expect(result.reconciled).toBe(false);
    expect(result.mentionedUserIds).toEqual([]);
  });

  it('ne transforme jamais une panne de résolution en rejet', async () => {
    const onError = jest.fn();
    const mentionService = makeMentionService({
      resolveUsernames: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
    });

    const result = await resolvePostMentions({
      prisma: makePrisma(), mentionService, notificationService: makeNotifier(),
      post: POST, content: 'salut @alice', onError,
    });

    expect(result.reconciled).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  // La notification est DÉTACHÉE : un push lent ne doit pas retarder la réponse
  // de création, et son échec ne défait pas une persistance réussie.
  it('reste réconcilié même si la notification échoue', async () => {
    const notificationService = {
      createPostMentionNotificationsBatch: jest.fn<any>().mockRejectedValue(new Error('apns down')),
    } as any;

    const result = await resolvePostMentions({
      prisma: makePrisma(), mentionService: makeMentionService(), notificationService,
      post: POST, content: 'salut @alice',
    });

    expect(result.reconciled).toBe(true);
    expect(result.mentionedUserIds).toEqual(['u-alice']);
  });

  it('persiste sans notifier quand aucun service de notification n\'est câblé', async () => {
    const mentionService = makeMentionService();

    const result = await resolvePostMentions({
      prisma: makePrisma(), mentionService, notificationService: undefined,
      post: POST, content: 'salut @alice',
    });

    expect(result.mentionedUserIds).toEqual(['u-alice']);
    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-alice'], 'INLINE');
  });
});

describe('resolvePostMentions — mentions DÉCLARÉES (hors texte)', () => {
  it('persiste et prévient un badge de canevas que le texte ne nomme pas', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(
        new Map([['bob', { id: 'u-bob', username: 'bob' }]])
      ),
    });
    const notificationService = makeNotifier();

    const result = await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST,
      content: 'une story sans une seule arobase',
      declared: [{ username: 'bob', display: 'PINNED' }],
    });

    expect(result.mentionedUserIds).toEqual(['u-bob']);
    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-bob'], 'PINNED');
    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedUserIds: ['u-bob'] })
    );
  });

  it('prend un userId déclaré tel quel, sans le résoudre par pseudo', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
    });

    await resolvePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: null, declared: [{ userId: 'u-direct', display: 'PINNED' }],
    });

    expect(mentionService.resolveUsernames).not.toHaveBeenCalled();
    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-direct'], 'PINNED');
  });

  it('ne touche à rien quand ni le texte ni la déclaration ne nomment personne', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();

    const result = await resolvePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'bonjour', declared: [],
    });

    expect(result).toEqual({ mentionedUserIds: [], newlyMentionedUserIds: [], reconciled: true });
    expect(mentionService.createPostMentions).not.toHaveBeenCalled();
  });
});

describe('reconcilePostMentions — mentions DÉCLARÉES (tri-état)', () => {
  /// Sans liste, les pastilles SURVIVENT. Les déduire du texte les effacerait à
  /// la première correction de frappe — elles n'y sont pas, c'est leur raison
  /// d'être.
  it('préserve les pastilles de canevas quand le client ne parle pas de mentions', async () => {
    const prisma = makePrisma();
    prisma.postMention.findMany.mockResolvedValue([
      { mentionedUserId: 'u-bob', display: 'PINNED' },
    ]);
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
    });

    const result = await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'texte édité sans arobase',
    });

    expect(prisma.postMention.deleteMany).not.toHaveBeenCalled();
    expect(result.mentionedUserIds).toEqual(['u-bob']);
    expect(result.newlyMentionedUserIds).toEqual([]);
  });

  it('retire les pastilles quand le client déclare une liste vide', async () => {
    const prisma = makePrisma();
    prisma.postMention.findMany.mockResolvedValue([
      { mentionedUserId: 'u-bob', display: 'PINNED' },
    ]);
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
    });

    const result = await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'texte édité', declared: [],
    });

    expect(prisma.postMention.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', mentionedUserId: { in: ['u-bob'] } },
    });
    expect(result.mentionedUserIds).toEqual([]);
  });

  /// `display` absent = ligne écrite avant le discriminant. Elle se lit INLINE :
  /// c'était la seule voie qui existait alors.
  it('relit dans le texte une ligne antérieure au discriminant', async () => {
    const prisma = makePrisma();
    prisma.postMention.findMany.mockResolvedValue([
      { mentionedUserId: 'u-legacy', display: null },
    ]);
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
    });

    const result = await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'plus aucune mention',
    });

    expect(prisma.postMention.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', mentionedUserId: { in: ['u-legacy'] } },
    });
    expect(result.mentionedUserIds).toEqual([]);
  });
});

describe('reconcilePostMentions — édition', () => {
  it('ne prévient QUE les entrants — corriger une faute ne renotifie personne', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    const result = await reconcilePostMentions({
      prisma, mentionService, notificationService, post: POST, content: 'salut @alice !',
    });

    expect(result.mentionedUserIds).toEqual(['u-alice']);
    expect(result.newlyMentionedUserIds).toEqual([]);
    expect(notificationService.createPostMentionNotificationsBatch).not.toHaveBeenCalled();
  });

  it('supprime les lignes des partants et crée celles des seuls entrants', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-alice' },
          { mentionedUserId: 'u-carol' },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue(['alice', 'bob']),
      resolveUsernames: jest.fn<any>().mockResolvedValue(
        new Map([
          ['alice', { id: 'u-alice', username: 'alice' }],
          ['bob', { id: 'u-bob', username: 'bob' }],
        ])
      ),
    });
    const notificationService = makeNotifier();

    const result = await reconcilePostMentions({
      prisma, mentionService, notificationService, post: POST, content: 'salut @alice @bob',
    });

    expect(prisma.postMention.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', mentionedUserId: { in: ['u-carol'] } },
    });
    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-bob'], 'INLINE');
    expect(result.newlyMentionedUserIds).toEqual(['u-bob']);
    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedUserIds: ['u-bob'] })
    );
  });

  // Pas de court-circuit « pas de @ » à l'édition : un contenu qui ne nomme plus
  // personne doit EFFACER les lignes, là où une création sans @ n'écrit rien.
  it('efface toutes les lignes quand le contenu édité ne nomme plus personne', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
    });

    const result = await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(),
      post: POST, content: 'plus personne ici',
    });

    expect(prisma.postMention.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', mentionedUserId: { in: ['u-alice'] } },
    });
    expect(result.mentionedUserIds).toEqual([]);
    expect(result.reconciled).toBe(true);
  });

  it('réconcilie un post édité sans contenu textuel', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });

    const result = await reconcilePostMentions({
      prisma, mentionService: makeMentionService(), notificationService: makeNotifier(),
      post: POST, content: undefined,
    });

    expect(prisma.postMention.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', mentionedUserId: { in: ['u-alice'] } },
    });
    expect(result.reconciled).toBe(true);
  });

  // Préserver une mention périmée vaut mieux que détruire une mention vivante :
  // la première surligne quelqu'un de trop, la seconde ne revient jamais.
  it('s\'abstient de tout écrire quand l\'ensemble précédent est illisible', async () => {
    const onError = jest.fn();
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    const result = await reconcilePostMentions({
      prisma, mentionService, notificationService, post: POST, content: 'salut @alice', onError,
    });

    expect(result.reconciled).toBe(false);
    expect(prisma.postMention.deleteMany).not.toHaveBeenCalled();
    expect(mentionService.createPostMentions).not.toHaveBeenCalled();
    expect(notificationService.createPostMentionNotificationsBatch).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('ne conclut rien sans service de mentions câblé', async () => {
    const prisma = makePrisma();

    const result = await reconcilePostMentions({
      prisma, mentionService: undefined, notificationService: makeNotifier(),
      post: POST, content: 'salut @alice',
    });

    expect(result.reconciled).toBe(false);
    expect(prisma.postMention.findMany).not.toHaveBeenCalled();
    expect(prisma.postMention.deleteMany).not.toHaveBeenCalled();
  });

  it('n\'appelle deleteMany qu\'en présence de partants', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: 'u-alice' }]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });

    await reconcilePostMentions({
      prisma, mentionService: makeMentionService(), notificationService: makeNotifier(),
      post: POST, content: 'salut @alice',
    });

    expect(prisma.postMention.deleteMany).not.toHaveBeenCalled();
  });

  it('propage le type de contenu à la notification des entrants', async () => {
    const notificationService = makeNotifier();

    await reconcilePostMentions({
      prisma: makePrisma(), mentionService: makeMentionService(), notificationService,
      post: { id: 'post-1', authorId: 'u-author', type: 'REEL', visibility: 'PUBLIC' }, content: 'salut @alice',
    });

    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ postType: 'REEL', mentionedUserIds: ['u-alice'] })
    );
  });
});

describe('resolvePostMentions — précédence des modes', () => {
  it('laisse un PINNED déclaré gagner sur le texte qui nomme la même personne', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST,
      content: 'bravo @alice',
      declared: [{ username: 'alice', display: 'PINNED' }],
    });

    expect(mentionService.createPostMentions).toHaveBeenCalledTimes(1);
    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-alice'], 'PINNED');
  });

  it('fait perdre un SILENT déclaré contre le texte — on ne cache pas ce qui est écrit', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST,
      content: 'bravo @alice',
      declared: [{ username: 'alice', display: 'SILENT' }],
    });

    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-alice'], 'INLINE');
  });

  it('dérive INLINE depuis le texte du CANEVAS, pas seulement depuis la légende', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST,
      content: null,
      storyEffects: { textObjects: [{ id: 't1', text: 'coucou @alice' }] },
    });

    expect(mentionService.createPostMentions).toHaveBeenCalledWith('post-1', ['u-alice'], 'INLINE');
  });

  it('n\'interroge NI la base NI le service quand aucune source ne porte de @ ni de déclaration', async () => {
    const prisma = makePrisma();
    const mentionService = makeMentionService();
    const notificationService = makeNotifier();

    const result = await resolvePostMentions({
      prisma, mentionService, notificationService, post: POST,
      content: 'rien ici',
      storyEffects: { textObjects: [{ id: 't1', text: 'ni la' }] },
    });

    expect(result.reconciled).toBe(true);
    expect(mentionService.extractMentions).not.toHaveBeenCalled();
    expect(mentionService.createPostMentions).not.toHaveBeenCalled();
  });
});

describe('reconcilePostMentions — tri-état par mode déclaré', () => {
  it('préserve les trois modes déclarés quand le client n\'en parle pas', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-bob', display: 'PINNED' },
          { mentionedUserId: 'u-carol', display: 'SILENT' },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    const result = await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'texte sans arobase',
      declared: undefined,
    });

    expect(prisma.postMention.deleteMany).not.toHaveBeenCalled();
    expect(result.mentionedUserIds).toEqual(expect.arrayContaining(['u-bob', 'u-carol']));
    expect(result.reconciled).toBe(true);
  });

  it('efface toutes les déclarées quand le client envoie une liste vide', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-bob', display: 'NOTE' },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'texte sans arobase',
      declared: [],
    });

    expect(prisma.postMention.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', mentionedUserId: { in: ['u-bob'] } },
    });
  });

  it('lit une ligne sans champ display comme INLINE — donc relue dans le texte', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-alice', display: null },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'le pseudo a disparu du texte',
      declared: undefined,
    });

    expect(prisma.postMention.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', mentionedUserId: { in: ['u-alice'] } },
    });
  });
});

describe('reconcilePostMentions — rétractation', () => {
  it('retire la notification de la personne dont la référence disparaît', async () => {
    const prisma = makePrisma({
      postMention: {
        findMany: jest.fn<any>().mockResolvedValue([
          { mentionedUserId: 'u-bob', display: 'NOTE' },
        ]),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
      notification: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
    });
    const mentionService = makeMentionService({
      extractMentions: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    });

    await reconcilePostMentions({
      prisma, mentionService, notificationService: makeNotifier(), post: POST,
      content: 'plus personne', declared: [],
    });

    expect(prisma.notification.deleteMany).toHaveBeenCalledTimes(1);
  });
});
