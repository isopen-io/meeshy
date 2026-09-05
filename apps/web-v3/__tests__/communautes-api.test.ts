/**
 * @jest-environment node
 */

import { communautesDuLecteur, conversationsDeLaCommunaute, creeUneCommunaute } from '@/lib/api/communautes';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la LECTURE des trois routes de
 * `/communities` (§ 2 de la spécification), contre la forme que la
 * passerelle sert RÉELLEMENT.
 *
 * LE TÉMOIN DE GARDE (T-garde) EST LE CŒUR DU CRITÈRE : une charge ADVERSE
 * qui porterait `members`/`creator.isOnline`/`participants[].user.isOnline`
 * — ce que la passerelle NE sert PAS (§ 2.1, § 2.2) mais qu'une régression
 * pourrait un jour réintroduire — ne doit laisser AUCUNE trace dans la
 * projection. Le serveur retire déjà ces champs ; ce module prouve qu'il ne
 * les GARDERAIT pas non plus s'ils arrivaient.
 */

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const passerelle = (parChemin: Readonly<Record<string, () => Response>>) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1]();
  };
  return { recuperer, vus };
};

/** Une communauté servie (`communitySchema` après `flattenCommunityCounts`, § 2.1) — les clés EXACTES du contrat. */
const communauteServie = (extra: Record<string, unknown> = {}) => ({
  id: 'comm-1',
  identifier: 'mshy_diaspora-fr-en',
  name: 'Diaspora FR-EN',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: false,
  isActive: true,
  deletedAt: null,
  createdBy: 'u1',
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-08-20T09:00:00.000Z',
  creator: { id: 'u1', username: 'membre', displayName: 'Vous', avatar: null },
  memberCount: 128,
  conversationCount: 14,
  ...extra,
});

