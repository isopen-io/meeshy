/**
 * @jest-environment node
 */

import {
  apercuDuLien,
  enregistreClic,
  resoudreLien,
  type Recuperateur,
} from '@/lib/api/links';

const reponseJson = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });

const journalisant = (
  repond: (url: string, options?: RequestInit) => Promise<Response>,
): { readonly recuperer: Recuperateur; readonly appels: readonly [string, RequestInit | undefined][] } => {
  const appels: [string, RequestInit | undefined][] = [];
  const recuperer: Recuperateur = (url, options) => {
    appels.push([String(url), options]);
    return repond(String(url), options);
  };
  return { recuperer, appels };
};

const CIBLE_SERVIE = {
  success: true,
  data: {
    kind: 'tracking',
    targetType: 'STORY',
    targetId: '507f1f77bcf86cd799439011',
    originalUrl: null,
    isActive: true,
    expiresAt: null,
  },
};

describe('resoudreLien — la seule lecture qui BLOQUE la redirection', () => {
  it('rend la cible servie par la passerelle quand le lien est actif', async () => {
    const { recuperer, appels } = journalisant(async () => reponseJson(CIBLE_SERVIE));

    const resolution = await resoudreLien({ token: '8fz3-lagos', recuperer, base: 'http://passerelle' });

    expect(resolution).toEqual({
      etat: 'servable',
      cible: {
        genre: 'tracking',
        typeDeCible: 'STORY',
        idDeCible: '507f1f77bcf86cd799439011',
        urlOriginale: null,
      },
    });
    expect(appels).toHaveLength(1);
    expect(appels[0]?.[0]).toBe('http://passerelle/api/v1/tracking-links/8fz3-lagos/resolve');
  });

  it("échappe le jeton dans le chemin — un jeton n'est pas un fragment d'URL de confiance", async () => {
    const { recuperer, appels } = journalisant(async () => reponseJson(CIBLE_SERVIE));

    await resoudreLien({ token: 'a/../admin', recuperer, base: 'http://passerelle' });

    expect(appels[0]?.[0]).toBe('http://passerelle/api/v1/tracking-links/a%2F..%2Fadmin/resolve');
  });

  /**
   * Le variant CLOS porte ce que la passerelle a DIT du lien — sa famille et son
   * échéance —, et c'est ce qui permet à l'écran clos de nommer la cause d'un
   * `TrackingLink`, que la porte d'aperçu ne connaît pas. Les jeter ici, comme
   * ce module l'a d'abord fait, revenait à payer un second aller-retour vers une
   * porte incapable de répondre.
   */
  it('rend « clos » sur un lien désactivé ou expiré, avec ce que la passerelle en dit', async () => {
    const { recuperer } = journalisant(async () =>
      reponseJson({
        success: true,
        data: { ...CIBLE_SERVIE.data, isActive: false, expiresAt: '2020-01-02T03:04:05.000Z' },
      }),
    );

    await expect(resoudreLien({ token: 't', recuperer, base: 'http://p' })).resolves.toEqual({
      etat: 'clos',
      genre: 'tracking',
      echeance: Date.parse('2020-01-02T03:04:05.000Z'),
    });
  });

  it('rend le MÊME « clos » sur un jeton inconnu — un 404 distinct serait un oracle d’énumération', async () => {
    const { recuperer } = journalisant(async () => reponseJson({ success: false }, 404));

    await expect(resoudreLien({ token: 't', recuperer, base: 'http://p' })).resolves.toEqual({
      etat: 'clos',
      genre: null,
      echeance: null,
    });
  });

  /**
   * Un jeton INCONNU ne dit ni sa famille ni son échéance : c'est le patron
   * `resolveConsumptionTarget` (§ 5.1). Dire « expiré » de ce qui n'existe pas
   * répondrait « celui-là existait » à qui balaie l'espace des jetons.
   */
  it('ne fabrique aucune charge pour un jeton que la passerelle ne trouve pas', async () => {
    const { recuperer } = journalisant(async () => reponseJson({ success: false }, 410));
    const resolution = await resoudreLien({ token: 't', recuperer, base: 'http://p' });

    expect(resolution).toEqual({ etat: 'clos', genre: null, echeance: null });
  });

  it('rend « indisponible » — jamais « clos » — quand la passerelle tombe', async () => {
    const { recuperer } = journalisant(async () => {
      throw new TypeError('fetch failed');
    });

    const resolution = await resoudreLien({ token: 't', recuperer, base: 'http://p' });

    expect(resolution.etat).toBe('indisponible');
  });

  it('rend « indisponible » sur un 500 : une panne amont ne ferme pas le lien de quelqu’un', async () => {
    const { recuperer } = journalisant(async () => reponseJson({ success: false }, 500));

    await expect(resoudreLien({ token: 't', recuperer, base: 'http://p' })).resolves.toMatchObject({
      etat: 'indisponible',
    });
  });

  it('rend « indisponible » sur un corps illisible plutôt que de fabriquer une cible', async () => {
    const { recuperer } = journalisant(
      async () => new Response('<html>proxy</html>', { status: 200 }),
    );

    await expect(resoudreLien({ token: 't', recuperer, base: 'http://p' })).resolves.toMatchObject({
      etat: 'indisponible',
    });
  });
});

