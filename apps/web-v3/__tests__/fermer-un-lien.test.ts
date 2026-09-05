/**
 * @jest-environment node
 */

import { POST_SUR_LES_LIENS } from '@/app/connecte/liens-porte';
import { FERMETURE } from '@/lib/contenu/liens';

/**
 * `/links` — FERMER UN LIEN (#4933), le second verbe d'écriture de l'écran.
 *
 * CE QUE CES TÉMOINS ÉPROUVENT, ligne à ligne avec le critère de fin :
 *
 *   • le corps REÇU par la passerelle est le contrat STRICT de `PATCH
 *     /links/:linkId` (`{ isActive: false }`, rien d'autre) — assertion sur ce
 *     qui PART, jamais sur ce que le module CROIT envoyer ;
 *   • le succès est un Post/Redirect/Get (303 → `/links?ferme`) ;
 *   • le refus (403/404) NE REDIRIGE PAS : la ligne visée reste ACTIVE, sous
 *     les yeux du lecteur, avec le motif de la passerelle rendu VERBATIM ;
 *   • une panne réseau rend 503, motif générique ;
 *   • un jeton mort renvoie se connecter ;
 *   • l'origine étrangère est refusée AVANT tout appel ;
 *   • un POST de CRÉATION (sans `geste`) passe toujours par la création —
 *     régression #5071.
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

const formulaire = (champs: Readonly<Record<string, string>>): FormData => {
  const corps = new FormData();
  Object.entries(champs).forEach(([nom, valeur]) => corps.append(nom, valeur));
  return corps;
};

const poste = (
  champs: Readonly<Record<string, string>>,
  options: { readonly origine?: string | null; readonly avecCookie?: boolean } = {},
): Request =>
  requete('https://meeshy.test/links', {
    method: 'POST',
    body: formulaire(champs),
    ...(options.origine === undefined ? {} : { origine: options.origine }),
    ...(options.avecCookie === false ? { headers: {} } : {}),
  });

const sansCookie = (champs: Readonly<Record<string, string>>): Request =>
  new Request('https://meeshy.test/links', {
    method: 'POST',
    body: formulaire(champs),
    headers: { origin: 'https://meeshy.test' },
  });

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const CARNET = {
  success: true,
  data: [
    {
      id: 'l1',
      linkId: 'mshy_lagos',
      identifier: 'lagos-q1',
      name: 'Ops Lagos',
      isActive: true,
      currentUses: 4,
      maxUses: null,
      expiresAt: null,
      conversation: { id: 'c1', title: 'Équipe Lagos', type: 'group' },
    },
  ],
  meta: { summary: { totalLinks: 2, activeLinks: 2 } },
};

type Appel = { readonly url: string; readonly methode: string; readonly corps: string | null; readonly entetes: Record<string, string> };

const passerelle = (parChemin: Readonly<Record<string, (appel: Appel) => Response>>) => {
  const vus: Appel[] = [];
  const recuperer = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const appel: Appel = {
      url,
      methode: String(init.method ?? 'GET'),
      corps: typeof init.body === 'string' ? init.body : null,
      entetes: (init.headers as Record<string, string>) ?? {},
    };
    vus.push(appel);
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1](appel);
  };
  return { recuperer, vus };
};

/** Le carnet servi, et un PATCH qui aboutit. */
const NOMINALE = () =>
  passerelle({
    '/api/v1/links/mshy_lagos': (appel) =>
      appel.methode === 'PATCH' ? json({ success: true, data: { linkId: 'mshy_lagos', isActive: false } }) : json(CARNET),
    '/api/v1/links': () => json(CARNET),
  });

