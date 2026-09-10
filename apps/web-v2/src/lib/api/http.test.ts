import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from './http';

/**
 * `createHttpTransport` — LE CLIENT HTTP RÉEL, `fetchImpl` INJECTÉ (#5605, T2).
 *
 * Chaque charge de test recopie la FORME EXACTE d'une route du gateway,
 * commentée par sa source — jamais une jumelle inventée (§ 3.6 de la
 * spécification).
 */

type RecordedCall = { readonly url: string; readonly init: RequestInit };

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: RecordedCall[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    });
  }) as typeof fetch;
  return { impl, calls };
}

function headerOf(init: RequestInit, name: string): string | null {
  const headers = init.headers;
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) return headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  if (headers && typeof headers === 'object') {
    const entry = Object.entries(headers as Record<string, string>).find(
      ([k]) => k.toLowerCase() === name.toLowerCase(),
    );
    return entry?.[1] ?? null;
  }
  return null;
}

describe('createHttpTransport — composition d’URL', () => {
  test('base relative + chemin préfixé ⇒ URL relative, sans double préfixe', async () => {
    // forme : routes/auth/login.ts:206-212
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { ok: true } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await transport.request({ method: 'POST', path: '/api/v1/auth/login' });
    expect(calls[0]?.url).toBe('/api/v1/auth/login');
  });

  test('base absolue + même chemin ⇒ URL absolue, sans double préfixe', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: 'https://gate.staging.meeshy.me', fetchImpl: impl });
    await transport.request({ method: 'POST', path: '/api/v1/auth/login' });
    expect(calls[0]?.url).toBe('https://gate.staging.meeshy.me/api/v1/auth/login');
  });
});

describe('createHttpTransport — les deux régimes d’identité (APIClient.swift:480-483)', () => {
  test('crédential enregistré ⇒ Authorization Bearer, PAS de X-Session-Token', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({
      base: '',
      fetchImpl: impl,
      credential: () => ({ kind: 'registered', token: 'jwt-1' }),
    });
    await transport.request({ method: 'GET', path: '/api/v1/me' });
    expect(headerOf(calls[0]!.init, 'Authorization')).toBe('Bearer jwt-1');
    expect(headerOf(calls[0]!.init, 'X-Session-Token')).toBeNull();
  });

  test('crédential anonyme ⇒ X-Session-Token, PAS d’Authorization', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({
      base: '',
      fetchImpl: impl,
      credential: () => ({ kind: 'anonymous', sessionToken: 'anon_1' }),
    });
    await transport.request({ method: 'GET', path: '/api/v1/posts/p1' });
    expect(headerOf(calls[0]!.init, 'X-Session-Token')).toBe('anon_1');
    expect(headerOf(calls[0]!.init, 'Authorization')).toBeNull();
  });

  test('aucun crédential ⇒ aucun des deux en-têtes', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await transport.request({ method: 'GET', path: '/api/v1/posts/p1' });
    expect(headerOf(calls[0]!.init, 'Authorization')).toBeNull();
    expect(headerOf(calls[0]!.init, 'X-Session-Token')).toBeNull();
  });
});

describe('createHttpTransport — X-Device-Locale (rang 4 du Prisme)', () => {
  test('résolveur présent ⇒ en-tête posé avec sa valeur', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl, deviceLocale: () => 'fr-FR' });
    await transport.request({ method: 'GET', path: '/api/v1/me' });
    expect(headerOf(calls[0]!.init, 'X-Device-Locale')).toBe('fr-FR');
  });

  test('résolveur absent ⇒ en-tête absent, jamais "undefined"', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await transport.request({ method: 'GET', path: '/api/v1/me' });
    expect(headerOf(calls[0]!.init, 'X-Device-Locale')).toBeNull();
  });
});