describe('enregistreClic — la télémétrie ne peut RIEN casser', () => {
  it('poste ce que le SERVEUR observe, et rien qui exige un navigateur', async () => {
    const { recuperer, appels } = journalisant(async () => reponseJson({ success: true }));

    await enregistreClic({
      token: '8fz3',
      base: 'http://p',
      recuperer,
      clic: {
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
        browser: 'Safari',
        os: 'iOS',
        device: 'mobile',
        language: 'fr',
        languages: 'fr-FR,fr;q=0.9',
        referrer: 'https://www.whatsapp.com/',
        socialSource: 'WhatsApp',
        utmClickSource: 'wa',
      },
    });

    expect(appels).toHaveLength(1);
    const envoi = appels[0];
    expect(envoi?.[0]).toBe('http://p/api/v1/tracking-links/8fz3/click');
    expect(envoi?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(envoi?.[1]?.body))).toEqual({
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      browser: 'Safari',
      os: 'iOS',
      device: 'mobile',
      language: 'fr',
      languages: 'fr-FR,fr;q=0.9',
      referrer: 'https://www.whatsapp.com/',
      socialSource: 'WhatsApp',
      utmClickSource: 'wa',
    });
  });

  it('n’écrit aucune clé vide : un champ inconnu du serveur ne s’invente pas', async () => {
    const { recuperer, appels } = journalisant(async () => reponseJson({ success: true }));

    await enregistreClic({
      token: 't',
      base: 'http://p',
      recuperer,
      clic: { userAgent: 'ua', referrer: '', socialSource: undefined },
    });

    expect(JSON.parse(String(appels[0]?.[1]?.body))).toEqual({ userAgent: 'ua' });
  });

  it('avale toute panne — elle part APRÈS la réponse, personne ne l’attend', async () => {
    const { recuperer } = journalisant(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(
      enregistreClic({ token: 't', base: 'http://p', recuperer, clic: {} }),
    ).resolves.toBe(false);
  });
});

describe('apercuDuLien — une PROJECTION, pas une charge relayée', () => {
  it('ne retient que le nom et la description : l’identité du créateur ne voyage pas', async () => {
    const { recuperer } = journalisant(async () =>
      reponseJson({
        success: true,
        data: {
          linkId: 'mshy_lagos',
          name: 'Équipe Lagos',
          description: 'Le canal des opérations',
          creator: { id: 'u1', username: 'ibrahim', email: 'ibrahim@example.com' },
          conversation: { id: 'c1', title: 'Équipe Lagos', description: 'ops' },
          stats: { totalParticipants: 12 },
        },
      }),
    );

    const apercu = await apercuDuLien({ identifiant: 'mshy_lagos', base: 'http://p', recuperer });

    expect(apercu).toEqual({ nom: 'Équipe Lagos', description: 'Le canal des opérations' });
  });

  it('retombe sur le titre de la conversation quand le lien n’est pas nommé', async () => {
    const { recuperer } = journalisant(async () =>
      reponseJson({
        success: true,
        data: { name: null, description: null, conversation: { title: 'Équipe Lagos', description: 'ops' } },
      }),
    );

    await expect(
      apercuDuLien({ identifiant: 'x', base: 'http://p', recuperer }),
    ).resolves.toEqual({ nom: 'Équipe Lagos', description: 'ops' });
  });

  it('rend null sans jamais jeter quand l’aperçu est refusé', async () => {
    const { recuperer } = journalisant(async () => reponseJson({ success: false }, 410));

    await expect(apercuDuLien({ identifiant: 'x', base: 'http://p', recuperer })).resolves.toBeNull();
  });
});
