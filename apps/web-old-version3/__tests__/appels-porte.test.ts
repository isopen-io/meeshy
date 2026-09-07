/**
 * @jest-environment node
 */

import { HISTORIQUE } from '@/app/connecte/appels-porte';
import { APPELS } from '@/lib/contenu/appels';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la PORTE, c'est-à-dire les décisions que
 * `/calls` prend avant de rendre quoi que ce soit, et l'écran qu'elle rend.
 *
 * Six d'entre eux gardent des choses qu'aucune lecture distraite du HTML
 * n'attraperait seule :
 *
 *   - le document servi n'embarque NI CallManager NI la pile WebRTC — le
 *     critère même de la matrice, tenu par CONSTRUCTION (aucun `<script src>`,
 *     aucune référence textuelle) ;
 *   - la liste est ENTIÈREMENT servie : aucun spinner, aucun squelette,
 *     jamais un état de chargement à peindre après coup ;
 *   - la porte NE DEMANDE QU'UNE SEULE ROUTE — `/calls/history` — jamais
 *     `/auth/me` ni `/conversations` : le sens d'une ligne est dérivé
 *     SERVEUR, l'identité du lecteur ne classe rien ici ;
 *   - un 401 renvoie se connecter — le cas NOMINAL d'un retour après quelques
 *     jours, pas une erreur ;
 *   - un manqué DIT « Manqué » en toutes lettres, et aucune pastille de
 *     présence n'est rendue ;
 *   - chaque ligne a un EFFET : elle mène au fil de sa conversation.
 */

const COOKIE = 'meeshy_auth=jeton-de-test';

const requete = (url: string, init: RequestInit = {}): Request =>
  new Request(url, { ...init, headers: { cookie: COOKIE, ...(init.headers as Record<string, string> | undefined) } });

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

const passerelle = (parChemin: Readonly<Record<string, () => Response>>) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1]();
  };
  return { recuperer, vus };
};

const ligneServie = (extra: Record<string, unknown> = {}) => ({
  callId: 'c-1',
  conversationId: 'conv-1',
  conversationType: 'direct',
  conversationTitle: null,
  conversationAvatar: null,
  mode: 'audio',
  status: 'missed',
  endReason: null,
  direction: 'missed',
  isVideo: false,
  startedAt: '2026-09-04T12:00:00.000Z',
  answeredAt: null,
  endedAt: null,
  durationSec: 0,
  bytesSent: null,
  bytesReceived: null,
  peer: {
    userId: 'u-support',
    username: 'support',
    displayName: 'Support produit',
    avatar: null,
    phoneNumber: null,
    isOnline: true,
  },
  ...extra,
});

const TROIS_LIGNES = [
  ligneServie(),
  ligneServie({
    callId: 'c-2',
    direction: 'incoming',
    status: 'ended',
    durationSec: 720,
    startedAt: '2026-09-03T12:00:00.000Z',
    peer: { userId: 'u-marta', username: 'marta', displayName: 'Marta Ruiz', avatar: null, phoneNumber: null, isOnline: true },
  }),
  ligneServie({
    callId: 'c-3',
    conversationId: 'conv-3',
    conversationType: 'group',
    conversationTitle: 'Équipe Lagos',
    direction: 'outgoing',
    status: 'ended',
    isVideo: true,
    durationSec: 2460,
    startedAt: '2026-09-01T09:00:00.000Z',
    peer: null,
  }),
];

const NOMINALE = (lignes: readonly unknown[] = TROIS_LIGNES) =>
  passerelle({
    '/calls/history': () =>
      json({ success: true, data: lignes, pagination: { limit: 30, hasMore: false } }),
  });

