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

describe('classifySmokeStatus', () => {
  it('classifies 404 as absent — the route is not registered on the running revision', () => {
    expect(classifySmokeStatus(404)).toBe('absent');
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
    const fetchImpl = jest.fn().mockResolvedValue({ status: 404 });
    const results = await runRouteSmokeTest({ baseUrl: 'https://gate.staging.meeshy.me', routes: target, fetchImpl });
    expect(summarizeSmokeResults(results).absent).toHaveLength(1);
  });

  it('passes GREEN once the route answers with anything but 404 (401 = present, auth required)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 401 });
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
