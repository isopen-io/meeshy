/**
 * @jest-environment node
 */

import {
  CONFIDENTIALITE,
  DOCUMENT_MEDIAS,
  EXPORT,
  HUB_MEDIAS,
  MESSAGES,
  STUB_AUDIO,
  STUB_VIDEO,
  SUPPRESSION,
} from '@/app/connecte/reglages-details-porte';
import { DOCUMENT_PREFERENCE_DEFAULTS, PRIVACY_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences';

/**
 * `app/connecte/reglages-details-porte.ts` — LES PORTES DES QUATRE
 * RÉGLAGES-DÉTAILS (spécification § 3, témoins 3, 4, 6, 7).
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

describe('CONFIDENTIALITE — GET', () => {
  it('renvoie se connecter sans jeton', async () => {
    const reponse = await CONFIDENTIALITE(new Request('https://meeshy.test/settings/privacy'));
    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fsettings%2Fprivacy');
  });

  it('sert les quatre bascules avec `aria-checked` reflétant le document SERVI', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/preferences': () =>
        json({ success: true, data: { privacy: { ...PRIVACY_PREFERENCE_DEFAULTS, showOnlineStatus: false } } }),
    });

    const html = await (await CONFIDENTIALITE(requete('https://meeshy.test/settings/privacy'), recuperer)).text();
    const zone = html.slice(html.indexOf('name="cle" value="showOnlineStatus"'), html.indexOf('name="cle" value="showOnlineStatus"') + 400);

    expect(zone).toContain('aria-checked="false"');
  });

  it('renvoie se connecter sur un 401', async () => {
    const { recuperer } = passerelle({ '/api/v1/me/preferences': () => json({ success: false }, 401) });
    const reponse = await CONFIDENTIALITE(requete('https://meeshy.test/settings/privacy'), recuperer);
    expect(reponse.status).toBe(302);
  });

  it('dessine la panne quand la passerelle se tait', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };
    const reponse = await CONFIDENTIALITE(requete('https://meeshy.test/settings/privacy'), recuperer);
    expect(reponse.status).toBe(503);
  });
});

describe('CONFIDENTIALITE — POST', () => {
  it('poste EXACTEMENT { privacy: { <cle>: <valeur> } } et redirige vers ?regle=<cle>', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { privacy: PRIVACY_PREFERENCE_DEFAULTS } }),
    });

    const reponse = await CONFIDENTIALITE(
      requete('https://meeshy.test/settings/privacy', { method: 'POST', corps: 'cle=showOnlineStatus&valeur=false' }),
      recuperer,
    );

    const patch = vus.find((v) => v.options.method === 'PATCH');
    expect(JSON.parse(String(patch?.options.body))).toEqual({ privacy: { showOnlineStatus: false } });
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/settings/privacy?regle=showOnlineStatus');
  });

  it('refuse une `cle` hors table — 400, AUCUN appel (hideProfileFromSearch y compris)', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { privacy: PRIVACY_PREFERENCE_DEFAULTS } }),
    });

    const reponse = await CONFIDENTIALITE(
      requete('https://meeshy.test/settings/privacy', { method: 'POST', corps: 'cle=hideProfileFromSearch&valeur=true' }),
      recuperer,
    );

    expect(reponse.status).toBe(400);
    expect(vus).toEqual([]);
  });

  it('refuse une origine ÉTRANGÈRE avant tout appel', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { privacy: PRIVACY_PREFERENCE_DEFAULTS } }),
    });

    const reponse = await CONFIDENTIALITE(
      requete('https://meeshy.test/settings/privacy', {
        method: 'POST',
        corps: 'cle=showOnlineStatus&valeur=false',
        origine: 'https://ailleurs.test',
      }),
      recuperer,
    );

    expect(vus).toEqual([]);
    expect(reponse.status).not.toBe(303);
  });

  it('re-sert le document RELU, avec un bandeau d’échec, quand le PATCH échoue (403 CONSENT_REQUIRED simulé)', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/preferences': (_url, options) =>
        options.method === 'PATCH'
          ? json({ success: false, error: 'CONSENT_REQUIRED' }, 403)
          : json({ success: true, data: { privacy: { ...PRIVACY_PREFERENCE_DEFAULTS, showOnlineStatus: false } } }),
    });

    const reponse = await CONFIDENTIALITE(
      requete('https://meeshy.test/settings/privacy', { method: 'POST', corps: 'cle=showOnlineStatus&valeur=true' }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(200);
    expect(html).toMatch(/role="alert"/);
    const zone = html.slice(html.indexOf('name="cle" value="showOnlineStatus"'), html.indexOf('name="cle" value="showOnlineStatus"') + 400);
    expect(zone).toContain('aria-checked="false"');
  });
});

describe('EXPORT', () => {
  it('renvoie se connecter sans jeton', async () => {
    const reponse = await EXPORT(new Request('https://meeshy.test/settings/privacy/export'));
    expect(reponse.status).toBe(302);
  });

  it('GET rend le formulaire de demande', async () => {
    const reponse = await EXPORT(requete('https://meeshy.test/settings/privacy/export'));
    expect(await reponse.text()).toContain('<form method="post">');
  });

  it('POST relaie `GET /me/export?format=json&types=profile,messages,contacts` et répond en pièce jointe', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/export': () => json({ success: true, data: { exportDate: '2026-09-06', profile: { id: 'u1' } } }),
    });

    const reponse = await EXPORT(requete('https://meeshy.test/settings/privacy/export', { method: 'POST' }), recuperer);

    expect(vus[0]?.url).toContain('/api/v1/me/export?format=json&types=profile,messages,contacts');
    expect(reponse.headers.get('content-disposition')).toContain('attachment');
    expect(JSON.parse(await reponse.text())).toEqual({ exportDate: '2026-09-06', profile: { id: 'u1' } });
  });

  it('dessine la panne plutôt qu’un fichier vide', async () => {
    const { recuperer } = passerelle({ '/api/v1/me/export': () => json({ success: false }, 500) });
    const reponse = await EXPORT(requete('https://meeshy.test/settings/privacy/export', { method: 'POST' }), recuperer);
    expect(reponse.status).toBe(503);
  });
});

describe('SUPPRESSION', () => {
  it('GET rend le formulaire (phrase + mot de passe)', async () => {
    const reponse = await SUPPRESSION(requete('https://meeshy.test/settings/privacy/delete'));
    const html = await reponse.text();
    expect(html).toContain('name="confirmationPhrase"');
    expect(html).toContain('name="currentPassword"');
  });

  it('POST phrase ≠ SUPPRIMER MON COMPTE → 422 SANS appel', async () => {
    const { recuperer, vus } = passerelle({ '/api/v1/me/account/deletion': () => json({ success: true }) });
    const reponse = await SUPPRESSION(
      requete('https://meeshy.test/settings/privacy/delete', { method: 'POST', corps: 'confirmationPhrase=oups&currentPassword=x' }),
      recuperer,
    );
    expect(reponse.status).toBe(422);
    expect(vus).toEqual([]);
  });

  it('POST mot de passe vide → 422 SANS appel', async () => {
    const { recuperer, vus } = passerelle({ '/api/v1/me/account/deletion': () => json({ success: true }) });
    const reponse = await SUPPRESSION(
      requete('https://meeshy.test/settings/privacy/delete', {
        method: 'POST',
        corps: `confirmationPhrase=${encodeURIComponent('SUPPRIMER MON COMPTE')}&currentPassword=`,
      }),
      recuperer,
    );
    expect(reponse.status).toBe(422);
    expect(vus).toEqual([]);
  });

  it('200 → redirige/rend l’état « demandée »', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/account/deletion': () => json({ success: true, data: { message: 'ok' } }),
    });
    const reponse = await SUPPRESSION(
      requete('https://meeshy.test/settings/privacy/delete', {
        method: 'POST',
        corps: `confirmationPhrase=${encodeURIComponent('SUPPRIMER MON COMPTE')}&currentPassword=secret`,
      }),
      recuperer,
    );
    expect(await reponse.text()).toContain('e-mail de confirmation');
  });

  it('400 INVALID_PASSWORD → re-rendu avec le motif', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/account/deletion': () => json({ success: false, error: 'Mot de passe incorrect', code: 'INVALID_PASSWORD' }, 400),
    });
    const reponse = await SUPPRESSION(
      requete('https://meeshy.test/settings/privacy/delete', {
        method: 'POST',
        corps: `confirmationPhrase=${encodeURIComponent('SUPPRIMER MON COMPTE')}&currentPassword=faux`,
      }),
      recuperer,
    );
    expect(reponse.status).toBe(400);
    expect(await reponse.text()).toContain('incorrect');
  });

  it('409 ALREADY_PENDING et 409 NO_EMAIL → états distincts, nommés', async () => {
    const pending = passerelle({
      '/api/v1/me/account/deletion': () =>
        json({ success: false, error: 'Une demande de suppression est déjà en cours', code: 'ALREADY_PENDING' }, 409),
    });
    const reponseA = await SUPPRESSION(
      requete('https://meeshy.test/settings/privacy/delete', {
        method: 'POST',
        corps: `confirmationPhrase=${encodeURIComponent('SUPPRIMER MON COMPTE')}&currentPassword=secret`,
      }),
      pending.recuperer,
    );
    expect(await reponseA.text()).toContain('déjà en cours');

    const noEmail = passerelle({
      '/api/v1/me/account/deletion': () => json({ success: false, error: 'sans email', code: 'NO_EMAIL' }, 409),
    });
    const reponseB = await SUPPRESSION(
      requete('https://meeshy.test/settings/privacy/delete', {
        method: 'POST',
        corps: `confirmationPhrase=${encodeURIComponent('SUPPRIMER MON COMPTE')}&currentPassword=secret`,
      }),
      noEmail.recuperer,
    );
    const texteB = await reponseB.text();
    expect(texteB).toContain('e-mail');
    expect(texteB).not.toContain('déjà en cours');
  });
});

describe('les écrans du hub Médias', () => {
  it('HUB_MEDIAS ne fait AUCUN appel passerelle', async () => {
    const reponse = await HUB_MEDIAS(requete('https://meeshy.test/settings/media'));
    expect(reponse.status).toBe(200);
    expect(await reponse.text()).toContain('href="/settings/media/document"');
  });

  it('STUB_AUDIO et STUB_VIDEO ne font AUCUN appel passerelle, aucun contrôle', async () => {
    const reponseAudio = await STUB_AUDIO(requete('https://meeshy.test/settings/media/audio'));
    const reponseVideo = await STUB_VIDEO(requete('https://meeshy.test/settings/media/video'));
    expect(await reponseAudio.text()).not.toContain('<form');
    expect(await reponseVideo.text()).not.toContain('<form');
  });
});

describe('DOCUMENT_MEDIAS', () => {
  it('GET sert le commutateur depuis `data.document.autoDownloadEnabled`', async () => {
    const { recuperer } = passerelle({
      '/api/v1/me/preferences': () =>
        json({ success: true, data: { document: { ...DOCUMENT_PREFERENCE_DEFAULTS, autoDownloadEnabled: true } } }),
    });

    const html = await (await DOCUMENT_MEDIAS(requete('https://meeshy.test/settings/media/document'), recuperer)).text();
    const zone = html.slice(html.indexOf('name="cle" value="autoDownloadEnabled"'), html.indexOf('name="cle" value="autoDownloadEnabled"') + 400);
    expect(zone).toContain('aria-checked="true"');
  });

  it('POST → PATCH { document: { autoDownloadEnabled } } + PRG', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { document: DOCUMENT_PREFERENCE_DEFAULTS } }),
    });

    const reponse = await DOCUMENT_MEDIAS(
      requete('https://meeshy.test/settings/media/document', { method: 'POST', corps: 'cle=autoDownloadEnabled&valeur=true' }),
      recuperer,
    );

    const patch = vus.find((v) => v.options.method === 'PATCH');
    expect(JSON.parse(String(patch?.options.body))).toEqual({ document: { autoDownloadEnabled: true } });
    expect(reponse.status).toBe(303);
  });

  it('refuse une `cle` autre que `autoDownloadEnabled` — 400, AUCUN appel', async () => {
    const { recuperer, vus } = passerelle({
      '/api/v1/me/preferences': () => json({ success: true, data: { document: DOCUMENT_PREFERENCE_DEFAULTS } }),
    });
    const reponse = await DOCUMENT_MEDIAS(
      requete('https://meeshy.test/settings/media/document', { method: 'POST', corps: 'cle=storageQuota&valeur=true' }),
      recuperer,
    );
    expect(reponse.status).toBe(400);
    expect(vus).toEqual([]);
  });
});

describe('MESSAGES', () => {
  it('rend l’état dessiné derrière le jeton, sans appel passerelle', async () => {
    const reponse = await MESSAGES(requete('https://meeshy.test/settings/message'));
    expect(reponse.status).toBe(200);
    expect(await reponse.text()).not.toContain('<form');
  });

  it('renvoie se connecter sans jeton', async () => {
    const reponse = await MESSAGES(new Request('https://meeshy.test/settings/message'));
    expect(reponse.status).toBe(302);
  });
});

/**
 * LES DEUX CORRECTIONS DE LA REVUE sur `/settings/privacy/delete` — la loi que
 * `reglages-feuille.ts` énonce pour TOUS les écrans de réglages (« un champ en
 * erreur garde sa saisie ») et la distinction des deux refus locaux.
 */
describe('SUPPRESSION — un refus dit LEQUEL, et ne fait pas recommencer ce qui était juste', () => {
  const poste = (corps: string): Promise<Response> =>
    SUPPRESSION(requete('https://meeshy.test/settings/privacy/delete', { method: 'POST', corps }));

  it('un mot de passe VIDE ne se dit pas « recopiez la phrase » — la phrase était juste', async () => {
    const html = await (
      await poste('confirmationPhrase=SUPPRIMER+MON+COMPTE&currentPassword=')
    ).text();

    expect(html).toContain('Votre mot de passe est requis');
    expect(html).not.toContain('Recopiez exactement');
  });

  it('repose la phrase déjà tapée, et JAMAIS le mot de passe', async () => {
    const html = await (
      await poste('confirmationPhrase=SUPPRIMER+MON+COMPTE&currentPassword=')
    ).text();

    expect(html).toContain('value="SUPPRIMER MON COMPTE"');
    expect(html).not.toContain('secret-du-lecteur');
  });

  it('une phrase FAUSSE la repose telle quelle — on corrige, on ne retape pas', async () => {
    const html = await (
      await poste('confirmationPhrase=supprimer+mon+compte&currentPassword=secret-du-lecteur')
    ).text();

    expect(html).toContain('Recopiez exactement');
    expect(html).toContain('value="supprimer mon compte"');
    expect(html).not.toContain('secret-du-lecteur');
  });

  it('n’annonce qu’UNE alerte — l’avertissement permanent n’en est pas une', async () => {
    const html = await (await SUPPRESSION(requete('https://meeshy.test/settings/privacy/delete'))).text();

    // Le `role="alert"` de la FEUILLE (`.reglages .avis[role="alert"]`) n'est
    // pas un nœud annoncé : l'assertion porte sur le BALISAGE.
    expect(html.match(/<p class="avis" role="alert"/g) ?? []).toHaveLength(0);
    expect(html).toContain('<p class="avis">');
    expect(html).toContain('IRRÉVERSIBLE');
  });
});
