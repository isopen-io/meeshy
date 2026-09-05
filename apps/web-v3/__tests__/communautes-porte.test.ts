/**
 * @jest-environment node
 */

import { COMMUNAUTES_DU_LECTEUR, CREE_UNE_COMMUNAUTE } from '@/app/connecte/communautes-porte';
import { BORNES_DE_LA_COMMUNAUTE } from '@/app/connecte/communautes-vue';
import { teinteDeLAvatar } from '@/lib/avatar';
import { COMMUNAUTES } from '@/lib/contenu/communautes';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PORTE de `/communities`, c'est-à-dire les
 * décisions qu'elle prend avant de rendre quoi que ce soit, et l'écran qu'elle
 * rend (§ 3 de la spécification, T1-T8 + T-garde).
 *
 * DEUX APPELS AU PLUS (T5) — jamais un troisième pour le nom d'une communauté
 * ouverte : il vient de la liste déjà en main.
 *
 * LA GARDE DE PRÉSENCE (T-garde, document) : le document nominal ne rend
 * AUCUN nœud de présence — la cible n'en dessine pas, et l'API ne projette
 * rien à peindre par distraction.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';

const requete = (url: string, init: RequestInit & { readonly origine?: string | null } = {}): Request => {
  const { origine = 'https://meeshy.test', ...reste } = init;
  return new Request(url, {
    ...reste,
    headers: { cookie: COOKIE, ...(origine === null ? {} : { origin: origine }), ...((reste.headers as Record<string, string>) ?? {}) },
  });
};

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

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

const DEUX_COMMUNAUTES = [
  communauteServie(),
  communauteServie({ id: 'comm-2', identifier: 'mshy_atelier-traduction', name: 'Atelier traduction', isPrivate: true, memberCount: 32, conversationCount: 3 }),
];

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
  participants: [],
  _count: { messages: 4, participants: 2 },
  ...extra,
});

const passerelle = (parChemin: Readonly<Record<string, (init: RequestInit) => Response>>) => {
  const vus: string[] = [];
  const recuperer = async (url: string, init: RequestInit): Promise<Response> => {
    vus.push(url);
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1](init);
  };
  return { recuperer, vus };
};

const NOMINALE = (communautes: readonly unknown[] = DEUX_COMMUNAUTES) =>
  passerelle({
    '/api/v1/communities/comm-1/conversations': () =>
      json({ success: true, data: [conversationServie()], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } }),
    '/api/v1/communities': () =>
      json({ success: true, data: communautes, pagination: { total: communautes.length, limit: 20, offset: 0, hasMore: false } }),
  });