describe('la porte de fermeture de /links', () => {
  it('PATCHe le BON lien avec le corps STRICT { isActive: false }, en Bearer', async () => {
    const { recuperer, vus } = NOMINALE();

    await POST_SUR_LES_LIENS(poste({ geste: 'fermer', lien: 'mshy_lagos' }), recuperer);

    const patch = vus.find((appel) => appel.methode === 'PATCH');
    expect(patch).toBeDefined();
    expect(patch?.url.endsWith('/api/v1/links/mshy_lagos')).toBe(true);
    expect(JSON.parse(patch?.corps ?? '{}')).toEqual({ isActive: false });
    expect(patch?.entetes.authorization).toBe('Bearer jeton-de-test');
  });

  it('redirige en 303 vers /links?ferme sur un succès — le PRG', async () => {
    const { recuperer } = NOMINALE();

    const reponse = await POST_SUR_LES_LIENS(poste({ geste: 'fermer', lien: 'mshy_lagos' }), recuperer);

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/links?ferme');
    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
  });

  it('un REFUS (403) ne redirige PAS : la ligne reste ACTIVE, le motif est rendu VERBATIM', async () => {
    const { recuperer } = passerelle({
      '/api/v1/links/mshy_lagos': (appel) =>
        appel.methode === 'PATCH'
          ? json({ success: false, error: 'Permissions insuffisantes pour modifier ce lien' }, 403)
          : json(CARNET),
      '/api/v1/links': () => json(CARNET),
    });

    const reponse = await POST_SUR_LES_LIENS(poste({ geste: 'fermer', lien: 'mshy_lagos' }), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(403);
    expect(reponse.headers.get('location')).toBeNull();
    // La voix du carnet est SERVIE dans tous les états : le témoin porte donc
    // sur ce qui la distingue — elle n'est plus MUETTE, et elle porte le motif.
    expect(html).toContain('<p class="avis alerte" role="alert">');
    expect(html).not.toContain('<p class="avis alerte" role="alert" hidden>');
    expect(html).toContain(`${FERMETURE.refuse} Permissions insuffisantes pour modifier ce lien`);
    // La ligne visée reste ACTIVE dans le carnet re-servi.
    expect(html).not.toMatch(/<li class="ligne-lien ferme"[^>]*data-lien="mshy_lagos"/);
  });

  it('un REFUS (404) rend le motif « Lien de partage non trouvé », verbatim', async () => {
    const { recuperer } = passerelle({
      '/api/v1/links/mshy_lagos': (appel) =>
        appel.methode === 'PATCH' ? json({ success: false, error: 'Lien de partage non trouvé' }, 404) : json(CARNET),
      '/api/v1/links': () => json(CARNET),
    });

    const reponse = await POST_SUR_LES_LIENS(poste({ geste: 'fermer', lien: 'mshy_lagos' }), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(404);
    expect(html).toContain('Lien de partage non trouvé');
  });

  it('une PANNE (5xx ou passerelle muette) rend 503 avec le motif générique', async () => {
    const { recuperer } = passerelle({
      '/api/v1/links/mshy_lagos': (appel) => (appel.methode === 'PATCH' ? json({ success: false }, 500) : json(CARNET)),
      '/api/v1/links': () => json(CARNET),
    });

    const reponse = await POST_SUR_LES_LIENS(poste({ geste: 'fermer', lien: 'mshy_lagos' }), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(503);
    expect(html).toContain(FERMETURE.echec);
  });

  it('un 401 au PATCH renvoie se connecter', async () => {
    const { recuperer } = passerelle({
      '/api/v1/links/mshy_lagos': () => json({ success: false }, 401),
    });

    const reponse = await POST_SUR_LES_LIENS(poste({ geste: 'fermer', lien: 'mshy_lagos' }), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Flinks');
  });

  it('refuse une origine étrangère AVANT d’atteindre la passerelle', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await POST_SUR_LES_LIENS(
      poste({ geste: 'fermer', lien: 'mshy_lagos' }, { origine: 'https://ailleurs.test' }),
      recuperer,
    );

    expect(reponse.status).toBe(403);
    expect(vus).toEqual([]);
  });

  it('renvoie se connecter sans jeton — sans appeler la passerelle', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await POST_SUR_LES_LIENS(sansCookie({ geste: 'fermer', lien: 'mshy_lagos' }), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Flinks');
    expect(vus).toEqual([]);
  });

  it('un `lien` vide redirige vers /links sans appeler la passerelle', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await POST_SUR_LES_LIENS(poste({ geste: 'fermer', lien: '' }), recuperer);

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/links');
    expect(vus).toEqual([]);
  });

  it('un POST de CRÉATION (sans `geste`) passe TOUJOURS par la création — régression #5071', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/links': (appel) =>
        appel.methode === 'POST'
          ? json({ success: true, data: { linkId: 'mshy_neuf', conversationId: 'c-neuve' } }, 201)
          : json(CARNET),
    });

    const reponse = await POST_SUR_LES_LIENS(poste({ conversation: 'Le potager' }), recuperer);

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/links?cree');
    expect(vus.some((appel) => appel.methode === 'POST' && appel.url.endsWith('/api/v1/links'))).toBe(true);
    expect(vus.some((appel) => appel.methode === 'PATCH')).toBe(false);
  });
});
