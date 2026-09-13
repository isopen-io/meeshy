import sitemap from '../../app/sitemap';

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_FRONTEND_URL;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.NEXT_PUBLIC_FRONTEND_URL;
  } else {
    process.env.NEXT_PUBLIC_FRONTEND_URL = ORIGINAL_ENV;
  }
  jest.resetModules();
});

describe('app/sitemap', () => {
  it('lists only the pages that are genuinely public today', () => {
    const entries = sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);

    expect(paths).toEqual(['/', '/about', '/partners', '/contact', '/privacy', '/terms']);
  });

  it('never lists an auth-gated or app-shell surface', () => {
    const entries = sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);
    const gatedPrefixes = [
      '/dashboard',
      '/settings',
      '/conversations',
      '/feed',
      '/story',
      '/reel',
      '/post',
      '/u',
      '/admin',
    ];

    for (const prefix of gatedPrefixes) {
      expect(paths.some((path) => path.startsWith(prefix))).toBe(false);
    }
  });

  it('gives every entry a lastModified date, changeFrequency and priority', () => {
    const entries = sitemap();

    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
      expect(entry.changeFrequency).toBeTruthy();
      expect(typeof entry.priority).toBe('number');
    }
  });

  it('gives the home page the highest priority', () => {
    const entries = sitemap();
    const home = entries.find((entry) => new URL(entry.url).pathname === '/');
    const others = entries.filter((entry) => new URL(entry.url).pathname !== '/');

    expect(home?.priority).toBe(1);
    for (const entry of others) {
      expect(entry.priority).toBeLessThan(1);
    }
  });

  it('builds absolute URLs against the configured frontend origin', () => {
    const entries = sitemap();

    for (const entry of entries) {
      expect(() => new URL(entry.url)).not.toThrow();
      expect(entry.url.startsWith('http')).toBe(true);
    }
  });
});
