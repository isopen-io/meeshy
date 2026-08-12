/**
 * Le fil d'un post (ses commentaires) hérite de l'audience du post.
 *
 * `postVisibility.ts` porte depuis toujours une asymétrie ÉCRITE mais jamais
 * exécutable en dehors du feed : « VOIR ⊇ INTERAGIR ». Le filtre de feed
 * (`buildPostVisibilityOrFilter`) admet amis ∪ contacts DM ; `canUserViewPost`,
 * décrit dans le même fichier comme « ce qui garde RÉAGIR / COMMENTER », reste
 * amis stricts.
 *
 * Ces deux règles n'avaient aucun point d'entrée commun applicable à un
 * commentaire : les routes du fil ne consultaient JAMAIS la visibilité du post.
 * Les quatre fonctions testées ici sont ce point d'entrée — chargement de la
 * tranche ACL (depuis un post OU depuis un commentaire, l'id d'URL n'étant
 * jamais cru) puis les deux verdicts nommés d'après ce qu'ils autorisent.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  loadPostAcl,
  loadCommentPostAcl,
  canUserConsumePost,
  canUserInteractWithPost,
} from '../../../../services/posts/postVisibility';
import { doUsersShareDirectConversation } from '../../../../services/posts/directContactVisibility';

const AUTHOR = 'u-author';
const VIEWER = 'u-viewer';
const POST_ID = 'p-1';
const COMMENT_ID = 'c-1';

type PrismaDouble = Record<string, Record<string, unknown>>;

/**
 * Le double n'expose que les délégués réellement touchés. Un délégué manquant
 * fait échouer le test par TypeError plutôt que de rendre un verdict par
 * défaut — c'est voulu : une garde qui interroge silencieusement la mauvaise
 * table doit se voir.
 */
function makePrisma(opts: {
  post?: unknown;
  comment?: unknown;
  friends?: boolean;
  communities?: string[];
  coMemberIn?: string[];
  directConversations?: string[];
  directPeer?: boolean;
} = {}): any {
  const prisma: PrismaDouble = {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(opts.post ?? null),
    },
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue(opts.comment ?? null),
    },
    friendRequest: {
      findFirst: jest.fn<any>().mockResolvedValue(opts.friends ? { id: 'fr-1' } : null),
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue((opts.communities ?? []).map((id) => ({ communityId: id }))),
      findFirst: jest.fn<any>().mockResolvedValue((opts.coMemberIn ?? []).length > 0 ? { id: 'cm-1' } : null),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(
        (opts.directConversations ?? []).map((id) => ({ conversationId: id }))
      ),
      findFirst: jest.fn<any>().mockResolvedValue(opts.directPeer ? { id: 'pt-1' } : null),
    },
  };
  return prisma;
}

function postAcl(overrides: Partial<{ visibility: string; visibilityUserIds: string[]; authorId: string }> = {}) {
  return {
    authorId: overrides.authorId ?? AUTHOR,
    visibility: overrides.visibility ?? 'PUBLIC',
    visibilityUserIds: overrides.visibilityUserIds ?? [],
  } as any;
}

// ─── loadPostAcl ──────────────────────────────────────────────────────────────

describe('loadPostAcl — la tranche ACL, rien de plus', () => {
  it('rend le triplet auteur/visibilité/liste du post demandé', async () => {
    const prisma = makePrisma({ post: { authorId: AUTHOR, visibility: 'ONLY', visibilityUserIds: [VIEWER] } });

    const acl = await loadPostAcl(prisma, POST_ID);

    expect(acl).toEqual({ authorId: AUTHOR, visibility: 'ONLY', visibilityUserIds: [VIEWER] });
  });

  it('rend null pour un post absent ou supprimé — les deux cas sont indiscernables', async () => {
    const prisma = makePrisma({ post: null });

    expect(await loadPostAcl(prisma, POST_ID)).toBeNull();
  });

  it('exclut les posts supprimés dans le where, pas après coup', async () => {
    const prisma = makePrisma({ post: postAcl() });

    await loadPostAcl(prisma, POST_ID);

    const where = (prisma.post.findFirst as any).mock.calls[0][0].where;
    expect(where.id).toBe(POST_ID);
    expect(where.deletedAt).toBeDefined();
  });
});

