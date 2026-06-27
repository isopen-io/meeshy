/**
 * Tests for lib/geolocation.ts
 *
 * The module maintains module-level cache (cachedGeo, pendingRequest).
 * Each test must call destroyCache (via requestBrowserGeolocation's internals)
 * or rely on jest's module isolation per test suite.
 * We use jest.resetModules() + re-import to get a clean slate per describe.
 */

const mockGetCurrentPosition = jest.fn();
const mockFetch = jest.fn();

beforeEach(() => {
  mockGetCurrentPosition.mockClear();
  mockFetch.mockClear();

  // jsdom doesn't implement navigator.geolocation — stub it
  Object.defineProperty(global.navigator, 'geolocation', {
    value: { getCurrentPosition: mockGetCurrentPosition },
    writable: true,
    configurable: true,
  });

  global.fetch = mockFetch as any;
});

// Re-import the module fresh for each test to reset the module-level cache
// (jest.resetModules() invalidates the module registry so the next import is fresh)
const freshImport = async () => {
  jest.resetModules();
  return import('@/lib/geolocation');
};

const mockPosition = (lat: number, lng: number): GeolocationPosition => ({
  coords: { latitude: lat, longitude: lng } as GeolocationCoordinates,
  timestamp: 0,
});

const mockGeoApiResponse = (overrides = {}) => ({
  city: 'Paris',
  locality: 'Paris',
  countryName: 'France',
  countryCode: 'FR',
  principalSubdivision: 'Île-de-France',
  ...overrides,
});

// ─── getCachedGeolocation ─────────────────────────────────────────────────────

describe('getCachedGeolocation', () => {
  it('returns null before any geolocation request', async () => {
    const { getCachedGeolocation } = await freshImport();
    expect(getCachedGeolocation()).toBeNull();
  });
});

// ─── getGeolocationHeaders ────────────────────────────────────────────────────

describe('getGeolocationHeaders', () => {
  it('returns empty object when no cache', async () => {
    const { getGeolocationHeaders } = await freshImport();
    expect(getGeolocationHeaders()).toEqual({});
  });
});

// ─── requestBrowserGeolocation ────────────────────────────────────────────────

describe('requestBrowserGeolocation', () => {
  it('returns null when geolocation is unavailable', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: null,
      writable: true,
      configurable: true,
    });
    const { requestBrowserGeolocation } = await freshImport();
    const result = await requestBrowserGeolocation();
    expect(result).toBeNull();
  });

  it('returns null when getCurrentPosition errors', async () => {
    mockGetCurrentPosition.mockImplementation((_success: any, error: any) => {
      error(new Error('denied'));
    });
    const { requestBrowserGeolocation } = await freshImport();
    const result = await requestBrowserGeolocation();
    expect(result).toBeNull();
  });

  it('returns geo data when successful', async () => {
    mockGetCurrentPosition.mockImplementation((success: any) => {
      success(mockPosition(48.8566, 2.3522));
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockGeoApiResponse(),
    } as Response);

    const { requestBrowserGeolocation } = await freshImport();
    const result = await requestBrowserGeolocation();
    expect(result).not.toBeNull();
    expect(result!.city).toBe('Paris');
    expect(result!.countryCode).toBe('FR');
  });

  it('caches the result so second call does not re-fetch', async () => {
    mockGetCurrentPosition.mockImplementation((success: any) => {
      success(mockPosition(48.8566, 2.3522));
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockGeoApiResponse(),
    } as Response);

    const { requestBrowserGeolocation } = await freshImport();
    await requestBrowserGeolocation();
    await requestBrowserGeolocation();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when reverse geocode API fails', async () => {
    mockGetCurrentPosition.mockImplementation((success: any) => {
      success(mockPosition(48.8566, 2.3522));
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const { requestBrowserGeolocation } = await freshImport();
    const result = await requestBrowserGeolocation();
    expect(result).toBeNull();
  });
});

// ─── getGeolocationHeaders (with cached data) ─────────────────────────────────

describe('getGeolocationHeaders with cached geo', () => {
  it('returns headers when geo is cached', async () => {
    mockGetCurrentPosition.mockImplementation((success: any) => {
      success(mockPosition(48.8566, 2.3522));
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockGeoApiResponse({ city: 'Lyon', countryCode: 'FR' }),
    } as Response);

    const { requestBrowserGeolocation, getGeolocationHeaders } = await freshImport();
    await requestBrowserGeolocation();
    const headers = getGeolocationHeaders();
    expect(headers['X-Meeshy-Platform']).toBe('web');
    expect(headers['X-Meeshy-City']).toBe('Lyon');
    expect(headers['X-Meeshy-Country']).toBe('FR');
  });
});
