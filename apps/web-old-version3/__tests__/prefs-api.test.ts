/**
 * @jest-environment node
 */

import {
  apercusAutomatiques,
  basculeUnePreference,
  ecrisUnePreference,
  lisLesPreferences,
  preferencesDeNotification,
} from '@/lib/api/preferences';
import { NOTIFICATION_PREFERENCE_DEFAULTS, PRIVACY_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences';

/**
 * `lib/api/preferences.ts` — LE CLIENT DU COMPTE (spécification § 2, § 3.1).
 *
 * DEUX ROUTES RÉELLES, LUES DANS `services/gateway/src/routes/me/
 * preferences/unified-routes.ts` :
 *
 *   - `GET /api/v1/me/preferences?categories=notification` (`:150`) — rend
 *     `{ success, data: { notification: {…complet…} } }` ;
 *   - `PATCH /api/v1/me/preferences` (mode `merge` par défaut, `:229`) —
 *     corps `{ notification: { [cle]: valeur } }`, UNE seule clé.
 *
 * Ce module ne peint rien : il dit ce que la passerelle a répondu, comme ses
 * voisins `reglePreference` / `supprimePourMoi` du même fichier.
 */

const JETON = 'jeton-de-test';

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const passerelle = (repond: () => Response) => {
  const vus: { url: string; options: RequestInit }[] = [];
  const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
    vus.push({ url, options });
    return repond();
  };
  return { recuperer, vus };
};

describe('preferencesDeNotification — la lecture', () => {
  it('compose GET /api/v1/me/preferences?categories=notification avec le porteur', async () => {
    const appels: { url: string; options: RequestInit }[] = [];
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      appels.push({ url, options });
      return json({ success: true, data: { notification: NOTIFICATION_PREFERENCE_DEFAULTS } });
    };

    await preferencesDeNotification({ jeton: JETON, base: 'https://passerelle.test', recuperer });

    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe('https://passerelle.test/api/v1/me/preferences?categories=notification');
    expect((appels[0]?.options.headers as Record<string, string>).authorization).toBe(`Bearer ${JETON}`);
    expect(appels[0]?.options.method ?? 'GET').toBe('GET');
  });

  it('rend chaque clé de la table en booléen, depuis le document servi', async () => {
    const recuperer = async (): Promise<Response> =>
      json({ success: true, data: { notification: { ...NOTIFICATION_PREFERENCE_DEFAULTS, reactionEnabled: false } } });

    const issue = await preferencesDeNotification({ jeton: JETON, base: 'https://passerelle.test', recuperer });

    expect(issue.genre).toBe('document');
    if (issue.genre !== 'document') throw new Error('attendu : document');
    expect(issue.reglages.pushEnabled).toBe(true);
    expect(issue.reglages.reactionEnabled).toBe(false);
    expect(issue.reglages.dndEnabled).toBe(false);
  });

  it('rend session-expiree sur un 401', async () => {
    const recuperer = async (): Promise<Response> => json({ success: false }, 401);

    const issue = await preferencesDeNotification({ jeton: JETON, base: 'https://passerelle.test', recuperer });

    expect(issue.genre).toBe('session-expiree');
  });

  it('rend panne quand le récupérateur ne répond pas', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    const issue = await preferencesDeNotification({ jeton: JETON, base: 'https://passerelle.test', recuperer });

    expect(issue.genre).toBe('panne');
  });

  it('rend panne sur un 500', async () => {
    const recuperer = async (): Promise<Response> => json({ success: false }, 500);

    const issue = await preferencesDeNotification({ jeton: JETON, base: 'https://passerelle.test', recuperer });

    expect(issue.genre).toBe('panne');
  });
});

