/**
 * @jest-environment node
 */

import { GESTE_SUR_UNE_LIGNE, LISTE_DES_CHATS } from '@/app/connecte/liste-porte';
import { CHAMPS_DE_LA_NOUVELLE_CONV } from '@/app/connecte/liste-vue';
import { NOUVELLE_CONVERSATION } from '@/lib/contenu/liste';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — `sheet:conv` (#5072), et les trois décisions
 * qu'aucune capture ne montrerait :
 *
 *   • le carnet de contacts n'est demandé QUE dans l'état `?nouvelle` — sur
 *     l'écran le plus visité de la zone, un appel de plus par lecture serait
 *     une lenteur, donc un bug ;
 *   • le POST est reconnu par un MARQUEUR, pas par les champs qu'il porte :
 *     `/chats` reçoit trois familles de formulaires, et deviner ferait voler
 *     l'une par l'autre ;
 *   • le succès mène AU FIL CRÉÉ, pas à la liste — c'est ce que « deux gestes »
 *     veut dire.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';

const requete = (url: string, init: RequestInit & { readonly origine?: string | null } = {}): Request => {
  const { origine = 'https://meeshy.test', ...reste } = init;
  return new Request(url, {
    ...reste,
    headers: { cookie: COOKIE, ...(origine === null ? {} : { origin: origine }), ...((reste.headers as Record<string, string>) ?? {}) },
  });
};

const creation = (champs: Readonly<Record<string, string | readonly string[]>>, origine?: string | null): Request => {
  const corps = new FormData();
  corps.append(CHAMPS_DE_LA_NOUVELLE_CONV.quoi, CHAMPS_DE_LA_NOUVELLE_CONV.marque);
  Object.entries(champs).forEach(([nom, valeur]) =>
    (Array.isArray(valeur) ? valeur : [valeur as string]).forEach((une) => corps.append(nom, une)),
  );
  return requete('https://meeshy.test/chats', { method: 'POST', body: corps, ...(origine === undefined ? {} : { origine }) });
};

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const MOI = { success: true, data: { id: 'u1', displayName: 'Moi', systemLanguage: 'fr' } };
const CONVERSATIONS = { success: true, data: [], pagination: { total: 0 } };
/**
 * LA FORME EST CELLE QUE `versContact` LIT — `matchedUser`, pas `user` : le
 * carnet sert la LIGNE, et la personne qu'elle désigne y vit sous ce nom-là.
 * Une fixture qui inventerait la clé rendrait un carnet vide sans un mot.
 */
const CARNET = {
  success: true,
  data: [{ id: 'k1', displayName: 'Awa', matchedUser: { id: 'u2', username: 'awa', displayName: 'Awa' } }],
};
const DEMANDES = { success: true, data: [] };

const passerelle = (parChemin: Readonly<Record<string, (init: RequestInit) => Response>>) => {
  const vus: { url: string; methode: string; corps: string | null }[] = [];
  const recuperer = async (url: string, init: RequestInit): Promise<Response> => {
    vus.push({ url, methode: String(init.method ?? 'GET'), corps: typeof init.body === 'string' ? init.body : null });
    const trouve = Object.entries(parChemin)
      .sort(([a], [b]) => b.length - a.length)
      .find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1](init);
  };
  return { recuperer, vus };
};

const NOMINALE = () =>
  passerelle({
    '/auth/me': () => json(MOI),
    '/directory/contacts': () => json(CARNET),
    '/directory/friend-requests': () => json(DEMANDES),
    '/conversations': (init) =>
      String(init.method ?? 'GET') === 'POST'
        ? json({ success: true, data: { id: 'conv-neuve' } }, 200)
        : json(CONVERSATIONS),
  });

