/**
 * @jest-environment node
 */

const taches: (() => unknown)[] = [];

jest.mock('next/server', () => ({
  after: (tache: () => unknown) => {
    taches.push(tache);
  },
}));

import { GET } from '@/app/(public)/l/[token]/route';

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_ROBOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

type Appel = { readonly url: string; readonly methode: string };

const appels: Appel[] = [];

const passerelle = (reponsePour: (url: string) => Response | Promise<Response> | Error) => {
  global.fetch = (async (entree: RequestInfo | URL, options?: RequestInit) => {
    const url = String(entree);
    appels.push({ url, methode: options?.method ?? 'GET' });
    const reponse = await reponsePour(url);
    if (reponse instanceof Error) throw reponse;
    return reponse;
  }) as typeof fetch;
};

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json' } });

const CIBLE_ACTIVE = {
  success: true,
  data: {
    kind: 'conversation',
    targetType: 'CONVERSATION',
    targetId: 'c1',
    originalUrl: null,
    isActive: true,
  },
};

const APERCU = {
  success: true,
  data: { name: 'Équipe Lagos', description: 'Le canal des opérations', creator: { username: 'ibrahim' } },
};

const demande = (token: string, entetes: Readonly<Record<string, string>>): Promise<Response> =>
  GET(new Request(`https://meeshy.me/l/${token}`, { headers: entetes }), {
    params: Promise.resolve({ token }),
  });

const videLesTachesDApres = async (): Promise<void> => {
  const aCourir = [...taches];
  taches.length = 0;
  await Promise.all(aCourir.map((tache) => tache()));
};

beforeEach(() => {
  appels.length = 0;
  taches.length = 0;
  process.env.MEESHY_GATEWAY_URL = 'http://passerelle';
});

describe('GET /l/:token — un humain', () => {
  it('reçoit une 302 vers le contenu, sans un octet de HTML', async () => {
    passerelle(() => json(CIBLE_ACTIVE));

    const reponse = await demande('8fz3-lagos', { 'user-agent': UA_IPHONE });

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/chats/8fz3-lagos');
    expect(await reponse.text()).toBe('');
  });

  it('n’a coûté qu’UN appel amont avant la redirection : la résolution', async () => {
    passerelle(() => json(CIBLE_ACTIVE));

    await demande('8fz3', { 'user-agent': UA_IPHONE });

    expect(appels).toEqual([
      { url: 'http://passerelle/api/v1/tracking-links/8fz3/resolve', methode: 'GET' },
    ]);
  });

  /**
   * Le critère de fin exige le clic APRÈS la redirection. Ce n'est donc pas un
   * appel parallèle qu'on n'attend pas — un tel appel PART avant la réponse —
   * mais une tâche remise à `after()`, que le runtime exécute une fois la
   * réponse écrite.
   */
  it('n’enregistre le clic qu’APRÈS avoir répondu', async () => {
    passerelle(() => json(CIBLE_ACTIVE));

    await demande('8fz3', { 'user-agent': UA_IPHONE, referer: 'https://l.wl.co/' });

    expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(0);
    expect(taches).toHaveLength(1);

    await videLesTachesDApres();

    expect(appels.at(-1)).toEqual({
      url: 'http://passerelle/api/v1/tracking-links/8fz3/click',
      methode: 'POST',
    });
  });

  /** Le symétrique du témoin « un aperçu n'est pas un clic » : un lecteur, lui, en est un. */
  it('enregistre bien UN clic — la distinction porte sur le robot, pas sur le clic', async () => {
    passerelle(() => json(CIBLE_ACTIVE));

    await demande('8fz3', { 'user-agent': UA_IPHONE });
    await videLesTachesDApres();

    expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(1);
  });

  it('interdit toute mise en cache : un lien se referme, et son clic se compte', async () => {
    passerelle(() => json(CIBLE_ACTIVE));

    const reponse = await demande('8fz3', { 'user-agent': UA_IPHONE });

    expect(reponse.headers.get('cache-control')).toContain('no-store');
  });
});

describe('GET /l/:token — un lien qui ne s’ouvre pas', () => {
  it('mène à l’état « expiré » quand le lien est désactivé', async () => {
    passerelle(() => json({ success: true, data: { ...CIBLE_ACTIVE.data, isActive: false } }));

    const reponse = await demande('8fz3', { 'user-agent': UA_IPHONE });

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/l/8fz3/expired');
  });

  it('mène au MÊME état quand le jeton est inconnu — jamais un 404 qui confirme', async () => {
    passerelle(() => json({ success: false }, 404));

    const reponse = await demande('inconnu', { 'user-agent': UA_IPHONE });

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/l/inconnu/expired');
  });

  it('mène au même état sur un jeton malformé, sans jamais appeler la passerelle', async () => {
    passerelle(() => json(CIBLE_ACTIVE));

    const reponse = await demande('a%20b!', { 'user-agent': UA_IPHONE });

    expect(reponse.headers.get('location')).toContain('/expired');
    expect(appels).toHaveLength(0);
  });

  it('ne ment pas quand c’est la PASSERELLE qui tombe : 503 et l’écran, pas « expiré »', async () => {
    passerelle(() => new TypeError('fetch failed'));

    const reponse = await demande('8fz3', { 'user-agent': UA_IPHONE });
    const html = await reponse.text();

    expect(reponse.status).toBe(503);
    expect(html).toContain('<main id="main-content"');
  });

  /**
   * L'invariant que le doc-comment de la route énonce, porté jusqu'aux
   * CONTRÔLES : le 503 dit la vérité dans son statut, ses deux gestes ne
   * doivent pas la contredire. Un secondaire vers `/l/:token/expired` menait le
   * lecteur, en un tap, à l'état terminal que ce 503 existe pour ne pas
   * affirmer.
   */
  it('n’offre AUCUN geste vers l’état clos sur l’écran de panne, et nomme son réessai', async () => {
    passerelle(() => new TypeError('fetch failed'));

    const html = await (await demande('8fz3', { 'user-agent': UA_IPHONE })).text();

    expect(html).not.toContain('/expired');
    expect(html).toContain('<a class="cta principal" href="/l/8fz3">Réessayer</a>');
    expect(html).toContain('<a class="cta secondaire" href="/">Revenir à l&#39;accueil</a>');
  });

  it('compte tout de même le clic d’un lien clos ou en panne — le lecteur, lui, a cliqué', async () => {
    passerelle(() => json({ success: true, data: { ...CIBLE_ACTIVE.data, isActive: false } }));

    await demande('8fz3', { 'user-agent': UA_IPHONE });
    await videLesTachesDApres();

    expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(1);
  });
});

