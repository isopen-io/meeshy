/**
 * @jest-environment node
 */

import { carnetDeLiens, fermeUnLien } from '@/lib/api/compte';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la lecture de `GET /links` pour l'écran
 * `/links`, contre la charge que la route sert RÉELLEMENT.
 *
 * Les bouchons sont copiés du schéma de réponse
 * (`services/gateway/src/routes/links/user.ts:334-440`) et du site d'envoi
 * (`:624-630`, seul producteur de l'enveloppe). Trois points gardés que rien
 * d'autre n'attraperait :
 *
 *   - `meta.summary` n'est PAS à la racine. `unreadCount` des notifications
 *     l'est ; ces agrégats-ci ne le sont pas. Supposer une règle commune aux
 *     deux routes rendrait `undefined`, donc ZÉRO — « 0 lien actif » sous une
 *     liste qui en montre deux (leçon 476) ;
 *   - `activeLinks` est SERVI, jamais recompté sur la page : le recompter
 *     donnerait un total plafonné par `limit` ;
 *   - un lien FERMÉ reste dans l'inventaire. C'est l'écart assumé avec
 *     `liensDuLecteur`, qui les écarte du tableau de bord.
 */

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

const lienServi = (extra: Record<string, unknown> = {}) => ({
  id: 'l1',
  linkId: 'mshy_lagos',
  identifier: 'lagos-q1',
  name: 'Ops Lagos',
  isActive: true,
  currentUses: 12,
  maxUses: null,
  expiresAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  conversationTitle: 'Équipe Lagos',
  conversation: { id: 'c1', title: 'Équipe Lagos', type: 'group' },
  ...extra,
});

const ENVELOPPE = (liens: readonly unknown[], summary: unknown = { totalLinks: 2, activeLinks: 2, totalUses: 15 }) => ({
  success: true,
  data: liens,
  pagination: { total: liens.length, offset: 0, limit: 50, hasMore: false },
  // `meta` est posé à la racine à côté de `data`, et `summary` DEDANS
  // (`user.ts:611-613` puis `:624-630`).
  ...(summary === null ? {} : { meta: { summary } }),
});

const passerelle = (reponse: () => Response) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    return reponse();
  };
  return { recuperer, vus };
};

describe('le carnet de liens', () => {
  it('demande les agrégats AVEC la page — un aller-retour, pas deux', async () => {
    const { recuperer, vus } = passerelle(() => json(ENVELOPPE([lienServi()])));

    await carnetDeLiens({ jeton: 'j', base: 'https://gate.test', recuperer });

    expect(vus).toHaveLength(1);
    // `?include=summary` absorbe `GET /links/stats`, que la passerelle déclare
    // déprécié en nommant son successeur (`user.ts:649`).
    expect(vus[0]).toContain('include=summary');
    expect(vus[0]).toContain('expand=conversation');
    expect(vus.some((url) => url.includes('/links/stats'))).toBe(false);
  });

  it('lit les actifs SOUS meta.summary — pas à la racine, pas sur la page', async () => {
    const { recuperer } = passerelle(() =>
      json(ENVELOPPE([lienServi(), lienServi({ id: 'l2', identifier: 'demo', isActive: false })], {
        totalLinks: 30,
        activeLinks: 17,
        totalUses: 400,
      })),
    );

    const carnet = await carnetDeLiens({ jeton: 'j', base: 'https://gate.test', recuperer });
    if (carnet.genre !== 'liste') throw new Error(carnet.genre);

    // Le compte est celui de TOUT le carnet — 17 actifs — et non celui de la
    // page servie, qui n'en porte qu'un.
    expect(carnet.actifs).toBe(17);
    expect(carnet.total).toBe(30);
    expect(carnet.liens).toHaveLength(2);
  });

  it('garde les liens FERMÉS — cet écran est celui où on l’apprend', async () => {
    const { recuperer } = passerelle(() =>
      json(ENVELOPPE([lienServi({ id: 'l2', identifier: 'demo', isActive: false })])),
    );

    const carnet = await carnetDeLiens({ jeton: 'j', base: 'https://gate.test', recuperer });
    if (carnet.genre !== 'liste') throw new Error(carnet.genre);

    expect(carnet.liens).toHaveLength(1);
    expect(carnet.liens[0]?.actif).toBe(false);
  });

  it('projette la capacité et l’échéance quand le lien en porte, `null` sinon', async () => {
    const { recuperer } = passerelle(() =>
      json(
        ENVELOPPE([
          lienServi({ maxUses: 50, expiresAt: '2026-12-31T23:59:00.000Z' }),
          lienServi({ id: 'l2', identifier: 'sans-borne' }),
        ]),
      ),
    );

    const carnet = await carnetDeLiens({ jeton: 'j', base: 'https://gate.test', recuperer });
    if (carnet.genre !== 'liste') throw new Error(carnet.genre);

    expect(carnet.liens[0]?.capacite).toBe(50);
    expect(carnet.liens[0]?.expireA).toBe('2026-12-31T23:59:00.000Z');
    // Un lien sans borne rend `null`, jamais `0` ni une date fabriquée : `0`
    // se lirait « épuisé ».
    expect(carnet.liens[1]?.capacite).toBeNull();
    expect(carnet.liens[1]?.expireA).toBeNull();
  });

  it('compte des ADMISSIONS, et l’écran ne dira jamais « vues »', async () => {
    const { recuperer } = passerelle(() => json(ENVELOPPE([lienServi({ currentUses: 4 })])));

    const carnet = await carnetDeLiens({ jeton: 'j', base: 'https://gate.test', recuperer });
    if (carnet.genre !== 'liste') throw new Error(carnet.genre);

    // `currentUses` n'a qu'un producteur — `claimLinkUse`
    // (`routes/conversations/link-admission.ts:192`), sur le chemin
    // d'admission, borné par `maxUses`. Il s'incrémente quand quelqu'un ENTRE.
    // Aucun compteur de vues n'existe sur un lien de partage.
    expect(carnet.liens[0]?.utilisations).toBe(4);
  });

  it('rend ZÉRO plutôt qu’un chiffre inventé quand la passerelle ne calcule rien', async () => {
    // `meta` est ABSENT « quand rien n'a été calculé — jamais un objet vide »
    // (`user.ts:424`). L'écran affichera alors la liste sans son compte, ce qui
    // est la vérité ; fabriquer le total depuis la page serait un chiffre faux
    // dès la seconde page.
    const { recuperer } = passerelle(() => json(ENVELOPPE([lienServi()], null)));

    const carnet = await carnetDeLiens({ jeton: 'j', base: 'https://gate.test', recuperer });
    if (carnet.genre !== 'liste') throw new Error(carnet.genre);

    expect(carnet.actifs).toBe(0);
    expect(carnet.liens).toHaveLength(1);
  });

  it('sépare la session expirée de la panne — les liens SONT cet écran', async () => {
    // `liensDuLecteur` ne connaît qu'« indisponible » : sur le tableau de bord
    // les liens sont une section, et un refus de leur route ne doit pas éjecter
    // un lecteur que deux autres routes viennent d'accepter. Ici, un 401 n'a
    // plus rien à dégrader.
    const refus = async (statut: number) =>
      (await carnetDeLiens({
        jeton: 'j',
        base: 'https://gate.test',
        recuperer: async () => json({ success: false }, statut),
      })).genre;

    expect(await refus(401)).toBe('session-expiree');
    expect(await refus(500)).toBe('panne');

    const coupe = await carnetDeLiens({
      jeton: 'j',
      base: 'https://gate.test',
      recuperer: async () => {
        throw new Error('réseau coupé');
      },
    });
    expect(coupe.genre).toBe('panne');
  });
});

