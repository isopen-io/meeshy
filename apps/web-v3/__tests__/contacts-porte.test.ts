/**
 * @jest-environment node
 */

import { CARNET, REPONDRE } from '@/app/connecte/contacts-porte';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PORTE, c'est-à-dire les décisions que
 * `/contacts` prend avant de rendre quoi que ce soit, et l'écran qu'elle rend.
 *
 * Quatre d'entre eux gardent des choses qu'aucune lecture du HTML n'attraperait
 * seule :
 *
 *   - la porte NE DEMANDE PAS `/conversations`. Cet écran n'en rend aucune, et
 *     l'appeler serait un aller-retour payé sur une 3G rurale ;
 *   - un POST d'origine ÉTRANGÈRE est refusé AVANT d'atteindre la passerelle :
 *     sinon un autre site ferait accepter une demande d'ami à l'insu du
 *     lecteur, c'est-à-dire lui ferait donner sa présence et son fil à
 *     quelqu'un qu'il n'a pas choisi ;
 *   - un ÉCHEC ne prend pas le témoin du succès ;
 *   - `offline` ne rend AUCUNE pastille — la règle produit l'interdit sur un
 *     avatar, et c'est ce qui rend une présence MASQUÉE indiscernable d'une
 *     absence réelle.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';
const MOI = 'u-moi';

const requete = (
  url: string,
  init: RequestInit & { readonly origine?: string | null } = {},
): Request => {
  const { origine = 'https://meeshy.test', ...reste } = init;
  return new Request(url, {
    ...reste,
    headers: {
      cookie: COOKIE,
      ...(origine === null ? {} : { origin: origine }),
      ...((reste.headers as Record<string, string>) ?? {}),
    },
  });
};

const formulaire = (champs: Readonly<Record<string, string>>): RequestInit => {
  const corps = new URLSearchParams(champs);
  return {
    method: 'POST',
    body: corps.toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  };
};

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

const partie = (id: string, nom: string, presence: Record<string, unknown> = {}) => ({
  id,
  username: nom.toLowerCase().replace(' ', ''),
  displayName: nom,
  avatar: null,
  firstName: null,
  lastName: null,
  isOnline: false,
  lastActiveAt: null,
  ...presence,
});

const DEMANDES = [
  {
    id: 'd-recue',
    senderId: 'u-sara',
    receiverId: MOI,
    message: null,
    status: 'pending',
    respondedAt: null,
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    sender: partie('u-sara', 'Sara Kim'),
    receiver: partie(MOI, 'Moi'),
  },
  {
    id: 'd-envoyee',
    senderId: MOI,
    receiverId: 'u-kofi',
    message: null,
    status: 'pending',
    respondedAt: null,
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    sender: partie(MOI, 'Moi'),
    receiver: partie('u-kofi', 'Kofi Owusu'),
  },
];

