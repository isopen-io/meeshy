/**
 * @jest-environment node
 */

import { PREFERENCES } from '@/app/connecte/prefs-porte';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences';

/**
 * `/notifications/preferences` — LA PORTE (spécification § 3, § 4 étape 4).
 *
 * MÊME PATRON QUE `notifs-porte.ts` : les trois questions (un jeton ? la
 * passerelle l'accepte-t-elle ? a-t-elle répondu ?), l'origine vérifiée AVANT
 * tout POST, Post/Redirect/Get pour que le rechargement ne rejoue rien, et un
 * échec qui NE MENT PAS — la boîte relue plutôt qu'un état inventé.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';

const requete = (
  url: string,
  init: RequestInit & { readonly origine?: string | null; readonly corps?: string } = {},
): Request => {
  const { origine = 'https://meeshy.test', corps, ...reste } = init;
  return new Request(url, {
    ...reste,
    ...(corps === undefined ? {} : { body: corps }),
    headers: {
      cookie: COOKIE,
      ...(reste.method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(origine === null ? {} : { origin: origine }),
      ...((reste.headers as Record<string, string>) ?? {}),
    },
  });
};

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const DOCUMENT_SERVI = { ...NOTIFICATION_PREFERENCE_DEFAULTS, reactionEnabled: false };

const passerelle = (parChemin: Readonly<Record<string, (url: string, options: RequestInit) => Response>>) => {
  const vus: { url: string; options: RequestInit }[] = [];
  const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
    vus.push({ url, options });
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1](url, options);
  };
  return { recuperer, vus };
};

const NOMINALE = () =>
  passerelle({
    '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
  });

describe('la porte de /notifications/preferences — GET', () => {
  it('renvoie se connecter quand aucun jeton n’est présenté', async () => {
    const reponse = await PREFERENCES(new Request('https://meeshy.test/notifications/preferences'));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fnotifications%2Fpreferences');
  });

  it('sert le document, et son état vient de ce que la passerelle a servi', async () => {
    const { recuperer } = NOMINALE();

    const reponse = await PREFERENCES(requete('https://meeshy.test/notifications/preferences'), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    // reactionEnabled est servi FAUX — la seule preuve que l'état vient du
    // serveur, pas d'un défaut local.
    const zone = html.slice(html.indexOf('name="cle" value="reactionEnabled"'), html.indexOf('name="cle" value="reactionEnabled"') + 400);
    expect(zone).toContain('aria-checked="false"');
    // pushEnabled est servi VRAI.
    const zonePush = html.slice(html.indexOf('name="cle" value="pushEnabled"'), html.indexOf('name="cle" value="pushEnabled"') + 400);
    expect(zonePush).toContain('aria-checked="true"');
  });

  it('renvoie se connecter quand la passerelle refuse le jeton (401)', async () => {
    const { recuperer } = passerelle({ '/api/v1/me/preferences': () => json({ success: false }, 401) });

    const reponse = await PREFERENCES(requete('https://meeshy.test/notifications/preferences'), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fnotifications%2Fpreferences');
  });

  it('dessine la panne plutôt qu’une page blanche quand la passerelle se tait', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    const reponse = await PREFERENCES(requete('https://meeshy.test/notifications/preferences'), recuperer);

    expect(reponse.status).toBe(503);
    expect(await reponse.text()).not.toBe('');
  });

  it('révèle la région de statut au retour de la redirection', async () => {
    const { recuperer } = NOMINALE();

    const html = await (
      await PREFERENCES(requete('https://meeshy.test/notifications/preferences?regle=pushEnabled'), recuperer)
    ).text();

    expect(html).toMatch(/<p class="avis" role="status">/);
    expect(html).toContain('pushEnabled'.length > 0 ? 'réglage enregistré' : '');
  });
});

describe('la porte de /notifications/preferences — POST', () => {
  it('poste EXACTEMENT { notification: { <cle>: <valeur> } } et redirige vers ?regle=<cle>', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: { ...NOTIFICATION_PREFERENCE_DEFAULTS, pushEnabled: false } } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', { method: 'POST', corps: 'cle=pushEnabled&valeur=false' }),
      recuperer,
    );

    const patch = vus.find((v) => v.options.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(String(patch?.options.body))).toEqual({ notification: { pushEnabled: false } });
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/notifications/preferences?regle=pushEnabled');
  });

  it('refuse un POST d’origine ÉTRANGÈRE sans jamais toucher la passerelle', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'cle=pushEnabled&valeur=false',
        origine: 'https://ailleurs.test',
      }),
      recuperer,
    );

    expect(vus).toEqual([]);
    expect(reponse.status).not.toBe(303);
  });

  it('refuse une `cle` hors table — 400, AUCUNE écriture émise', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', { method: 'POST', corps: 'cle=callsEnabled&valeur=false' }),
      recuperer,
    );

    expect(reponse.status).toBe(400);
    expect(vus).toEqual([]);
  });

  it('re-sert le document, RELU du serveur, avec un bandeau d’échec — quand le PATCH échoue', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/preferences': (url, options) =>
        options.method === 'PATCH' ? json({ success: false }, 500) : json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', { method: 'POST', corps: 'cle=pushEnabled&valeur=false' }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    expect(html).toMatch(/<p class="echec" role="alert">/);
    // reactionEnabled RELU depuis la passerelle reste faux — la vérité du serveur, pas un état inventé.
    const zone = html.slice(html.indexOf('name="cle" value="reactionEnabled"'), html.indexOf('name="cle" value="reactionEnabled"') + 400);
    expect(zone).toContain('aria-checked="false"');
  });

  it('renvoie se connecter quand le PATCH répond 401', async () => {
    const { recuperer } = passerelle({ '/api/v1/me/preferences': () => json({ success: false }, 401) });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', { method: 'POST', corps: 'cle=pushEnabled&valeur=false' }),
      recuperer,
    );

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fnotifications%2Fpreferences');
  });
});
