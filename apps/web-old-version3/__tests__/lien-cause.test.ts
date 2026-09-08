/**
 * @jest-environment node
 */

import { causeDeCloture, type Recuperateur } from '@/lib/api/links';

/**
 * La CAUSE d'un lien clos — et la ligne que ce témoin trace.
 *
 * `/l/:token` mène tous ses refus à la MÊME adresse close (§ 5.1 : un état
 * distinct par jeton inconnu serait un oracle d'énumération). L'écran qui s'y
 * trouve doit pourtant dire POURQUOI, sans quoi il est la page blanche que
 * l'issue #4496 remplace. Les deux tiennent ensemble à une condition : la cause
 * n'est jamais DÉDUITE ici, elle est LUE de ce que la passerelle sert déjà
 * publiquement.
 *
 * DE QUELLE PORTE, ET C'EST TOUT LE SUJET
 *
 * `GET /anonymous/link/:identifier` ne connaît que `ConversationShareLink`. Un
 * jeton de story, de réel, de post ou d'humeur est un `TrackingLink` — un modèle
 * disjoint — et cette porte rend 404 dessus. Tant que la cause descendait d'elle
 * seule, tout le contenu du § P0 obtenait « Indéterminé ».
 *
 * `GET /tracking-links/:token/resolve` répond aux DEUX familles et expose
 * publiquement `isActive` et `expiresAt` : c'est de LUI que la cause descend, et
 * de l'aperçu seulement ce que lui seul sait nommer (`LINK_MAX_USES`,
 * `CONVERSATION_CLOSED`).
 *
 * Ce que ce témoin refuse, donc : qu'un 200, une réponse illisible ou une
 * passerelle muette produisent une FERMETURE. Une cause inventée est pire
 * qu'une absence de cause — c'est un message que le lecteur ne peut pas
 * contredire (§ 7).
 */

const BASE = 'https://passerelle.test';
const JETON = '8fz3-lagos';

const HIER = new Date(Date.now() - 86_400_000).toISOString();
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString();

const reponse = (statut: number, corps: unknown): Response =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });

const resolution = (donnee: Record<string, unknown>): Response =>
  reponse(200, { success: true, data: { targetType: 'CONVERSATION', targetId: 'c1', ...donnee } });

/**
 * Un bouchon qui répond PAR PORTE. Refuser des deux côtés à la fois raconterait
 * une chaîne que la production ne produit jamais pour un `TrackingLink` : sa
 * porte d'aperçu rend 404, toujours.
 */
const passerelle = (
  parPorte: {
    readonly resolve: (url: string) => Response;
    readonly apercu?: (url: string) => Response;
  },
): { readonly recuperer: Recuperateur; readonly urls: readonly string[] } => {
  const urls: string[] = [];
  return {
    urls,
    recuperer: async (url) => {
      urls.push(url);
      return url.includes('/resolve')
        ? parPorte.resolve(url)
        : (parPorte.apercu ?? (() => reponse(404, { success: false, error: 'NOT_FOUND' })))(url);
    },
  };
};

const cause = (
  parPorte: Parameters<typeof passerelle>[0],
  token: string = JETON,
): Promise<string> => causeDeCloture({ token, base: BASE, recuperer: passerelle(parPorte).recuperer });

const invitation = (code: string) => ({
  resolve: () => resolution({ kind: 'conversation', isActive: false, expiresAt: null }),
  apercu: () => reponse(410, { success: false, error: code, message: 'peu importe' }),
});

