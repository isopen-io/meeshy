/**
 * @jest-environment node
 */

import { GET } from '@/app/(public)/l/[token]/expired/route';

/**
 * L'écran `linkExpired` — servi par un GESTIONNAIRE DE ROUTE, jamais découvert
 * après hydratation (issue #4496, planche `cible/linkExpired.png`).
 *
 * Ce que ce témoin tient, et que ni le gate de bundle ni le gate réseau ne
 * peuvent tenir à sa place :
 *
 *   • la RAISON est dans le HTML de la première réponse — et elle l'est pour les
 *     DEUX familles de jetons, pas seulement pour les invitations ;
 *   • les deux suites sont des `<a href>` RÉELS, donc atteignables au clavier
 *     et cliquables sans une ligne de JavaScript ;
 *   • aucune suite ne renvoie vers l'écran d'où l'on vient — un contrôle qui
 *     boucle est un contrôle inerte (loi 4) ;
 *   • rien de ce que la passerelle sert sur la conversation n'entre dans le
 *     document — c'est la seconde exigence de l'issue, et elle se prouve en
 *     servant à l'écran une charge qui PORTE le nom de la conversation.
 */

const JETON = '8fz3-lagos';
const NOM_DE_LA_CONVERSATION = 'Équipe Lagos';
const CREATEUR = 'ibrahim-le-createur';

const HIER = new Date(Date.now() - 86_400_000).toISOString();
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString();

let appels: string[] = [];

const json = (statut: number, corps: unknown): Response =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });

/**
 * LA PASSERELLE DE BOUCHON RÉPOND PAR PORTE, JAMAIS « DES DEUX CÔTÉS ».
 *
 * Un bouchon qui refuse les deux portes à la fois raconte une chaîne que la
 * production ne produit PAS : `GET /anonymous/link/:identifier` ne connaît que
 * `ConversationShareLink` et rend 404 sur un jeton de tracking. C'est cette
 * asymétrie — et elle seule — qui fait de la story, du réel, du post et de
 * l'humeur du § P0 la classe de liens qui n'obtenait aucune raison.
 */
const passerelle = ({
  resolve,
  apercu,
}: {
  readonly resolve: () => Response;
  readonly apercu?: () => Response;
}): typeof fetch =>
  (async (entree: RequestInfo | URL) => {
    const url = String(entree);
    appels.push(url);
    if (url.includes('/resolve')) return resolve();
    return apercu?.() ?? json(404, { success: false, error: 'NOT_FOUND' });
  }) as typeof fetch;

const resolution = (charge: Record<string, unknown>) => () =>
  json(200, {
    success: true,
    data: { targetType: 'CONVERSATION', targetId: 'c1', originalUrl: null, ...charge },
  });

const refus = (code: string) => () => json(410, { success: false, error: code, message: 'refus' });

/** Un lien d'INVITATION fermé : les deux portes savent en parler. */
const invitationRefusee = (code: string): typeof fetch =>
  passerelle({
    resolve: resolution({ kind: 'conversation', isActive: false, expiresAt: null }),
    apercu: refus(code),
  });

/** Un lien de TRACKING fermé : la porte d'aperçu ne le connaît pas et rend 404. */
const trackingFerme = (expiresAt: string | null): typeof fetch =>
  passerelle({ resolve: resolution({ kind: 'tracking', isActive: false, expiresAt }) });

const html = async (token: string = JETON): Promise<string> => {
  const reponse = await GET(new Request(`https://meeshy.me/l/${token}/expired`), {
    params: Promise.resolve({ token }),
  });
  return reponse.text();
};

const titre = (page: string): string => /<h1[^>]*>([^<]*)<\/h1>/.exec(page)?.[1] ?? '';
const statut = (page: string): string =>
  [...page.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].find(([, cle]) => cle === 'Statut')?.[2] ??
  '';
const suites = (page: string): readonly string[] =>
  [...(/<nav[^>]*>([\s\S]*?)<\/nav>/.exec(page)?.[1] ?? '').matchAll(/href="([^"]*)"/g)].map(
    ([, href]) => href ?? '',
  );

beforeEach(() => {
  appels = [];
});

