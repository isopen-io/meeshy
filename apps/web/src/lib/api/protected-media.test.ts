import { describe, expect, test } from 'bun:test';

import type { Credential } from './http';
import {
  PROTECTED_MEDIA_PATH,
  fetchProtectedObjectUrl,
  isProtectedMediaSrc,
  type ProtectedMediaDeps,
} from './protected-media';

/**
 * #7015 — LE SON DE FOND D'UNE STORY NE JOUAIT JAMAIS SUR LE WEB.
 *
 * Mesuré en production le 2026-09-18 :
 * `GET https://gate.meeshy.me/api/v1/static/d0bf39b7-…m4a` rend **401**, pas
 * 404 — le fichier EXISTE (`/app/sounds`, 18 fichiers, vérifié dans le
 * conteneur). La route porte `preValidation: [requiredAuth]`
 * (`services/gateway/src/routes/posts/audio.ts:86`) et **une balise
 * `<audio src>` n'envoie aucun en-tête `Authorization`** : la requête part
 * anonyme et se fait refuser. iOS joue ces mêmes pistes parce que son SDK
 * passe par `APIClient`, qui pose l'en-tête.
 *
 * Ces témoins gardent le SITE UNIQUE qui répare ça : les octets sont demandés
 * par `fetch` — le seul transport du navigateur qui porte un en-tête — et
 * l'élément média reçoit une URL d'OBJET. Aucun jeton ne transite par une URL.
 *
 * **REVUE-CORRECTION (défaut 2)** — `fetchProtectedObjectUrl` rendait un
 * `null` unique pour toute indisponibilité : refus, absence, coupure
 * modération, réseau tombé et rendu sans identité étaient INDISCERNABLES pour
 * l'appelant. Il rend désormais un résultat DISCRIMINÉ —
 * `{ kind: 'ready', url }` ou `{ kind: 'unavailable', reason }`, JAMAIS un
 * rejet.
 */
const CREDENTIAL: Credential = { kind: 'registered', token: 'jwt-1' };
const GATE = 'https://gate.meeshy.me';
const SON = `${GATE}${PROTECTED_MEDIA_PATH}d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a`;

type Appel = { readonly url: string; readonly headers: Record<string, string> };

/**
 * CE QUE LA ROUTE SERT VRAIMENT — mesuré, jamais supposé :
 * `GET /static/:filename` refuse toute extension hors
 * `ALLOWED_AUDIO_EXT` (`services/gateway/src/services/posts/soundFormats.ts`)
 * puis pose `Content-Type: EXT_TO_MIME[ext]` — six entrées, toutes `audio/*`
 * (`.m4a` → `audio/x-m4a`). Le repli `application/octet-stream` de
 * `audio.ts:155` est INATTEIGNABLE : les six extensions admises sont
 * exactement les six clés de la carte. Le fixture porte donc la forme de
 * production, pas une forme commode.
 */
const audioServi = (): Response =>
  new Response(new Blob(['octets'], { type: 'audio/x-m4a' }), { status: 200, headers: { 'content-type': 'audio/x-m4a' } });

/**
 * L'INDEX DU SPA, SERVI EN `200` — la SECONDE FORME que `media-url.ts`
 * documente pour les images, rejouée sur le son. `apiConfig.base` vaut `''`
 * par défaut (`config.ts:24`, valide derrière un proxy SEULEMENT) : hors
 * proxy, le `fetch` part vers l'origine WEB, qui répond `200 text/html` avec
 * son propre `index.html`. Le corps n'est pas vide, le statut est `ok` — et
 * rien d'autre ne distingue cette réponse d'une piste.
 */
const spaIndexHtml = (): Response =>
  new Response(new Blob(['<!doctype html><html><body>meeshy</body></html>'], { type: 'text/html' }), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

function deps(options: {
  readonly reponse?: () => Promise<Response>;
  readonly credential?: Credential | null;
  readonly appels?: Appel[];
  readonly objectUrl?: (blob: Blob) => string;
}): ProtectedMediaDeps {
  return {
    credential: () => ('credential' in options ? options.credential ?? null : CREDENTIAL),
    fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, name) => {
        headers[name] = value;
      });
      options.appels?.push({ url: String(input), headers });
      return (options.reponse ?? (() => Promise.resolve(audioServi())))();
    }) as typeof fetch,
    createObjectURL: options.objectUrl ?? (() => 'blob:meeshy/1'),
    revokeObjectURL: () => undefined,
  };
}

