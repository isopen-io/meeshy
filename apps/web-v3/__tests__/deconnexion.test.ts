/**
 * @jest-environment node
 */

/**
 * `POST /deconnexion` — ON SORT ENFIN DE LA V3 (#5095).
 *
 * Les quatre critères de fin, dans l'ordre :
 *   1. le POST rend un `Set-Cookie` qui expire `meeshy_auth` et un 302 vers `/` ;
 *   2. après lui, `GET /` avec le même jar rend la VITRINE (`app/route.ts:90`
 *      lit `meeshy_session`, désormais expiré) ;
 *   3. la purge du travailleur de zone — gardée par `sw-zone.test.ts` ;
 *   4. le contrôle est un `<form>` servi — gardé par `espace-membre.test.ts`.
 *
 * L'endpoint attaqué : `POST /api/v1/auth/logout`
 * (`services/gateway/src/routes/auth/login.ts:350`), en BEST-EFFORT — une
 * panne, un délai ou un 401 ne retiennent JAMAIS la sortie.
 */

import { GET as RACINE } from '@/app/route';
import { GET, POST } from '@/app/deconnexion/route';
import { SORTIE } from '@/app/authentification/deconnexion-porte';
import type { Recuperateur } from '@/lib/api/authentification';

type Appel = { readonly url: string; readonly entetes: Readonly<Record<string, string>> };

const passerelle = (reponse: () => Response | Promise<Response>) => {
  const appels: Appel[] = [];
  const recuperer: Recuperateur = async (url, options) => {
    appels.push({ url, entetes: (options.headers ?? {}) as Readonly<Record<string, string>> });
    return reponse();
  };
  return { appels, recuperer };
};

