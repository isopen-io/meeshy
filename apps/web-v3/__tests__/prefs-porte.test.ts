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
    // L'avis NOMME la rangée réglée — sans quoi, treize rangées identiques,
    // il dirait « c'est enregistré » sans dire QUOI.
    expect(html).toContain('Notifications push : réglage enregistré.');
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
      '/api/v1/me/preferences': (_url, options) =>
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

describe('la porte de /notifications/preferences — POST du geste `fenetre` (édition DND)', () => {
  it('poste EXACTEMENT { notification: { dndStartTime, dndEndTime, dndUtcOffsetMinutes } } et redirige vers ?regle=fenetre-dnd', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'geste=fenetre&dndStartTime=23%3A30&dndEndTime=07%3A00&fuseau=120',
      }),
      recuperer,
    );

    const patch = vus.find((v) => v.options.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(String(patch?.options.body))).toEqual({
      notification: { dndStartTime: '23:30', dndEndTime: '07:00', dndUtcOffsetMinutes: 120 },
    });
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/notifications/preferences?regle=fenetre-dnd');
  });

  it('`fuseau=auto` SANS cookie de fuseau n’écrit AUCUN décalage — la valeur stockée survit', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'geste=fenetre&dndStartTime=22%3A00&dndEndTime=08%3A00&fuseau=auto',
      }),
      recuperer,
    );

    const patch = vus.find((v) => v.options.method === 'PATCH');
    expect(JSON.parse(String(patch?.options.body))).toEqual({
      notification: { dndStartTime: '22:00', dndEndTime: '08:00' },
    });
  });

  /**
   * LE TÉMOIN DE LA MESURE (défaut relevé en revue) : « Fuseau de cet appareil »
   * n'annonçait un fuseau et n'en mesurait aucun — la plage d'un lecteur de
   * Paris se décalait de deux heures, `isWithinDnd` évaluant en UTC
   * (`packages/shared/utils/notification-dnd.ts:56`). Le décalage vient du
   * cookie que le fil pose déjà (`lib/temps.ts` › `COOKIE_DE_FUSEAU`), jamais
   * d'un second mécanisme.
   *
   * Le témoin porte sur un fuseau SANS heure d'été (`Asia/Kolkata`, +05:30) :
   * une zone à DST rendrait l'assertion dépendante de la date d'exécution.
   */
  it('`fuseau=auto` AVEC le cookie de fuseau écrit le décalage MESURÉ de l’appareil', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'geste=fenetre&dndStartTime=22%3A00&dndEndTime=08%3A00&fuseau=auto',
        headers: { cookie: `${COOKIE}; meeshy_tz=Asia%2FKolkata` },
      }),
      recuperer,
    );

    const patch = vus.find((v) => v.options.method === 'PATCH');
    expect(JSON.parse(String(patch?.options.body))).toEqual({
      notification: { dndStartTime: '22:00', dndEndTime: '08:00', dndUtcOffsetMinutes: 330 },
    });
  });

  it('l’option « cet appareil » NOMME le décalage mesuré, et ne le promet pas quand il manque', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    const avec = await (
      await PREFERENCES(
        requete('https://meeshy.test/notifications/preferences', {
          headers: { cookie: `${COOKIE}; meeshy_tz=Asia%2FKolkata` },
        }),
        recuperer,
      )
    ).text();
    const sans = await (await PREFERENCES(requete('https://meeshy.test/notifications/preferences'), recuperer)).text();

    expect(avec).toContain('Fuseau de cet appareil (UTC+05:30)');
    expect(sans).not.toContain('Fuseau de cet appareil');
    expect(sans).toContain('Ne pas changer le fuseau');
  });

  /**
   * UNE HEURE ILLISIBLE SE DIT. `<input type="time">` retombe en champ TEXTE
   * là où il n'est pas supporté : « 9:00 » tapé à la main est un chemin de
   * lecteur, et le 400 sans corps y était un écran blanc. Ce qui reste
   * INTERDIT est l'ÉCRITURE : le PATCH ne part pas.
   */
  it.each(['25:00', '9:00', ''])('une heure invalide (%s) se DIT — 422, aucune ÉCRITURE', async (heure) => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: `geste=fenetre&dndStartTime=${encodeURIComponent(heure)}&dndEndTime=08%3A00&fuseau=auto`,
      }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(vus.filter((v) => v.options.method === 'PATCH')).toEqual([]);
    expect(html).toContain('Une heure au format HH:MM est requise');
  });

  it('un `fuseau` hors de la table fermée est refusé SANS écriture', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'geste=fenetre&dndStartTime=22%3A00&dndEndTime=08%3A00&fuseau=13',
      }),
      recuperer,
    );

    expect(reponse.status).toBe(422);
    expect(vus.filter((v) => v.options.method === 'PATCH')).toEqual([]);
  });

  it('refuse une origine ÉTRANGÈRE avant tout appel', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'geste=fenetre&dndStartTime=22%3A00&dndEndTime=08%3A00&fuseau=auto',
        origine: 'https://ailleurs.test',
      }),
      recuperer,
    );

    expect(vus).toEqual([]);
    expect(reponse.status).not.toBe(303);
  });
});