describe('la lecture de GET /communities', () => {
  it('demande la route canonique, sur le préfixe /api/v1', async () => {
    const { recuperer, vus } = passerelle({
      '/communities': () => json({ success: true, data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } }),
    });

    await communautesDuLecteur({ jeton: 'j', recuperer });

    expect(vus).toHaveLength(1);
    expect(vus[0]).toContain('/api/v1/communities');
    expect(vus[0]).toContain('limit=20');
    expect(vus[0]).toContain('offset=0');
  });

  it('projette la charge nominale : cinq champs, jamais identifier/creator/avatar/banner/description', async () => {
    const { recuperer } = passerelle({
      '/communities': () =>
        json({
          success: true,
          data: [communauteServie(), communauteServie({ id: 'comm-2', name: 'Atelier traduction', isPrivate: true, memberCount: 32, conversationCount: 3 })],
          pagination: { total: 2, limit: 20, offset: 0, hasMore: false },
        }),
    });

    const liste = await communautesDuLecteur({ jeton: 'j', recuperer });
    if (liste.genre !== 'liste') throw new Error(liste.genre);

    expect(liste.communautes).toEqual([
      { id: 'comm-1', nom: 'Diaspora FR-EN', prive: false, membres: 128, conversations: 14 },
      { id: 'comm-2', nom: 'Atelier traduction', prive: true, membres: 32, conversations: 3 },
    ]);
    const projection = JSON.stringify(liste.communautes);
    expect(projection).not.toContain('identifier');
    expect(projection).not.toContain('creator');
    expect(projection).not.toContain('avatar');
    expect(projection).not.toContain('banner');
    expect(projection).not.toContain('description');
  });

  /**
   * T-GARDE — la moitié « le client ne fabrique rien ». Le serveur ne sert
   * ni `members` ni `creator.isOnline` (§ 2.1) ; cette charge les porte QUAND
   * MÊME pour prouver que la projection ne les lit NULLE PART.
   */
  it('T-garde : une charge adverse portant members/creator.isOnline ne laisse RIEN dans la projection', async () => {
    const { recuperer: recupererNominal } = passerelle({
      '/communities': () => json({ success: true, data: [communauteServie()], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } }),
    });
    const nominale = await communautesDuLecteur({ jeton: 'j', recuperer: recupererNominal });
    if (nominale.genre !== 'liste') throw new Error(nominale.genre);

    const { recuperer: recupererAdverse } = passerelle({
      '/communities': () =>
        json({
          success: true,
          data: [
            communauteServie({
              creator: { id: 'u1', username: 'membre', displayName: 'Vous', avatar: null, isOnline: true, lastActiveAt: '2026-09-05T10:00:00.000Z' },
              members: [{ user: { id: 'u2', isOnline: true, lastActiveAt: '2026-09-05T09:00:00.000Z' } }],
            }),
          ],
          pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
        }),
    });
    const adverse = await communautesDuLecteur({ jeton: 'j', recuperer: recupererAdverse });
    if (adverse.genre !== 'liste') throw new Error(adverse.genre);

    expect(JSON.stringify(adverse.communautes)).toBe(JSON.stringify(nominale.communautes));
    expect(JSON.stringify(adverse.communautes)).not.toContain('isOnline');
    expect(JSON.stringify(adverse.communautes)).not.toContain('lastActiveAt');
    expect(JSON.stringify(adverse.communautes)).not.toContain('members');
  });

  it('dit « session-expiree » sur un 401', async () => {
    const { recuperer } = passerelle({ '/communities': () => json({ success: false }, 401) });

    expect((await communautesDuLecteur({ jeton: 'j', recuperer })).genre).toBe('session-expiree');
  });

  it('dit « panne » quand le réseau ne répond pas', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    expect((await communautesDuLecteur({ jeton: 'j', recuperer })).genre).toBe('panne');
  });

  it('dit « panne » sur une enveloppe success:false', async () => {
    const { recuperer } = passerelle({ '/communities': () => json({ success: false }) });

    expect((await communautesDuLecteur({ jeton: 'j', recuperer })).genre).toBe('panne');
  });

  it('écarte un item malformé plutôt que de tout jeter', async () => {
    const { recuperer } = passerelle({
      '/communities': () =>
        json({
          success: true,
          data: [communauteServie(), { id: 'comm-casse' }],
          pagination: { total: 2, limit: 20, offset: 0, hasMore: false },
        }),
    });

    const liste = await communautesDuLecteur({ jeton: 'j', recuperer });
    if (liste.genre !== 'liste') throw new Error(liste.genre);

    expect(liste.communautes.map((c) => c.id)).toEqual(['comm-1']);
  });

  it('`suite` porte le prochain OFFSET quand hasMore, `null` sinon', async () => {
    const { recuperer: avecSuite } = passerelle({
      '/communities': () => json({ success: true, data: [communauteServie(), communauteServie({ id: 'comm-2' })], pagination: { total: 25, limit: 2, offset: 0, hasMore: true } }),
    });
    const listeAvecSuite = await communautesDuLecteur({ jeton: 'j', offset: 0, limite: 2, recuperer: avecSuite });
    if (listeAvecSuite.genre !== 'liste') throw new Error(listeAvecSuite.genre);
    expect(listeAvecSuite.suite).toBe(2);

    const { recuperer: sansSuite } = passerelle({
      '/communities': () => json({ success: true, data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } }),
    });
    const listeSansSuite = await communautesDuLecteur({ jeton: 'j', recuperer: sansSuite });
    if (listeSansSuite.genre !== 'liste') throw new Error(listeSansSuite.genre);
    expect(listeSansSuite.suite).toBeNull();
  });

  it('relaie `offset` à la passerelle quand il est fourni', async () => {
    const { recuperer, vus } = passerelle({
      '/communities': () => json({ success: true, data: [], pagination: { total: 0, limit: 20, offset: 20, hasMore: false } }),
    });

    await communautesDuLecteur({ jeton: 'j', offset: 20, recuperer });

    expect(vus[0]).toContain('offset=20');
  });
});

