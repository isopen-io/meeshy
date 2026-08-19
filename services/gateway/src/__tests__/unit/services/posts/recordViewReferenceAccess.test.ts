/**
 * `POST /posts/:postId/view` est le SEUL acte qui dépense le droit ouvert par
 * une référence — et le seul chemin qui amène ici un lecteur hors audience.
 *
 * Deux faits se rencontrent dans `recordView` :
 *
 *  1. le filtre de visibilité écarte le référencé qui n'est ni ami, ni contact
 *     DM, ni co-membre — c'est pourtant lui que la référence a le droit de
 *     faire entrer ;
 *  2. la vue DÉCLARÉE ouvre la fenêtre de 24 h. Une lecture ne consomme jamais
 *     rien : la NSE préfetche le post à la réception de la notification, la
 *     revalidation cache-first relit derrière, et le pull-to-refresh relit
 *     encore — la consommation posée sur un GET serait dépensée avant tout
 *     affichage.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../services/posts/communityVisibility', () => ({
  getCommunityCoMemberIds: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstanceSync: jest.fn<any>().mockReturnValue(null) },
}));

import { PostService } from '../../../../services/PostService';

const AUTHOR = 'u-author';
const VIEWER = 'u-viewer';
const HOUR = 3600_000;

function expiredPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    authorId: AUTHOR,
    type: 'STORY',
    expiresAt: new Date(Date.now() - HOUR),
    repostOfId: null,
    originalRepostOfId: null,
    ...overrides,
  };
}

/**
 * `visible` = ce que rend la requête FILTRÉE par l'audience (null pour un
 * lecteur hors audience) ; `stored` = ce que rend la relecture SANS filtre.
 */
function makePrisma(opts: { visible: unknown; stored?: unknown; reference?: unknown }) {
  const post = {
    findFirst: jest.fn<any>(async (args: any) => {
      const filtered = args?.where?.OR !== undefined || args?.where?.visibility !== undefined;
      return filtered ? opts.visible : (opts.stored ?? opts.visible);
    }),
    update: jest.fn<any>().mockResolvedValue({}),
    count: jest.fn<any>().mockResolvedValue(0),
  };

  return {
    post,
    postView: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 'pv-1' }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    postMention: {
      findUnique: jest.fn<any>().mockResolvedValue(opts.reference ?? null),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

describe('PostService.recordView — le droit ouvert par une référence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enregistre la vue d\'un référencé que le filtre d\'audience écarte', async () => {
    const prisma = makePrisma({
      visible: null,
      stored: expiredPost(),
      reference: { expiredViewAt: null },
    });

    expect(await new PostService(prisma).recordView('p-1', VIEWER)).toBe(true);
    expect(prisma.postView.create).toHaveBeenCalled();
  });

  it('ouvre la fenêtre de 24 h — une seule fois, par un filtre sur l\'absence', async () => {
    const prisma = makePrisma({
      visible: null,
      stored: expiredPost(),
      reference: { expiredViewAt: null },
    });

    await new PostService(prisma).recordView('p-1', VIEWER);

    expect(prisma.postMention.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          postId: 'p-1',
          mentionedUserId: VIEWER,
          OR: [{ expiredViewAt: { isSet: false } }, { expiredViewAt: null }],
        }),
      })
    );
  });

  it('refuse un lecteur hors audience qui n\'est PAS référencé', async () => {
    const prisma = makePrisma({ visible: null, stored: expiredPost(), reference: null });

    expect(await new PostService(prisma).recordView('p-1', VIEWER)).toBe(false);
    expect(prisma.postView.create).not.toHaveBeenCalled();
    expect(prisma.postMention.updateMany).not.toHaveBeenCalled();
  });

  it('refuse un référencé dont la fenêtre est écoulée', async () => {
    const prisma = makePrisma({
      visible: null,
      stored: expiredPost(),
      reference: { expiredViewAt: new Date(Date.now() - 25 * HOUR) },
    });

    expect(await new PostService(prisma).recordView('p-1', VIEWER)).toBe(false);
    expect(prisma.postView.create).not.toHaveBeenCalled();
  });

  it('ne dépense RIEN quand le contenu est encore vivant', async () => {
    const live = expiredPost({ expiresAt: new Date(Date.now() + HOUR) });
    const prisma = makePrisma({ visible: live, reference: { expiredViewAt: null } });

    expect(await new PostService(prisma).recordView('p-1', VIEWER)).toBe(true);
    expect(prisma.postMention.updateMany).not.toHaveBeenCalled();
  });

  it('laisse un membre de l\'audience non référencé se comporter comme avant', async () => {
    const prisma = makePrisma({ visible: expiredPost(), reference: null });

    expect(await new PostService(prisma).recordView('p-1', VIEWER)).toBe(true);
    expect(prisma.postMention.updateMany).not.toHaveBeenCalled();
  });
});