/**
 * LE GESTE `push` — L'ABONNEMENT DE CET APPAREIL (#5391, § 3.2, § 4.2 de la
 * spécification). Les quatre variables Firebase sont posées/retirées
 * autour de chaque test — `configurationFirebase()` (`prefs-porte.ts`) les
 * lit à l'appel, jamais au chargement du module.
 */
const ENV_FIREBASE: Readonly<Record<string, string>> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'AIza-test',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'meeshy-test',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123:web:abc',
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: 'BExxx',
};

const CLES_ENV_FIREBASE = Object.keys(ENV_FIREBASE);

const avecEnvFirebase = <T>(execute: () => Promise<T>): Promise<T> => {
  const avant: Record<string, string | undefined> = {};
  for (const cle of CLES_ENV_FIREBASE) {
    avant[cle] = process.env[cle];
    process.env[cle] = ENV_FIREBASE[cle];
  }
  return execute().finally(() => {
    for (const cle of CLES_ENV_FIREBASE) {
      if (avant[cle] === undefined) delete process.env[cle];
      else process.env[cle] = avant[cle];
    }
  });
};

describe('la porte de /notifications/preferences — GET, la rangée push', () => {
  it('sans configuration Firebase, l’état servi est `indisponible`, sans appel à /users/me/devices', async () => {
    const { recuperer, vus } = NOMINALE();

    const html = await (await PREFERENCES(requete('https://meeshy.test/notifications/preferences'), recuperer)).text();

    expect(html).toContain('Sur cet appareil');
    expect(vus.some((v) => v.url.includes('/users/me/devices'))).toBe(false);
    const zone = html.slice(html.indexOf('name="geste" value="push"'), html.indexOf('name="geste" value="push"') + 500);
    expect(zone).toContain('disabled');
  });

  it('avec configuration Firebase et un cookie appareil ABONNÉ (present dans /users/me/devices), aria-checked="true"', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
      '/api/v1/users/me/devices': () =>
        json({ success: true, data: [{ id: 'pt-1', deviceId: 'device-42', platform: 'web', isActive: true }] }),
    });

    const html = await avecEnvFirebase(async () =>
      (
        await PREFERENCES(
          requete('https://meeshy.test/notifications/preferences', { headers: { cookie: `${COOKIE}; meeshy_v3_push_appareil=device-42` } }),
          recuperer,
        )
      ).text(),
    );

    const zone = html.slice(html.indexOf('name="geste" value="push"'), html.indexOf('name="geste" value="push"') + 500);
    expect(zone).toContain('aria-checked="true"');
    expect(zone).toContain('name="valeur" value="false"');
    expect(html).toContain('data-firebase-api-key="AIza-test"');
  });

  it('avec configuration Firebase et AUCUN cookie appareil, l’état est `non-abonne` SANS appeler /users/me/devices', async () => {
    const { recuperer, vus } = NOMINALE();

    const html = await avecEnvFirebase(async () =>
      (await PREFERENCES(requete('https://meeshy.test/notifications/preferences'), recuperer)).text(),
    );

    expect(vus.some((v) => v.url.includes('/users/me/devices'))).toBe(false);
    const zone = html.slice(html.indexOf('name="geste" value="push"'), html.indexOf('name="geste" value="push"') + 500);
    expect(zone).toContain('aria-checked="false"');
    expect(zone).toContain('name="valeur" value="true"');
  });

  it('un cookie appareil qui ne figure PAS parmi les appareils actifs rend `non-abonne`', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
      '/api/v1/users/me/devices': () => json({ success: true, data: [] }),
    });

    const html = await avecEnvFirebase(async () =>
      (
        await PREFERENCES(
          requete('https://meeshy.test/notifications/preferences', { headers: { cookie: `${COOKIE}; meeshy_v3_push_appareil=device-inconnu` } }),
          recuperer,
        )
      ).text(),
    );

    const zone = html.slice(html.indexOf('name="geste" value="push"'), html.indexOf('name="geste" value="push"') + 500);
    expect(zone).toContain('aria-checked="false"');
  });
});

