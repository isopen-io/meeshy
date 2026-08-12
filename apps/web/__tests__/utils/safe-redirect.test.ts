import { openExternalUrl, safeExternalUrl, safeInternalPath } from '@/utils/safe-redirect';

const ORIGIN = 'https://meeshy.me';

/**
 * `safeInternalPath` guards `window.location.href = ...` in the auth flows
 * (magic-link, 2FA), where `returnUrl` comes straight off a query string an
 * attacker controls. "Same origin" therefore has to mean the origin the
 * BROWSER resolves, not the one the guard's string inspection assumes — the
 * two diverge whenever URL parsing rewrites the input before resolving it.
 */
const resolvedOrigin = (path: string): string => new URL(path, ORIGIN).origin;

describe('safeInternalPath', () => {
  it('keeps ordinary same-origin paths', () => {
    expect(safeInternalPath('/dashboard')).toBe('/dashboard');
    expect(safeInternalPath('/conversations/abc?tab=1#x')).toBe('/conversations/abc?tab=1#x');
  });

  it('falls back for non-strings, empty values and relative paths', () => {
    expect(safeInternalPath(undefined, '/home')).toBe('/home');
    expect(safeInternalPath(null, '/home')).toBe('/home');
    expect(safeInternalPath('', '/home')).toBe('/home');
    expect(safeInternalPath(42, '/home')).toBe('/home');
    expect(safeInternalPath('dashboard', '/home')).toBe('/home');
  });

  it('falls back for absolute, protocol-relative and scheme URLs', () => {
    expect(safeInternalPath('https://evil.example', '/home')).toBe('/home');
    expect(safeInternalPath('//evil.example', '/home')).toBe('/home');
    expect(safeInternalPath('/\\evil.example', '/home')).toBe('/home');
    expect(safeInternalPath('javascript:alert(1)', '/home')).toBe('/home');
    expect(safeInternalPath('data:text/html,<script>', '/home')).toBe('/home');
  });

  // URL parsing removes tab, LF and CR from anywhere in the input BEFORE
  // resolving it (WHATWG URL, "URL parsing" step 2). `/\t/evil.example`
  // therefore reaches the network as `//evil.example` — protocol-relative,
  // off-origin — while looking like a plain path to a startsWith() check.
  it.each([
    ['tab', '/\t/evil.example'],
    ['line feed', '/\n/evil.example'],
    ['carriage return', '/\r/evil.example'],
  ])('falls back for a %s smuggled into a protocol-relative path', (_label, raw) => {
    expect(resolvedOrigin(raw)).not.toBe(ORIGIN);
    expect(safeInternalPath(raw, '/home')).toBe('/home');
  });

  it('never returns a path the browser would resolve off-origin', () => {
    const probes = [
      '/dashboard',
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r/evil.example',
      '/\r\n/evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\t\t//evil.example',
      'https://evil.example',
    ];

    probes.forEach((raw) => {
      expect(resolvedOrigin(safeInternalPath(raw, '/home'))).toBe(ORIGIN);
    });
  });
});

describe('safeExternalUrl', () => {
  it('keeps http and https destinations', () => {
    expect(safeExternalUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeExternalUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('rejects non-http schemes and unparseable values', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>')).toBeNull();
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull();
    expect(safeExternalUrl('/relative')).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });

  it('rejects a scheme smuggled past a naive check with control characters', () => {
    expect(safeExternalUrl('java\tscript:alert(1)')).toBeNull();
    expect(safeExternalUrl('java\nscript:alert(1)')).toBeNull();
  });
});

// jsdom keeps `window.location` as a non-writable own property, so an
// assignment to `location.href` cannot be observed from a test. What matters
// for the security property still can be: the guard is a single early return
// placed BEFORE either sink, so proving a hostile destination never reaches
// `window.open` proves it never reaches `location.href` either.
describe('openExternalUrl', () => {
  const originalOpen = window.open;

  afterEach(() => {
    window.open = originalOpen;
  });

  it('opens a valid https destination in a new tab', () => {
    const open = jest.fn().mockReturnValue({ closed: false });
    window.open = open as unknown as typeof window.open;

    expect(openExternalUrl('https://example.com/a')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
  });

  it('reports success when the popup is blocked and it falls back to the same tab', () => {
    window.open = jest.fn().mockReturnValue(null) as unknown as typeof window.open;

    expect(openExternalUrl('https://example.com/a')).toBe(true);
  });

  // The destination of a tracking link is chosen by whoever created it — another
  // user. A `javascript:` destination reaching either sink is script execution on
  // our own origin, against the reader's session.
  it.each([
    'javascript:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
  ])('refuses %s at both sinks', (hostile) => {
    const open = jest.fn();
    window.open = open as unknown as typeof window.open;

    expect(openExternalUrl(hostile)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('refuses empty and non-string destinations', () => {
    const open = jest.fn();
    window.open = open as unknown as typeof window.open;

    expect(openExternalUrl('')).toBe(false);
    expect(openExternalUrl(undefined)).toBe(false);
    expect(openExternalUrl(null)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
