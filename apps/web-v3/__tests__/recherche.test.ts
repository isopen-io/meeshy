/**
 * @jest-environment node
 */

import { cherche } from '@/lib/api/recherche';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la lecture des QUATRE routes de recherche,
 * contre la forme qu'elles servent réellement (#5174, #5171).
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
 *     CURSEUR ;
 *   - `crossConversationAttachmentItemSchema`, servi par
 *     `GET /attachments/search` (`routes/attachments/search.ts:187-224`) —
 *     `data.attachments`, PAS un tableau nu, pagination par CURSEUR ;
 *   - `LinkItem`, servi par `GET /links?q=` (`routes/links/user.ts:315`) —
 *     tableau nu, pagination OFFSET (`{ total, offset, limit, hasMore }`).
 *
 * Points gardés que rien d'autre n'attraperait :
 *
 *   - une requête VIDE n'appelle RIEN. `q` est requis avec `minLength: 1` sur
 *     conversations/attachments : appeler sans terme rendrait un 400 ;
 *   - la CANONIQUE des personnes est appelée, jamais `GET /users/search` ;
 *   - `hasMore` est SERVI et relayé tel quel — il dit « il en reste », jamais
 *     combien, et aucun total n'est fabriqué ;
 *   - une panne sur MOINS de quatre routes DÉGRADE PAR GROUPE (correctif
 *     2026-09-05) : la route en échec sert un groupe `indisponible`, les
 *     autres continuent de répondre — seule une panne sur les QUATRE À LA
 *     FOIS, ou un 401 sur N'IMPORTE LAQUELLE, reste un événement global ;
 *   - les quatre appels partent en PARALLÈLE (`Promise.all`) : le coût est
 *     celui du plus lent, jamais leur somme.
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

/** Une ligne de `crossConversationAttachmentItemSchema` (`attachments/search.ts:57-73`). */
const mediaServi = (extra: Record<string, unknown> = {}) => ({
  id: 'am1',
  fileName: 'tableau.jpg',
  mimeType: 'image/jpeg',
  fileSize: 430_080,
  fileUrl: '/api/v1/attachments/file/2026/tableau.jpg',
  thumbnailUrl: null,
  duration: null,
  messageId: 'r1',
  originalName: 'tableau.jpg',
  uploadedBy: 'p-ibrahim',
  createdAt: '2026-09-01T10:00:00.000Z',
  width: 1200,
  height: 900,
  conversationId: 'fil-riche',
  ...extra,
});