describe('la porte de /communities', () => {
  it('renvoie se connecter quand aucun jeton n’est présenté', async () => {
    const reponse = await COMMUNAUTES_DU_LECTEUR(new Request('https://meeshy.test/communities'));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcommunities');
    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
  });

  // T1 — le document servi n'embarque aucun module.
  it('n’embarque aucun <script src> applicatif', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer)).text();

    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
  });

  // T2 — aucun spinner, jamais : la liste est SERVIE.
  it('sert les deux lignes ENTIÈRES, sans aucun état de chargement', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer)).text();

    expect((html.match(/class="communaute"/g) ?? []).length).toBe(2);
    expect(html).not.toContain('aria-busy');
    expect(html).not.toContain('spinner');
    expect(html).not.toContain('squelette');
    expect(html).not.toContain('Chargement');
  });

  // T3
  it('302 vers /login?returnUrl=%2Fcommunities, cache-control no-store', async () => {
    const reponse = await COMMUNAUTES_DU_LECTEUR(new Request('https://meeshy.test/communities'));
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
  });

  // T4
  it('renvoie se connecter sur un 401 passerelle', async () => {
    const { recuperer } = passerelle({ '/api/v1/communities': () => json({ success: false }, 401) });

    const reponse = await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcommunities');
  });

  it('dessine la panne (503) plutôt qu’une page blanche quand la passerelle se tait', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    const reponse = await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer);

    expect(reponse.status).toBe(503);
    expect(await reponse.text()).not.toBe('');
  });

  // T5 — UN appel sur le GET nu, DEUX sur ?ouverte=, jamais /auth/me.
  it('demande UNE SEULE route sur le GET nu — jamais /auth/me', async () => {
    const { recuperer, vus } = NOMINALE();

    await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer);

    expect(vus).toHaveLength(1);
    expect(vus[0]).toContain('/api/v1/communities?limit=20&offset=0');
    expect(vus.some((url) => url.includes('/auth/me'))).toBe(false);
  });

  it('demande DEUX routes sur ?ouverte=, jamais un troisième appel pour le nom', async () => {
    const { recuperer, vus } = NOMINALE();

    await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities?ouverte=comm-1'), recuperer);

    expect(vus).toHaveLength(2);
    expect(vus.some((url) => url.includes('/api/v1/communities?limit=20&offset=0'))).toBe(true);
    expect(vus.some((url) => url.includes('/api/v1/communities/comm-1/conversations'))).toBe(true);
  });

  // T6 — le méta suit la cible.
  it('méta : publique « 128 membres · 14 conversations », privée « 32 membres · privée »', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer)).text();

    expect(html).toContain('128 membres · 14 conversations');
    expect(html).toContain('32 membres · privée');
    expect(html).not.toContain('32 membres · 3 conversations');
  });

  it('méta : singuliers corrects — « 1 membre »', async () => {
    const { recuperer } = NOMINALE([communauteServie({ memberCount: 1, conversationCount: 1 })]);

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer)).text();

    expect(html).toContain('1 membre · 1 conversation');
  });

  // T6bis — chaque contrôle a un effet.
  it('chaque ligne, « Créer » et la pagination sont des <a> vers un effet réel', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer)).text();

    expect(html).toContain('href="/communities?ouverte=comm-1"');
    expect(html).toContain('href="/communities?ouverte=comm-2"');
    expect(html).toContain('href="/communities?nouvelle"');
  });

  it('la pagination rend <a href="/communities?offset=…"> quand hasMore', async () => {
    const { recuperer } = passerelle({
      '/api/v1/communities': () => json({ success: true, data: DEUX_COMMUNAUTES, pagination: { total: 40, limit: 2, offset: 0, hasMore: true } }),
    });

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer)).text();

    expect(html).toContain('href="/communities?offset=2"');
    // LE VOCABULAIRE DE LA ZONE, PAS UN NOM À SOI : `plus-ancien action
    // discrete` est ce que le fil, la galerie, `/notifications` et `/calls`
    // rendent. La feuille en déclarait une copie sous `.plus` — nom que
    // `social-feuille.ts` portait déjà, autrement.
    expect(html).toContain('class="plus-ancien action discrete"');
    expect(html).not.toContain('class="plus action');
  });

  it('vide : carteVide, ni lignes ni lien « plus »', async () => {
    const { recuperer } = passerelle({
      '/api/v1/communities': () => json({ success: true, data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } }),
    });

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer)).text();

    expect(html).toContain(COMMUNAUTES.vide);
    expect(html).not.toContain('class="communaute"');
    expect(html).not.toContain(COMMUNAUTES.plus);
  });

  // T7 — l'état ?ouverte=.
  it('?ouverte= : la surimpression porte le nom, les conversations en <a href="/chats/:id">, le méta, et se ferme sans JS', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities?ouverte=comm-1'), recuperer)).text();

    expect(html).toContain('<dialog class="communaute-ouverte" open');
    expect(html).toContain('Diaspora FR-EN');
    expect(html).toContain('href="/chats/conv-1"');
    expect(html).toContain('Annonces');
    expect(html).toContain('data-retour="/communities"');
    // La conversation à 2 participants ne montre AUCUN compte (seuil 3, § 12.10.2).
    expect(html).not.toMatch(/2 participants/);
    // La liste reste rendue DESSOUS, jamais retirée.
    expect((html.match(/class="communaute"/g) ?? []).length).toBe(2);
  });

  it('?ouverte= : le compte de participants apparaît à partir de 3 (l’autre moitié du seuil)', async () => {
    const { recuperer } = passerelle({
      '/api/v1/communities/comm-1/conversations': () =>
        json({ success: true, data: [conversationServie({ _count: { messages: 1, participants: 3 } })], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } }),
      '/api/v1/communities': () => json({ success: true, data: DEUX_COMMUNAUTES, pagination: { total: 2, limit: 20, offset: 0, hasMore: false } }),
    });

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities?ouverte=comm-1'), recuperer)).text();

    expect(html).toContain('3 participants');
  });

  it('?ouverte= : 403 ⇒ la phrase « privée » peinte, liste intacte', async () => {
    const { recuperer } = passerelle({
      '/api/v1/communities/comm-1/conversations': () => json({ success: false }, 403),
      '/api/v1/communities': () => json({ success: true, data: DEUX_COMMUNAUTES, pagination: { total: 2, limit: 20, offset: 0, hasMore: false } }),
    });

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities?ouverte=comm-1'), recuperer)).text();

    expect(html).toContain(COMMUNAUTES.refusPrivee);
    expect((html.match(/class="communaute"/g) ?? []).length).toBe(2);
  });

  it('?ouverte= : 404 ⇒ « n’existe plus » peinte, liste intacte', async () => {
    const { recuperer } = passerelle({
      '/api/v1/communities/comm-1/conversations': () => json({ success: false }, 404),
      '/api/v1/communities': () => json({ success: true, data: DEUX_COMMUNAUTES, pagination: { total: 2, limit: 20, offset: 0, hasMore: false } }),
    });

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities?ouverte=comm-1'), recuperer)).text();

    expect(html).toContain(COMMUNAUTES.introuvable);
  });

  // T-garde (document).
  it('T-garde : le document nominal ne rend AUCUN nœud de présence', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities?ouverte=comm-1'), recuperer)).text();

    expect(html).not.toContain('pastille');
    expect(html).not.toContain('en-ligne');
    expect(html).not.toContain('isOnline');
  });

  // T8 — l'état ?nouvelle et son POST.
  it('?nouvelle : la feuille sert le formulaire, case privée cochée par défaut', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities?nouvelle'), recuperer)).text();

    expect(html).toContain('<dialog class="nouvelle-communaute" open');
    expect(html).toContain('name="nom" type="text" required');
    expect(html).toContain('name="description"');
    expect(html).toContain('name="prive" value="1" checked');
  });

  const formulaire = (champs: Readonly<Record<string, string>>): FormData => {
    const corps = new FormData();
    Object.entries(champs).forEach(([nom, valeur]) => corps.append(nom, valeur));
    return corps;
  };

  const poste = (champs: Readonly<Record<string, string>>): Request =>
    requete('https://meeshy.test/communities', { method: 'POST', body: formulaire(champs) });

  it('POST 201 ⇒ 302 vers /communities (PRG)', async () => {
    const { recuperer } = passerelle({
      '/api/v1/communities': (init) =>
        String(init.method ?? 'GET') === 'POST'
          ? json({ success: true, data: communauteServie({ id: 'comm-neuve' }) }, 201)
          : json({ success: true, data: DEUX_COMMUNAUTES, pagination: { total: 2, limit: 20, offset: 0, hasMore: false } }),
    });

    const reponse = await CREE_UNE_COMMUNAUTE(poste({ nom: 'Diaspora FR-EN' }), recuperer);

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/communities');
  });

  it('POST poste isPrivate EXPLICITE, jamais implicite — case décochée ⇒ false', async () => {
    const corps: string[] = [];
    const { recuperer } = passerelle({
      '/api/v1/communities': (init) => {
        if (String(init.method ?? 'GET') === 'POST') {
          corps.push(String(init.body));
          return json({ success: true, data: communauteServie({ id: 'comm-neuve' }) }, 201);
        }
        return json({ success: true, data: DEUX_COMMUNAUTES, pagination: { total: 2, limit: 20, offset: 0, hasMore: false } });
      },
    });

    await CREE_UNE_COMMUNAUTE(poste({ nom: 'Sans case privée' }), recuperer);

    expect(JSON.parse(corps[0] ?? '{}')).toMatchObject({ isPrivate: false });
  });

  it('POST 409 ⇒ re-rendu 409 avec la copie FRANÇAISE de conflit — jamais le texte anglais du serveur', async () => {
    const messageServeur = 'A community with identifier "mshy_diaspora-fr-en" already exists';
    const { recuperer } = passerelle({
      '/api/v1/communities': (init) =>
        String(init.method ?? 'GET') === 'POST'
          ? json({ success: false, error: messageServeur, message: messageServeur }, 409)
          : json({ success: true, data: DEUX_COMMUNAUTES, pagination: { total: 2, limit: 20, offset: 0, hasMore: false } }),
    });

    const reponse = await CREE_UNE_COMMUNAUTE(poste({ nom: 'Diaspora FR-EN' }), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(409);
    expect(html).toContain(COMMUNAUTES.conflit);
    expect(html).not.toContain(messageServeur);
    // La saisie est CONSERVÉE.
    expect(html).toContain('value="Diaspora FR-EN"');
  });

  it('POST sans nom ⇒ refus CÔTÉ CLIENT, jamais de POST vers la passerelle', async () => {
    const methodes: string[] = [];
    const recuperer = async (_url: string, init: RequestInit): Promise<Response> => {
      methodes.push(String(init.method ?? 'GET'));
      return json({ success: true, data: DEUX_COMMUNAUTES, pagination: { total: 2, limit: 20, offset: 0, hasMore: false } });
    };

    const reponse = await CREE_UNE_COMMUNAUTE(poste({ nom: '' }), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(html).toContain(COMMUNAUTES.sansNom);
    expect(methodes).not.toContain('POST');
  });

  it('POST refuse une origine étrangère', async () => {
    const reponse = await CREE_UNE_COMMUNAUTE(
      requete('https://meeshy.test/communities', { method: 'POST', body: formulaire({ nom: 'x' }), origine: 'https://mechant.test' }),
    );

    expect(reponse.status).not.toBe(303);
    expect(await reponse.text()).toContain('Meeshy');
  });
});