describe('l’état ?nouvelle de /chats', () => {
  /**
   * `/chats` EST L'ÉCRAN LE PLUS VISITÉ DE LA ZONE. Lui faire payer le carnet
   * de contacts à chaque ouverture, pour une feuille que la plupart des
   * lectures n'ouvrent jamais, serait une lenteur — c'est-à-dire un bug.
   */
  it('ne demande le carnet de contacts QUE dans l’état ?nouvelle', async () => {
    const ordinaire = NOMINALE();
    await LISTE_DES_CHATS(requete('https://meeshy.test/chats'), ordinaire.recuperer);
    expect(ordinaire.vus.some(({ url }) => url.includes('/directory/contacts'))).toBe(false);

    const ouverte = NOMINALE();
    await LISTE_DES_CHATS(requete('https://meeshy.test/chats?nouvelle'), ouverte.recuperer);
    expect(ouverte.vus.some(({ url }) => url.includes('/directory/contacts'))).toBe(true);
  });

  it('sert la feuille ouverte, et rien sans l’état', async () => {
    const ouverte = await (await LISTE_DES_CHATS(requete('https://meeshy.test/chats?nouvelle'), NOMINALE().recuperer)).text();
    expect(ouverte).toContain('<dialog class="nouvelle-conv" open');

    const nue = await (await LISTE_DES_CHATS(requete('https://meeshy.test/chats'), NOMINALE().recuperer)).text();
    expect(nue).not.toContain('nouvelle-conv');
  });
});

describe('la création d’une conversation', () => {
  it('refuse un POST d’origine étrangère AVANT d’atteindre la passerelle', async () => {
    const reponse = await GESTE_SUR_UNE_LIGNE(creation({ nom: 'Pirates' }, 'https://ailleurs.test'));

    expect(reponse.status).toBe(403);
  });

  it('mène AU FIL CRÉÉ, pas à la liste — c’est ce que « deux gestes » veut dire', async () => {
    const { recuperer } = NOMINALE();

    const reponse = await GESTE_SUR_UNE_LIGNE(creation({ nom: 'Le potager' }), recuperer);

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/chats/conv-neuve');
  });

  it('envoie le type « group » et les invités cochés, jamais le lecteur', async () => {
    const { recuperer, vus } = NOMINALE();

    await GESTE_SUR_UNE_LIGNE(creation({ nom: 'Le potager', description: 'Entre voisins', invite: ['u2', 'u3'] }), recuperer);

    const envoi = vus.find(({ methode }) => methode === 'POST');
    expect(JSON.parse(envoi?.corps ?? '{}')).toEqual({
      type: 'group',
      title: 'Le potager',
      description: 'Entre voisins',
      participantIds: ['u2', 'u3'],
    });
  });

  it('n’envoie ni description vide ni liste d’invités vide', async () => {
    const { recuperer, vus } = NOMINALE();

    await GESTE_SUR_UNE_LIGNE(creation({ nom: 'Le potager' }), recuperer);

    const corps = JSON.parse(vus.find(({ methode }) => methode === 'POST')?.corps ?? '{}') as Record<string, unknown>;
    expect(corps.description).toBeUndefined();
    expect(corps.participantIds).toBeUndefined();
  });

  it('ne demande RIEN à la passerelle quand la conversation n’est pas nommée', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await GESTE_SUR_UNE_LIGNE(creation({ nom: '  ' }), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(vus.every(({ methode }) => methode === 'GET')).toBe(true);
    expect(html).toContain(NOUVELLE_CONVERSATION.sansNom);
  });

  it('re-sert la feuille avec la saisie, les invités cochés et le motif', async () => {
    const { recuperer } = passerelle({
      '/auth/me': () => json(MOI),
      '/directory/contacts': () => json(CARNET),
      '/directory/friend-requests': () => json(DEMANDES),
      '/conversations': (init) =>
        String(init.method ?? 'GET') === 'POST'
          ? json({ success: false, error: { message: 'Community not found' } }, 404)
          : json(CONVERSATIONS),
    });

    const reponse = await GESTE_SUR_UNE_LIGNE(creation({ nom: 'Le potager', invite: 'u2' }), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(html).toContain('Community not found');
    expect(html).toContain('value="Le potager"');
    expect(html).toMatch(/value="u2"[^>]*checked/);
  });

  /**
   * LE MARQUEUR, ET NON LES CHAMPS. `/chats` reçoit trois familles de POST ;
   * une création reconnue « parce qu'elle a un champ `nom` » se ferait voler
   * par la première autre famille qui en gagnerait un.
   */
  it('ignore un POST qui porte les champs mais pas le marqueur', async () => {
    const { recuperer, vus } = NOMINALE();
    const corps = new FormData();
    corps.append('nom', 'Le potager');

    const reponse = await GESTE_SUR_UNE_LIGNE(
      requete('https://meeshy.test/chats', { method: 'POST', body: corps }),
      recuperer,
    );

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/chats');
    expect(vus.some(({ methode }) => methode === 'POST')).toBe(false);
  });
});