/** Une ligne de `GET /links?expand=conversation` (`links/user.ts` — forme de `LinkItem`). */
const lienServi = (extra: Record<string, unknown> = {}) => ({
  id: 'l1',
  linkId: 'mshy_lagos',
  identifier: 'lagos',
  name: 'Ops Lagos',
  isActive: true,
  currentUses: 12,
  maxUses: null,
  expiresAt: null,
  conversation: { id: 'c1', title: 'Équipe Lagos', type: 'group' },
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

const NOMINALE = ({
  fils = [filServi()],
  gens = [personneServie()],
  paginationGens = { hasMore: false, nextCursor: null, limit: 20 },
  medias = [mediaServi()],
  paginationMedias = { limit: 50, hasMore: false, nextCursor: null },
  liens = [lienServi()],
  paginationLiens = { total: liens.length, offset: 0, limit: 20, hasMore: false },
}: {
  readonly fils?: readonly unknown[];
  readonly gens?: readonly unknown[];
  readonly paginationGens?: unknown;
  readonly medias?: readonly unknown[];
  readonly paginationMedias?: unknown;
  readonly liens?: readonly unknown[];
  readonly paginationLiens?: unknown;
} = {}) =>
  passerelle({
    '/conversations/search': () => json({ success: true, data: fils }),
    '/directory/people': () => json({ success: true, data: gens, pagination: paginationGens }),
    '/attachments/search': () => json({ success: true, data: { attachments: medias }, pagination: paginationMedias }),
    '/links': () => json({ success: true, data: liens, pagination: paginationLiens }),
  });

describe('la recherche', () => {
  it('n’appelle RIEN sur une requête vide', async () => {
    const { recuperer, vus } = NOMINALE();

    const trouvailles = await cherche({ jeton: 'j', requete: '   ', recuperer });

    // `q` est REQUIS avec `minLength: 1` : appeler sans terme rendrait un 400,
    // et l'écran aurait payé des aller-retours pour l'apprendre.
    expect(vus).toEqual([]);
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);
    expect(trouvailles.conversations).toEqual([]);
    expect(trouvailles.personnes).toEqual([]);
    expect(trouvailles.medias).toEqual([]);
    expect(trouvailles.liens).toEqual([]);
  });

  it('interroge les QUATRE routes — médias et liens compris — jamais /users/search', async () => {
    const { recuperer, vus } = NOMINALE();

    await cherche({ jeton: 'j', requete: 'lagos', base: 'https://gate.test', recuperer });

    expect(vus).toHaveLength(4);
    expect(vus.some((url) => url.includes('/api/v1/conversations/search?q=lagos'))).toBe(true);
    expect(vus.some((url) => url.includes('/api/v1/directory/people?q=lagos'))).toBe(true);
    expect(vus.some((url) => url.includes('/api/v1/attachments/search?q=lagos'))).toBe(true);
    expect(vus.some((url) => url.includes('/api/v1/links?q=lagos') && url.includes('expand=conversation'))).toBe(true);
    // L'ancienne balayait la collection entière à chaque frappe : son
    // remplaçant le documente, et un client neuf ne la ressuscite pas.
    expect(vus.some((url) => url.includes('/users/search'))).toBe(false);
  });

  it('encode le terme plutôt que de le coller dans l’URL', async () => {
    const { recuperer, vus } = NOMINALE();

    await cherche({ jeton: 'j', requete: 'côte & mer', base: 'https://gate.test', recuperer });

    expect(vus.every((url) => url.includes('q=c%C3%B4te%20%26%20mer'))).toBe(true);
    expect(vus.every((url) => !url.includes('&mer'))).toBe(true);
  });

  it('projette la conversation par la MÊME lecture que la liste', async () => {
    const { recuperer } = NOMINALE({
      fils: [
        filServi(),
        // Un fil direct sans titre : le nom vient des participants, exactement
        // comme sur `/chats`. C'est ce que la projection partagée garantit.
        filServi({ id: 'c2', title: null, type: 'direct', participants: [{ displayName: 'Marta Ruiz' }] }),
      ],
    });

    const trouvailles = await cherche({ jeton: 'j', requete: 'a', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.conversations.map((c) => c.titre)).toEqual(['Équipe Lagos', 'Marta Ruiz']);
    expect(trouvailles.conversations[0]?.membres).toBe(12);
  });

  it('relaie `hasMore` des personnes sans jamais fabriquer de total', async () => {
    const { recuperer } = NOMINALE({
      gens: [personneServie()],
      paginationGens: { hasMore: true, nextCursor: 'u-sara', limit: 20 },
    });

    const trouvailles = await cherche({ jeton: 'j', requete: 'sara', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    // « Il en reste » — jamais « il y en a N ». Aucune des deux routes ne sert
    // de total, et un total ne se déduit pas d'un curseur.
    expect(trouvailles.encoreDesPersonnes).toBe(true);
    expect(Object.keys(trouvailles)).not.toContain('total');
  });

  it('écarte une personne sans pseudonyme plutôt que d’en inventer un', async () => {
    const { recuperer } = NOMINALE({ fils: [], gens: [personneServie(), personneServie({ id: 'u-x', username: null })] });

    const trouvailles = await cherche({ jeton: 'j', requete: 'x', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.personnes.map((p) => p.id)).toEqual(['u-sara']);
  });

  it('retombe sur le pseudonyme quand le nom affiché manque', async () => {
    const { recuperer } = NOMINALE({ fils: [], gens: [personneServie({ displayName: null })] });

    const trouvailles = await cherche({ jeton: 'j', requete: 'x', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.personnes[0]?.nom).toBe('sarakim');
  });

  it('lit les médias SOUS data.attachments — jamais un tableau nu', async () => {
    // `/attachments/search` sert `{ data: { attachments } }` — un `data`
    // tableau (la forme de `/conversations/search`) doit rendre zéro média,
    // jamais jeter.
    const { recuperer } = passerelle({
      '/conversations/search': () => json({ success: true, data: [] }),
      '/directory/people': () => json({ success: true, data: [], pagination: { hasMore: false, nextCursor: null, limit: 20 } }),
      '/attachments/search': () => json({ success: true, data: [mediaServi()] }),
      '/links': () => json({ success: true, data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }),
    });

    const trouvailles = await cherche({ jeton: 'j', requete: 'a', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.medias).toEqual([]);
  });

  it('écarte un média sans messageId plutôt que de composer une adresse morte', async () => {
    const { recuperer } = NOMINALE({ medias: [mediaServi(), mediaServi({ id: 'am2', messageId: null })] });

    const trouvailles = await cherche({ jeton: 'j', requete: 'a', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.medias.map((m) => m.id)).toEqual(['am1']);
  });

  it('donne à chaque média son genre par genreDeMime — jamais une seconde table', async () => {
    const { recuperer } = NOMINALE({ medias: [mediaServi({ id: 'av1', mimeType: 'video/mp4' })] });

    const trouvailles = await cherche({ jeton: 'j', requete: 'a', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.medias[0]?.genre).toBe('video');
  });

  it('relaie hasMore des médias et des liens sans fabriquer de total', async () => {
    const { recuperer } = NOMINALE({
      paginationMedias: { limit: 50, hasMore: true, nextCursor: 'am1' },
      paginationLiens: { total: 5, offset: 0, limit: 20, hasMore: true },
    });

    const trouvailles = await cherche({ jeton: 'j', requete: 'a', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.encoreDesMedias).toBe(true);
    expect(trouvailles.encoreDesLiens).toBe(true);
    expect(Object.keys(trouvailles)).not.toContain('total');
  });

  it('projette un lien par lienDePartage — conversation depuis l’expansion', async () => {
    const { recuperer } = NOMINALE({
      liens: [lienServi(), lienServi({ id: 'l2', linkId: 'mshy_sans', identifier: 'sans-fil', conversation: undefined })],
    });

    const trouvailles = await cherche({ jeton: 'j', requete: 'a', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.liens.map((l) => l.conversation)).toEqual(['c1', null]);
  });

  it('dit « session expirée » quand l’une des quatre routes refuse le jeton', async () => {
    const { recuperer } = passerelle({
      '/conversations/search': () => json({ success: true, data: [] }),
      '/directory/people': () => json({ success: false }, 401),
      '/attachments/search': () => json({ success: true, data: { attachments: [] } }),
      '/links': () => json({ success: true, data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }),
    });

    expect((await cherche({ jeton: 'j', requete: 'a', recuperer })).genre).toBe('session-expiree');
  });

  it('un 401 sur une des routes NEUVES renvoie se connecter', async () => {
    const { recuperer } = passerelle({
      '/conversations/search': () => json({ success: true, data: [] }),
      '/directory/people': () => json({ success: true, data: [], pagination: { hasMore: false, nextCursor: null, limit: 20 } }),
      '/attachments/search': () => json({ success: false }, 401),
      '/links': () => json({ success: true, data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }),
    });

    expect((await cherche({ jeton: 'j', requete: 'a', recuperer })).genre).toBe('session-expiree');
  });

  it('sert la part qui a répondu quand une SEULE autre route tombe (correctif 2026-09-05)', async () => {
    const recuperer = async (url: string): Promise<Response> => {
      if (url.includes('/conversations/search')) return json({ success: true, data: [filServi()] });
      if (url.includes('/directory/people')) return json({ success: true, data: [], pagination: { hasMore: false, nextCursor: null, limit: 20 } });
      if (url.includes('/attachments/search')) return json({ success: true, data: { attachments: [] } });
      throw new Error('réseau coupé'); // /links seule tombe
    };

    const trouvailles = await cherche({ jeton: 'j', requete: 'a', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.conversations.map((c) => c.id)).toEqual(['c1']);
    expect(trouvailles.conversationsIndisponibles).toBe(false);
    expect(trouvailles.liens).toEqual([]);
    expect(trouvailles.liensIndisponibles).toBe(true);
    expect(trouvailles.personnesIndisponibles).toBe(false);
    expect(trouvailles.mediasIndisponibles).toBe(false);
  });

  it('une panne sur MÉDIAS SEULS marque MÉDIAS indisponible, sert les trois autres', async () => {
    const recuperer = async (url: string): Promise<Response> => {
      if (url.includes('/attachments/search')) throw new Error('réseau coupé');
      if (url.includes('/conversations/search')) return json({ success: true, data: [] });
      if (url.includes('/directory/people')) return json({ success: true, data: [], pagination: { hasMore: false, nextCursor: null, limit: 20 } });
      return json({ success: true, data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } });
    };

    const trouvailles = await cherche({ jeton: 'j', requete: 'a', recuperer });
    if (trouvailles.genre !== 'resultats') throw new Error(trouvailles.genre);

    expect(trouvailles.mediasIndisponibles).toBe(true);
    expect(trouvailles.medias).toEqual([]);
    expect(trouvailles.conversationsIndisponibles).toBe(false);
    expect(trouvailles.personnesIndisponibles).toBe(false);
    expect(trouvailles.liensIndisponibles).toBe(false);
  });

  it('une panne sur les QUATRE À LA FOIS reste une panne entière', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    expect((await cherche({ jeton: 'j', requete: 'a', recuperer })).genre).toBe('panne');
  });

  it('un 401 sur une route reste GLOBAL même quand une autre est en panne', async () => {
    const recuperer = async (url: string): Promise<Response> => {
      if (url.includes('/directory/people')) return json({ success: false }, 401);
      if (url.includes('/attachments/search')) throw new Error('réseau coupé');
      if (url.includes('/conversations/search')) return json({ success: true, data: [] });
      return json({ success: true, data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } });
    };

    expect((await cherche({ jeton: 'j', requete: 'a', recuperer })).genre).toBe('session-expiree');
  });

  it('les quatre routes partent en PARALLÈLE — aucune n’attend la précédente', async () => {
    // AUCUN TIMER RÉEL : sous jest en pleine suite, plusieurs workers se
    // disputent le CPU et un `setTimeout` mesuré en millisecondes devient un
    // faux négatif (constaté : 308 ms mesurés pour un plafond de 90). La
    // preuve tient sans horloge — l'ORDRE des microtâches suffit : si les
    // quatre appels étaient en CASCADE (l'un après l'autre, comme une panne
    // partielle en série le ferait), un seul `recuperer` aurait démarré avant
    // qu'aucun ne réponde ; `Promise.all` les démarre TOUS avant que le
    // premier ne se résolve.
    const commences: string[] = [];
    const debloque: Record<string, () => void> = {};
    const clientDe = (url: string): string =>
      url.includes('/links')
        ? 'liens'
        : url.includes('/attachments/search')
          ? 'medias'
          : url.includes('/directory/people')
            ? 'personnes'
            : 'conversations';

    const recuperer = async (url: string): Promise<Response> => {
      const cle = clientDe(url);
      commences.push(cle);
      await new Promise<void>((resolue) => {
        debloque[cle] = resolue;
      });
      if (cle === 'liens') return json({ success: true, data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } });
      if (cle === 'medias') return json({ success: true, data: { attachments: [] } });
      if (cle === 'personnes') return json({ success: true, data: [], pagination: { hasMore: false, nextCursor: null, limit: 20 } });
      return json({ success: true, data: [] });
    };

    const promesse = cherche({ jeton: 'j', requete: 'a', recuperer });

    // Laisse le microtask queue s'écouler SANS débloquer aucun appel : en
    // cascade, `commences` n'aurait qu'UNE entrée à ce stade.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(commences.slice().sort()).toEqual(['conversations', 'liens', 'medias', 'personnes']);

    Object.values(debloque).forEach((resolue) => resolue());
    const trouvailles = await promesse;
    expect(trouvailles.genre).toBe('resultats');
  });
});
