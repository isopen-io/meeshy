import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { APP_STORE_URL, DownloadPage } from './download';

/**
 * **`/download` — LE PREMIER CONTACT AVEC MEESHY** (#7297).
 *
 * C'est l'adresse que l'app publiée envoie par SMS
 * (`DiscoverViewModel.swift:285`, `PhonebookViewModel.swift:282`) à quelqu'un
 * qui ne connaît PAS encore le produit. Elle s'ouvre sans compte, sur un
 * appareil inconnu, dans une langue inconnue — d'où les trois exigences que ces
 * témoins tiennent : elle DIT quelque chose, elle le dit dans la langue du
 * lecteur, et elle ne PROMET rien que le produit ne tienne.
 */
describe('/download — ce que voit quelqu’un qui ne connaît pas Meeshy (#7297)', () => {
  beforeAll(async () => {
    ensureHappyDomRegistered();
    await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
  });

  afterAll(async () => {
    await releaseHappyDomIfRegistered();
  });

  test('la fiche App Store est la porte principale, et son adresse est celle du dépôt', () => {
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    expect(APP_STORE_URL).toBe('https://apps.apple.com/app/meeshy');
    expect(html).toContain(`href="${APP_STORE_URL}"`);
    expect(html).toContain('App Store');
  });

  test('une seconde porte mène au produit SERVI aujourd’hui — le web', () => {
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    expect(html).toContain('href="/"');
    expect(html).toContain('navigateur');
  });

  test('AUCUNE promesse d’application Android : le Play Store n’est pas cité', () => {
    for (const language of ['fr', 'en', 'ar'] as const) {
      const html = renderToStaticMarkup(<DownloadPage language={language} />);
      expect(html).not.toContain('play.google.com');
      expect(html.toLowerCase()).not.toContain('play store');
    }
  });

  test('en : la page parle anglais — le destinataire n’a pas choisi le français', () => {
    const html = renderToStaticMarkup(<DownloadPage language="en" />);
    expect(html).toContain('Get Meeshy');
    expect(html).not.toContain('navigateur');
  });

  test('ar : la page parle arabe', () => {
    const html = renderToStaticMarkup(<DownloadPage language="ar" />);
    expect(html).toContain('Meeshy');
    expect(html).toContain('المتصفح');
  });

  test('le lien sortant s’ouvre sans rendre l’onglet d’origine manipulable', () => {
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