/**
 * LA PAGE 2 EST UNE PAGE, PAS UN CUL-DE-SAC (#5109, trouvé en revue).
 *
 * `?offset=` gouverne QUELLE page la porte demande à la passerelle — donc,
 * mécaniquement, quelles communautés `ouvertureDe` a en main pour nommer une
 * surimpression (`GET /communities/:id/conversations` ne sert AUCUN `name`,
 * § 2.2). Une ligne de la page 2 dont le `href` ne reporte pas l'offset fait
 * relire la page 1 : la communauté demandée n'y est pas, et sa surimpression
 * s'ouvre sur le repli « Communauté » au lieu de son nom. Le repli existe pour
 * une adresse composée à la main, pas pour le geste NOMINAL du lecteur qui
 * possède plus de vingt communautés.
 *
 * Les trois retours de la surimpression (voile, poignée, croix) et le lien
 * « plus » suivent la même loi : ce qui repart de la page 2 y revient.
 */
describe('la pagination reporte l’offset — la page 2 n’est pas un cul-de-sac', () => {
  const PAGE_DEUX = [
    communauteServie({ id: 'comm-3', identifier: 'mshy_cercle', name: 'Cercle des lecteurs', memberCount: 7, conversationCount: 2 }),
  ];

  /**
   * LE BOUCHON PAGINE POUR DE VRAI — `data` dépend de `offset`, comme
   * `communities/core.ts:99-239`. Un bouchon qui rend la même page quel que
   * soit l'offset rendrait ces témoins INCAPABLES d'échouer : la porte
   * retrouverait `comm-3` même après avoir perdu l'offset en chemin.
   */
  const pageDeux = () => {
    const vus: string[] = [];
    const recuperer = async (url: string): Promise<Response> => {
      vus.push(url);
      if (url.includes('/conversations')) {
        return json({ success: true, data: [conversationServie({ communityId: 'comm-3' })], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } });
      }
      const offset = Number(new URL(url).searchParams.get('offset') ?? '0');
      const page = offset >= 2 ? PAGE_DEUX : DEUX_COMMUNAUTES;
      return json({ success: true, data: page, pagination: { total: 3, limit: 2, offset, hasMore: offset < 2 } });
    };
    return { recuperer, vus };
  };

  const sert = async (adresse: string): Promise<string> =>
    (await COMMUNAUTES_DU_LECTEUR(requete(`https://meeshy.test${adresse}`), pageDeux().recuperer)).text();

  it('chaque ligne de la page 2 reporte l’offset dans son href', async () => {
    expect(await sert('/communities?offset=2')).toContain('href="/communities?offset=2&amp;ouverte=comm-3"');
  });

  it('« Créer » depuis la page 2 y revient après coup', async () => {
    expect(await sert('/communities?offset=2')).toContain('href="/communities?offset=2&amp;nouvelle"');
  });

  /**
   * LE TÉMOIN SUIT LE LIEN, il ne le suppose pas : c'est le `href` RENDU sur
   * la page 2 qu'on redemande, exactement comme le pouce du lecteur. Épingler
   * `?ouverte=&offset=` à la main aurait passé au vert sur le code défaillant,
   * qui savait déjà nommer une communauté quand l'offset lui arrivait — ce
   * qu'il perdait, c'est le report de l'offset DANS le lien.
   */
  it('suivre la ligne de la page 2 ouvre une surimpression qui porte son NOM', async () => {
    const liste = await sert('/communities?offset=2');
    const lien = /href="(\/communities\?[^"]*ouverte=comm-3[^"]*)"/.exec(liste)?.[1];
    if (lien === undefined) throw new Error('aucun lien vers comm-3');

    const ouverte = await sert(lien.replace(/&amp;/g, '&'));

    expect(ouverte).toContain('Cercle des lecteurs</h2>');
    expect(ouverte).not.toContain(`${COMMUNAUTES.communauteSansNom}</h2>`);
  });

  it('les trois retours de la surimpression ramènent à la page 2', async () => {
    const html = await sert('/communities?offset=2&ouverte=comm-3');

    expect(html).not.toContain('href="/communities" aria-label');
    expect(html.match(/href="\/communities\?offset=2" aria-label/g) ?? []).toHaveLength(3);
    expect(html).toContain('data-retour="/communities?offset=2"');
  });

  it('la page 1 ne porte AUCUN offset — l’adresse nue reste nue', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer)).text();

    expect(html).toContain('href="/communities?ouverte=comm-1"');
    expect(html).not.toContain('offset=0');
  });
});

