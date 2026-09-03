/**
 * @jest-environment node
 */

import { CARNET_DE_LIENS } from '@/app/connecte/liens-porte';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PORTE de `/links` et l'écran qu'elle rend.
 *
 * Quatre gardent des choses qu'aucune lecture distraite du HTML n'attraperait :
 *
 *   - la porte ne demande NI `/auth/me` NI `/conversations`. Cet écran ne rend
 *     ni le nom du lecteur ni ses conversations ; les appeler serait deux
 *     aller-retours payés sur une 3G rurale pour rien. Un témoin de rendu
 *     serait vert avec les deux appels en place — celui-ci COMPTE les URL ;
 *   - le compte des actifs vient du SERVEUR, jamais de la page ;
 *   - « ont rejoint », jamais « vues » — `currentUses` compte des ADMISSIONS
 *     (`link-admission.ts:192`) ;
 *   - un lien FERMÉ reste, et le dit en TEXTE.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';

const requete = (url: string): Request => new Request(url, { headers: { cookie: COOKIE } });

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

const lienServi = (extra: Record<string, unknown> = {}) => ({
  id: 'l1',
  linkId: 'mshy_lagos',
  identifier: 'lagos-q1',
  name: 'Ops Lagos',
  isActive: true,
  currentUses: 4,
  maxUses: null,
  expiresAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  conversationTitle: 'Équipe Lagos',
  conversation: { id: 'c1', title: 'Équipe Lagos', type: 'group' },
  ...extra,
});

const passerelle = (reponse: () => Response) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    return reponse();
  };
  return { recuperer, vus };
};

const NOMINALE = (liens: readonly unknown[] = [lienServi()], summary: unknown = { totalLinks: 2, activeLinks: 2, totalUses: 15 }) =>
  passerelle(() => json({ success: true, data: liens, meta: { summary } }));

describe('la porte de /links', () => {
  it('renvoie se connecter quand aucun jeton n’est présenté', async () => {
    const reponse = await CARNET_DE_LIENS(new Request('https://meeshy.test/links'));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Flinks');
  });

  it('ne demande NI /auth/me NI /conversations — un seul appel suffit', async () => {
    const { recuperer, vus } = NOMINALE();

    await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer);

    expect(vus).toHaveLength(1);
    expect(vus[0]).toContain('/api/v1/links');
    expect(vus.some((url) => url.includes('/auth/me'))).toBe(false);
    expect(vus.some((url) => url.includes('/api/v1/conversations'))).toBe(false);
  });

  it('sert l’adresse PUBLIQUE du lien, et mène à la conversation du lecteur', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer)).text();

    // Le TEXTE est ce que le lecteur colle ailleurs — la porte de l'invité.
    expect(html).toContain('/chat/mshy_lagos');
    // La LIGNE mène à sa propre conversation : l'y renvoyer par `/chat/:lien`
    // lui ferait refaire une jonction déjà faite.
    expect(html).toContain('href="/chats/c1"');
  });

  it('dit « ont rejoint », jamais « vues »', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer)).text();

    // `currentUses` s'incrémente sur le chemin d'ADMISSION (`claimLinkUse`,
    // `link-admission.ts:192`), jamais à l'ouverture d'une page. Aucun
    // compteur de vues n'existe sur un lien de partage.
    expect(html).toContain('4 ont rejoint');
    expect(html).not.toContain('vues');
  });

  it('affiche le compte SERVI, pas celui de la page', async () => {
    const { recuperer } = NOMINALE([lienServi()], { totalLinks: 30, activeLinks: 17, totalUses: 400 });

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer)).text();

    // Dix-sept actifs dans le carnet, UN sur la page servie. Recompter la page
    // afficherait « 1 lien actif » et se contredirait à la page suivante.
    expect(html).toContain('17 liens actifs');
  });

  it('garde un lien FERMÉ et le dit en toutes lettres', async () => {
    const { recuperer } = NOMINALE([lienServi({ isActive: false })]);

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer)).text();

    // Le mot, pas seulement une teinte : cet écran est celui où le lecteur
    // apprend qu'un lien ne sert plus, et le cacher se lirait comme une perte.
    expect(html).toContain('Fermé');
    expect(html).toContain('/chat/mshy_lagos');
  });

  it('n’invente ni capacité ni échéance quand le lien n’en déclare pas', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer)).text();

    expect(html).not.toContain('Expire');
    // « 4 / 0 » sous un lien sans borne serait une contrainte inventée. On
    // vise le TEXTE rendu (`>4 / `), pas la barre oblique — le document en
    // porte partout ailleurs, et une assertion trop large est verte pour la
    // mauvaise raison le jour où elle passe.
    expect(html).not.toContain('>4 / ');
  });

  it('dit la capacité et l’échéance quand le lien les porte', async () => {
    const { recuperer } = NOMINALE([
      lienServi({ maxUses: 50, expiresAt: '2026-12-31T12:00:00.000Z' }),
    ]);

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer)).text();

    expect(html).toContain('4 / 50');
    expect(html).toContain('Expire le 31 décembre 2026');
  });

  it('ne rend PAS de lien mort quand la passerelle n’a pas étendu la conversation', async () => {
    const { recuperer } = NOMINALE([lienServi({ conversation: null })]);

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer)).text();

    // La ligne reste une ligne d'INFORMATION — l'adresse s'y lit et s'y copie —
    // plutôt qu'un lien qui ne mène nulle part (charte règle 7).
    expect(html).toContain('/chat/mshy_lagos');
    expect(html).not.toContain('href="/chats/');
  });

  it('ne rend ni « Créer » ni « Copier » — aucun des deux n’a d’effet aujourd’hui', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer)).text();

    // « Créer » ouvrirait `sheet:link`, que la v3 ne sert pas ; « Copier »
    // exige le presse-papiers, donc du JavaScript, sur un écran qui en expédie
    // zéro. Un bouton « Copier » qui ne copie pas est pire que son absence.
    expect(html).not.toContain('Copier');
    expect(html).not.toContain('>Créer<');
  });

  it('dessine l’état vide plutôt qu’une liste nue', async () => {
    const { recuperer } = NOMINALE([], { totalLinks: 0, activeLinks: 0, totalUses: 0 });

    const html = await (await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer)).text();

    expect(html).toContain('Aucun lien de partage');
  });

  it('renvoie se connecter sur 401, dessine la panne sur un silence', async () => {
    const { recuperer } = passerelle(() => json({ success: false }, 401));
    const refus = await CARNET_DE_LIENS(requete('https://meeshy.test/links'), recuperer);
    expect(refus.status).toBe(302);
    expect(refus.headers.get('location')).toBe('/login?returnUrl=%2Flinks');

    const muette = await CARNET_DE_LIENS(requete('https://meeshy.test/links'), async () => {
      throw new Error('réseau coupé');
    });
    expect(muette.status).toBe(503);
    expect(await muette.text()).not.toBe('');
  });
});