describe('fermer un lien', () => {
  const jsonRefus = (statut: number, corps: unknown = { success: false, error: 'refus' }): Response =>
    new Response(JSON.stringify(corps), { status: statut });

  it('PATCHe la BONNE adresse, avec le corps STRICT { isActive: false } — rien d’autre', async () => {
    const { recuperer, vus } = passerelle(() =>
      json({ success: true, data: { linkId: 'mshy_lagos', isActive: false } }),
    );

    const issue = await fermeUnLien({ jeton: 'j', identifiant: 'mshy_lagos', base: 'https://gate.test', recuperer });

    expect(issue).toEqual({ genre: 'fait' });
    expect(vus).toHaveLength(1);
    expect(vus[0]).toBe('https://gate.test/api/v1/links/mshy_lagos');
  });

  it('envoie EXACTEMENT { isActive: false } — le corps STRICT que le critère de fin exige', async () => {
    const boite: { recu: RequestInit | undefined } = { recu: undefined };
    const recuperer = async (_url: string, init: RequestInit): Promise<Response> => {
      boite.recu = init;
      return json({ success: true, data: {} });
    };

    await fermeUnLien({ jeton: 'j', identifiant: 'mshy_lagos', base: 'https://gate.test', recuperer });

    expect(boite.recu).toBeDefined();
    expect(boite.recu?.method).toBe('PATCH');
    expect(JSON.parse(String(boite.recu?.body))).toEqual({ isActive: false });
    expect((boite.recu?.headers as Record<string, string>).authorization).toBe('Bearer j');
  });

  it('encode l’identifiant dans l’URL', async () => {
    const { recuperer, vus } = passerelle(() => json({ success: true, data: {} }));

    await fermeUnLien({ jeton: 'j', identifiant: 'mshy demo/x', base: 'https://gate.test', recuperer });

    expect(vus[0]).toBe('https://gate.test/api/v1/links/mshy%20demo%2Fx');
  });

  it('sépare la session expirée (401) du refus (403/404) et de la panne (5xx)', async () => {
    const ferme = (statut: number, corps?: unknown) =>
      fermeUnLien({
        jeton: 'j',
        identifiant: 'mshy_lagos',
        base: 'https://gate.test',
        recuperer: async () => jsonRefus(statut, corps),
      });

    expect(await ferme(401)).toEqual({ genre: 'session-expiree' });
    expect(await ferme(500)).toEqual({ genre: 'panne' });

    // Le refus est rendu TEL QUEL — `error` est une CHAÎNE (`sendError`),
    // jamais un objet : les deux formes sont lues, la même règle que
    // `creeUnLien`.
    expect(await ferme(403, { success: false, error: 'Permissions insuffisantes pour modifier ce lien' })).toEqual({
      genre: 'refus',
      message: 'Permissions insuffisantes pour modifier ce lien',
      statut: 403,
    });
    expect(await ferme(404, { success: false, error: { message: 'Lien de partage non trouvé' } })).toEqual({
      genre: 'refus',
      message: 'Lien de partage non trouvé',
      statut: 404,
    });
  });

  it('rend une panne quand le réseau est coupé', async () => {
    const issue = await fermeUnLien({
      jeton: 'j',
      identifiant: 'mshy_lagos',
      base: 'https://gate.test',
      recuperer: async () => {
        throw new Error('réseau coupé');
      },
    });
    expect(issue).toEqual({ genre: 'panne' });
  });
});
