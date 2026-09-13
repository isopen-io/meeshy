import {
  classifySmokeStatus,
  resolveRoutePath,
  runRouteSmokeTest,
  selectSmokeRoutes,
  summarizeSmokeResults,
  type ManifestRoute,
  type SmokeResult
} from '../../utils/route-smoke';

const route = (overrides: Partial<ManifestRoute> = {}): ManifestRoute => ({
  method: 'GET',
  path: '/api/v1/x',
  module: 'x',
  mountPrefix: '/api/v1/x',
  securityLevel: 'inconnu',
  ...overrides
});

describe('resolveRoutePath', () => {
  it('replaces every :param segment with the placeholder id', () => {
    expect(resolveRoutePath('/api/v1/users/:id/friends/:friendId')).toBe(
      '/api/v1/users/000000000000000000000000/friends/000000000000000000000000'
    );
  });

  it('leaves a path without params untouched', () => {
    expect(resolveRoutePath('/api/v1/auth/login')).toBe('/api/v1/auth/login');
  });

  /**
   * Un segment JOKER n'est pas un `:param` et échappait donc à la
   * substitution : la sonde interrogeait `/api/v1/attachments/file/*` avec un
   * astérisque LITTÉRAL (#5857). L'URL n'avait aucun sens, et le verdict qui
   * en sortait n'en avait pas davantage.
   */
  it('replaces a wildcard segment too — a literal * is not a path', () => {
    expect(resolveRoutePath('/api/v1/attachments/file/*')).toBe(
      '/api/v1/attachments/file/000000000000000000000000'
    );
  });
});

describe('selectSmokeRoutes', () => {
  it('keeps routes mounted under /api', () => {
    const routes = [route({ path: '/api/v1/directory/friend-requests', method: 'POST' })];
    expect(selectSmokeRoutes(routes)).toEqual(routes);
  });

  it('drops routes outside /api — /health is not part of the client-facing surface', () => {
    expect(selectSmokeRoutes([route({ path: '/health' })])).toEqual([]);
  });

  it('drops methods a smoke probe must not send (HEAD, OPTIONS)', () => {
    expect(selectSmokeRoutes([route({ method: 'OPTIONS' }), route({ method: 'HEAD' })])).toEqual([]);
  });
});

/**
 * **Deux 404 se ressemblent au STATUT et se distinguent au CORPS (#5857).**
 *
 * La sonde interroge chaque `:param` avec un ObjectId qui n'existe pas. Une
 * route PUBLIQUE de lecture-par-identifiant répond donc légitimement 404 —
 * mesuré sur staging le 2026-09-09, douze routes déclarées « absentes » alors
 * qu'elles servaient :
 *
 *     GET /api/v1/users/000…0   404 {"success":false,"error":"User not found"}
 *     GET /api/v1/inexistante   404 {"error":"Not Found","statusCode":404}
 *
 * Le premier corps est celui de `sendError()` — le producteur UNIQUE des
 * réponses du gateway (§ « API Response Format ») : le voir PROUVE que notre
 * handler a tourné, donc que la route existe. Le second est le
 * `notFoundHandler` de Fastify.
 *
 * La règle est donc POSITIVE et fail-closed : un 404 n'est « présent » que
 * s'il porte la signature de notre propre producteur. Tout autre 404 — la
 * forme Fastify, un corps vide, du HTML de proxy — n'a rien prouvé et reste
 * « absent ». Se fier à la forme de Fastify pour conclure à l'absence
 * pencherait dans l'autre sens : le jour où elle change, une route vraiment
 * disparue passerait pour présente.
 */