describe('createHttpTransport — l’enveloppe', () => {
  test('succès 200 ⇒ { ok: true, data, pagination }', async () => {
    // forme : sendSuccess() / services/gateway/src/utils/response.ts
    const { impl } = fakeFetch({
      status: 200,
      body: { success: true, data: { id: 'c-1' }, pagination: { total: 1, offset: 0, limit: 20, hasMore: false } },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await transport.request<{ id: string }>({ method: 'GET', path: '/api/v1/conversations' });
    expect(result).toEqual({
      ok: true,
      data: { id: 'c-1' },
      status: 200,
      pagination: { total: 1, offset: 0, limit: 20, hasMore: false },
    });
  });

  test('succès 201 ⇒ status: 201 posé (#5814, distingue « créée » de 200 « inchangée »)', async () => {
    // forme : routes/reactions.ts:132-270 (POST /api/v1/reactions, création)
    const { impl } = fakeFetch({ status: 201, body: { success: true, data: { id: 'r-1' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await transport.request<{ id: string }>({ method: 'POST', path: '/api/v1/reactions' });
    expect(result).toEqual({ ok: true, data: { id: 'r-1' }, status: 201 });
  });

  test('DELETE part avec la méthode et SANS corps (#5814, retrait d’une réaction)', async () => {
    // forme : routes/reactions.ts:279-283 (DELETE /api/v1/reactions/:messageId/:emoji)
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { message: 'ok' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await transport.request({ method: 'DELETE', path: '/api/v1/reactions/m1/%F0%9F%91%8D' });
    expect(calls[0]?.init.method).toBe('DELETE');
    expect(calls[0]?.init.body).toBeUndefined();
  });

  test('échec 401 ⇒ { ok: false, status, error, code } — error est une CHAÎNE PLATE', async () => {
    // forme : routes/auth/login.ts:133 (sendUnauthorized)
    const { impl } = fakeFetch({
      status: 401,
      body: { success: false, error: 'Identifiants invalides', code: 'INVALID_CREDENTIALS' },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await transport.request({ method: 'POST', path: '/api/v1/auth/login' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(typeof result.error).toBe('string');
    expect(result).toEqual({ ok: false, status: 401, error: 'Identifiants invalides', code: 'INVALID_CREDENTIALS' });
  });

  test('panne réseau ⇒ { ok: false, status: 0, error } — jamais une exception avalée', async () => {
    const impl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await transport.request({ method: 'GET', path: '/api/v1/me' });
    expect(result).toEqual({ ok: false, status: 0, error: 'network down' });
  });

  test('401 sur un appel PORTANT un crédential appelle onUnauthorized ; 403/500 ne l’appellent PAS', async () => {
    let calls401 = 0;
    const unauthorized = () => {
      calls401 += 1;
    };
    const credential = () => ({ kind: 'registered' as const, token: 'jwt-1' });

    const { impl: impl401 } = fakeFetch({ status: 401, body: { success: false, error: 'x' } });
    await createHttpTransport({ base: '', fetchImpl: impl401, credential, onUnauthorized: unauthorized }).request({
      method: 'GET',
      path: '/api/v1/me',
    });
    expect(calls401).toBe(1);

    const { impl: impl403 } = fakeFetch({ status: 403, body: { success: false, error: 'x' } });
    await createHttpTransport({ base: '', fetchImpl: impl403, credential, onUnauthorized: unauthorized }).request({
      method: 'GET',
      path: '/api/v1/me',
    });
    expect(calls401).toBe(1);

    const { impl: impl500 } = fakeFetch({ status: 500, body: { success: false, error: 'x' } });
    await createHttpTransport({ base: '', fetchImpl: impl500, credential, onUnauthorized: unauthorized }).request({
      method: 'GET',
      path: '/api/v1/me',
    });
    expect(calls401).toBe(1);
  });

  test('401 sur un appel SANS crédential ne dit rien du jeton courant — POST /auth/login refusé ne déconnecte personne', async () => {
    let calls401 = 0;
    // forme : routes/auth/login.ts:133 — `security: []`, aucun jeton présenté.
    const { impl } = fakeFetch({
      status: 401,
      body: { success: false, error: 'Identifiants invalides', code: 'INVALID_CREDENTIALS' },
    });
    await createHttpTransport({
      base: '',
      fetchImpl: impl,
      onUnauthorized: () => {
        calls401 += 1;
      },
    }).request({ method: 'POST', path: '/api/v1/auth/login', body: { username: 'a', password: 'faux' } });

    expect(calls401).toBe(0);
  });
});

describe('createHttpTransport — le champ d’un refus (#5555, T1)', () => {
  test('un corps { field: "email" } rend { ok:false, field:"email" } — forme register.ts:401-407 / 409', async () => {
    const { impl } = fakeFetch({
      status: 409,
      body: { success: false, error: 'Adresse déjà utilisée', code: 'EMAIL_TAKEN', field: 'email' },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await transport.request({ method: 'POST', path: '/api/v1/auth/register' });
    expect(result).toEqual({ ok: false, status: 409, error: 'Adresse déjà utilisée', code: 'EMAIL_TAKEN', field: 'email' });
  });

  test('un refus AJV — `details` en TABLEAU, sans field à la racine — rend quand même `field` (mesuré en direct sur gate.staging.meeshy.me, POST /auth/register, mot de passe de 5 caractères)', async () => {
    const { impl } = fakeFetch({
      status: 400,
      body: {
        success: false,
        error: 'Validation Error',
        message: 'body/password must NOT have fewer than 12 characters',
        code: 'VALIDATION_ERROR',
        details: [{ field: 'password', message: 'must NOT have fewer than 12 characters' }],
      },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await transport.request({ method: 'POST', path: '/api/v1/auth/register' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.field).toBe('password');
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  test('un corps sans field rend un échec SANS la clé — forme login.ts:133', async () => {
    const { impl } = fakeFetch({
      status: 401,
      body: { success: false, error: 'Identifiants invalides', code: 'INVALID_CREDENTIALS' },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await transport.request({ method: 'POST', path: '/api/v1/auth/login' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect('field' in result).toBe(false);
  });

  test('un 429 rend `retryAfter` — forme rate-limiter.ts:307 (#5912)', async () => {
    const { impl } = fakeFetch({
      status: 429,
      body: { success: false, error: 'RATE_LIMIT_EXCEEDED', message: "Trop de tentatives d'inscription (limite: 3/5min).", retryAfter: 300, limit: 3 },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await transport.request({ method: 'POST', path: '/api/v1/auth/register' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.retryAfter).toBe(300);
  });

  test('un corps sans retryAfter rend un échec SANS la clé', async () => {
    const { impl } = fakeFetch({
      status: 409,
      body: { success: false, error: 'Adresse déjà utilisée', code: 'EMAIL_TAKEN', field: 'email' },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await transport.request({ method: 'POST', path: '/api/v1/auth/register' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect('retryAfter' in result).toBe(false);
  });
});

describe('createHttpTransport — l’annulation', () => {
  test('le signal de l’appelant est TRANSMIS à fetch — l’annuler annule ce que fetch reçoit', async () => {
    // `timeoutMs` désactivé : sans lui, `signal` serait un composé
    // (`AbortSignal.any`) et ne serait plus `===` au signal de l'appelant —
    // c'est l'ÉTAT d'annulation qui se propage, jamais l'IDENTITÉ de l'objet.
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const controller = new AbortController();
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 0 });

    await transport.request({ method: 'GET', path: '/api/v1/conversations', signal: controller.signal });

    expect(calls[0]!.init.signal).toBe(controller.signal);
  });

  test('caller ET délai actifs ensemble ⇒ fetch reçoit un signal composé qui reflète l’annulation du caller', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const controller = new AbortController();
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 60_000 });

    await transport.request({ method: 'GET', path: '/api/v1/conversations', signal: controller.signal });

    const signal = calls[0]!.init.signal as AbortSignal | undefined;
    expect(signal).not.toBeUndefined();
    expect(signal).not.toBe(controller.signal);
    expect(signal!.aborted).toBe(false);
    controller.abort();
    expect(signal!.aborted).toBe(true);
  });

  test('une requête annulée par l’appelant se distingue d’une panne réseau — code ABORTED (état du signal, pas le nom de l’erreur)', async () => {
    const controller = new AbortController();
    const impl = (async () => {
      controller.abort();
      // Le mock ne prend pas la peine d'imiter `DOMException`/`AbortError` —
      // c'est exactement le cas que la doctrine de `abortCode` couvre.
      throw new Error('fetch aborted');
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 0 });

    const result = await transport.request({ method: 'GET', path: '/api/v1/conversations', signal: controller.signal });

    expect(result).toEqual({ ok: false, status: 0, error: 'fetch aborted', code: 'ABORTED' });
  });

  test('un appel SANS signal explicite dont fetchImpl lève quand même une AbortError ⇒ code ABORTED (repli sur le nom)', async () => {
    const impl = (async () => {
      throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 0 });

    const result = await transport.request({ method: 'GET', path: '/api/v1/conversations' });

    expect(result).toEqual({ ok: false, status: 0, error: 'The operation was aborted.', code: 'ABORTED' });
  });

  test('panne réseau SANS aucun signal actif ⇒ toujours sans code (comportement inchangé)', async () => {
    const impl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 0 });
    const result = await transport.request({ method: 'GET', path: '/api/v1/me' });
    expect(result).toEqual({ ok: false, status: 0, error: 'network down' });
  });
});

describe('createHttpTransport — le délai de garde (#5605, revue-correction)', () => {
  test('sans timeoutMs explicite, DEFAULT_TIMEOUT_MS pose quand même un signal transmis à fetch', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await transport.request({ method: 'GET', path: '/api/v1/me' });
    expect(calls[0]!.init.signal instanceof AbortSignal).toBe(true);
  });

  test('une réponse plus lente que timeoutMs ⇒ { ok:false, code: "TIMEOUT" }, distinct de ABORTED', async () => {
    // `fetchImpl` respecte le signal comme le ferait un vrai `fetch` : il ne
    // se résout QUE si le signal ne s'est pas déjà déclenché.
    const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        signal?.addEventListener('abort', () => reject(signal.reason));
      });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 10 });

    const result = await transport.request({ method: 'GET', path: '/api/v1/me' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('TIMEOUT');
    expect(result.status).toBe(0);
  });

  test('timeoutMs: 0 désactive le délai — aucun signal si l’appelant n’en fournit pas non plus', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 0 });
    await transport.request({ method: 'GET', path: '/api/v1/me' });
    expect(calls[0]!.init.signal).toBeUndefined();
  });
});

describe('createHttpTransport — le corps JSON', () => {
  test('corps présent ⇒ Content-Type + JSON.stringify', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await transport.request({ method: 'POST', path: '/api/v1/auth/login', body: { username: 'a', password: 'b' } });
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBe('application/json');
    expect(calls[0]!.init.body).toBe(JSON.stringify({ username: 'a', password: 'b' }));
  });

  test('corps absent ⇒ ni Content-Type ni corps — POST …/mark-unread', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await transport.request({ method: 'POST', path: '/api/v1/conversations/c-1/mark-unread' });
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();
    expect(calls[0]!.init.body).toBeUndefined();
  });
});

describe('createHttpTransport — en-têtes fournis par l’appelant (motif APIClient.swift, appliqués en dernier)', () => {
  test('un en-tête explicite est posé, et gagne sur le défaut du crédential — logout avec X-Session-Token', async () => {
    // forme : routes/auth/login.ts:355 (logout), en-tête x-session-token optionnel
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { message: 'ok' } } });
    const transport = createHttpTransport({
      base: '',
      fetchImpl: impl,
      credential: () => ({ kind: 'registered', token: 'jwt-1' }),
    });
    await transport.request({
      method: 'POST',
      path: '/api/v1/auth/logout',
      headers: { 'X-Session-Token': 'sess-1', Authorization: 'Bearer jwt-override' },
    });
    expect(headerOf(calls[0]!.init, 'X-Session-Token')).toBe('sess-1');
    expect(headerOf(calls[0]!.init, 'Authorization')).toBe('Bearer jwt-override');
  });
});

describe('createHttpTransport — le verbe GET du contrat Transport (T5)', () => {
  test('le port `Transport` accepte GET', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    // Vérifie l'appelable en tant que `Transport` (method/path/body, sans le
    // générique de retour) — c'est le contrat que `net/transport.ts` déclare.
    await transport({ method: 'GET', path: '/api/v1/me' });
    expect(calls[0]?.url).toBe('/api/v1/me');
  });
});

/**
 * UN CORPS `FormData` (#5668) — `POST /api/v1/attachments/upload`
 * (`services/gateway/src/routes/attachments/upload.ts:59-207`,
 * `consumes: ['multipart/form-data']`). Le témoin qui compte : AUCUN
 * `Content-Type` posé par ce transport — c'est le navigateur qui doit
 * l'écrire avec son `boundary`, un en-tête figé ici l'en empêcherait.
 */
describe('createHttpTransport — un corps FormData ne pose JAMAIS son propre Content-Type', () => {
  test('req.body instanceof FormData ⇒ aucun Content-Type, le FormData transmis TEL QUEL', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { attachments: [] } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const form = new FormData();
    form.append('files', new Blob(['x'], { type: 'image/png' }), 'a.png');

    await transport.request({ method: 'POST', path: '/api/v1/attachments/upload', body: form });

    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();
    expect(calls[0]!.init.body).toBe(form);
  });

  test('un corps JSON ordinaire pose TOUJOURS Content-Type: application/json (non-régression)', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await transport.request({ method: 'POST', path: '/api/v1/conversations/c-a/messages', body: { content: 'x' } });

    expect(headerOf(calls[0]!.init, 'Content-Type')).toBe('application/json');
  });
});


/**
 * LE DÉLAI PAR APPEL (revue-correction #5668) — `DEFAULT_TIMEOUT_MS` (15 s)
 * est arbitré contre le p95 d'un appel JSON ; un TÉLÉVERSEMENT dure en
 * proportion des OCTETS. Sans cette porte, `POST /attachments/upload`
 * héritait des 15 s et AUCUNE photo n'aboutissait sur le profil Fast 3G que
 * `budgets.json` déclare — l'échec se lisant « la passerelle n'a pas répondu »,
 * qui accuse le serveur d'une horloge cliente.
 *
 * Le témoin s'écrit sur le SIGNAL passé à `fetch`, pas sur une attente réelle :
 * un `AbortSignal.timeout(1)` est déjà avorté au tour de boucle suivant, un
 * `AbortSignal.timeout(600_000)` ne l'est jamais. On mesure donc lequel des
 * deux délais a été composé.
 */
describe('createHttpTransport — le délai de garde PAR APPEL', () => {
  const abortedAfterATick = async (init: RequestInit): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return init.signal?.aborted === true;
  };

  test('sans `timeoutMs` sur la requête, le délai du TRANSPORT s’applique', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 1 });
    await transport.request({ method: 'GET', path: '/api/v1/conversations' });
    expect(await abortedAfterATick(calls[0]!.init)).toBe(true);
  });

  test('`timeoutMs` sur la requête REMPLACE celui du transport — un téléversement a le sien', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: {} } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 1 });
    await transport.request({ method: 'POST', path: '/api/v1/attachments/upload', body: new FormData(), timeoutMs: 600_000 });
    expect(await abortedAfterATick(calls[0]!.init)).toBe(false);
  });
});