describe('la porte de /notifications/preferences — POST du geste `push`', () => {
  it('valeur=false, cookie appareil présent ⇒ DELETE {deviceId}, 303 vers ?regle=push-desabonne', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
      '/api/v1/users/register-device-token': () => json({ success: true, data: { deletedCount: 1 } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'geste=push&valeur=false',
        headers: { cookie: `${COOKIE}; meeshy_v3_push_appareil=device-42` },
      }),
      recuperer,
    );

    const suppression = vus.find((v) => v.options.method === 'DELETE');
    expect(suppression).toBeDefined();
    expect(JSON.parse(String(suppression?.options.body))).toEqual({ deviceId: 'device-42' });
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/notifications/preferences?regle=push-desabonne');
  });

  it('valeur=false SANS cookie appareil ⇒ 200, motif nommé, ZÉRO appel à la passerelle', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', { method: 'POST', corps: 'geste=push&valeur=false' }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    expect(vus.filter((v) => v.options.method === 'DELETE')).toEqual([]);
    expect(html).toContain('Aucun abonnement connu sur cet appareil.');
  });

  it('valeur=true, champ `abonnement` rempli ⇒ POST register-device-token, 303 vers ?regle=push-abonne', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
      '/api/v1/users/register-device-token': () => json({ success: true, data: { id: 'pt-1', isNew: true } }),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'geste=push&valeur=true&abonnement=fcm-token-abc&deviceId=device-42',
      }),
      recuperer,
    );

    const enregistrement = vus.find((v) => v.options.method === 'POST' && v.url.includes('register-device-token'));
    expect(enregistrement).toBeDefined();
    expect(JSON.parse(String(enregistrement?.options.body))).toEqual({
      token: 'fcm-token-abc',
      type: 'fcm',
      platform: 'web',
      deviceId: 'device-42',
      deviceName: 'Web v3',
    });
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/notifications/preferences?regle=push-abonne');
  });

  it('valeur=true, champ `abonnement` VIDE (sans JavaScript) ⇒ 200, motif « exige JavaScript », ZÉRO appel gateway', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', { method: 'POST', corps: 'geste=push&valeur=true' }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    expect(vus.some((v) => v.url.includes('register-device-token'))).toBe(false);
    expect(html).toContain('S’abonner exige JavaScript');
  });

  it('refuse une origine ÉTRANGÈRE avant tout appel', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'geste=push&valeur=false',
        origine: 'https://ailleurs.test',
      }),
      recuperer,
    );

    expect(vus).toEqual([]);
    expect(reponse.status).not.toBe(303);
  });

  it('renvoie se connecter quand register-device-token répond 401', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { notification: DOCUMENT_SERVI } }),
      '/api/v1/users/register-device-token': () => json({ success: false }, 401),
    });

    const reponse = await PREFERENCES(
      requete('https://meeshy.test/notifications/preferences', {
        method: 'POST',
        corps: 'geste=push&valeur=true&abonnement=fcm-token-abc&deviceId=device-42',
      }),
      recuperer,
    );

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fnotifications%2Fpreferences');
  });
});
