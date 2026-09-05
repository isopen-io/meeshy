/**
 * @jest-environment node
 */

import { CARNET_DE_LIENS, CREE_UN_LIEN } from '@/app/connecte/liens-porte';
import { PERMISSIONS_DU_LIEN, documentDesLiens, SAISIE_NEUVE } from '@/app/connecte/liens-vue';
import { NOUVEAU_LIEN } from '@/lib/contenu/liens';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — `sheet:link` (#5071), et surtout les trois
 * décisions qu'aucune capture ne montrerait :
 *
 *   • AUCUN champ décoratif n'est rendu — `allowedCountries`, que la passerelle
 *     accepte et n'applique pas, est le seul candidat du schéma et il est
 *     absent ;
 *   • une case DÉCOCHÉE part en `false` explicite, sans quoi décocher n'aurait
 *     aucun effet ;
 *   • un refus re-sert la feuille avec la saisie ET les cases, jamais une
 *     redirection qui les perdrait.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';

const requete = (url: string, init: RequestInit & { readonly origine?: string | null } = {}): Request => {
  const { origine = 'https://meeshy.test', ...reste } = init;
  return new Request(url, {
    ...reste,
    headers: { cookie: COOKIE, ...(origine === null ? {} : { origin: origine }), ...((reste.headers as Record<string, string>) ?? {}) },
  });
};

const formulaire = (champs: Readonly<Record<string, string>>): FormData => {
  const corps = new FormData();
  Object.entries(champs).forEach(([nom, valeur]) => corps.append(nom, valeur));
  return corps;
};

const poste = (champs: Readonly<Record<string, string>>, origine?: string | null): Request =>
  requete('https://meeshy.test/links', { method: 'POST', body: formulaire(champs), ...(origine === undefined ? {} : { origine }) });

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const CARNET = { success: true, data: [], meta: { summary: { activeLinks: 0 } } };

const passerelle = (parChemin: Readonly<Record<string, (init: RequestInit) => Response>>) => {
  const vus: { url: string; methode: string; corps: string | null }[] = [];
  const recuperer = async (url: string, init: RequestInit): Promise<Response> => {
    vus.push({ url, methode: String(init.method ?? 'GET'), corps: typeof init.body === 'string' ? init.body : null });
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1](init);
  };
  return { recuperer, vus };
};

/** Un carnet servi, et une création qui aboutit. */
const NOMINALE = () =>
  passerelle({
    '/links': (init) =>
      String(init.method ?? 'GET') === 'POST'
        ? json({ success: true, data: { linkId: 'mshy_abc_123', conversationId: 'c1' } }, 201)
        : json(CARNET),
  });

const corpsSoumis = (vus: readonly { corps: string | null; methode: string }[]): Record<string, unknown> =>
  JSON.parse(vus.find(({ methode }) => methode === 'POST')?.corps ?? '{}') as Record<string, unknown>;