/**
 * `inert` EST TOUTE LA MODALITÉ D'UNE SURIMPRESSION SANS JAVASCRIPT (#5109,
 * trouvé en revue : la garde existait, aucun témoin ne la tenait).
 *
 * Sans un octet de script il n'y a ni Échap ni piège à focus : `inert` sur le
 * `<main>` est ce que le navigateur donne gratuitement — la première
 * tabulation atteint la croix, et le lecteur d'écran cesse d'annoncer une
 * liste que la feuille recouvre. C'est la raison écrite dans `fil-vue.ts` pour
 * la modale de l'état CHOIX ; elle vaut ici pour les TROIS surimpressions.
 */
describe('le <main> est inert sous une surimpression, et lui seul', () => {
  const sertNominale = async (adresse: string): Promise<string> =>
    (await COMMUNAUTES_DU_LECTEUR(requete(`https://meeshy.test${adresse}`), NOMINALE().recuperer)).text();

  it('l’écran nominal n’est PAS inert', async () => {
    expect(await sertNominale('/communities')).toContain('<main id="main-content" class="communautes-ecran">');
  });

  it.each([['?nouvelle'], ['?ouverte=comm-1'], ['?espace']])(
    'la surimpression %s rend le <main> inert',
    async (etat) => {
      expect(await sertNominale(`/communities${etat}`)).toContain(
        '<main id="main-content" class="communautes-ecran" inert>',
      );
    },
  );
});