describe('causeDeCloture — ce que la passerelle DIT, jamais ce qu’on en déduit', () => {
  it('nomme les quatre refus que la passerelle sert sur un 410', async () => {
    await expect(cause(invitation('LINK_EXPIRED'))).resolves.toBe('expiration');
    await expect(cause(invitation('LINK_INACTIVE'))).resolves.toBe('desactivation');
    await expect(cause(invitation('LINK_MAX_USES'))).resolves.toBe('epuisement');
    await expect(cause(invitation('CONVERSATION_CLOSED'))).resolves.toBe('conversation-terminee');
  });

  it('rend quatre causes DISTINCTES — un message générique ne répondrait à aucune', async () => {
    const causes = await Promise.all(
      ['LINK_EXPIRED', 'LINK_INACTIVE', 'LINK_MAX_USES', 'CONVERSATION_CLOSED']
        .map(invitation)
        .map((parPorte) => cause(parPorte)),
    );

    expect(new Set(causes).size).toBe(4);
  });

  /**
   * Les jumeaux de vocabulaire de la passerelle : `/anonymous/refresh` répond
   * `LINK_DEACTIVATED` là où l'aperçu répond `LINK_INACTIVE`, et
   * `admitLinkEntry` `LINK_EXHAUSTED` là où l'aperçu répond `LINK_MAX_USES`.
   * Deux mots pour un état : l'écran n'en connaît qu'UN.
   */
  it('range les deux vocabulaires de la passerelle sous la même cause', async () => {
    await expect(cause(invitation('LINK_DEACTIVATED'))).resolves.toBe('desactivation');
    await expect(cause(invitation('LINK_EXHAUSTED'))).resolves.toBe('epuisement');
  });

  it('lit le code là où la passerelle le pose — `error`, sinon `code`', async () => {
    await expect(
      cause({
        resolve: () => resolution({ kind: 'conversation', isActive: false, expiresAt: null }),
        apercu: () => reponse(410, { success: false, code: 'LINK_MAX_USES' }),
      }),
    ).resolves.toBe('epuisement');
  });

  /**
   * LE DÉFAUT QUE CE TÉMOIN EXISTE POUR ATTRAPER — et il porte sur toute la
   * classe de liens du § P0 : story, réel, post, humeur, lien externe.
   */
  it('nomme la cause d’un lien de TRACKING, dont la porte d’aperçu rend 404', async () => {
    await expect(
      cause({ resolve: () => resolution({ kind: 'tracking', isActive: false, expiresAt: HIER }) }),
    ).resolves.toBe('expiration');

    await expect(
      cause({ resolve: () => resolution({ kind: 'tracking', isActive: false, expiresAt: null }) }),
    ).resolves.toBe('desactivation');
  });

  it('n’interroge pas une porte qui ne connaît pas la famille du jeton', async () => {
    const { recuperer, urls } = passerelle({
      resolve: () => resolution({ kind: 'tracking', isActive: false, expiresAt: HIER }),
    });

    await causeDeCloture({ token: JETON, base: BASE, recuperer });

    expect(urls).toEqual([`${BASE}/api/v1/tracking-links/${JETON}/resolve`]);
  });

  it('ne prend pas une échéance À VENIR pour une expiration', async () => {
    await expect(
      cause({ resolve: () => resolution({ kind: 'tracking', isActive: false, expiresAt: DEMAIN }) }),
    ).resolves.toBe('desactivation');
  });

  it('ne prend pas une échéance ILLISIBLE pour une expiration', async () => {
    await expect(
      cause({
        resolve: () => resolution({ kind: 'tracking', isActive: false, expiresAt: 'bientôt' }),
      }),
    ).resolves.toBe('desactivation');
  });

  it('retombe sur ce que la résolution sait quand l’aperçu ne nomme aucun code connu', async () => {
    await expect(
      cause({
        resolve: () => resolution({ kind: 'conversation', isActive: false, expiresAt: HIER }),
        apercu: () => reponse(410, { success: false, error: 'UN_CODE_QUI_N_EXISTE_PAS' }),
      }),
    ).resolves.toBe('expiration');
  });

  it("ne distingue pas un jeton inconnu d'un lien fermé : le 404 ne nomme rien", async () => {
    await expect(
      cause({ resolve: () => reponse(404, { success: false, error: 'NOT_FOUND' }) }),
    ).resolves.toBe('indeterminee');
  });

  /**
   * § 7 — « erreur réseau ≠ refus ». Une passerelle injoignable, illisible ou
   * qui SERT encore le lien ne le ferme pas : l'écran n'affirme alors aucune
   * fermeture, et c'est le seul état dont la suite est de réessayer.
   */
  it('ne transforme JAMAIS une absence de refus en fermeture', async () => {
    await expect(
      causeDeCloture({
        token: JETON,
        base: BASE,
        recuperer: async () => {
          throw new TypeError('fetch failed');
        },
      }),
    ).resolves.toBe('verification-impossible');

    await expect(
      causeDeCloture({
        token: JETON,
        base: BASE,
        recuperer: async () => new Response('<html>', { status: 200 }),
      }),
    ).resolves.toBe('verification-impossible');

    await expect(
      cause({ resolve: () => resolution({ kind: 'tracking', isActive: true, expiresAt: null }) }),
    ).resolves.toBe('verification-impossible');
  });

  it('interroge la porte qui répond aux DEUX familles, avec le jeton échappé', async () => {
    const { recuperer, urls } = passerelle({ resolve: () => reponse(404, { success: false }) });

    await causeDeCloture({ token: 'a/b', base: BASE, recuperer });

    expect(urls).toEqual([`${BASE}/api/v1/tracking-links/a%2Fb/resolve`]);
  });
});