describe('GET /l/:token — un robot d’aperçu', () => {
  it('reçoit le repli HTML porteur des OG, jamais une redirection', async () => {
    passerelle((url) => (url.includes('/anonymous/link/') ? json(APERCU) : json(CIBLE_ACTIVE)));

    const reponse = await demande('8fz3', { 'user-agent': UA_ROBOT });
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<meta property="og:title" content="Équipe Lagos"/>');
    expect(html).toContain('og:description');
    expect(html).toContain('href="/chats/8fz3"');
  });

  it('ne relaie AUCUNE identité de créateur dans le HTML qu’il rend', async () => {
    passerelle((url) => (url.includes('/anonymous/link/') ? json(APERCU) : json(CIBLE_ACTIVE)));

    const html = await (await demande('8fz3', { 'user-agent': UA_ROBOT })).text();

    expect(html).not.toContain('ibrahim');
  });

  it('n’expose aucun aperçu d’un lien clos — il reçoit la même redirection que l’humain', async () => {
    passerelle(() => json({ success: true, data: { ...CIBLE_ACTIVE.data, isActive: false } }));

    const reponse = await demande('8fz3', { 'user-agent': UA_ROBOT });

    expect(reponse.status).toBe(302);
    expect(await reponse.text()).toBe('');
  });

  /**
   * La régression que ce témoin ferme : `apps/web` enregistre le clic depuis un
   * composant `'use client'`, donc un crawler — qui n'exécute pas de JavaScript —
   * n'en a JAMAIS produit. Compter l'aperçu ici afficherait dix clics et zéro
   * lecteur pour un lien collé dans dix groupes.
   */
  it('n’enregistre AUCUN clic : un aperçu n’est pas un clic', async () => {
    passerelle((url) => (url.includes('/anonymous/link/') ? json(APERCU) : json(CIBLE_ACTIVE)));

    await demande('8fz3', { 'user-agent': UA_ROBOT });

    expect(taches).toHaveLength(0);
    await videLesTachesDApres();
    expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(0);
  });

  /**
   * Le cas qui rend le faux clic pire qu'un bruit de fond : `whatsapp` est à la
   * fois dans `ROBOTS` et dans `SOURCE_PAR_AGENT`. Un aperçu compté serait donc
   * ATTRIBUÉ à la plateforme, et gonflerait `clicksBySocialSource`.
   */
  it('ne compte pas davantage l’aperçu d’un agent que la télémétrie sait nommer', async () => {
    passerelle((url) => (url.includes('/anonymous/link/') ? json(APERCU) : json(CIBLE_ACTIVE)));

    await demande('8fz3', { 'user-agent': 'WhatsApp/2.23.20.0 A' });

    expect(taches).toHaveLength(0);
  });

  /**
   * `lang` déclare la langue de ce qui est ÉCRIT. La copie du repli est
   * française et constante ; l'annoncer `en-US` ferait prononcer le français
   * avec la phonétique anglaise (WCAG 3.1.1, niveau A). La langue DEMANDÉE reste
   * servie — comme une donnée du `<dl>`, jamais comme une déclaration.
   */
  it('déclare la langue de sa COPIE, et sert celle du visiteur comme une donnée', async () => {
    passerelle((url) => (url.includes('/anonymous/link/') ? json(APERCU) : json(CIBLE_ACTIVE)));

    const html = await (
      await demande('8fz3', { 'user-agent': UA_ROBOT, 'accept-language': 'en-US,en;q=0.9' })
    ).text();

    expect(html).toContain('<html lang="fr"');
    expect(html).not.toContain('lang="en');
    expect(html).toContain('Langue détectée');
    expect(html).toContain('🇺🇸');
  });

  it('ne demande l’aperçu que pour un lien de CONVERSATION', async () => {
    passerelle(() =>
      json({
        success: true,
        data: { kind: 'tracking', targetType: 'STORY', targetId: 's1', originalUrl: null, isActive: true },
      }),
    );

    await demande('8fz3', { 'user-agent': UA_ROBOT });

    expect(appels.filter((a) => a.url.includes('/anonymous/link/'))).toHaveLength(0);
  });
});
