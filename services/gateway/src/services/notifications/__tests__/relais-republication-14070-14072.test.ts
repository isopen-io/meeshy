/**
 * #14070 — republier le contenu de Y prévient l'entourage B de Y
 * (`circleOnMyContentRepost`, défaut Proche). Il n'existe pas de cran C pour une
 * republication : côté republieur, c'est une de SES publications, que son
 * entourage A apprend déjà par `friend_new_post` (`circlePublicationRepost`).
 *
 * #14072 — citer le contenu de Y prévient le croisement B ∩ C : l'entourage de Y
 * (`circleOnMyContentQuote`, défaut Proche) ET celui du citant
 * (`circleElsewhereQuote`, défaut Sang).
 *
 * Dans les deux cas : la personne doit pouvoir voir l'original ET la
 * republication ; l'auteur republié garde sa notification (`post_repost`) ; qui
 * a déjà appris la republication par `friend_new_post` ne la reçoit pas deux
 * fois ; bloqué : jamais.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { relayRepostToEntourage } from '../fanout/activity-relay';
import { createPostRepostNotification } from '../builders/social-engagement';
import type { NotificationBuilderDependencies } from '../builders/dependencies';
import {
  AUTEUR, COMMENTATEUR as REPUBLIEUR, SANG, PROCHE, AMI, SANG_BLOQUE, SANG_DU_COMMENTATEUR, POST, monde, type Link, type World,
  deletedAtMatches,
} from '../../../__tests__/helpers/circle-world';

const REPOST = 'ffffffffffffffffffffffff';
const COMMUN_PROCHE = '6000000000000000000000d1';
const LIENS_COMMUNS: readonly Link[] = [
  [AUTEUR, COMMUN_PROCHE, 'CLOSE'],
  [REPUBLIEUR, COMMUN_PROCHE, 'BLOOD'],
];

type Republication = { readonly isQuote?: boolean; readonly visibility?: string; readonly visibilityUserIds?: string[] };

const republier = async (
  world: World = {},
  republication: Republication = {},
  options: { readonly reposterEntourageNotified?: boolean } = {}
) => {
  const original = { id: POST, authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '' };
  const repost = {
    id: REPOST, authorId: REPUBLIEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '',
    isQuote: false, repostOfId: POST, ...republication,
  };
  const m = monde({ ...world, extraLinks: [...LIENS_COMMUNS, ...(world.extraLinks ?? [])], post: original });
  const findFirst = m.prisma.post.findFirst;
  m.prisma.post.findFirst = (async (args?: { where?: { id?: string; deletedAt?: unknown } }) =>
    args?.where?.id === REPOST ? repost : findFirst(args)) as typeof findFirst;
  await relayRepostToEntourage(m.deps, {
    originalPostId: POST,
    repostId: REPOST,
    actorId: REPUBLIEUR,
    reposterEntourageNotified: options.reposterEntourageNotified ?? false,
  });
  return { reposts: m.notified('friend_content_repost').sort(), quotes: m.notified('friend_content_quote').sort(), m };
};

describe('republication simple (friend_content_repost, #14070)', () => {
  it('défaut : l’entourage Proche et au-dessus de l’auteur, sans seuil côté republieur', async () => {
    expect((await republier()).reposts).toEqual([SANG, PROCHE, COMMUN_PROCHE].sort());
  });

  it('un Ami de l’auteur n’est pas prévenu au défaut ; l’auteur réglé « Ami », si', async () => {
    expect((await republier()).reposts).not.toContain(AMI);
    expect((await republier({ settings: { [AUTEUR]: { circleOnMyContentRepost: 'FRIEND' } } })).reposts).toContain(AMI);
  });

  it('« Personne » chez l’auteur ⇒ personne', async () => {
    expect((await republier({ settings: { [AUTEUR]: { circleOnMyContentRepost: 'NOBODY' } } })).reposts).toEqual([]);
  });

  it('un bloqué par l’auteur ou qui bloque le republieur n’est jamais prévenu', async () => {
    const { reposts } = await republier({ blocks: { [AUTEUR]: [SANG_BLOQUE], [PROCHE]: [REPUBLIEUR] } });
    expect(reposts).not.toContain(SANG_BLOQUE);
    expect(reposts).not.toContain(PROCHE);
  });

  it('qui ne peut pas voir la republication n’est pas prévenu', async () => {
    expect((await republier({}, { visibility: 'ONLY', visibilityUserIds: [SANG] })).reposts).toEqual([SANG]);
    expect((await republier({}, { visibility: 'PRIVATE' })).reposts).toEqual([]);
  });

  it('qui a déjà appris la republication par l’entourage du republieur n’est pas prévenu deux fois', async () => {
    const { reposts } = await republier({}, {}, { reposterEntourageNotified: true });
    expect(reposts).toEqual([SANG, PROCHE].sort());
  });

  it('la charge nomme l’auteur de l’original et pointe la republication', async () => {
    const { m } = await republier();
    const [params] = m.createNotification.mock.calls[0] as unknown as [Record<string, Record<string, unknown>>];
    expect(params.context).toMatchObject({ postId: REPOST });
    expect(params.metadata).toMatchObject({ activity: 'repost', originalPostId: POST, repostId: REPOST, contentAuthorName: AUTEUR });
  });
});

describe('citation (friend_content_quote, #14072)', () => {
  it('défaut : seul qui est Proche+ de l’auteur ET Sang du citant', async () => {
    const { quotes, reposts } = await republier({}, { isQuote: true });
    expect(quotes).toEqual([COMMUN_PROCHE]);
    expect(reposts).toEqual([]);
  });

  it('le Sang d’un seul côté n’est pas prévenu', async () => {
    const { quotes } = await republier({}, { isQuote: true });
    expect(quotes).not.toContain(SANG);
    expect(quotes).not.toContain(SANG_DU_COMMENTATEUR);
  });

  it('« Personne » chez l’auteur ou chez le citant ⇒ personne', async () => {
    expect((await republier({ settings: { [AUTEUR]: { circleOnMyContentQuote: 'NOBODY' } } }, { isQuote: true })).quotes).toEqual([]);
    expect((await republier({ settings: { [REPUBLIEUR]: { circleElsewhereQuote: 'NOBODY' } } }, { isQuote: true })).quotes).toEqual([]);
  });

  it('un Sang du citant qui a déjà reçu friend_new_post n’est pas prévenu deux fois', async () => {
    const { quotes } = await republier({}, { isQuote: true }, { reposterEntourageNotified: true });
    expect(quotes).toEqual([]);
  });
});

describe('republier son propre contenu (#14070)', () => {
  it('ne relaie rien par ce chemin', async () => {
    const m = monde({ extraLinks: LIENS_COMMUNS, post: { authorId: REPUBLIEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '' } });
    await relayRepostToEntourage(m.deps, { originalPostId: POST, repostId: REPOST, actorId: REPUBLIEUR, reposterEntourageNotified: false });
    expect(m.createNotification).not.toHaveBeenCalled();
  });
});

describe('le bâtisseur post_repost relaie aussi (#14070)', () => {
  const bâtir = async (canNotify: boolean, reposterEntourageNotified?: boolean) => {
    const original = { id: POST, authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '' };
    const repost = { ...original, id: REPOST, authorId: REPUBLIEUR, isQuote: false };
    const m = monde({ extraLinks: LIENS_COMMUNS, post: original });
    const findFirst = m.prisma.post.findFirst;
    m.prisma.post.findFirst = (async (args?: { where?: { id?: string } }) =>
      args?.where?.id === REPOST ? repost : findFirst(args)) as typeof findFirst;
    const deps: NotificationBuilderDependencies = {
      prisma: m.prisma as unknown as PrismaClient,
      createNotification: m.createNotification as unknown as NotificationBuilderDependencies['createNotification'],
      resolveRecipientLang: async () => 'fr',
      resolveRecipientPrism: async () => ({ lang: 'fr', ordered: ['fr'] }),
      canNotifyAboutPost: async () => canNotify,
      shouldCreateReactionNotification: () => true,
      truncateMessage: (message) => message,
      isConversationMutedFor: async () => false,
      relayThrottle: (m.deps as unknown as { relayThrottle: NotificationBuilderDependencies['relayThrottle'] }).relayThrottle,
    };
    await createPostRepostNotification(deps, {
      actorId: REPUBLIEUR, originalPostId: POST, postAuthorId: AUTEUR, repostId: REPOST,
      ...(reposterEntourageNotified !== undefined ? { reposterEntourageNotified } : {}),
    });
    return m;
  };

  it('post_repost à l’auteur, et le relais à son entourage', async () => {
    const m = await bâtir(true);
    expect(m.notified('post_repost')).toEqual([AUTEUR]);
    expect(m.notified('friend_content_repost').sort()).toEqual([SANG, PROCHE, COMMUN_PROCHE].sort());
  });

  it('l’auteur qui ne voit pas la republication n’est pas prévenu, son entourage qui la voit l’est', async () => {
    const m = await bâtir(false);
    expect(m.notified('post_repost')).toEqual([]);
    expect(m.notified('friend_content_repost').sort()).toEqual([SANG, PROCHE, COMMUN_PROCHE].sort());
  });

  it('transmet « l’entourage du republieur est déjà prévenu »', async () => {
    expect((await bâtir(true, true)).notified('friend_content_repost').sort()).toEqual([SANG, PROCHE].sort());
  });
});

describe('ce que l’audit a trouvé (#14070)', () => {
  const R1 = '6000000000000000000000f1';
  const X1 = '6000000000000000000000f2';
  const PROCHE_X1 = '6000000000000000000000f3';
  type Row = Record<string, unknown> & { readonly id: string };

  const relayer = async (options: {
    readonly blocks?: Record<string, string[]>;
    readonly chain?: boolean;
    readonly repost?: Record<string, unknown>;
    readonly original?: Record<string, unknown>;
  }) => {
    const original: Row = { id: POST, authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '', ...options.original };
    const r1: Row = { id: R1, authorId: X1, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '', isQuote: false, repostOfId: POST, originalRepostOfId: POST };
    const repost: Row = {
      id: REPOST, authorId: REPUBLIEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '', isQuote: false,
      repostOfId: options.chain ? R1 : POST, originalRepostOfId: POST, ...options.repost,
    };
    const m = monde({ extraLinks: [...LIENS_COMMUNS, [X1, PROCHE_X1, 'CLOSE']], blocks: options.blocks, post: original });
    const rows = [original, r1, repost];
    m.prisma.post.findFirst = (async (args?: { where?: { id?: string; deletedAt?: unknown } }) =>
      rows.find((row) => row.id === args?.where?.id && deletedAtMatches(row, args?.where?.deletedAt)) ?? null) as typeof m.prisma.post.findFirst;
    await relayRepostToEntourage(m.deps, {
      originalPostId: options.chain ? R1 : POST, repostId: REPOST, actorId: REPUBLIEUR, reposterEntourageNotified: false,
    });
    return m.notified('friend_content_repost');
  };

  it('témoin : sans blocage, l’entourage de l’auteur est prévenu', async () => {
    expect(await relayer({})).toContain(SANG);
  });

  it('auteur et republieur bloqués, dans un sens ou dans l’autre : l’entourage de l’auteur n’apprend rien', async () => {
    expect(await relayer({ blocks: { [AUTEUR]: [REPUBLIEUR] } })).toEqual([]);
    expect(await relayer({ blocks: { [REPUBLIEUR]: [AUTEUR] } })).toEqual([]);
  });

  it('republier une republication simple prévient l’entourage de l’auteur RACINE, jamais celui du premier republieur', async () => {
    const sent = await relayer({ chain: true });
    expect(sent).not.toContain(PROCHE_X1);
    expect(sent).toEqual(expect.arrayContaining([SANG, PROCHE]));
  });

  it('une republication supprimée, un original supprimé ou une story expirée ne sont pas relayés', async () => {
    expect(await relayer({ repost: { deletedAt: new Date() } })).toEqual([]);
    expect(await relayer({ original: { deletedAt: new Date() } })).toEqual([]);
    expect(await relayer({ original: { type: 'STORY', expiresAt: new Date(Date.now() - 1000) } })).toEqual([]);
  });
});
