import {
  composeMetadata,
  composePageMetadata,
  getMetadataBundle,
  getMetadataPage,
  interpolate,
  pageString,
} from '@/lib/i18n/metadata';
import { SUPPORTED_INTERFACE_LOCALES } from '@/lib/i18n/locale-config';

describe('composeMetadata', () => {
  it('emits an og:locale that matches the active interface locale', () => {
    expect(composeMetadata({ locale: 'fr', title: 't', description: 'd' }).openGraph?.locale).toBe('fr_FR');
    expect(composeMetadata({ locale: 'en', title: 't', description: 'd' }).openGraph?.locale).toBe('en_US');
    expect(composeMetadata({ locale: 'pt', title: 't', description: 'd' }).openGraph?.locale).toBe('pt_PT');
  });

  it('mirrors title/description into Open Graph and Twitter cards', () => {
    const meta = composeMetadata({ locale: 'en', title: 'Title', description: 'Desc' });
    expect(meta.title).toBe('Title');
    expect(meta.openGraph?.title).toBe('Title');
    expect(meta.twitter?.title).toBe('Title');
    expect(meta.twitter?.description).toBe('Desc');
  });

  it('uses explicit ogTitle and image alt when provided', () => {
    const meta = composeMetadata({
      locale: 'en',
      title: 'Title',
      description: 'Desc',
      ogTitle: 'OG Title',
      image: 'https://x/og.jpg',
      imageAlt: 'alt text',
    });
    expect(meta.openGraph?.title).toBe('OG Title');
    const images = meta.openGraph?.images as Array<{ alt?: string }>;
    expect(images[0].alt).toBe('alt text');
  });

  it('omits images and canonical when not supplied', () => {
    const meta = composeMetadata({ locale: 'en', title: 't', description: 'd' });
    expect(meta.openGraph && 'images' in meta.openGraph).toBe(false);
    expect(meta.alternates).toBeUndefined();
  });
});

describe('composePageMetadata', () => {
  it('localizes the home title for each translated locale', () => {
    expect(composePageMetadata('home', 'en').title).toBe('Meeshy - Real-time multilingual messaging');
    expect(composePageMetadata('home', 'fr').title).toBe('Meeshy - Messagerie multilingue en temps réel');
    expect(composePageMetadata('home', 'es').title).toBe('Meeshy - Mensajería multilingüe en tiempo real');
    expect(composePageMetadata('home', 'pt').title).toBe('Meeshy - Mensagens multilíngues em tempo real');
  });

  it('uses the localized ogTitle when the page defines one', () => {
    expect(composePageMetadata('about', 'en').openGraph?.title).toBe('About Meeshy');
    expect(composePageMetadata('about', 'fr').openGraph?.title).toBe('À propos de Meeshy');
  });

  it('carries through caller-supplied url, image and canonical', () => {
    const meta = composePageMetadata('settings', 'en', {
      url: 'https://meeshy.me/settings',
      image: 'https://meeshy.me/images/meeshy-og-settings.jpg',
      canonical: 'https://meeshy.me/settings',
    });
    expect(meta.openGraph?.url).toBe('https://meeshy.me/settings');
    expect(meta.alternates?.canonical).toBe('https://meeshy.me/settings');
  });

  it('falls back to English copy for locales without a bundle (de/it) but keeps their og:locale', () => {
    const meta = composePageMetadata('home', 'de');
    expect(meta.title).toBe('Meeshy - Real-time multilingual messaging');
    expect(meta.openGraph?.locale).toBe('de_DE');
  });
});

describe('bundle integrity', () => {
  const pageKeys = [
    'home', 'notifications', 'settings', 'conversations', 'groups', 'about',
    'privacy', 'login', 'terms', 'partners', 'signup', 'chat', 'groupDetail',
    'userProfile', 'conversationDetail', 'join', 'affiliate',
  ];

  it.each(['en', 'fr', 'es', 'pt'])('bundle "%s" defines a title for every page', (locale) => {
    pageKeys.forEach((key) => {
      const page = getMetadataPage(locale, key);
      const titleKey = page.title ? 'title' : 'fallbackTitle';
      expect(pageString(page, titleKey).length).toBeGreaterThan(0);
    });
  });

  it('exposes a localized skip-to-content label', () => {
    expect(getMetadataBundle('en').skipToContent).toBe('Skip to main content');
    expect(getMetadataBundle('fr').skipToContent).toBe('Aller au contenu principal');
  });

  it('interpolates dynamic join/userProfile templates', () => {
    const join = getMetadataPage('en', 'join');
    expect(interpolate(pageString(join, 'title'), { title: 'Team' })).toBe('Join "Team" - Meeshy');
    const profile = getMetadataPage('fr', 'userProfile');
    expect(interpolate(pageString(profile, 'ogImageAlt'), { name: 'Ada' })).toBe('Profil de Ada');
  });

  it('declares no unexpected gaps in the supported locale list', () => {
    expect(SUPPORTED_INTERFACE_LOCALES).toEqual(['en', 'fr', 'es', 'pt', 'de', 'it']);
  });
});