/** Une conversation servie (`communityConversationSchema`, § 2.2). */
const conversationServie = (extra: Record<string, unknown> = {}) => ({
  id: 'conv-1',
  identifier: null,
  title: 'Annonces',
  type: 'group',
  description: null,
  avatar: null,
  banner: null,
  isActive: true,
  memberCount: 12,
  lastMessageAt: '2026-09-04T18:00:00.000Z',
  communityId: 'comm-1',
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-09-04T18:00:00.000Z',
  participants: [
    { id: 'p1', userId: 'u2', displayName: 'Membre 1', role: 'member', isActive: true, user: { id: 'u2', username: 'm1', displayName: 'Membre 1', avatar: null, isOnline: false } },
  ],
  _count: { messages: 4, participants: 12 },
  ...extra,
});

describe('la lecture de GET /communities/:id/conversations', () => {
  it('demande la route canonique avec l’id de communauté', async () => {
    const { recuperer, vus } = passerelle({
      '/conversations': () => json({ success: true, data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } }),
    });

    await conversationsDeLaCommunaute({ jeton: 'j', id: 'comm-1', recuperer });

    expect(vus[0]).toContain('/api/v1/communities/comm-1/conversations');
  });

  it('projette id/titre/COMPTE de participants/dernierMessageA — jamais la liste participants[]', async () => {
    const { recuperer } = passerelle({
      '/conversations': () => json({ success: true, data: [conversationServie()], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } }),
    });

    const ouverture = await conversationsDeLaCommunaute({ jeton: 'j', id: 'comm-1', recuperer });
    if (ouverture.genre !== 'ouverte') throw new Error(ouverture.genre);

    expect(ouverture.conversations).toEqual([
      { id: 'conv-1', titre: 'Annonces', participants: 12, dernierMessageA: '2026-09-04T18:00:00.000Z' },
    ]);
  });

  /** T-GARDE, seconde surface : `participants[].user.isOnline` n'entre JAMAIS dans la projection, même adverse. */
  it('T-garde : une charge adverse portant participants[].user.isOnline ne laisse RIEN de la présence', async () => {
    const { recuperer } = passerelle({
      '/conversations': () =>
        json({
          success: true,
          data: [
            conversationServie({
              participants: [
                { id: 'p1', userId: 'u2', displayName: 'Membre 1', role: 'member', isActive: true, user: { id: 'u2', username: 'm1', displayName: 'Membre 1', avatar: null, isOnline: true, lastActiveAt: '2026-09-05T09:00:00.000Z' } },
              ],
            }),
          ],
          pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
        }),
    });

    const ouverture = await conversationsDeLaCommunaute({ jeton: 'j', id: 'comm-1', recuperer });
    if (ouverture.genre !== 'ouverte') throw new Error(ouverture.genre);

    const projection = JSON.stringify(ouverture.conversations);
    // `participants` RESTE — c'est le COMPTE (le témoin voisin le nomme :
    // « COMPTE de participants … jamais la liste participants[] »), et un
    // AGRÉGAT SANS IDENTITÉ n'est pas visé par la règle de présence
    // (CLAUDE.md § Visibilité de la présence). Ce qu'on interdit est la LISTE
    // et tout ce qu'elle transporte. Bannir la sous-chaîne `participants`
    // rendait la garde INCAPABLE de passer — un rouge permanent n'apprend
    // plus rien à personne, et c'est ainsi qu'une garde cesse d'être lue.
    expect(typeof ouverture.conversations[0]?.participants).toBe('number');
    expect(projection).not.toContain('isOnline');
    expect(projection).not.toContain('lastActiveAt');
    expect(projection).not.toContain('userId');
    expect(projection).not.toContain('displayName');
    expect(projection).not.toContain('u2');
    expect(ouverture.conversations).toEqual([{ id: 'conv-1', titre: 'Annonces', participants: 12, dernierMessageA: '2026-09-04T18:00:00.000Z' }]);
  });

  it('titre : repli « Conversation » quand `title` est null', async () => {
    const { recuperer } = passerelle({
      '/conversations': () => json({ success: true, data: [conversationServie({ title: null })], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } }),
    });

    const ouverture = await conversationsDeLaCommunaute({ jeton: 'j', id: 'comm-1', recuperer });
    if (ouverture.genre !== 'ouverte') throw new Error(ouverture.genre);

    expect(ouverture.conversations[0]?.titre).toBe('Conversation');
  });

  it('403 ⇒ refus, 404 ⇒ introuvable, 401 ⇒ session-expiree, panne ⇒ panne — quatre formes distinctes', async () => {
    const refus = await conversationsDeLaCommunaute({ jeton: 'j', id: 'comm-1', recuperer: async () => json({ success: false }, 403) });
    expect(refus.genre).toBe('refus');

    const introuvable = await conversationsDeLaCommunaute({ jeton: 'j', id: 'comm-1', recuperer: async () => json({ success: false }, 404) });
    expect(introuvable.genre).toBe('introuvable');

    const expiree = await conversationsDeLaCommunaute({ jeton: 'j', id: 'comm-1', recuperer: async () => json({ success: false }, 401) });
    expect(expiree.genre).toBe('session-expiree');

    const panne = await conversationsDeLaCommunaute({
      jeton: 'j',
      id: 'comm-1',
      recuperer: async () => {
        throw new Error('réseau coupé');
      },
    });
    expect(panne.genre).toBe('panne');
  });
});