describe('la porte de /calls', () => {
  it('renvoie se connecter quand aucun jeton n’est présenté', async () => {
    const reponse = await HISTORIQUE(new Request('https://meeshy.test/calls'));

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcalls');
    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
  });

  // T1 — le document servi n'embarque aucun module.
  it('n’embarque NI CallManager NI la pile WebRTC — aucun <script src>', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html.toLowerCase()).not.toContain('callmanager');
    expect(html.toLowerCase()).not.toContain('webrtc');
  });

  // T2 — aucun spinner, jamais : la liste est SERVIE.
  it('sert les trois lignes ENTIÈRES, sans aucun état de chargement', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect((html.match(/class="appel"/g) ?? []).length).toBe(3);
    expect(html).not.toContain('aria-busy');
    expect(html).not.toContain('spinner');
    expect(html).not.toContain('squelette');
    expect(html).not.toContain('Chargement');
  });

  // T5 — UN seul appel sortant.
  it('demande UNE SEULE route — jamais /auth/me ni /conversations', async () => {
    const { recuperer, vus } = NOMINALE();

    await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer);

    expect(vus).toHaveLength(1);
    expect(vus[0]).toContain('/api/v1/calls/history?limit=30');
    expect(vus.some((url) => url.includes('/auth/me'))).toBe(false);
    expect(vus.some((url) => url.includes('/conversations'))).toBe(false);
  });

  it('renvoie se connecter quand la passerelle refuse le jeton (401)', async () => {
    const { recuperer } = passerelle({ '/calls/history': () => json({ success: false }, 401) });

    const reponse = await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/login?returnUrl=%2Fcalls');
  });

  it('dessine la panne plutôt qu’une page blanche quand la passerelle se tait', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    const reponse = await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer);

    expect(reponse.status).toBe(503);
    expect(await reponse.text()).not.toBe('');
  });

  // T6 — la pagination est un lien, le vide est un état.
  it('sert `<a href="/calls?cursor=…">` quand `nextCursor` existe', async () => {
    const { recuperer } = passerelle({
      '/calls/history': () =>
        json({ success: true, data: TROIS_LIGNES, pagination: { limit: 30, hasMore: true, nextCursor: 'c-3' } }),
    });

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect(html).toContain('href="/calls?cursor=c-3"');
  });

  it('relaie `?cursor` de l’URL vers la passerelle', async () => {
    const { recuperer, vus } = NOMINALE([]);

    await HISTORIQUE(requete('https://meeshy.test/calls?cursor=c-1'), recuperer);

    expect(vus[0]).toContain('cursor=c-1');
  });

  it('rend la carte vide, sans aucune ligne ni lien « plus anciens », sur une page sans appel', async () => {
    const { recuperer } = NOMINALE([]);

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect(html).toContain(APPELS.vide);
    expect(html).not.toContain('class="appel"');
    expect(html).not.toContain(APPELS.plusAnciens);
  });

  // T6bis — chaque ligne a un effet, et dit sa nature en toutes lettres.
  it('mène chaque ligne au fil de sa conversation, et dit « Manqué » en toutes lettres', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect(html).toContain('href="/chats/conv-1"');
    expect(html).toContain('Manqué');
    expect(html).toContain('entrant');
  });

  it('nomme un appel de groupe par conversationTitle, un direct sans titre par son correspondant', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect(html).toContain('Équipe Lagos');
    expect(html).toContain('Marta Ruiz');
  });

  it('ne rend AUCUNE pastille de présence — la cible n’en dessine pas', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect(html).not.toContain('pastille');
    expect(html).not.toContain('en-ligne');
  });

  it('dit la nature d’un appel répondu — « Audio » et sa durée en minutes', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect(html).toContain('Audio');
    expect(html).toContain('12 min');
  });

  it('dit « Vidéo » pour un appel de groupe vidéo, avec sa tuile teintée à part', async () => {
    const { recuperer } = NOMINALE();

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect(html).toContain('Vidéo');
    expect(html).toContain('class="tuile video"');
    expect(html).toContain('class="tuile manque"');
  });

  /**
   * UN SORTANT `rejected`/`failed` NE SE REND PAS COMME UN RÉPONDU DE 0 S.
   * Sans lire `status`, `c-rejete` et `c-ok-mais-court` étaient IDENTIQUES à
   * l'écran — « Audio · <instant> », la durée simplement absente des deux
   * côtés. `APPELS.nonAbouti` distingue les deux : un appel qui n'a jamais
   * décroché le dit, plutôt que de laisser un pouce inférer que la durée a
   * juste été omise.
   */
  it('dit « Non abouti » pour un sortant rejeté ou en échec — jamais pour un répondu', async () => {
    const { recuperer } = NOMINALE([
      ligneServie({
        callId: 'c-rejete',
        direction: 'outgoing',
        status: 'rejected',
        durationSec: 0,
        answeredAt: null,
        endedAt: null,
        peer: { userId: 'u-kofi', username: 'kofi', displayName: 'Kofi Owusu', avatar: null, phoneNumber: null, isOnline: false },
      }),
      ligneServie({
        callId: 'c-ok-court',
        direction: 'outgoing',
        status: 'ended',
        durationSec: 5,
        peer: { userId: 'u-kofi', username: 'kofi', displayName: 'Kofi Owusu', avatar: null, phoneNumber: null, isOnline: false },
      }),
    ]);

    const html = await (await HISTORIQUE(requete('https://meeshy.test/calls'), recuperer)).text();

    expect(html).toContain(APPELS.nonAbouti);
    // Le répondu de 5 s dit sa durée EN SECONDES — jamais « Non abouti ».
    expect(html).toContain('5 s');
  });
});