describe('linkExpired — un lien fermé dit pourquoi', () => {
  it('rend une raison PROPRE à chacun des quatre refus que la passerelle nomme', async () => {
    const titres: string[] = [];

    // SÉQUENTIEL, et c'est le sujet : chaque rendu installe SA passerelle. Un
    // `Promise.all` ferait gagner la dernière et les quatre écrans rendraient le
    // même titre — un test vert sur le défaut qu'il existe pour attraper.
    for (const code of ['LINK_EXPIRED', 'LINK_INACTIVE', 'LINK_MAX_USES', 'CONVERSATION_CLOSED']) {
      globalThis.fetch = invitationRefusee(code);
      titres.push(titre(await html()));
    }

    expect(titres.every((t) => t !== '')).toBe(true);
    expect(new Set(titres).size).toBe(4);
  });

  /**
   * LE DÉFAUT QUE CE TÉMOIN EXISTE POUR ATTRAPER, et la classe de liens qu'il
   * couvre : story, réel, post, humeur, lien externe — tout le § P0.
   *
   * Un `TrackingLink` est un modèle DISJOINT de `ConversationShareLink`. La
   * porte d'aperçu ne le trouve pas et rend 404 ; tant que la cause descendait
   * de cette porte-là, un lien de story expiré servait « Ce lien n'a pas pu être
   * ouvert · Indéterminé » — la page qui ne dit rien, sur la moitié du produit.
   * La donnée était pourtant déjà en main : `/resolve` sert `isActive` ET
   * `expiresAt` pour les DEUX familles.
   */
  it('nomme la cause d’un lien de TRACKING, que la porte d’aperçu ne connaît pas', async () => {
    globalThis.fetch = trackingFerme(HIER);
    const expire = await html();

    globalThis.fetch = trackingFerme(null);
    const ferme = await html();

    expect(statut(expire)).toBe('Expiré');
    expect(statut(ferme)).toBe('Fermé par son auteur');
    expect([titre(expire), titre(ferme)]).not.toContain('Ce lien n’a pas pu être ouvert');
  });

  it('n’interroge pas la porte d’aperçu pour une famille dont elle ne sait rien', async () => {
    globalThis.fetch = trackingFerme(HIER);
    await html();

    expect(appels.filter((url) => url.includes('/anonymous/link/'))).toEqual([]);
    expect(appels).toHaveLength(1);
  });

  /**
   * Une échéance encore à venir sur un lien pourtant `isActive:false` : c'est
   * une DÉSACTIVATION, jamais une expiration. Le témoin distingue les deux là
   * où un `expiresAt !== null` naïf les confondrait.
   */
  it('ne prend pas une échéance à venir pour une expiration', async () => {
    globalThis.fetch = trackingFerme(DEMAIN);

    expect(statut(await html())).toBe('Fermé par son auteur');
  });

  it('retombe sur ce que la résolution sait quand l’aperçu ne nomme aucun code', async () => {
    globalThis.fetch = passerelle({
      resolve: resolution({ kind: 'conversation', isActive: false, expiresAt: HIER }),
      apercu: refus('UN_CODE_QUI_N_EXISTE_PAS'),
    });

    expect(statut(await html())).toBe('Expiré');
  });

  it('ne nomme RIEN sur un jeton que la passerelle ne trouve pas', async () => {
    globalThis.fetch = passerelle({ resolve: () => json(404, { success: false }) });

    expect(statut(await html())).toBe('Indéterminé');
  });

  /**
   * § 7 — « erreur réseau ≠ refus ». Une passerelle muette ne ferme aucun lien :
   * l'écran le DIT, et c'est le seul état dont la suite est de réessayer.
   */
  it('distingue « on n’a pas pu vérifier » de « le lien est fini »', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const muette = await html();

    globalThis.fetch = passerelle({ resolve: () => json(404, { success: false }) });
    const inconnu = await html();

    expect(statut(muette)).toBe('Non vérifié');
    expect(statut(inconnu)).toBe('Indéterminé');
    expect(titre(muette)).not.toBe(titre(inconnu));
  });

  /**
   * LA LOI 4, MESURÉE PAR SON EFFET : « cliquer change-t-il quelque chose ? »
   *
   * `/l/<jeton>` est la porte d'où l'on VIENT : elle redirige ici dès que la
   * résolution dit le lien clos ou que le jeton est hors forme. Y renvoyer
   * depuis cet écran coûte deux allers-retours et un appel passerelle pour
   * réafficher le MÊME écran, mot pour mot. La seule situation qui l'autorise
   * est celle où la v3 n'a PAS jugé le lien clos.
   */
  it('ne renvoie jamais vers la porte d’où l’on vient, sauf si le lien n’a pas été jugé clos', async () => {
    const retour = `/l/${JETON}`;

    for (const installe of [
      () => (globalThis.fetch = invitationRefusee('LINK_EXPIRED')),
      () => (globalThis.fetch = invitationRefusee('LINK_MAX_USES')),
      () => (globalThis.fetch = invitationRefusee('CONVERSATION_CLOSED')),
      () => (globalThis.fetch = trackingFerme(HIER)),
      () => (globalThis.fetch = passerelle({ resolve: () => json(404, { success: false }) })),
    ]) {
      installe();
      expect(suites(await html())).not.toContain(retour);
    }

    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    expect(suites(await html())).toContain(retour);
  });

  it('pose les repères de structure que le gate a11y exige', async () => {
    globalThis.fetch = invitationRefusee('LINK_EXPIRED');
    const page = await html();

    expect(page).toContain('<main id="main-content">');
    expect(page).toMatch(/<header\b/);
    expect(page).toMatch(/<nav\b/);
    expect(page).toMatch(/<h1\b/);
    expect(page).toContain('<dl>');
  });

  it('sert ses deux suites en liens RÉELS — pas un div, pas un bouton mort', async () => {
    globalThis.fetch = invitationRefusee('LINK_EXPIRED');
    const page = await html();
    const adresses = suites(page);

    expect(adresses).toHaveLength(2);
    expect(adresses.every((href) => href !== '' && href !== '#')).toBe(true);
    expect(page).not.toContain('onclick');
  });

  it('câble la connexion sur le lien gardé de côté', async () => {
    globalThis.fetch = invitationRefusee('LINK_EXPIRED');

    expect(await html()).toContain(`href="/login?next=%2Fl%2F${JETON}"`);
  });

  it('rend le jeton du lien, échappé', async () => {
    globalThis.fetch = invitationRefusee('LINK_EXPIRED');
    const page = await html('a<b>c');

    expect(page).toContain('l/a&lt;b&gt;c');
    expect(page).not.toContain('<b>c');
  });

  /**
   * `GET /anonymous/link/:identifier` sert l'identité complète du créateur et le
   * titre de la conversation (§ 5.1, ⚠️ fuite). L'écran d'un lien MORT n'a
   * aucune raison d'en rendre quoi que ce soit : la planche dessine une ligne
   * « Conversation » que la v3 ne sert pas — écart assumé, tenu par ce témoin.
   */
  it('ne rend RIEN de la conversation derrière le lien, même quand la passerelle la sert', async () => {
    globalThis.fetch = passerelle({
      resolve: resolution({ kind: 'conversation', isActive: false, expiresAt: HIER }),
      apercu: () =>
        json(200, {
          success: true,
          data: {
            name: NOM_DE_LA_CONVERSATION,
            creator: { username: CREATEUR },
            conversation: { title: NOM_DE_LA_CONVERSATION },
          },
        }),
    });
    const page = await html();

    expect(page).not.toContain(NOM_DE_LA_CONVERSATION);
    expect(page).not.toContain(CREATEUR);
  });

  it("n'appelle pas la passerelle pour un jeton que sa porte refuserait", async () => {
    globalThis.fetch = invitationRefusee('LINK_EXPIRED');
    await html('../../secret');

    expect(appels).toEqual([]);
  });

  /**
   * LE GATE DE REQUÊTES, TENU SUR LA CHAÎNE.
   *
   * Un gestionnaire de route compose son document à la main : aucun chunk du
   * runtime d'App Router n'entre dans son `<head>`, là où une PAGE en pose
   * quatre. Le seul script servi est le moteur de thème, inline.
   */
  it('n’expédie aucun chunk de framework : le seul script est le moteur de thème', async () => {
    globalThis.fetch = invitationRefusee('LINK_EXPIRED');
    const page = await html();

    expect(page).not.toContain('<script src=');
    expect(page).not.toContain('/_next/static/chunks/');
    expect(page).not.toContain('rel="stylesheet"');
    expect((page.match(/<script/g) ?? []).length).toBe(1);
  });

  it('rend son glyphe inliné depuis le sprite, sans une requête de plus', async () => {
    globalThis.fetch = invitationRefusee('LINK_EXPIRED');
    const page = await html();

    expect(page).toContain('<svg viewBox="0 0 256 256"');
    expect(page).not.toContain('sprite.svg');
    expect(page).not.toContain('<use ');
  });

  it('sert un document HTML complet, jamais mis en cache', async () => {
    globalThis.fetch = invitationRefusee('LINK_EXPIRED');
    const reponse = await GET(new Request(`https://meeshy.me/l/${JETON}/expired`), {
      params: Promise.resolve({ token: JETON }),
    });

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('content-type')).toContain('text/html');
    expect(reponse.headers.get('cache-control')).toBe('no-store');
    expect((await reponse.text()).startsWith('<!doctype html>')).toBe(true);
  });
});