describe('isProtectedMediaSrc — la SEULE route média de la passerelle qui exige une identité', () => {
  test('la route de diffusion des sons de fond, absolue ou relative', () => {
    expect(isProtectedMediaSrc(SON)).toBe(true);
    expect(isProtectedMediaSrc(`${PROTECTED_MEDIA_PATH}42af6b03-975a-4232-9123-de3301dc260c.mp3`)).toBe(true);
  });

  test('CONTRASTE — rien d’autre ne passe par ce transport', () => {
    // `GET /attachments/file/*` est servie SANS authentification
    // (`download.ts`) : la faire passer par `fetch` coûterait un octet de
    // mémoire par média du fil, pour rien.
    expect(isProtectedMediaSrc(`${GATE}/api/v1/attachments/file/2026%2F09%2Fvoix.m4a`)).toBe(false);
    expect(isProtectedMediaSrc('blob:https://meeshy.me/1234')).toBe(false);
    expect(isProtectedMediaSrc('data:audio/mp4;base64,AAAA')).toBe(false);
    expect(isProtectedMediaSrc('')).toBe(false);
  });

  test('le PRÉFIXE se lit sur le chemin, jamais sur la chaîne entière', () => {
    // Un chemin qui CONTIENT le mot sans en être.
    expect(isProtectedMediaSrc(`${GATE}/api/v1/posts/api/v1/static/x.m4a`)).toBe(false);
    expect(isProtectedMediaSrc(`${GATE}/api/v1/statics/x.m4a`)).toBe(false);
  });
});

describe('fetchProtectedObjectUrl — l’identité voyage en EN-TÊTE, jamais en paramètre', () => {
  test('la requête porte `Authorization`, et rend `{ kind: \'ready\', url }`', async () => {
    const appels: Appel[] = [];
    const result = await fetchProtectedObjectUrl(SON, deps({ appels }));
    expect(result).toEqual({ kind: 'ready', url: 'blob:meeshy/1' });
    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe(SON);
    expect(appels[0]?.headers['authorization']).toBe('Bearer jwt-1');
    // LA GARDE QUI COMPTE : aucun secret dans l’URL demandée (CLAUDE.md § 4).
    expect(appels[0]?.url).not.toContain('jwt-1');
    expect(appels[0]?.url).not.toContain('token=');
  });

  test('l’INVITÉ D’UN LIEN parle `X-Session-Token` — la route accepte les deux régimes', async () => {
    const appels: Appel[] = [];
    await fetchProtectedObjectUrl(SON, deps({ appels, credential: { kind: 'anonymous', sessionToken: 'sess-1' } }));
    expect(appels[0]?.headers['x-session-token']).toBe('sess-1');
    expect(appels[0]?.headers['authorization']).toBeUndefined();
  });

  test('SANS crédential, AUCUNE requête n’est tentée — `{ kind: \'unavailable\', reason: \'no-identity\' }`', async () => {
    const appels: Appel[] = [];
    const result = await fetchProtectedObjectUrl(SON, deps({ appels, credential: null }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'no-identity' });
    expect(appels).toHaveLength(0);
  });
});

/**
 * UNE INDISPONIBILITÉ DÉGRADE — jamais une promesse rejetée, et désormais
 * jamais un `null` muet : chaque branche rend SA raison, et l'appelant peut
 * enfin la dire (revue-correction #7015, défaut 2).
 */
describe('une indisponibilité DÉGRADE — jamais une promesse rejetée, et la RAISON voyage', () => {
  test('un refus (401) rend `{ kind: \'unavailable\', reason: \'refused\' }`, sans rejeter', async () => {
    const result = await fetchProtectedObjectUrl(SON, deps({ reponse: () => Promise.resolve(new Response('', { status: 401 })) }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'refused' });
  });

  test('un refus (403) rend aussi `\'refused\'` — même famille que 401', async () => {
    const result = await fetchProtectedObjectUrl(SON, deps({ reponse: () => Promise.resolve(new Response('', { status: 403 })) }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'refused' });
  });

  test('un fichier absent (404) rend `{ kind: \'unavailable\', reason: \'missing\' }`', async () => {
    const result = await fetchProtectedObjectUrl(SON, deps({ reponse: () => Promise.resolve(new Response('', { status: 404 })) }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'missing' });
  });

  test('un son COUPÉ (410, `mutedAt`) rend `{ kind: \'unavailable\', reason: \'muted\' }`', async () => {
    const result = await fetchProtectedObjectUrl(SON, deps({ reponse: () => Promise.resolve(new Response('', { status: 410 })) }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'muted' });
  });

  test('le RÉSEAU qui tombe rend `{ kind: \'unavailable\', reason: \'offline\' }` — le rejet est rattrapé ICI', async () => {
    const result = await fetchProtectedObjectUrl(SON, deps({ reponse: () => Promise.reject(new TypeError('Failed to fetch')) }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'offline' });
  });

  test('un corps VIDE ne fabrique pas une piste muette — `\'missing\'`', async () => {
    const result = await fetchProtectedObjectUrl(SON, deps({ reponse: () => Promise.resolve(new Response(new Blob([]), { status: 200 })) }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'missing' });
  });

  test('`createObjectURL` indisponible (rendu hors navigateur) rend `\'missing\'`', async () => {
    const result = await fetchProtectedObjectUrl(SON, deps({
      objectUrl: () => {
        throw new TypeError('createObjectURL is not a function');
      },
    }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'missing' });
  });

  test('une source NON protégée ne part jamais sur ce transport', async () => {
    const appels: Appel[] = [];
    const result = await fetchProtectedObjectUrl('https://cdn.test/track.mp3', deps({ appels }));
    expect(result.kind).toBe('unavailable');
    expect(appels).toHaveLength(0);
  });
});

