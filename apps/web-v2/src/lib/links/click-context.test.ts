import { describe, expect, test } from 'bun:test';

import { collectClickContext, detectSocialSource, type ClickEnvironment } from './click-context';

/**
 * CE QU'UN CLIC RACONTE À LA PASSERELLE (#6714) — la page legacy
 * (`apps/web/app/l/[token]/page.tsx`) envoyait ces champs avec chaque clic, et
 * les statistiques d'un lien suivi les agrègent. Les porter à l'identique est
 * ce qui empêche la bascule de casser les tableaux du propriétaire d'un lien.
 */

const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const base = {
  userAgent: SAFARI_IPHONE,
  referrer: '',
  search: '',
  language: 'fr-FR',
  languages: ['fr-FR', 'en'],
  screen: { width: 390, height: 844, colorDepth: 24 },
  viewport: { width: 390, height: 664 },
  pixelRatio: 3,
  timezone: 'Europe/Paris',
  maxTouchPoints: 5,
  platform: 'iPhone',
  cookiesEnabled: true,
} as const satisfies ClickEnvironment;

const environment = (overrides: Partial<ClickEnvironment> = {}): ClickEnvironment => ({ ...base, hardwareConcurrency: 6, ...overrides });

describe('collectClickContext — ce que le legacy comptait', () => {
  test('un iPhone arrivé sans référent', () => {
    expect(collectClickContext(environment())).toEqual({
      language: 'fr',
      languages: 'fr-FR,en',
      screenResolution: '390x844',
      viewportSize: '390x664',
      pixelRatio: 3,
      colorDepth: 24,
      timezone: 'Europe/Paris',
      touchSupport: true,
      platform: 'iPhone',
      cookiesEnabled: true,
      hardwareConcurrency: 6,
      socialSource: 'Direct',
      deviceFingerprint: 'fp-z9rpzs',
    });
  });

  /* Les deux valeurs ont été calculées par l'algorithme du legacy lui-même,
     sur les mêmes neuf valeurs dans le même ordre. Une empreinte qui changerait
     à la bascule compterait chaque appareil comme un visiteur NOUVEAU. */
  test('l’empreinte est celle du legacy : un appareil ne devient pas un second visiteur à la bascule', () => {
    expect(collectClickContext(environment()).deviceFingerprint).toBe('fp-z9rpzs');
    expect(collectClickContext({ ...base }).deviceFingerprint).toBe('fp-kov4va');
  });

  test('les UTM de l’adresse du clic, et seulement ceux qui sont là', () => {
    const context = collectClickContext(environment({ search: '?utm_source=newsletter&utm_medium=email&utm_campaign=rentree' }));
    expect(context.utmClickSource).toBe('newsletter');
    expect(context.utmClickMedium).toBe('email');
    expect(context.utmClickCampaign).toBe('rentree');
    expect('utmClickTerm' in context).toBe(false);
    expect('utmClickContent' in context).toBe(false);
  });

  test('chaque texte tient sous la borne de la passerelle — un seul champ trop long ferait refuser le clic entier', () => {
    const context = collectClickContext(
      environment({
        referrer: `https://example.com/${'a'.repeat(3000)}`,
        search: `?utm_source=${'s'.repeat(150)}`,
        languages: Array.from({ length: 60 }, (_, index) => `x${index}-YY`),
      }),
    );
    expect(context.referrer?.length).toBe(2048);
    expect(context.utmClickSource?.length).toBe(100);
    expect((context.languages ?? '').length).toBeLessThanOrEqual(256);
  });

  test('un nombre que la passerelle veut entier et qui ne l’est pas est omis, jamais arrondi', () => {
    const context = collectClickContext(environment({ hardwareConcurrency: 6.5, screen: { width: 390, height: 844, colorDepth: 24.5 } }));
    expect('hardwareConcurrency' in context).toBe(false);
    expect('colorDepth' in context).toBe(false);
  });

  test('la connexion et la mémoire, quand le navigateur les dit', () => {
    const context = collectClickContext(environment({ connection: { effectiveType: '4g', downlink: 10 }, deviceMemory: 4 }));
    expect(context.connectionType).toBe('4g');
    expect(context.connectionSpeed).toBe(10);
    expect(context.deviceMemory).toBe(4);
  });

  test('le référent, et la source sociale qui en découle', () => {
    const context = collectClickContext(environment({ referrer: 'https://l.facebook.com/l.php?u=x' }));
    expect(context.referrer).toBe('https://l.facebook.com/l.php?u=x');
    expect(context.socialSource).toBe('Facebook');
  });
});