const contact = (matchedUser: Record<string, unknown>) => ({
  id: 'c-1',
  contactKey: 'phone:+33600000000',
  displayName: 'Marta Ruiz',
  phoneNumbers: ['+33600000000'],
  emails: [],
  usernames: [],
  isOnMeeshy: true,
  matchedBy: 'phone',
  matchedAt: '2026-08-01T00:00:00.000Z',
  lastSyncedAt: '2026-09-01T00:00:00.000Z',
  matchedUser: {
    id: 'u-marta',
    username: 'marta',
    firstName: null,
    lastName: null,
    displayName: 'Marta Ruiz',
    avatar: null,
    ...matchedUser,
  },
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

const NOMINALE = (matchedUser: Record<string, unknown> = { isOnline: true, lastActiveAt: null }) =>
  passerelle({
    '/auth/me': () => json({ success: true, data: { id: MOI, displayName: 'Moi' } }),
    '/directory/friend-requests': () => json({ success: true, data: DEMANDES }),
    '/directory/contacts': () => json({ success: true, data: [contact(matchedUser)] }),
  });

describe('la porte de /contacts', () => {
  it('renvoie se connecter quand aucun jeton n’est présenté', async () => {
    const reponse = await CARNET(new Request('https://meeshy.test/contacts'));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcontacts');
  });

  it('NE DEMANDE PAS /conversations — cet écran n’en rend aucune', async () => {
    const { recuperer, vus } = NOMINALE();

    await CARNET(requete('https://meeshy.test/contacts'), recuperer);

    expect(vus.some((url) => url.includes('/auth/me'))).toBe(true);
    expect(vus.some((url) => url.includes('/directory/friend-requests'))).toBe(true);
    expect(vus.some((url) => url.includes('/directory/contacts'))).toBe(true);
    expect(vus.filter((url) => url.includes('/api/v1/conversations'))).toEqual([]);
  });

  it('rend les trois sortes de lignes, dans l’ordre de la cible', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await CARNET(requete('https://meeshy.test/contacts'), recuperer)).text();

    expect(html).toContain('Sara Kim');
    expect(html).toContain('Demande reçue');
    expect(html).toContain('Kofi Owusu');
    expect(html).toContain('Demande envoyée');
    expect(html).toContain('Marta Ruiz');
    expect(html).toContain('@marta');

    // Ce qui ATTEND le lecteur est en haut : la demande reçue précède
    // l'envoyée, qui précède le carnet.
    expect(html.indexOf('Sara Kim')).toBeLessThan(html.indexOf('Kofi Owusu'));
    expect(html.indexOf('Kofi Owusu')).toBeLessThan(html.indexOf('Marta Ruiz'));

    // Le sous-titre ne compte QUE ce sur quoi on peut agir.
    expect(html).toContain('1 demande en attente');
  });

  it('n’offre « Accepter » que sur une demande REÇUE', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await CARNET(requete('https://meeshy.test/contacts'), recuperer)).text();

    expect(html.match(/value="accepter"/g)).toHaveLength(1);
    // Une demande envoyée est un CONSTAT, pas un bouton.
    expect(html).toContain('En attente');
  });

  it('ne dessine AUCUNE pastille pour une présence absente ou masquée', async () => {
    // Une demande en attente : la loi de présence a masqué les deux parties.
    // Un contact hors ligne depuis longtemps : `offline` pour la même raison
    // qu'une absence — et la règle produit interdit le point gris sur un
    // avatar.
    const { recuperer } = NOMINALE({
      isOnline: false,
      lastActiveAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    });

    const html = await (await CARNET(requete('https://meeshy.test/contacts'), recuperer)).text();

    expect(html).not.toContain('class="pastille');
  });

  it('dessine la pastille quand la passerelle SERT la présence', async () => {
    const { recuperer } = NOMINALE({ isOnline: true, lastActiveAt: null });

    const html = await (await CARNET(requete('https://meeshy.test/contacts'), recuperer)).text();

    expect(html).toContain('class="pastille en-ligne"');
    // Une seule : les deux parties des demandes restent masquées.
    expect(html.match(/class="pastille/g)).toHaveLength(1);
  });

  it('renvoie se connecter quand la passerelle refuse le jeton (401)', async () => {
    const { recuperer } = passerelle({
      '/auth/me': () => json({ success: true, data: { id: MOI } }),
      '/directory/friend-requests': () => json({ success: false }, 401),
      '/directory/contacts': () => json({ success: true, data: [] }),
    });

    const reponse = await CARNET(requete('https://meeshy.test/contacts'), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcontacts');
  });

  it('dessine la panne plutôt qu’une page blanche quand la passerelle se tait', async () => {
    const recuperer = async (url: string): Promise<Response> => {
      if (url.includes('/auth/me')) return json({ success: true, data: { id: MOI } });
      throw new Error('réseau coupé');
    };

    const reponse = await CARNET(requete('https://meeshy.test/contacts'), recuperer);

    expect(reponse.status).toBe(503);
    expect(await reponse.text()).not.toBe('');
  });

  it('refuse de CLASSER quand l’identité arrive sans identifiant', async () => {
    // Sans `id`, aucune demande ne peut être rangée du bon côté, et un
    // « Accepter » posé sur sa propre demande serait un contrôle qui ment.
    const { recuperer, vus } = passerelle({
      '/auth/me': () => json({ success: true, data: { displayName: 'Moi' } }),
    });

    expect((await CARNET(requete('https://meeshy.test/contacts'), recuperer)).status).toBe(503);
    expect(vus.filter((url) => url.includes('/directory/'))).toEqual([]);
  });
});

describe('répondre à une demande', () => {
  it('redirige APRÈS avoir posté, en disant ce qu’il a fait', async () => {
    const { recuperer, vus } = passerelle({
      '/directory/friend-requests/d-recue': () => json({ success: true, data: {} }),
    });

    const reponse = await REPONDRE(
      requete('https://meeshy.test/contacts', formulaire({ demande: 'd-recue', geste: 'accepter' })),
      recuperer,
    );

    expect(vus).toHaveLength(1);
    expect(vus[0]).toContain('/api/v1/directory/friend-requests/d-recue');
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/contacts?acceptee');
  });

  it('refuse un POST d’origine ÉTRANGÈRE sans jamais toucher la passerelle', async () => {
    const { recuperer, vus } = passerelle({
      '/directory/friend-requests': () => json({ success: true, data: {} }),
    });

    const reponse = await REPONDRE(
      requete('https://meeshy.test/contacts', {
        ...formulaire({ demande: 'd-recue', geste: 'accepter' }),
        origine: 'https://ailleurs.test',
      }),
      recuperer,
    );

    expect(vus).toEqual([]);
    expect(reponse.status).not.toBe(303);
  });

  it('ne prend PAS le témoin du succès quand la passerelle refuse', async () => {
    const { recuperer } = passerelle({
      '/directory/friend-requests/d-recue': () => json({ success: false }, 404),
    });

    const reponse = await REPONDRE(
      requete('https://meeshy.test/contacts', formulaire({ demande: 'd-recue', geste: 'accepter' })),
      recuperer,
    );

    expect(reponse.headers.get('location')).toBe('/contacts?echouee');
  });

  it('re-sert la liste, sans rien raconter, quand le POST ne demande rien', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await REPONDRE(
      requete('https://meeshy.test/contacts', formulaire({ geste: 'accepter' })),
      recuperer,
    );

    expect(reponse.status).toBe(200);
    expect(vus.some((url) => url.includes('/directory/friend-requests/'))).toBe(false);
    const html = await reponse.text();
    expect(html).not.toContain('Demande acceptée');
    expect(html).not.toContain('n’a pas pu être traitée');
  });

  it('dit au retour de la redirection ce que le geste a fait', async () => {
    const { recuperer } = NOMINALE();

    const acceptee = await (
      await CARNET(requete('https://meeshy.test/contacts?acceptee'), recuperer)
    ).text();
    expect(acceptee).toContain('Demande acceptée');

    const echouee = await (
      await CARNET(requete('https://meeshy.test/contacts?echouee'), NOMINALE().recuperer)
    ).text();
    expect(echouee).toContain('n’a pas pu être traitée');
  });
});