describe('basculeUnePreference — l’écriture', () => {
  it('compose PATCH avec UNE seule clé, jamais mode=replace', async () => {
    const appels: { url: string; options: RequestInit }[] = [];
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      appels.push({ url, options });
      return json({ success: true, data: { notification: { ...NOTIFICATION_PREFERENCE_DEFAULTS, pushEnabled: false } } });
    };

    await basculeUnePreference({ jeton: JETON, cle: 'pushEnabled', valeur: false, base: 'https://passerelle.test', recuperer });

    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe('https://passerelle.test/api/v1/me/preferences');
    expect(appels[0]?.options.method).toBe('PATCH');
    expect(JSON.parse(String(appels[0]?.options.body))).toEqual({ notification: { pushEnabled: false } });
  });

  it('rend le document relu — la réponse du PATCH est une relecture', async () => {
    const recuperer = async (): Promise<Response> =>
      json({ success: true, data: { notification: { ...NOTIFICATION_PREFERENCE_DEFAULTS, mentionEnabled: false } } });

    const issue = await basculeUnePreference({ jeton: JETON, cle: 'mentionEnabled', valeur: false, base: 'https://passerelle.test', recuperer });

    expect(issue.genre).toBe('document');
    if (issue.genre !== 'document') throw new Error('attendu : document');
    expect(issue.reglages.mentionEnabled).toBe(false);
  });

  it('rend session-expiree sur un 401', async () => {
    const recuperer = async (): Promise<Response> => json({ success: false }, 401);

    const issue = await basculeUnePreference({ jeton: JETON, cle: 'pushEnabled', valeur: false, base: 'https://passerelle.test', recuperer });

    expect(issue.genre).toBe('session-expiree');
  });

  it('rend refus sur un 400 (clé refusée par la passerelle)', async () => {
    const recuperer = async (): Promise<Response> => json({ success: false, error: 'VALIDATION_ERROR' }, 400);

    const issue = await basculeUnePreference({ jeton: JETON, cle: 'pushEnabled', valeur: false, base: 'https://passerelle.test', recuperer });

    expect(issue).toEqual({ genre: 'refus', statut: 400 });
  });

  it('rend panne sur un 500 et quand le récupérateur ne répond pas', async () => {
    const recuperer500 = async (): Promise<Response> => json({ success: false }, 500);
    const recupererCoupe = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    expect(
      (await basculeUnePreference({ jeton: JETON, cle: 'pushEnabled', valeur: false, base: 'https://passerelle.test', recuperer: recuperer500 })).genre,
    ).toBe('panne');
    expect(
      (await basculeUnePreference({ jeton: JETON, cle: 'pushEnabled', valeur: false, base: 'https://passerelle.test', recuperer: recupererCoupe })).genre,
    ).toBe('panne');
  });
});