describe('classifySmokeStatus', () => {
  const erreurApplicative = { success: false, error: 'User not found', message: 'User not found' };
  const erreurFastify = {
    message: 'Route GET:/api/v1/inexistante not found',
    error: 'Not Found',
    statusCode: 404
  };

  it('classifies 404 as absent when Fastify itself answered — the route is not registered', () => {
    expect(classifySmokeStatus(404, erreurFastify)).toBe('absent');
  });

  it('classifies 404 as PRESENT when our own handler answered — the entity is missing, not the route', () => {
    expect(classifySmokeStatus(404, erreurApplicative)).toBe('present');
  });

  it.each([
    ['un corps absent', undefined],
    ['un corps vide', {}],
    ['du HTML de proxy', '<html>404</html>'],
    ['un tableau', []]
  ])('classifies 404 as absent on %s — rien ne PROUVE que la route a tourné', (_nom, corps) => {
    expect(classifySmokeStatus(404, corps)).toBe('absent');
  });

  it.each([200, 400, 401, 403, 422, 429, 500])(
    'classifies %i as present — the route exists, it just answered %i',
    (status) => {
      expect(classifySmokeStatus(status)).toBe('present');
    }
  );
});

describe('summarizeSmokeResults', () => {
  it('separates confirmed-absent and unreachable routes from confirmed-present ones', () => {
    const results: SmokeResult[] = [
      { method: 'GET', path: '/api/v1/a', module: 'a', status: 200, verdict: 'present' },
      { method: 'POST', path: '/api/v1/b', module: 'b', status: 404, verdict: 'absent' },
      { method: 'GET', path: '/api/v1/c', module: 'c', status: 'network-error', verdict: 'unreachable' }
    ];
    expect(summarizeSmokeResults(results)).toEqual({
      total: 3,
      absent: [results[1]],
      unreachable: [results[2]]
    });
  });
});

describe('runRouteSmokeTest', () => {
  const target: ManifestRoute[] = [
    { method: 'POST', path: '/api/v1/directory/friend-requests', module: 'friendRequestsRoutes', mountPrefix: '', securityLevel: 'inconnu' }
  ];

  it('proves RED: a route absent from the deployed revision (404) fails the smoke test — this is #5644 reproduced', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 404,
      body: { message: 'Route POST:/api/v1/directory/friend-requests not found', error: 'Not Found', statusCode: 404 }
    });
    const results = await runRouteSmokeTest({ baseUrl: 'https://gate.staging.meeshy.me', routes: target, fetchImpl });
    expect(summarizeSmokeResults(results).absent).toHaveLength(1);
  });

  it('passes GREEN once the route answers with anything but 404 (401 = present, auth required)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 401 });
    const results = await runRouteSmokeTest({ baseUrl: 'https://gate.staging.meeshy.me', routes: target, fetchImpl });
    expect(summarizeSmokeResults(results).absent).toHaveLength(0);
  });

  it("ne rougit PAS sur un 404 de notre propre handler — c'est l'entité qui manque, pas la route (#5857)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 404,
      body: { success: false, error: 'User not found', message: 'User not found' }
    });
    const results = await runRouteSmokeTest({ baseUrl: 'https://gate.staging.meeshy.me', routes: target, fetchImpl });
    expect(summarizeSmokeResults(results).absent).toHaveLength(0);
  });

  it('marks a network failure unreachable, never present — a dead host must not pass silently', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const results = await runRouteSmokeTest({ baseUrl: 'https://gate.staging.meeshy.me', routes: target, fetchImpl });
    const summary = summarizeSmokeResults(results);
    expect(summary.unreachable).toHaveLength(1);
    expect(summary.absent).toHaveLength(0);
  });

  it('builds the request URL by resolving path params against the base URL, and tags the probe header', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200 });
    await runRouteSmokeTest({
      baseUrl: 'https://gate.staging.meeshy.me',
      routes: [{ method: 'GET', path: '/api/v1/users/:id', module: 'usersRoutes', mountPrefix: '', securityLevel: 'inconnu' }],
      fetchImpl
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://gate.staging.meeshy.me/api/v1/users/000000000000000000000000',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-Meeshy-Smoke-Test': '1' })
      })
    );
  });

  it('runs every route even when concurrency is lower than the route count', async () => {
    const many: ManifestRoute[] = Array.from({ length: 5 }, (_, i) => route({ path: `/api/v1/x${i}` }));
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200 });
    const results = await runRouteSmokeTest({ baseUrl: 'https://gate.staging.meeshy.me', routes: many, fetchImpl, concurrency: 2 });
    expect(results).toHaveLength(5);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});