/**
 * UN `200` N'EST PAS UNE PISTE — le type SERVI décide (revue-correction #7015).
 *
 * `response.ok` + `blob.size !== 0` laissaient passer N'IMPORTE QUEL corps non
 * vide. Le cas n'est pas théorique : `apiConfig.base` vaut `''` par défaut
 * (`config.ts:24`), une valeur qui n'est juste que DERRIÈRE UN PROXY. Hors
 * proxy — les deux coques Capacitor, une PWA servie sans relais — la requête
 * part vers l'origine WEB et reçoit `200 text/html`, l'`index.html` du SPA.
 * `createObjectURL` rendait alors une URL d'objet **de HTML**, posée en
 * `<audio src>` : `readyState` reste 0, aucun son, aucune erreur, et surtout
 * **pas de `null`** — donc la balise est montée et la dégradation dessinée ne
 * se déclenche JAMAIS. Un échec de RÉSOLUTION déguisé en piste muette, exactement
 * ce que `media-url.ts` § « LA SECONDE FORME » décrit pour les images.
 *
 * La garde est FERMÉE : ce qui n'est pas `audio/*` n'est pas servi. Le seul
 * producteur de cette route pose un `Content-Type` de `EXT_TO_MIME`, tous
 * `audio/*` — rien de légitime ne tombe ici.
 */
describe('le TYPE servi décide — un `200` qui n’est pas de l’audio n’est pas une piste', () => {
  test('le SPA qui répond `200 text/html` (son propre index) ne devient JAMAIS une piste', async () => {
    let objectUrls = 0;
    const result = await fetchProtectedObjectUrl(
      SON,
      deps({
        reponse: () => Promise.resolve(spaIndexHtml()),
        objectUrl: () => {
          objectUrls += 1;
          return 'blob:meeshy/html';
        },
      }),
    );
    expect(result).toEqual({ kind: 'unavailable', reason: 'missing' });
    // Pas d'URL d'objet du tout : des octets de HTML ne doivent ni être
    // publiés ni rester en mémoire en attendant une révocation que personne
    // ne fera.
    expect(objectUrls).toBe(0);
  });

  test('une erreur JSON servie en `200` (un relais qui enveloppe) ne devient pas une piste', async () => {
    const result = await fetchProtectedObjectUrl(
      SON,
      deps({
        reponse: () =>
          Promise.resolve(
            new Response(new Blob(['{"success":false,"error":"Unauthorized"}'], { type: 'application/json' }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          ),
      }),
    );
    expect(result).toEqual({ kind: 'unavailable', reason: 'missing' });
  });

  test('un corps SANS type annoncé ne passe pas non plus — la garde est FERMÉE', async () => {
    const result = await fetchProtectedObjectUrl(SON, deps({ reponse: () => Promise.resolve(new Response(new Blob(['octets']), { status: 200 })) }));
    expect(result).toEqual({ kind: 'unavailable', reason: 'missing' });
  });

  test('CONTRASTE — le type que la route SERT vraiment passe, et rend `{ kind: \'ready\', url }`', async () => {
    expect(await fetchProtectedObjectUrl(SON, deps({ reponse: () => Promise.resolve(audioServi()) }))).toEqual({
      kind: 'ready',
      url: 'blob:meeshy/1',
    });
    // Les six MIME de `EXT_TO_MIME`, un par extension servable.
    for (const mime of ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/aac', 'audio/ogg']) {
      const result = await fetchProtectedObjectUrl(
        SON,
        deps({ reponse: () => Promise.resolve(new Response(new Blob(['octets'], { type: mime }), { status: 200 })) }),
      );
      expect(result).toEqual({ kind: 'ready', url: 'blob:meeshy/1' });
    }
  });

  test('le PARAMÈTRE du type ne change rien — `audio/ogg; codecs=opus` reste de l’audio', async () => {
    const result = await fetchProtectedObjectUrl(
      SON,
      deps({
        reponse: () =>
          Promise.resolve(new Response(new Blob(['octets'], { type: 'audio/ogg; codecs=opus' }), { status: 200 })),
      }),
    );
    expect(result).toEqual({ kind: 'ready', url: 'blob:meeshy/1' });
  });
});
