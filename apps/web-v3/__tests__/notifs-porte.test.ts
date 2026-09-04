/**
 * @jest-environment node
 */

import { BOITE, TOUT_LIRE } from '@/app/connecte/notifs-porte';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PORTE, c'est-à-dire les décisions que
 * prend `/notifications` avant de rendre quoi que ce soit.
 *
 * Trois d'entre eux gardent des choses qu'aucune assertion de rendu
 * n'attraperait :
 *
 *   - la porte NE DEMANDE PAS `/conversations`. Cet écran n'en rend aucune, et
 *     l'appeler serait un troisième aller-retour payé sur une 3G rurale — une
 *     lenteur, donc un bug. Un témoin sur le HTML serait vert avec l'appel en
 *     place ; celui-ci compte les URL demandées ;
 *   - le POST est un Post/Redirect/Get. Sans redirection, un rechargement
 *     REJOUERAIT « tout lire » ;
 *   - un POST d'origine ÉTRANGÈRE est refusé AVANT d'atteindre la passerelle :
 *     sinon un autre site marquerait la boîte du lecteur comme lue à son insu.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';

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

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

const BOITE_SERVIE = {
  success: true,
  data: [
    {
      id: 'n1',
      type: 'message',
      title: 'Alice vous a répondu',
      content: 'On se voit demain ?',
      state: { isRead: false, createdAt: '2026-09-02T20:00:00.000Z' },
    },
  ],
  pagination: { total: 1 },
  unreadCount: 1,
};

/** Une passerelle de bouchon qui ENREGISTRE ce qu'on lui demande. */
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

const NOMINALE = () =>
  passerelle({
    '/auth/me': () => json({ success: true, data: { id: 'u1', displayName: 'Moi' } }),
    '/notifications': () => json(BOITE_SERVIE),
  });

describe('la porte de /notifications', () => {
  it('renvoie se connecter quand aucun jeton n’est présenté', async () => {
    const reponse = await BOITE(new Request('https://meeshy.test/notifications'));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fnotifications');
  });

  it('NE DEMANDE PAS /conversations — cet écran n’en rend aucune', async () => {
    const { recuperer, vus } = NOMINALE();

    await BOITE(requete('https://meeshy.test/notifications'), recuperer);

    expect(vus.some((url) => url.includes('/notifications'))).toBe(true);
    expect(vus.some((url) => url.includes('/auth/me'))).toBe(true);
    expect(vus.filter((url) => url.includes('/conversations'))).toEqual([]);
  });

  it('sert la boîte et y écrit ce que la passerelle a servi', async () => {
    const { recuperer } = NOMINALE();

    const reponse = await BOITE(requete('https://meeshy.test/notifications'), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    expect(html).toContain('Alice vous a répondu');
    expect(html).toContain('On se voit demain ?');
    // Une non-lue se DIT, elle ne se colore pas seulement.
    expect(html).toContain('Non lue');
    // L'action existe puisqu'elle ferait quelque chose.
    expect(html).toContain('Tout marquer comme lu');
  });

  it('sert « Tout lire » CACHÉ quand il n’y a rien à lire — la fente existe, le contrôle n’est pas rendu', async () => {
    const { recuperer } = passerelle({
      '/auth/me': () => json({ success: true, data: { id: 'u1', displayName: 'Moi' } }),
      '/notifications': () => json({ success: true, data: [], pagination: { total: 0 }, unreadCount: 0 }),
    });

    const html = await (await BOITE(requete('https://meeshy.test/notifications'), recuperer)).text();

    // Le module de participation révèle la fente quand une non-lue ARRIVE ;
    // une fente absente serait un nœud à FABRIQUER. Cachée, elle n'est pas
    // rendue — la loi 4 (« un contrôle existe s'il a un effet ») reste tenue.
    expect(html).toMatch(/<form class="tout-lire" method="post" hidden>/);
    expect(html).toContain('Aucune notification');
  });

  it('renvoie se connecter quand la passerelle refuse le jeton (401)', async () => {
    const { recuperer } = passerelle({
      '/auth/me': () => json({ success: true, data: { id: 'u1' } }),
      '/notifications': () => json({ success: false }, 401),
    });

    const reponse = await BOITE(requete('https://meeshy.test/notifications'), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fnotifications');
  });

  it('dessine la panne plutôt qu’une page blanche quand la passerelle se tait', async () => {
    const recuperer = async (url: string): Promise<Response> => {
      if (url.includes('/auth/me')) return json({ success: true, data: { id: 'u1' } });
      throw new Error('réseau coupé');
    };

    const reponse = await BOITE(requete('https://meeshy.test/notifications'), recuperer);

    expect(reponse.status).toBe(503);
    expect(await reponse.text()).not.toBe('');
  });
});

describe('« Tout lire »', () => {
  it('redirige APRÈS avoir posté — sans quoi un rechargement rejouerait l’action', async () => {
    const { recuperer, vus } = passerelle({
      '/notifications/read-all': () => json({ success: true, count: 3 }),
    });

    const reponse = await TOUT_LIRE(
      requete('https://meeshy.test/notifications', { method: 'POST' }),
      recuperer,
    );

    // Le CHEMIN, pas l'hôte : la base vient de l'environnement, et l'y figer
    // ferait rougir ce témoin le jour où le déploiement change de domaine —
    // sans qu'aucun comportement n'ait bougé.
    expect(vus).toHaveLength(1);
    expect(vus[0]).toContain('/api/v1/notifications/read-all');
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/notifications?tout-lu');
  });

  it('refuse un POST d’origine ÉTRANGÈRE sans jamais toucher la passerelle', async () => {
    const { recuperer, vus } = passerelle({
      '/notifications/read-all': () => json({ success: true }),
    });

    const reponse = await TOUT_LIRE(
      requete('https://meeshy.test/notifications', { method: 'POST', origine: 'https://ailleurs.test' }),
      recuperer,
    );

    expect(vus).toEqual([]);
    expect(reponse.status).not.toBe(303);
  });

  it('re-sert la boîte SANS mentir quand la passerelle refuse l’action', async () => {
    const { recuperer } = passerelle({
      '/notifications/read-all': () => json({ success: false }, 500),
      '/auth/me': () => json({ success: true, data: { id: 'u1' } }),
      '/notifications': () => json(BOITE_SERVIE),
    });

    const reponse = await TOUT_LIRE(
      requete('https://meeshy.test/notifications', { method: 'POST' }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    // Les non-lues sont INTACTES, et rien ne prétend le contraire.
    expect(html).toContain('Non lue');
    expect(html).not.toContain('Tout est marqué comme lu');
  });

  it('dit ce qu’il a fait au retour de la redirection', async () => {
    const { recuperer } = NOMINALE();

    const html = await (
      await BOITE(requete('https://meeshy.test/notifications?tout-lu'), recuperer)
    ).text();

    expect(html).toContain('Tout est marqué comme lu');
  });
});