describe('lisLesPreferences / ecrisUnePreference — la généralisation multi-catégories (ce lot)', () => {
  it('compose ?categories=a,b et rend un document PAR catégorie demandée', async () => {
    const appels: { url: string; options: RequestInit }[] = [];
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      appels.push({ url, options });
      return json({ success: true, data: { privacy: PRIVACY_PREFERENCE_DEFAULTS, document: { autoDownloadEnabled: true } } });
    };

    const issue = await lisLesPreferences({
      jeton: JETON,
      categories: ['privacy', 'document'],
      base: 'https://passerelle.test',
      recuperer,
    });

    expect(appels[0]?.url).toBe('https://passerelle.test/api/v1/me/preferences?categories=privacy,document');
    expect(issue.genre).toBe('documents');
    if (issue.genre !== 'documents') throw new Error('attendu : documents');
    expect(issue.documents.privacy?.showOnlineStatus).toBe(true);
    expect(issue.documents.document?.autoDownloadEnabled).toBe(true);
  });

  it('ecrisUnePreference compose { [categorie]: champs } — une seule catégorie par appel', async () => {
    const appels: { url: string; options: RequestInit }[] = [];
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      appels.push({ url, options });
      return json({ success: true, data: { privacy: { ...PRIVACY_PREFERENCE_DEFAULTS, showOnlineStatus: false } } });
    };

    await ecrisUnePreference({
      jeton: JETON,
      categorie: 'privacy',
      champs: { showOnlineStatus: false },
      base: 'https://passerelle.test',
      recuperer,
    });

    expect(appels[0]?.options.method).toBe('PATCH');
    expect(JSON.parse(String(appels[0]?.options.body))).toEqual({ privacy: { showOnlineStatus: false } });
  });

  it('preferencesDeNotification et basculeUnePreference restent des PROJECTIONS — même comportement observable qu’avant', async () => {
    const recuperer = async (): Promise<Response> => json({ success: true, data: { notification: NOTIFICATION_PREFERENCE_DEFAULTS } });

    const issue = await preferencesDeNotification({ jeton: JETON, base: 'https://passerelle.test', recuperer });

    expect(issue.genre).toBe('document');
  });

  it('une catégorie absente du document servi rend `panne` — le contrat non tenu, pas un refus', async () => {
    const recuperer = async (): Promise<Response> => json({ success: true, data: {} });

    const issue = await lisLesPreferences({ jeton: JETON, categories: ['privacy'], base: 'https://passerelle.test', recuperer });

    // `documents` est bien rendu (l'enveloppe est valide) ; c'est la PROJECTION
    // vers une seule catégorie qui doit rendre panne si elle en est absente.
    expect(issue.genre).toBe('documents');
    const projete = await basculeUnePreference({ jeton: JETON, cle: 'pushEnabled', valeur: true, base: 'https://passerelle.test', recuperer: async () => json({ success: true, data: {} }) });
    expect(projete.genre).toBe('panne');
  });
});

/**
 * `apercusAutomatiques` — LA PROJECTION QUI NE PEUT PAS ÉCHOUER (revue du
 * travail `reglages-details`). Elle gouverne ce que `/chats/:cle/medias`
 * CONSOMME : chaque issue de la lecture doit retomber sur l'ÉCONOMIE, jamais
 * sur la dépense ni sur un écran refusé. Le témoin énumère les issues, parce
 * qu'un seul cas vert (« ça marche quand ça marche ») ne dirait rien de la
 * DIRECTION de l'erreur.
 */
describe('apercusAutomatiques — un booléen, et l’erreur va toujours vers l’économie', () => {
  it('rend `true` seulement sur un `true` explicitement SERVI', async () => {
    const { recuperer } = passerelle(() =>
      new Response(JSON.stringify({ success: true, data: { document: { autoDownloadEnabled: true } } }), { status: 200 }),
    );

    await expect(apercusAutomatiques({ jeton: 'j', recuperer })).resolves.toBe(true);
  });

  it('demande la catégorie `document`, et elle seule', async () => {
    const { recuperer, vus } = passerelle(() =>
      new Response(JSON.stringify({ success: true, data: { document: { autoDownloadEnabled: true } } }), { status: 200 }),
    );

    await apercusAutomatiques({ jeton: 'j', recuperer });

    expect(vus[0]?.url).toContain('categories=document');
  });

  it.each([
    ['le réglage est à faux', () => new Response(JSON.stringify({ success: true, data: { document: { autoDownloadEnabled: false } } }), { status: 200 })],
    ['la catégorie manque au contrat', () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })],
    ['la session a expiré', () => new Response('{}', { status: 401 })],
    ['la passerelle refuse', () => new Response('{}', { status: 403 })],
    ['la passerelle est en panne', () => new Response('{}', { status: 500 })],
  ])('rend `false` quand %s', async (_cas, reponse) => {
    const { recuperer } = passerelle(reponse);
    await expect(apercusAutomatiques({ jeton: 'j', recuperer })).resolves.toBe(false);
  });

  it('rend `false` — jamais une exception — quand le réseau est coupé', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };
    await expect(apercusAutomatiques({ jeton: 'j', recuperer })).resolves.toBe(false);
  });
});