/**
 * LA TUILE PORTE LA TEINTE DU NOM — `teinteDeLAvatar` (`lib/avatar.ts`), le
 * site UNIQUE de la dispersion, et pas une classe posée à la main (#5109,
 * trouvé en revue : rien ne le tenait).
 *
 * Sans ce témoin, une tuile figée sur `t1` rendrait le même document pour
 * toutes les communautés sans qu'aucun gate ne rougisse : la couleur cesserait
 * de DÉSAMBIGUÏSER deux lignes voisines — la seule chose que quatre teintes
 * peuvent promettre — et redeviendrait du bruit décoratif. Le CONTRASTE des
 * quatre teintes est gardé ailleurs, à sa place : `scripts/check-jetons.mjs`
 * apparie `--color-on-avatar` aux quatre `--color-avatar-*`, dans les deux
 * schémas.
 */
describe('la teinte de la tuile vient du nom, jamais d’une classe en dur', () => {
  it('chaque ligne porte la classe que teinteDeLAvatar rend pour son nom', async () => {
    const { recuperer } = NOMINALE([
      communauteServie({ id: 'comm-a', name: 'Cercle fermé' }),
      communauteServie({ id: 'comm-b', name: 'Cercle des lecteurs' }),
    ]);

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities'), recuperer)).text();

    expect(html).toContain(`class="tuile ${teinteDeLAvatar('Cercle fermé')}"`);
    expect(html).toContain(`class="tuile ${teinteDeLAvatar('Cercle des lecteurs')}"`);
    // Les deux noms tombent sur des teintes DIFFÉRENTES : le témoin rougirait
    // sur une classe figée, ce qu'une paire de même teinte laisserait passer.
    expect(teinteDeLAvatar('Cercle fermé')).not.toEqual(teinteDeLAvatar('Cercle des lecteurs'));
  });
});

/**
 * LES BORNES DU CONTRAT SONT SUR LE CHAMP (#5109, trouvé en revue).
 *
 * `createCommunityRequestSchema` borne `name` à 100 et `description` à 500, et
 * Fastify refuse en 400 avant le handler. La porte ne distingue que 401, 409 et
 * « le reste » : un dépassement tombait dans `echecCreation` — « Réessayez dans
 * un instant », une consigne qui ne peut pas aboutir. Les bornes se déclarent
 * donc où l'on tape, et le refus n'a plus lieu d'être.
 */
describe('la feuille de création borne ce que la passerelle borne', () => {
  it('nom maxlength=100, description maxlength=500 — les valeurs du contrat', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await COMMUNAUTES_DU_LECTEUR(requete('https://meeshy.test/communities?nouvelle'), recuperer)).text();

    expect(BORNES_DE_LA_COMMUNAUTE).toEqual({ nom: 100, description: 500 });
    expect(html).toContain(`maxlength="${BORNES_DE_LA_COMMUNAUTE.nom}"`);
    expect(html).toContain(`maxlength="${BORNES_DE_LA_COMMUNAUTE.description}"`);
  });
});
