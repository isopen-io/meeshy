/**
 * @jest-environment node
 */

import { cherche } from '@/lib/api/recherche';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la lecture des DEUX routes de recherche, contre
 * la forme qu'elles servent réellement.
 *
 * Les bouchons sont copiés des schémas qui les déclarent, jamais d'un souvenir
 * (leçon 476) :
 *
 *   - `conversationMinimalSchema`
 *     (`packages/shared/types/api-schemas/conversation.ts:425`), servi par
 *     `GET /conversations/search` (`routes/conversations/search.ts:67-90`) — un
 *     tableau NU, sans `pagination` ;
 *   - la ligne de `GET /directory/people`
 *     (`routes/directory/people.ts:105-135`) — six champs, pagination par
 *     CURSEUR.
 *
 * Quatre points gardés que rien d'autre n'attraperait :
 *
 *   - une requête VIDE n'appelle RIEN. `q` est requis avec `minLength: 1` :
 *     appeler sans terme rendrait un 400, et l'écran aurait payé deux
 *     aller-retours pour l'apprendre ;
 *   - la CANONIQUE est appelée, jamais `GET /users/search`, dont le
 *     remplaçant documente qu'elle balayait la collection à chaque frappe ;
 *   - `hasMore` est SERVI et relayé tel quel — il dit « il en reste », jamais
 *     combien, et aucun total n'est fabriqué ;
 *   - une panne PARTIELLE est une panne : servir la moitié qui a répondu ferait
 *     croire à un groupe vide.
 */

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

/** Une ligne de `conversationMinimalSchema`, réduite à ce que la vue lit. */
const filServi = (extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  identifier: 'lagos',
  title: 'Équipe Lagos',
  description: null,
  type: 'group',
  avatar: null,
  isActive: true,
  memberCount: 12,
  lastMessageAt: '2026-09-02T20:00:00.000Z',
  createdAt: '2026-08-01T10:00:00.000Z',
  participants: [],
  ...extra,
});

/** Une ligne de `/directory/people` — `isOnline` y est NULLABLE. */
const personneServie = (extra: Record<string, unknown> = {}) => ({
  id: 'u-sara',
  username: 'sarakim',
  displayName: 'Sara Kim',
  avatar: null,
  isOnline: null,
  lastActiveAt: null,
  ...extra,
});

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

const NOMINALE = (
  fils: readonly unknown[] = [filServi()],
  gens: readonly unknown[] = [personneServie()],
  pagination: unknown = { hasMore: false, nextCursor: null, limit: 20 },
) =>
  passerelle({
    '/conversations/search': () => json({ success: true, data: fils }),
    '/directory/people': () => json({ success: true, data: gens, pagination }),
  });

describe('la recherche', () => {
  it('n’appelle RIEN sur une requête vide', async () => {
    const { recuperer, vus } = NOMINALE();

    const trouvailles = await cherche({ jeton: 'j', requete: '   ', recuperer });

    // `q` est REQUIS avec `minLength: 1` : appeler sans terme rendrait un 400,
    // et l'écran aurait payé deux aller-retours pour l'apprendre.
    expect(vus).toEqual([]);
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);
    expect(trouvailles.conversations).toEqual([]);
    expect(trouvailles.personnes).toEqual([]);
  });

  it('interroge les deux CANONIQUES, jamais /users/search', async () => {
    const { recuperer, vus } = NOMINALE();

    await cherche({ jeton: 'j', requete: 'lagos', base: 'https://gate.test', recuperer });

    expect(vus).toHaveLength(2);
    expect(vus.some((url) => url.includes('/api/v1/conversations/search?q=lagos'))).toBe(true);
    expect(vus.some((url) => url.includes('/api/v1/directory/people?q=lagos'))).toBe(true);
    // L'ancienne balayait la collection entière à chaque frappe : son
    // remplaçant le documente, et un client neuf ne la ressuscite pas.
    expect(vus.some((url) => url.includes('/users/search'))).toBe(false);
  });

  it('encode le terme plutôt que de le coller dans l’URL', async () => {
    const { recuperer, vus } = NOMINALE();

    await cherche({ jeton: 'j', requete: 'côte & mer', base: 'https://gate.test', recuperer });

    expect(vus[0]).toContain('q=c%C3%B4te%20%26%20mer');
    expect(vus[0]).not.toContain('&mer');
  });

  it('projette la conversation par la MÊME lecture que la liste', async () => {
    const { recuperer } = NOMINALE([
      filServi(),
      // Un fil direct sans titre : le nom vient des participants, exactement
      // comme sur `/chats`. C'est ce que la projection partagée garantit.
      filServi({ id: 'c2', title: null, type: 'direct', participants: [{ displayName: 'Marta Ruiz' }] }),
    ]);

    const trouvailles = await cherche({ jeton: 'j', requete: 'a', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.conversations.map((c) => c.titre)).toEqual(['Équipe Lagos', 'Marta Ruiz']);
    expect(trouvailles.conversations[0]?.membres).toBe(12);
  });

  it('relaie `hasMore` sans jamais fabriquer de total', async () => {
    const { recuperer } = NOMINALE([filServi()], [personneServie()], {
      hasMore: true,
      nextCursor: 'u-sara',
      limit: 20,
    });

    const trouvailles = await cherche({ jeton: 'j', requete: 'sara', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    // « Il en reste » — jamais « il y en a N ». Aucune des deux routes ne sert
    // de total, et un total ne se déduit pas d'un curseur.
    expect(trouvailles.encoreDesPersonnes).toBe(true);
    expect(Object.keys(trouvailles)).not.toContain('total');
  });

  it('écarte une personne sans pseudonyme plutôt que d’en inventer un', async () => {
    const { recuperer } = NOMINALE([], [personneServie(), personneServie({ id: 'u-x', username: null })]);

    const trouvailles = await cherche({ jeton: 'j', requete: 'x', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.personnes.map((p) => p.id)).toEqual(['u-sara']);
  });

  it('retombe sur le pseudonyme quand le nom affiché manque', async () => {
    const { recuperer } = NOMINALE([], [personneServie({ displayName: null })]);

    const trouvailles = await cherche({ jeton: 'j', requete: 'x', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.personnes[0]?.nom).toBe('sarakim');
  });

  it('dit « session expirée » quand l’une des deux routes refuse le jeton', async () => {
    const { recuperer } = passerelle({
      '/conversations/search': () => json({ success: true, data: [] }),
      '/directory/people': () => json({ success: false }, 401),
    });

    expect((await cherche({ jeton: 'j', requete: 'a', recuperer })).genre).toBe('session-expiree');
  });

  it('ne sert PAS la moitié qui a répondu quand l’autre tombe', async () => {
    const recuperer = async (url: string): Promise<Response> => {
      if (url.includes('/conversations/search')) return json({ success: true, data: [filServi()] });
      throw new Error('réseau coupé');
    };

    expect((await cherche({ jeton: 'j', requete: 'a', recuperer })).genre).toBe('panne');
  });
});
