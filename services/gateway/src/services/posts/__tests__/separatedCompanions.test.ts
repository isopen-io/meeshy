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
import { hasSeparableCompanions, withoutSeparatedCompanions } from '../separatedCompanions';

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

  /**
   * **CE TÉMOIN A CHANGÉ DE PORTÉE, PAS DE GARANTIE** (#20711).
   *
   * Il disait « jamais sur le fil, séparation ou non », et il comptait la
   * composition d'une DIFFUSION parmi les charges servies. Mesuré : elle ne
   * l'est pas — une diffusion compose sa charge dans la route, très en amont de
   * son audience, et la résolution par lecteur n'arrive qu'au moment d'émettre.
   * Retirer la colonne ICI la rendait invisible au résolveur, et la moitié
   * « copie d'un contenu éphémère » de la loi était morte sur les cinq chemins
   * de production.
   *
   * La garantie « jamais sur le fil » est donc tenue à son vrai endroit, et
   * elle y est tenue par son propre témoin — `emitPostToAudience` retire la
   * colonne sur CHACUNE de ses charges
   * (`post-compagnons-separes-20711.test.ts` § « la COPIE d'un contenu
   * éphémère »). Ce qui se garde ici est ce qui reste vrai ici : toute charge
   * SERVIE la retire, et la diffusion la garde EXPRÈS.
   */
  it('la colonne de décision snapshotAuthorId ne part sur aucune charge SERVIE', () => {
    const copy = { id: 'copie', content: 'story copiée', author: person(FRIEND), snapshotAuthorId: AUTHOR, postMentions: [] };
    for (const reader of [separatedFrom(BLOCKED), undefined]) {
      const served = withMentions(post({ repostOf: copy }), reader) as { repostOf: Record<string, unknown> };
      expect(served.repostOf.id).toBe('copie');
      expect('snapshotAuthorId' in served.repostOf).toBe(false);
    }
  });

  it('une DIFFUSION la garde, parce que sa résolution par lecteur en a besoin', () => {
    const copy = { id: 'copie', content: 'story copiée', author: person(FRIEND), snapshotAuthorId: AUTHOR, postMentions: [] };
    const diffusee = withMentions(post({ repostOf: copy }), { broadcast: true }) as { repostOf: Record<string, unknown> };
    expect(diffusee.repostOf.snapshotAuthorId).toBe(AUTHOR);
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


/**
 * #20204 — le prédicat qui décide si une porte UNITAIRE doit LIRE les blocages.
 *
 * Il n'est pas une garde : il répond « cette charge a-t-elle un compagnon qu'un
 * blocage pourrait retirer ? ». Son contrat est donc exactement l'ENSEMBLE des
 * formes que `withoutSeparatedCompanions` sait toucher — et c'est cette
 * équivalence que ces témoins gardent, parce que c'est elle qui se casserait
 * silencieusement le jour où un troisième compagnon est ajouté au filtre sans
 * l'être au prédicat.
 */
describe('#20204 — hasSeparableCompanions', () => {
  it('une publication nue n’a rien à taire — c’est le cas nominal d’une création', () => {
    expect(hasSeparableCompanions({ id: 'p1', authorId: AUTHOR, content: 'bonjour' })).toBe(false);
  });

  it('`repostOf: null` et `comments: []` n’ouvrent rien non plus', () => {
    expect(hasSeparableCompanions({ id: 'p1', repostOf: null, comments: [] })).toBe(false);
  });

  it('une source republiée qui NOMME son auteur en ouvre un', () => {
    expect(hasSeparableCompanions({ id: 'p1', repostOf: { id: 'src', author: person(BLOCKED) } })).toBe(true);
  });

  it('la COPIE d’un contenu éphémère en ouvre un par `snapshotAuthorId`, sans auteur déclaré', () => {
    expect(hasSeparableCompanions({ id: 'p1', repostOf: { id: 'src', snapshotAuthorId: BLOCKED } })).toBe(true);
  });

  it('un seul commentaire en aperçu suffit', () => {
    expect(hasSeparableCompanions({ id: 'p1', comments: [comment('c1', FRIEND)] })).toBe(true);
  });

  it('TOUTE forme que le filtre sait toucher est reconnue par le prédicat', () => {
    const formes = [
      post(),
      { id: 'p1', repostOf: { id: 'src', author: person(BLOCKED) } },
      { id: 'p1', repostOf: { id: 'src', snapshotAuthorId: BLOCKED } },
      { id: 'p1', comments: [comment('c1', BLOCKED)] },
    ];
    for (const forme of formes) {
      // Le filtre CHANGE la charge sur chacune de ces formes quand l'auteur est
      // séparé : le prédicat doit donc l'annoncer, sinon la lecture est sautée
      // et le filtre ne tourne jamais.
      const filtre = withoutSeparatedCompanions(forme, new Set([BLOCKED, FRIEND]));
      expect(JSON.stringify(filtre) !== JSON.stringify(forme)).toBe(true);
      expect(hasSeparableCompanions(forme)).toBe(true);
    }
  });

  it('ne jette pas sur `null`, `undefined` ni sur une forme qui n’est pas un objet', () => {
    expect(hasSeparableCompanions(null)).toBe(false);
    expect(hasSeparableCompanions(undefined)).toBe(false);
    expect(hasSeparableCompanions('pas un post')).toBe(false);
  });
});
