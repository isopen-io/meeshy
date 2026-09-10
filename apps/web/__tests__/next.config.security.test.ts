/**
 * next.config.security.js builds its Content-Security-Policy from the real
 * per-deployment env vars (`NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` /
 * `NEXT_PUBLIC_TRANSLATION_URL` / `NEXT_PUBLIC_STATIC_URL`), never from
 * `NEXT_PUBLIC_API_DOMAIN` (#5728 — that var does not exist anywhere in this
 * repo and previously made every real deployment fall back to
 * `localhost:3001`, silently blocking the app's own API/WS traffic had CSP
 * ever been wired in blocking).
 *
 * The module reads `process.env` at top-level `require` time, so every test
 * sets env vars first, then `jest.resetModules()` + `require()`s fresh.
 */

const ENV_KEYS = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_WS_URL',
  'NEXT_PUBLIC_TRANSLATION_URL',
  'NEXT_PUBLIC_STATIC_URL',
  'NEXT_PUBLIC_API_DOMAIN',
] as const;

type SecurityConfigModule = {
  ContentSecurityPolicy: string;
  nonCspSecurityHeaders: Array<{ key: string; value: string }>;
  reportOnlyCspHeader: Array<{ key: string; value: string }>;
  securityHeaders: Array<{ key: string; value: string }>;
};

function loadWithEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): SecurityConfigModule {
  const previous: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../next.config.security.js') as SecurityConfigModule;

  for (const key of ENV_KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key] as string;
  }

  return mod;
}

describe('next.config.security — Content-Security-Policy allowlist', () => {
  it('reads the real production env vars, not NEXT_PUBLIC_API_DOMAIN', () => {
    const { ContentSecurityPolicy } = loadWithEnv({
      NEXT_PUBLIC_API_URL: 'https://gate.meeshy.me',
      NEXT_PUBLIC_WS_URL: 'wss://gate.meeshy.me',
      NEXT_PUBLIC_TRANSLATION_URL: 'https://ml.meeshy.me/translate',
      NEXT_PUBLIC_STATIC_URL: 'https://static.meeshy.me',
      NEXT_PUBLIC_API_DOMAIN: 'ignored.example.com',
    });

    expect(ContentSecurityPolicy).toContain('https://gate.meeshy.me');
    expect(ContentSecurityPolicy).toContain('wss://gate.meeshy.me');
    expect(ContentSecurityPolicy).toContain('https://ml.meeshy.me');
    expect(ContentSecurityPolicy).toContain('https://static.meeshy.me');
    expect(ContentSecurityPolicy).not.toContain('ignored.example.com');
    // The translation URL's /translate path must not leak into the origin.
    expect(ContentSecurityPolicy).not.toContain('ml.meeshy.me/translate');
  });

  it('never falls back to localhost:3001 — the old NEXT_PUBLIC_API_DOMAIN default', () => {
    const { ContentSecurityPolicy } = loadWithEnv({
      NEXT_PUBLIC_API_URL: 'https://gate.staging.meeshy.me',
      NEXT_PUBLIC_WS_URL: 'wss://gate.staging.meeshy.me',
      NEXT_PUBLIC_TRANSLATION_URL: 'https://ml.staging.meeshy.me/translate',
      NEXT_PUBLIC_STATIC_URL: 'https://static.staging.meeshy.me',
    });

    expect(ContentSecurityPolicy).not.toContain('localhost:3001');
    expect(ContentSecurityPolicy).toContain('gate.staging.meeshy.me');
  });

  it('falls back to the tmux "meeshy" local ports when no env var is set', () => {
    const { ContentSecurityPolicy } = loadWithEnv({});

    expect(ContentSecurityPolicy).toContain('http://localhost:3000');
    expect(ContentSecurityPolicy).toContain('ws://localhost:3000');
    expect(ContentSecurityPolicy).toContain('http://localhost:8000');
  });

  it('allows the Firebase/FCM domains firebase-config.ts and the messaging SW depend on', () => {
    const { ContentSecurityPolicy } = loadWithEnv({});

    expect(ContentSecurityPolicy).toContain('https://*.googleapis.com');
    expect(ContentSecurityPolicy).toContain('https://www.gstatic.com');
  });

  it('keeps the existing non-CSP hardening headers untouched', () => {
    const { nonCspSecurityHeaders } = loadWithEnv({});

    expect(nonCspSecurityHeaders.some((h) => h.key === 'X-Frame-Options')).toBe(true);
    expect(nonCspSecurityHeaders.some((h) => h.key === 'Content-Security-Policy')).toBe(false);
  });

  it('exposes the CSP only as Report-Only, never as the blocking header, until a staging pass verifies it', () => {
    const { reportOnlyCspHeader } = loadWithEnv({});

    expect(reportOnlyCspHeader).toHaveLength(1);
    expect(reportOnlyCspHeader[0].key).toBe('Content-Security-Policy-Report-Only');
    expect(reportOnlyCspHeader[0].value).toContain("default-src 'self'");
  });
});
