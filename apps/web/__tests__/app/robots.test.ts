import robots from '../../app/robots';

describe('app/robots', () => {
  it('points crawlers at the sitemap', () => {
    const result = robots();

    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it('allows the root path by default so new public pages stay crawlable', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rule.userAgent).toBe('*');
    expect(rule.allow).toBe('/');
  });

  it('disallows every auth-gated or app-shell surface', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];

    const expectedGatedPaths = [
      '/api/',
      '/admin',
      '/dashboard',
      '/account',
      '/settings',
      '/notifications',
      '/conversations',
      '/chat',
      '/call',
      '/feed',
      '/groups',
      '/contacts',
      '/search',
      '/story',
      '/reel',
      '/post',
      '/hashtag',
      '/u',
    ];

    for (const path of expectedGatedPaths) {
      expect(disallow).toContain(path);
    }
  });

  it('does not disallow the genuinely public marketing/legal pages', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];

    for (const path of ['/about', '/partners', '/contact', '/privacy', '/terms']) {
      expect(disallow).not.toContain(path);
    }
  });
});