const requetePost = (options?: {
  readonly cookie?: string;
  readonly site?: string;
  readonly corps?: Record<string, string>;
  readonly url?: string;
}): Request =>
  new Request(options?.url ?? 'http://meeshy.test/deconnexion', {
    method: 'POST',
    headers: {
      ...(options?.cookie !== undefined ? { cookie: options.cookie } : {}),
      'sec-fetch-site': options?.site ?? 'same-origin',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(options?.corps ?? {}).toString(),
  });

const JAR = 'meeshy_session=%7B%22role%22%3A%22USER%22%7D; meeshy_auth=JWT.abc';

const cookieDe = (nom: string, entetes: readonly string[]): string | undefined =>
  entetes.find((c) => c.startsWith(`${nom}=`));

describe('POST /deconnexion — la sortie', () => {
  it('expire meeshy_auth et meeshy_session, et redirige 302 vers /', async () => {
    const { recuperer } = passerelle(() => new Response(JSON.stringify({ success: true }), { status: 200 }));

    const reponse = await SORTIE(requetePost({ cookie: JAR }), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/');
    expect(reponse.headers.get('cache-control')).toBe('no-store, private');

    const cookies = reponse.headers.getSetCookie();
    expect(cookieDe('meeshy_auth', cookies)).toBe('meeshy_auth=; Max-Age=0; Path=/; SameSite=Lax');
    expect(cookieDe('meeshy_session', cookies)).toBe('meeshy_session=; Max-Age=0; Path=/; SameSite=Lax');
  });

  it('ajoute Secure quand le canal l’est (protocole https)', async () => {
    const { recuperer } = passerelle(() => new Response(null, { status: 200 }));

    const reponse = await SORTIE(
      requetePost({ cookie: JAR, url: 'https://meeshy.me/deconnexion' }),
      recuperer,
    );
    const cookies = reponse.headers.getSetCookie();
    expect(cookieDe('meeshy_auth', cookies)).toBe('meeshy_auth=; Max-Age=0; Path=/; SameSite=Lax; Secure');
  });

  it('ajoute Secure derrière un proxy qui relaie x-forwarded-proto: https', async () => {
    const { recuperer } = passerelle(() => new Response(null, { status: 200 }));
    const requete = new Request('http://meeshy.test/deconnexion', {
      method: 'POST',
      headers: { cookie: JAR, 'sec-fetch-site': 'same-origin', 'x-forwarded-proto': 'https' },
    });

    const reponse = await SORTIE(requete, recuperer);
    const cookies = reponse.headers.getSetCookie();
    expect(cookieDe('meeshy_auth', cookies)).toBe('meeshy_auth=; Max-Age=0; Path=/; SameSite=Lax; Secure');
  });

  it('après elle, GET / avec le même jar rend la vitrine', async () => {
    const { recuperer } = passerelle(() => new Response(null, { status: 200 }));
    const reponse = await SORTIE(requetePost({ cookie: JAR }), recuperer);
    const cookies = reponse.headers.getSetCookie();

    // Applique les Set-Cookie Max-Age=0 au jar simulé : retire les noms expirés.
    const expires = new Set(cookies.map((c) => c.split('=')[0]));
    const jarRestant = JAR
      .split(';')
      .map((m) => m.trim())
      .filter((m) => !expires.has(m.split('=')[0] ?? ''))
      .join('; ');

    const apres = await RACINE(new Request('https://meeshy.me/', { headers: { cookie: jarRestant } }));
    const corps = await apres.text();

    expect(corps).not.toContain('Tableau de bord');
    expect(corps.toLowerCase()).toContain('meeshy');
  });

  it('expire chaque cookie invité présenté', async () => {
    const { recuperer } = passerelle(() => new Response(null, { status: 200 }));
    const jar = `${JAR}; meeshy_guest_mshy_a=t1; meeshy_guest_mshy_b=t2`;

    const reponse = await SORTIE(requetePost({ cookie: jar }), recuperer);
    const cookies = reponse.headers.getSetCookie();

    expect(cookieDe('meeshy_guest_mshy_a', cookies)).toBe(
      'meeshy_guest_mshy_a=; Max-Age=0; Path=/chat; SameSite=Lax',
    );
    expect(cookieDe('meeshy_guest_mshy_b', cookies)).toBe(
      'meeshy_guest_mshy_b=; Max-Age=0; Path=/chat; SameSite=Lax',
    );
  });

  it('relaie le jeton de session quand le formulaire le porte', async () => {
    const { appels, recuperer } = passerelle(() => new Response(null, { status: 200 }));

    await SORTIE(requetePost({ cookie: JAR, corps: { session: 'sess-1' } }), recuperer);

    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toMatch(/\/api\/v1\/auth\/logout$/);
    expect(appels[0]?.entetes.authorization).toBe('Bearer JWT.abc');
    expect(appels[0]?.entetes['x-session-token']).toBe('sess-1');
  });

  it('sans champ session, l’appel part sans x-session-token', async () => {
    const { appels, recuperer } = passerelle(() => new Response(null, { status: 200 }));

    await SORTIE(requetePost({ cookie: JAR }), recuperer);

    expect(appels).toHaveLength(1);
    expect(appels[0]?.entetes['x-session-token']).toBeUndefined();
  });

  it('la passerelle en panne ne retient pas la sortie', async () => {
    const recuperer: Recuperateur = async () => {
      throw new Error('réseau coupé');
    };

    const reponse = await SORTIE(requetePost({ cookie: JAR }), recuperer);

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/');
    expect(cookieDe('meeshy_auth', reponse.headers.getSetCookie())).toBeDefined();
  });

  it('sans jeton, la sortie sort quand même — aucun appel passerelle', async () => {
    const { appels, recuperer } = passerelle(() => new Response(null, { status: 200 }));

    const reponse = await SORTIE(
      requetePost({ cookie: 'meeshy_session=%7B%22role%22%3A%22USER%22%7D' }),
      recuperer,
    );

    expect(reponse.status).toBe(302);
    expect(reponse.headers.get('location')).toBe('/');
    expect(cookieDe('meeshy_session', reponse.headers.getSetCookie())).toBe(
      'meeshy_session=; Max-Age=0; Path=/; SameSite=Lax',
    );
    expect(appels).toHaveLength(0);
  });

  it('un POST venu d’ailleurs est refusé — aucun Set-Cookie', async () => {
    const { appels, recuperer } = passerelle(() => new Response(null, { status: 200 }));

    const reponse = await SORTIE(requetePost({ cookie: JAR, site: 'cross-site' }), recuperer);

    expect(reponse.status).toBe(403);
    expect(reponse.headers.getSetCookie()).toEqual([]);
    expect(appels).toHaveLength(0);
  });
});

/**
 * LA ROUTE TELLE QUE NEXT L'APPELLE — la garde qui manquait.
 *
 * Un gestionnaire de route reçoit `(requête, CONTEXTE)` : Next compose son
 * second argument (`{ params }`) et le passe TOUJOURS, même à une route sans
 * segment dynamique (`next/dist/server/route-modules/app-route/module.js:210`
 * puis `:422`). Une porte qui déclarerait `recuperer` en 2ᵉ position recevrait
 * donc cet OBJET à la place d'une fonction — l'appel de passerelle mourrait en
 * `TypeError`, avalé par le best-effort : la sortie resterait VERTE ici et la
 * session ne serait JAMAIS invalidée en production. Ce témoin appelle `POST`
 * comme Next l'appelle, et regarde le `fetch` GLOBAL — celui qu'aucun test
 * n'injecte.
 */
describe('POST /deconnexion — appelée comme Next l’appelle', () => {
  it('joint quand même la passerelle quand le second argument est le contexte de Next', async () => {
    const appels: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      appels.push(String(url));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
      const commeNext = POST as unknown as (
        requete: Request,
        contexte: { readonly params: undefined },
      ) => Promise<Response>;
      const reponse = await commeNext(requetePost({ cookie: JAR }), { params: undefined });

      expect(reponse.status).toBe(302);
      expect(cookieDe('meeshy_auth', reponse.headers.getSetCookie())).toBeDefined();
      expect(appels).toHaveLength(1);
      expect(appels[0]).toMatch(/\/api\/v1\/auth\/logout$/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('GET /deconnexion — sans effet', () => {
  it('303 vers /, aucun Set-Cookie', async () => {
    const reponse = await GET();

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe('/');
    expect(reponse.headers.getSetCookie()).toEqual([]);
  });
});