describe('la création — POST /communities', () => {
  it('poste name/isPrivate/description au corps JSON', async () => {
    const corps: string[] = [];
    const recuperer = async (_url: string, options: RequestInit): Promise<Response> => {
      corps.push(String(options.body));
      return json({ success: true, data: communauteServie({ id: 'comm-neuve' }) }, 201);
    };

    await creeUneCommunaute({ jeton: 'j', champs: { nom: 'Diaspora FR-EN', description: 'Un espace', prive: false }, recuperer });

    expect(JSON.parse(corps[0] ?? '{}')).toEqual({ name: 'Diaspora FR-EN', isPrivate: false, description: 'Un espace' });
  });

  it('201 ⇒ {genre:"creee", id}', async () => {
    const recuperer = async (): Promise<Response> => json({ success: true, data: communauteServie({ id: 'comm-neuve' }) }, 201);

    const issue = await creeUneCommunaute({ jeton: 'j', champs: { nom: 'x', prive: true }, recuperer });
    expect(issue).toEqual({ genre: 'creee', id: 'comm-neuve' });
  });

  it('409 ⇒ {genre:"conflit", motif} — le message serveur est GARDÉ mais pas recomposé ici', async () => {
    const recuperer = async (): Promise<Response> =>
      json({ success: false, error: 'A community with identifier "mshy_x" already exists', message: 'A community with identifier "mshy_x" already exists' }, 409);

    const issue = await creeUneCommunaute({ jeton: 'j', champs: { nom: 'x', prive: true }, recuperer });
    expect(issue.genre).toBe('conflit');
    if (issue.genre !== 'conflit') throw new Error(issue.genre);
    expect(issue.motif).toContain('already exists');
  });

  it('401 ⇒ session-expiree, panne ⇒ panne', async () => {
    const expiree = await creeUneCommunaute({ jeton: 'j', champs: { nom: 'x', prive: true }, recuperer: async () => json({ success: false }, 401) });
    expect(expiree.genre).toBe('session-expiree');

    const panne = await creeUneCommunaute({
      jeton: 'j',
      champs: { nom: 'x', prive: true },
      recuperer: async () => {
        throw new Error('réseau coupé');
      },
    });
    expect(panne.genre).toBe('panne');
  });
});
