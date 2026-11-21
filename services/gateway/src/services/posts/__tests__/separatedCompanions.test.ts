/**
 * Un blocage retire aussi ce qui VOYAGE avec un post : la source d'une
 * republication et les commentaires en aperçu de l'auteur séparé (#16894).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { withMentions } from '../postReferences';
import { readerSeparatedFrom } from '../separatedReader';
import { buildPostVisibilityOrFilter } from '../postVisibility';

const READER = '507f1f77bcf86cd799439001';
const AUTHOR = '507f1f77bcf86cd799439002';
const BLOCKED = '507f1f77bcf86cd799439003';
const FRIEND = '507f1f77bcf86cd799439004';

const person = (id: string) => ({ id, username: `u${id.slice(-2)}`, displayName: null, avatar: null });
const comment = (id: string, authorId: string) => ({ id, content: `c-${id}`, author: person(authorId) });

const post = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  content: 'texte',
  author: person(AUTHOR),
  postMentions: [],
  comments: [comment('c1', FRIEND), comment('c2', BLOCKED), comment('c3', AUTHOR)],
  repostOf: { id: 'src', content: 'source', author: person(FRIEND), postMentions: [] },
  ...over,
});

const separatedFrom = (...ids: string[]) => ({ separatedUserIds: new Set(ids) });

describe('withMentions — ce qu’un blocage retire du post servi', () => {
  it('la source d’une republication d’un auteur séparé part en repostOf: null', () => {
    const served = withMentions(post({ repostOf: { id: 'src', content: 'secret', author: person(BLOCKED), postMentions: [] } }), separatedFrom(BLOCKED));
    expect(served.repostOf).toBeNull();
    expect(JSON.stringify(served)).not.toContain('secret');
  });

  it('les commentaires d’un auteur séparé sortent de l’aperçu, les autres restent dans leur ordre', () => {
    const served = withMentions(post(), separatedFrom(BLOCKED)) as { comments: Array<{ id: string }> };
    expect(served.comments.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('une source et des commentaires d’auteurs non séparés voyagent intacts', () => {
    const served = withMentions(post(), separatedFrom('507f1f77bcf86cd7994390ff')) as { comments: unknown[]; repostOf: { id: string } };
    expect(served.comments).toHaveLength(3);
    expect(served.repostOf.id).toBe('src');
  });

  it('une source qui est la COPIE du contenu d’un auteur séparé part aussi en repostOf: null', () => {
    const copy = { id: 'copie', content: 'story copiée', author: person(FRIEND), snapshotAuthorId: BLOCKED, postMentions: [] };
    const served = withMentions(post({ repostOf: copy }), separatedFrom(BLOCKED));
    expect(served.repostOf).toBeNull();
  });

  it('la colonne de décision snapshotAuthorId ne part jamais sur le fil, séparation ou non', () => {
    const copy = { id: 'copie', content: 'story copiée', author: person(FRIEND), snapshotAuthorId: AUTHOR, postMentions: [] };
    for (const reader of [separatedFrom(BLOCKED), { broadcast: true }, undefined]) {
      const served = withMentions(post({ repostOf: copy }), reader) as { repostOf: Record<string, unknown> };
      expect(served.repostOf.id).toBe('copie');
      expect('snapshotAuthorId' in served.repostOf).toBe(false);
    }
  });

  it('sans séparation déclarée (diffusion), rien n’est retiré', () => {
    const served = withMentions(post(), { broadcast: true }) as { comments: unknown[] };
    expect(served.comments).toHaveLength(3);
  });
});

describe('readerSeparatedFrom — le blocage dans les deux sens', () => {
  const prismaWith = (blockedByReader: string[], blockersOfReader: string[]) => ({
    user: {
      findUnique: jest.fn<any>(async () => ({ blockedUserIds: blockedByReader })),
      findMany: jest.fn<any>(async () => blockersOfReader.map((id) => ({ id }))),
    },
  });

  it('porte ceux que le lecteur a bloqués ET ceux qui l’ont bloqué, et garde le reste du lecteur', async () => {
    const reader = await readerSeparatedFrom(prismaWith([BLOCKED], [FRIEND]) as never, READER, { canvasCaps: 3 });
    expect([...(reader.separatedUserIds ?? [])].sort()).toEqual([BLOCKED, FRIEND].sort());
    expect(reader.canvasCaps).toBe(3);
  });

  it('sans compte, personne n’est séparé et rien n’est lu', async () => {
    const prisma = prismaWith([BLOCKED], []);
    const reader = await readerSeparatedFrom(prisma as never, undefined, undefined);
    expect(reader.separatedUserIds?.size).toBe(0);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('une lecture qui échoue fait échouer la requête (on ne sert pas sans savoir quoi taire)', async () => {
    const prisma = { user: { findUnique: jest.fn<any>(async () => { throw new Error('down'); }), findMany: jest.fn<any>(async () => []) } };
    await expect(readerSeparatedFrom(prisma as never, READER, undefined)).rejects.toThrow('down');
  });
});

describe('buildPostVisibilityOrFilter — la copie d’un auteur séparé ne passe pas le filtre de liste', () => {
  it('écarte l’auteur ET la copie dont il est l’auteur d’origine, champ absent compris', () => {
    const filter = buildPostVisibilityOrFilter(READER, [], [], [BLOCKED]) as { AND: unknown[] };
    expect(filter.AND).toContainEqual({ authorId: { notIn: [BLOCKED] } });
    expect(filter.AND).toContainEqual({
      OR: [{ snapshotAuthorId: null }, { snapshotAuthorId: { isSet: false } }, { snapshotAuthorId: { notIn: [BLOCKED] } }],
    });
  });
});