// ─── loadCommentPostAcl ───────────────────────────────────────────────────────

describe('loadCommentPostAcl — le post est résolu DEPUIS le commentaire', () => {
  it('rend le postId réel du commentaire, pas celui fourni par l’appelant', async () => {
    const prisma = makePrisma({
      comment: { postId: 'p-reel', post: { authorId: AUTHOR, visibility: 'PRIVATE', visibilityUserIds: [] } },
    });

    const resolved = await loadCommentPostAcl(prisma, COMMENT_ID);

    expect(resolved?.postId).toBe('p-reel');
    expect(resolved?.post.visibility).toBe('PRIVATE');
    expect((prisma.postComment.findFirst as any).mock.calls[0][0].where.id).toBe(COMMENT_ID);
  });

  it('rend null pour un commentaire absent ou supprimé', async () => {
    const prisma = makePrisma({ comment: null });

    expect(await loadCommentPostAcl(prisma, COMMENT_ID)).toBeNull();
  });

  it('rend null quand le post portant le commentaire a disparu', async () => {
    const prisma = makePrisma({ comment: { postId: 'p-orphan', post: null } });

    expect(await loadCommentPostAcl(prisma, COMMENT_ID)).toBeNull();
  });
});

// ─── canUserConsumePost — lire le fil ─────────────────────────────────────────