describe('detectSocialSource — par le NOM D’HÔTE, jamais par sous-chaîne', () => {
  test('les messageries et les réseaux', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['https://l.wl.co/l?u=x', 'WhatsApp'],
      ['https://web.whatsapp.com/', 'WhatsApp'],
      ['https://t.me/meeshy', 'Telegram'],
      ['https://m.facebook.com/story', 'Facebook'],
      ['https://www.messenger.com/t/1', 'Messenger'],
      ['https://l.instagram.com/?u=x', 'Instagram'],
      ['https://t.co/abc', 'Twitter/X'],
      ['https://x.com/meeshy', 'Twitter/X'],
      ['https://www.linkedin.com/feed/', 'LinkedIn'],
      ['https://www.reddit.com/r/x', 'Reddit'],
      ['https://www.tiktok.com/@x', 'TikTok'],
      ['https://discord.com/channels/1', 'Discord'],
      ['https://slack-redir.net/link?url=x', 'Slack'],
      ['https://www.snapchat.com/', 'Snapchat'],
      ['https://pin.it/abc', 'Pinterest'],
      ['https://youtu.be/abc', 'YouTube'],
      ['https://outlook.live.com/mail/0/', 'Email'],
      ['https://www.bing.com/search?q=meeshy', 'Bing'],
      ['https://duckduckgo.com/?q=meeshy', 'DuckDuckGo'],
    ];
    for (const [referrer, source] of cases) {
      expect({ referrer, source: detectSocialSource(referrer, SAFARI_IPHONE) }).toEqual({ referrer, source });
    }
  });

  /* Le legacy cherchait `t.co` en SOUS-CHAÎNE : `pinterest.com` et
     `microsoft.com` le contiennent, et partaient en « Twitter/X ». */
  test('« t.co » ne capture plus pinterest.com ni microsoft.com', () => {
    expect(detectSocialSource('https://www.pinterest.com/pin/1', SAFARI_IPHONE)).toBe('Pinterest');
    expect(detectSocialSource('https://www.microsoft.com/', SAFARI_IPHONE)).toBe('Other');
  });

  test('une recherche Google n’est pas le webmail Google', () => {
    expect(detectSocialSource('https://www.google.fr/search?q=meeshy', SAFARI_IPHONE)).toBe('Google Search');
    expect(detectSocialSource('https://www.google.com/?q=meeshy', SAFARI_IPHONE)).toBe('Google Search');
    expect(detectSocialSource('https://mail.google.com/mail/u/0/', SAFARI_IPHONE)).toBe('Email');
    expect(detectSocialSource('https://www.google.com/maps', SAFARI_IPHONE)).toBe('Other');
  });

  test('un navigateur intégré se reconnaît à son agent utilisateur', () => {
    const inApp: ReadonlyArray<readonly [string, string]> = [
      [`${SAFARI_IPHONE} [FBAN/FBIOS;FBAV/450.0]`, 'Facebook'],
      [`${SAFARI_IPHONE} Instagram 300.0.0`, 'Instagram'],
      [`${SAFARI_IPHONE} musical_ly_33.0 BytedanceWebview`, 'TikTok'],
      [`${SAFARI_IPHONE} Line/13.0.0`, 'LINE'],
      [`${SAFARI_IPHONE} MicroMessenger/8.0`, 'WeChat'],
    ];
    for (const [userAgent, source] of inApp) {
      expect({ userAgent, source: detectSocialSource('', userAgent) }).toEqual({ userAgent, source });
    }
  });

  test('sans référent : Direct ; un référent illisible ou inconnu : Other', () => {
    expect(detectSocialSource('', SAFARI_IPHONE)).toBe('Direct');
    expect(detectSocialSource('pas une adresse', SAFARI_IPHONE)).toBe('Other');
    expect(detectSocialSource('https://blog.example.org/article', SAFARI_IPHONE)).toBe('Other');
  });
});