describe('la feuille de création, rendue', () => {
  const html = documentDesLiens({ liens: [], actifs: 0, nouveau: true, saisie: SAISIE_NEUVE , tempsReel: null });

  it('est un dialogue servi OUVERT, que le module élèvera en modale', () => {
    expect(html).toContain('<dialog class="nouveau-lien" open');
    expect(html).toContain('data-retour="/links"');
  });

  /**
   * TROIS CHEMINS DE FERMETURE, chacun un lien ordinaire : sans JavaScript il
   * n'y a ni Échap ni piège à focus, et une feuille qu'on ne peut pas fermer
   * est un cul-de-sac.
   */
  it('se ferme par trois liens, pas par un bouton qui aurait besoin de script', () => {
    expect((html.match(/href="\/links"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('class="voile"');
    expect(html).toContain('class="poignee"');
  });

  /** LE TÉMOIN DU CRITÈRE : aucun champ que la passerelle n'applique. */
  it('ne rend AUCUN champ inerte — les pays autorisés en sont le seul candidat', () => {
    expect(html).not.toContain('allowedCountries');
    expect(html).not.toContain('allowedIpRanges');
  });

  it('rend les cinq permissions, chacune sous le nom du champ de la passerelle', () => {
    PERMISSIONS_DU_LIEN.forEach(({ champ }) => {
      expect(html).toContain(`name="${champ}"`);
    });
  });

  it('rend l’échéance en groupe de radios nommé, pas en saisie de date', () => {
    expect(html).toContain('<legend>Le lien expire</legend>');
    expect((html.match(/name="echeance"/g) ?? []).length).toBe(3);
    expect(html).not.toContain('type="date"');
  });

  it('rend le carnet INERTE derrière elle — sinon la tabulation part dans la liste', () => {
    expect(html).toContain('<main inert ');
  });

  it('ne sert NI la feuille NI son style quand l’état n’est pas ouvert', () => {
    const nu = documentDesLiens({ liens: [], actifs: 0 , tempsReel: null });
    expect(nu).not.toContain('<dialog');
    expect(nu).not.toContain('nouveau-lien{');
  });
});

describe('la porte de la création', () => {
  it('refuse un POST d’origine étrangère AVANT d’atteindre la passerelle', async () => {
    const { recuperer, vus } = NOMINALE();

    const reponse = await CREE_UN_LIEN(poste({ conversation: 'Chez pirate' }, 'https://ailleurs.test'), recuperer);

    expect(reponse.status).toBe(403);
    expect(vus).toEqual([]);
  });

  /**
   * UNE CASE DÉCOCHÉE N'ENVOIE RIEN en HTML. Sans booléen explicite, la
   * passerelle poserait son propre défaut et décocher n'aurait aucun effet —
   * le contrôle mentirait (charte règle 7).
   */
  it('envoie CHAQUE permission en booléen explicite, décochée comprise', async () => {
    const { recuperer, vus } = NOMINALE();

    await CREE_UN_LIEN(poste({ conversation: 'Le potager', allowAnonymousMessages: '1' }), recuperer);

    const corps = corpsSoumis(vus);
    expect(corps.allowAnonymousMessages).toBe(true);
    expect(corps.allowAnonymousFiles).toBe(false);
    expect(corps.allowViewHistory).toBe(false);
    expect(corps.requireNickname).toBe(false);
  });

  it('n’envoie AUCUN champ que createLinkSchema ne déclare pas', async () => {
    const { recuperer, vus } = NOMINALE();

    await CREE_UN_LIEN(poste({ conversation: 'Le potager', nom: 'Voisins', capacite: '12' }), recuperer);

    const corps = corpsSoumis(vus);
    expect(Object.keys(corps).sort()).toEqual([
      'allowAnonymousFiles',
      'allowAnonymousImages',
      'allowAnonymousMessages',
      'allowViewHistory',
      // Le défaut de l'échéance est « 7 jours » : `expiresAt` part donc, et
      // c'est ce que le formulaire coche.
      'expiresAt',
      'maxUses',
      'name',
      'newConversation',
      'requireNickname',
    ]);
    expect(corps.newConversation).toEqual({ title: 'Le potager' });
    expect(corps.maxUses).toBe(12);
  });

  /**
   * L'ÉCHÉANCE EST CALCULÉE SUR L'HORLOGE DU SERVEUR. Celle du navigateur peut
   * avoir des heures de retard, et une expiration fausse ne se découvre qu'au
   * moment où le lien meurt trop tôt.
   */
  it('calcule la date d’échéance, et n’en envoie AUCUNE pour « jamais »', async () => {
    const avant = Date.now();
    const { recuperer, vus } = NOMINALE();

    await CREE_UN_LIEN(poste({ conversation: 'Le potager', echeance: 'jour' }), recuperer);
    const avec = corpsSoumis(vus);
    const echeance = Date.parse(String(avec.expiresAt));
    expect(echeance).toBeGreaterThanOrEqual(avant + 24 * 60 * 60 * 1000);

    const sans = NOMINALE();
    await CREE_UN_LIEN(poste({ conversation: 'Le potager', echeance: 'jamais' }), sans.recuperer);
    expect(corpsSoumis(sans.vus).expiresAt).toBeUndefined();
  });

  it('n’envoie pas de capacité quand le champ est vide ou absurde', async () => {
    const { recuperer, vus } = NOMINALE();

    await CREE_UN_LIEN(poste({ conversation: 'Le potager', capacite: '' }), recuperer);

    expect(corpsSoumis(vus).maxUses).toBeUndefined();
  });

  it('redirige après un succès — sinon un rechargement créerait un second lien', async () => {
    const { recuperer } = NOMINALE();

    const reponse = await CREE_UN_LIEN(poste({ conversation: 'Le potager' }), recuperer);

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/links?cree');
  });

  it('ne demande RIEN à la passerelle quand la conversation n’est pas nommée', async () => {
    const { recuperer, vus } = passerelle({ '/links': () => json(CARNET) });

    const reponse = await CREE_UN_LIEN(poste({ conversation: '  ' }), recuperer);
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(vus.every(({ methode }) => methode === 'GET')).toBe(true);
    expect(html).toContain(NOUVEAU_LIEN.sansTitre);
  });

  /**
   * LE REFUS RE-SERT LA FEUILLE AVEC LA SAISIE ET LES CASES. Rien n'a été
   * écrit, donc rien à protéger du rejeu ; et une redirection coûterait un nom
   * de conversation et six cases qu'aucune URL ne peut porter sans les exposer.
   */
  it('re-sert la feuille avec la saisie, les cases et le motif de la passerelle', async () => {
    const { recuperer } = passerelle({
      '/links': (init) =>
        String(init.method ?? 'GET') === 'POST'
          ? json({ success: false, error: { message: 'Conversation is closed' } }, 410)
          : json(CARNET),
    });

    const reponse = await CREE_UN_LIEN(
      poste({ conversation: 'Le potager', nom: 'Voisins', allowViewHistory: '1' }),
      recuperer,
    );
    const html = await reponse.text();

    expect(reponse.status).toBe(422);
    expect(html).toContain('Conversation is closed');
    expect(html).toContain('value="Le potager"');
    expect(html).toContain('value="Voisins"');
    expect(html).toMatch(/name="allowViewHistory"[^>]*checked/);
    expect(html).not.toMatch(/name="allowAnonymousFiles"[^>]*checked/);
  });

  it('ouvre la feuille sur l’état ?nouveau, et la garde fermée sans lui', async () => {
    const { recuperer } = NOMINALE();

    const ouverte = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links?nouveau'), recuperer)).text();
    expect(ouverte).toContain('<dialog class="nouveau-lien" open');

    const { recuperer: second } = NOMINALE();
    const fermee = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), second)).text();
    expect(fermee).not.toContain('<dialog');
  });

  it('dit le succès au retour de la redirection, jamais par le formulaire', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links?cree'), recuperer)).text();

    expect(html).toContain(NOUVEAU_LIEN.cree);
    expect(html).toContain('role="status"');
  });
});
