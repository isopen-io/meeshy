/**
 * @jest-environment node
 */

import {
  APPLICATION,
  CARREFOUR,
  CHANGE_LE_MOT_DE_PASSE,
  CHANGE_LE_THEME,
  ENREGISTRE,
  PROFIL,
  RETIRE_UN_APPAREIL,
  SECURITE,
} from '@/app/connecte/reglages-porte';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PORTE des réglages, c'est-à-dire ce qu'elle
 * décide AVANT de rendre quoi que ce soit. Quatre d'entre eux gardent des
 * choses qu'aucune assertion de rendu n'attraperait :
 *
 *   • le carrefour et l'apparence NE DEMANDENT RIEN à la passerelle — un appel
 *     de plus sur une 3G rurale est une lenteur, donc un bug ;
 *   • tout POST est un Post/Redirect/Get, sinon un rechargement rejouerait le
 *     retrait d'un appareil ;
 *   • un POST d'origine ÉTRANGÈRE est refusé AVANT d'atteindre la passerelle,
 *     sans quoi un autre site changerait le profil du lecteur — ou tenterait
 *     des mots de passe depuis son navigateur ;
 *   • un mot de passe n'est PAS rogné : les espaces en font partie.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';

const requete = (
  url: string,
  init: RequestInit & { readonly origine?: string | null; readonly cookie?: string } = {},
): Request => {
  const { origine = 'https://meeshy.test', cookie = COOKIE, ...reste } = init;
  return new Request(url, {
    ...reste,
    headers: {
      cookie,
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

const poste = (url: string, champs: Readonly<Record<string, string>>, origine?: string | null): Request =>
  requete(url, { method: 'POST', body: formulaire(champs), ...(origine === undefined ? {} : { origine }) });

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const MOI = { success: true, data: { id: 'u1', displayName: 'Amina D.', username: 'amina', systemLanguage: 'fr' } };

/** Une passerelle de bouchon qui ENREGISTRE ce qu'on lui demande. */
const passerelle = (parChemin: Readonly<Record<string, (init: RequestInit) => Response>>) => {
  const vus: { url: string; methode: string; corps: string | null }[] = [];
  const recuperer = async (url: string, init: RequestInit): Promise<Response> => {
    vus.push({
      url,
      methode: String(init.method ?? 'GET'),
      corps: typeof init.body === 'string' ? init.body : null,
    });
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1](init);
  };
  return { recuperer, vus };
};

describe('la loi commune des six portes', () => {
  it.each([
    ['/settings', CARREFOUR],
    ['/settings/profile', PROFIL],
    ['/settings/application', APPLICATION],
    ['/settings/security', SECURITE],
  ] as const)('renvoie se connecter sans jeton (%s)', async (chemin, porte) => {
    const reponse = await porte(new Request(`https://meeshy.test${chemin}`));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe(`/login?returnUrl=${encodeURIComponent(chemin)}`);
  });
});

describe('le carrefour', () => {
  /**
   * IL NE REND QUE DES LIENS : ni nom, ni compteur. Payer `/auth/me` pour
   * décider s'il faut le servir serait un aller-retour offert à une page que la
   * destination refusera de toute façon si le jeton ne vaut plus.
   */
  it('ne demande RIEN à la passerelle', async () => {
    const { recuperer, vus } = passerelle({});
    const reponse = await CARREFOUR(requete('https://meeshy.test/settings'));

    expect(reponse.status).toBe(200);
    expect(vus).toEqual([]);
    expect(recuperer).toBeDefined();
  });
});

describe('le profil', () => {
  it('sert ce que /auth/me donne, et rien qu’un seul appel', async () => {
    const { recuperer, vus } = passerelle({ '/auth/me': () => json(MOI) });

    const html = await (await PROFIL(requete('https://meeshy.test/settings/profile'), recuperer)).text();

    expect(html).toContain('Amina D.');
    expect(html).toContain('@amina');
    // Cet écran ne rend AUCUNE conversation : lui en faire demander serait une
    // lenteur payée sur une 3G rurale.
    expect(vus.map(({ url }) => url).filter((url) => url.includes('/conversations'))).toEqual([]);
    expect(vus).toHaveLength(1);
  });

  it('renvoie se connecter quand la passerelle refuse le jeton', async () => {
    const { recuperer } = passerelle({ '/auth/me': () => json({}, 401) });

    const reponse = await PROFIL(requete('https://meeshy.test/settings/profile'), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toContain('/login');
  });

  it('dessine la panne quand la passerelle se tait', async () => {
    const { recuperer } = passerelle({ '/auth/me': () => json({}, 500) });

    expect((await PROFIL(requete('https://meeshy.test/settings/profile'), recuperer)).status).toBe(503);
  });
});

describe('l’écriture du profil', () => {
  it('refuse un POST d’origine étrangère AVANT d’atteindre la passerelle', async () => {
    const { recuperer, vus } = passerelle({});

    const reponse = await ENREGISTRE(
      poste('https://meeshy.test/settings/profile/edit', { nomAffiche: 'Pirate' }, 'https://ailleurs.test'),
      recuperer,
    );

    expect(reponse.status).toBe(403);
    expect(vus).toEqual([]);
  });

  it('n’envoie QUE les huit champs que PATCH /users/me accepte', async () => {
    const { recuperer, vus } = passerelle({ '/users/me': () => json({ success: true }) });

    await ENREGISTRE(
      poste('https://meeshy.test/settings/profile/edit', { nomAffiche: 'Amina D.', bio: 'Salut', email: 'pirate@x.y' }),
      recuperer,
    );

    const corps = JSON.parse(vus[0]?.corps ?? '{}') as Record<string, unknown>;
    expect(vus[0]?.methode).toBe('PATCH');
    expect(Object.keys(corps).sort()).toEqual([
      'bio',
      'customDestinationLanguage',
      'displayName',
      'firstName',
      'lastName',
      'regionalLanguage',
      'systemLanguage',
    ]);
    expect(corps.email).toBeUndefined();
  });

  it('redirige après un succès — sans quoi un rechargement rejouerait l’écriture', async () => {
    const { recuperer } = passerelle({ '/users/me': () => json({ success: true }) });

    const reponse = await ENREGISTRE(
      poste('https://meeshy.test/settings/profile/edit', { nomAffiche: 'Amina D.' }),
      recuperer,
    );

    // 303, pas 302 : c'est le statut qui FORCE le GET sur la destination.
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/settings/profile/edit?enregistre');
  });

  /**
   * LE REFUS NE REDIRIGE PAS : il n'y a rien à protéger du rejeu quand rien
   * n'a été écrit, et une redirection coûterait la saisie du lecteur.
   */
  it('re-sert le formulaire avec la saisie et le motif de la passerelle', async () => {
    const { recuperer } = passerelle({
      '/users/me': () => json({ success: false, error: { message: 'Display name too long' } }, 400),
    });

    const reponse = await ENREGISTRE(
      poste('https://meeshy.test/settings/profile/edit', { nomAffiche: 'Un nom vraiment très long' }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(html).toContain('Un nom vraiment très long');
    expect(html).toContain('Display name too long');
  });
});

describe('l’apparence', () => {
  it('ne demande RIEN à la passerelle', async () => {
    const { vus } = passerelle({});

    expect((await APPLICATION(requete('https://meeshy.test/settings/application'))).status).toBe(200);
    expect(vus).toEqual([]);
  });

  it('coche le thème que le cookie porte', async () => {
    const reponse = await APPLICATION(
      requete('https://meeshy.test/settings/application', { cookie: `${COOKIE}; meeshy_theme=light` }),
    );

    expect(await reponse.text()).toContain('value="clair" checked');
  });

  it('pose le cookie et redirige — c’est ce qui donne au contrôle son effet', async () => {
    const reponse = await CHANGE_LE_THEME(poste('https://meeshy.test/settings/application', { theme: 'sombre' }));

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/settings/application?applique');
    expect(reponse.headers.get('set-cookie')).toContain('meeshy_theme=dark');
    expect(reponse.headers.get('set-cookie')).toContain('path=/');
  });

  /**
   * « SYSTÈME » S'ÉCRIT, IL NE S'EFFACE PAS. La première version effaçait le
   * cookie ; le script de tête, qui le recopie dans `localStorage`, relisait
   * alors le choix précédent et « comme mon système » ne rendait rien. Le
   * témoin navigateur l'a attrapé — celui-ci fixe la moitié que la porte doit
   * tenir.
   */
  it('écrit « system » pour « comme mon système », et n’efface pas', async () => {
    const reponse = await CHANGE_LE_THEME(poste('https://meeshy.test/settings/application', { theme: 'systeme' }));

    expect(reponse.headers.get('set-cookie')).toContain('meeshy_theme=system');
    expect(reponse.headers.get('set-cookie')).not.toContain('max-age=0');
  });

  it('n’écrit rien pour un thème qu’il ne reconnaît pas', async () => {
    const reponse = await CHANGE_LE_THEME(poste('https://meeshy.test/settings/application', { theme: 'fuchsia' }));

    expect(reponse.headers.get('set-cookie')).toBeNull();
    expect(reponse.headers.get('location')).toBe('/settings/application');
  });

  it('refuse un POST d’origine étrangère', async () => {
    const reponse = await CHANGE_LE_THEME(
      poste('https://meeshy.test/settings/application', { theme: 'clair' }, 'https://ailleurs.test'),
    );

    expect(reponse.status).toBe(403);
  });
});

describe('les appareils', () => {
  const AVEC_UN_APPAREIL = () =>
    passerelle({
      '/users/me/devices': (init) =>
        String(init.method ?? 'GET') === 'DELETE'
          ? json({ success: true })
          : json({ success: true, data: [{ id: 'd1', deviceName: 'iPhone', platform: 'ios' }] }),
    });

  it('retire par DELETE et redirige', async () => {
    const { recuperer, vus } = AVEC_UN_APPAREIL();

    const reponse = await RETIRE_UN_APPAREIL(
      poste('https://meeshy.test/settings/security', { appareil: 'd1' }),
      recuperer,
    );

    expect(vus[0]?.methode).toBe('DELETE');
    expect(vus[0]?.url).toContain('/users/me/devices/d1');
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/settings/security?retire');
  });

  it('dit l’échec par son propre témoin, jamais par celui du succès', async () => {
    const { recuperer } = passerelle({ '/users/me/devices': () => json({ success: false }, 404) });

    const reponse = await RETIRE_UN_APPAREIL(
      poste('https://meeshy.test/settings/security', { appareil: 'd1' }),
      recuperer,
    );

    expect(reponse.headers.get('location')).toBe('/settings/security?echoue');
  });

  it('refuse un POST d’origine étrangère AVANT d’atteindre la passerelle', async () => {
    const { recuperer, vus } = AVEC_UN_APPAREIL();

    const reponse = await RETIRE_UN_APPAREIL(
      poste('https://meeshy.test/settings/security', { appareil: 'd1' }, 'https://ailleurs.test'),
      recuperer,
    );

    expect(reponse.status).toBe(403);
    expect(vus).toEqual([]);
  });
});

describe('le mot de passe', () => {
  /**
   * UN MOT DE PASSE NE SE ROGNE PAS. Les espaces de tête et de fin en font
   * partie : les retirer refuserait un mot de passe juste, et en
   * ENREGISTRERAIT un autre que celui que le lecteur croit avoir choisi.
   */
  it('envoie les deux mots de passe TELS QUELS, espaces compris', async () => {
    const { recuperer, vus } = passerelle({ '/users/me/password': () => json({ success: true }) });

    await CHANGE_LE_MOT_DE_PASSE(
      poste('https://meeshy.test/settings/security/password', { actuel: ' ancien ', nouveau: 'nouveau  ' }),
      recuperer,
    );

    expect(JSON.parse(vus[0]?.corps ?? '{}')).toEqual({
      currentPassword: ' ancien ',
      newPassword: 'nouveau  ',
    });
  });

  it('ne demande RIEN à la passerelle quand un champ manque', async () => {
    const { recuperer, vus } = passerelle({});

    const reponse = await CHANGE_LE_MOT_DE_PASSE(
      poste('https://meeshy.test/settings/security/password', { actuel: 'ancien', nouveau: '' }),
      recuperer,
    );

    expect(reponse.status).toBe(422);
    expect(vus).toEqual([]);
  });

  it('rend le motif de la passerelle sans le recomposer', async () => {
    const { recuperer } = passerelle({
      '/users/me/password': () => json({ success: false, error: { message: 'Current password is incorrect' } }, 400),
    });

    const reponse = await CHANGE_LE_MOT_DE_PASSE(
      poste('https://meeshy.test/settings/security/password', { actuel: 'faux', nouveau: 'nouveau12' }),
      recuperer,
    );

    expect(await reponse.text()).toContain('Current password is incorrect');
  });

  it('redirige après un succès', async () => {
    const { recuperer } = passerelle({ '/users/me/password': () => json({ success: true }) });

    const reponse = await CHANGE_LE_MOT_DE_PASSE(
      poste('https://meeshy.test/settings/security/password', { actuel: 'ancien', nouveau: 'nouveau12' }),
      recuperer,
    );

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/settings/security/password?change');
  });

  it('refuse un POST d’origine étrangère AVANT d’atteindre la passerelle', async () => {
    const { recuperer, vus } = passerelle({});

    const reponse = await CHANGE_LE_MOT_DE_PASSE(
      poste('https://meeshy.test/settings/security/password', { actuel: 'a', nouveau: 'b' }, 'https://ailleurs.test'),
      recuperer,
    );

    expect(reponse.status).toBe(403);
    expect(vus).toEqual([]);
  });
});