describe('canUserConsumePost — l’audience de CONSOMMATION (amis ∪ contacts DM)', () => {
  it('admet l’auteur sur son propre post PRIVATE', async () => {
    const prisma = makePrisma();

    expect(await canUserConsumePost(prisma, postAcl({ visibility: 'PRIVATE' }), AUTHOR)).toBe(true);
  });

  it('admet n’importe qui sur un post PUBLIC sans interroger le graphe', async () => {
    const prisma = makePrisma();

    expect(await canUserConsumePost(prisma, postAcl({ visibility: 'PUBLIC' }), VIEWER)).toBe(true);
    expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('refuse un tiers sur un post PRIVATE', async () => {
    const prisma = makePrisma();

    expect(await canUserConsumePost(prisma, postAcl({ visibility: 'PRIVATE' }), VIEWER)).toBe(false);
  });

  it('refuse un tiers absent de la liste ONLY', async () => {
    const prisma = makePrisma();

    expect(await canUserConsumePost(prisma, postAcl({ visibility: 'ONLY', visibilityUserIds: ['u-bob'] }), VIEWER)).toBe(false);
  });

  it('admet un CONTACT DM non-ami sur un post FRIENDS — le feed le lui montre déjà', async () => {
    const prisma = makePrisma({ friends: false, directConversations: ['conv-1'], directPeer: true });

    expect(await canUserConsumePost(prisma, postAcl({ visibility: 'FRIENDS' }), VIEWER)).toBe(true);
  });

  it('refuse un inconnu sans amitié ni conversation directe sur un post FRIENDS', async () => {
    const prisma = makePrisma({ friends: false, directConversations: [], directPeer: false });

    expect(await canUserConsumePost(prisma, postAcl({ visibility: 'FRIENDS' }), VIEWER)).toBe(false);
  });

  it('refuse un contact DM nommément exclu par EXCEPT', async () => {
    const prisma = makePrisma({ friends: false, directConversations: ['conv-1'], directPeer: true });

    const acl = postAcl({ visibility: 'EXCEPT', visibilityUserIds: [VIEWER] });
    expect(await canUserConsumePost(prisma, acl, VIEWER)).toBe(false);
  });

  it('n’admet un visiteur anonyme que sur un post PUBLIC', async () => {
    const prisma = makePrisma();

    expect(await canUserConsumePost(prisma, postAcl({ visibility: 'PUBLIC' }), undefined)).toBe(true);
    expect(await canUserConsumePost(prisma, postAcl({ visibility: 'FRIENDS' }), undefined)).toBe(false);
    expect(await canUserConsumePost(prisma, postAcl({ visibility: 'PRIVATE' }), undefined)).toBe(false);
    expect(prisma.friendRequest.findFirst).not.toHaveBeenCalled();
  });
});

// ─── canUserInteractWithPost — écrire dans le fil ─────────────────────────────

describe('canUserInteractWithPost — l’audience d’INTERACTION (amis stricts)', () => {
  it('refuse un contact DM non-ami là où la consommation l’admet', async () => {
    const prisma = makePrisma({ friends: false, directConversations: ['conv-1'], directPeer: true });
    const acl = postAcl({ visibility: 'FRIENDS' });

    expect(await canUserConsumePost(prisma, acl, VIEWER)).toBe(true);
    expect(await canUserInteractWithPost(prisma, acl, VIEWER)).toBe(false);
  });

  it('admet un ami sur un post FRIENDS', async () => {
    const prisma = makePrisma({ friends: true });

    expect(await canUserInteractWithPost(prisma, postAcl({ visibility: 'FRIENDS' }), VIEWER)).toBe(true);
  });

  it('refuse un tiers sur un post PRIVATE et admet son auteur', async () => {
    const prisma = makePrisma();

    expect(await canUserInteractWithPost(prisma, postAcl({ visibility: 'PRIVATE' }), VIEWER)).toBe(false);
    expect(await canUserInteractWithPost(prisma, postAcl({ visibility: 'PRIVATE' }), AUTHOR)).toBe(true);
  });

  it('refuse un utilisateur non identifié, quelle que soit la visibilité', async () => {
    const prisma = makePrisma();

    expect(await canUserInteractWithPost(prisma, postAcl({ visibility: 'PUBLIC' }), undefined)).toBe(false);
  });

  it('REFUSE une visibilité inconnue — un mode ajouté au schéma restreint par défaut', async () => {
    const prisma = makePrisma({ friends: true, directPeer: true, directConversations: ['conv-1'] });
    const unknown = postAcl({ visibility: 'AUDIENCE_DE_DEMAIN' });

    expect(await canUserInteractWithPost(prisma, unknown, VIEWER)).toBe(false);
    expect(await canUserConsumePost(prisma, unknown, VIEWER)).toBe(false);
  });
});

// ─── doUsersShareDirectConversation ───────────────────────────────────────────

describe('doUsersShareDirectConversation — le pendant pairwise de doUsersShareCommunity', () => {
  it('rend true quand les deux sont membres actifs d’une même conversation directe', async () => {
    const prisma = makePrisma({ directConversations: ['conv-1', 'conv-2'], directPeer: true });

    expect(await doUsersShareDirectConversation(prisma, AUTHOR, VIEWER)).toBe(true);
    expect((prisma.participant.findFirst as any).mock.calls[0][0].where.conversationId.in)
      .toEqual(['conv-1', 'conv-2']);
  });

  it('rend false sans interroger le pair quand le premier n’a aucune conversation directe', async () => {
    const prisma = makePrisma({ directConversations: [] });

    expect(await doUsersShareDirectConversation(prisma, AUTHOR, VIEWER)).toBe(false);
    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
  });

  it('REFUSE quand le graphe est illisible — l’échec ne doit pas ouvrir', async () => {
    const prisma = makePrisma();
    (prisma.participant.findMany as any).mockRejectedValue(new Error('mongo down'));

    expect(await doUsersShareDirectConversation(prisma, AUTHOR, VIEWER)).toBe(false);
  });
});
