import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { APP_STORE_URL, DownloadPage, downloadShots } from './download';

/**
 * **`/download` — LE PREMIER CONTACT AVEC MEESHY** (#7297, #8801).
 *
 * C'est l'adresse que l'app publiée envoie par SMS
 * (`DiscoverViewModel.swift:285`, `PhonebookViewModel.swift:282`) à quelqu'un
 * qui ne connaît PAS encore le produit. Elle s'ouvre sans compte, sur un
 * appareil inconnu, dans une langue inconnue — d'où les exigences que ces
 * témoins tiennent : elle MONTRE le produit sur les deux plateformes, elle le
 * dit dans la langue du lecteur, et chaque badge mène quelque part qui répond.
 */
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../../public');

describe('/download — ce que voit quelqu’un qui ne connaît pas Meeshy (#7297, #8801)', () => {
  beforeAll(async () => {
    ensureHappyDomRegistered();
    await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
  });

  afterAll(async () => {
    await releaseHappyDomIfRegistered();
  });

  test('le badge App Store mène à la fiche RÉELLE — `apps.apple.com/app/meeshy` rendait 404', () => {
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    expect(APP_STORE_URL).toBe('https://apps.apple.com/app/id6760208591');
    expect(html).toContain(`href="${APP_STORE_URL}"`);
    expect(html).toContain('App Store');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('le badge Google Play est là, dit « bientôt », et mène à la version web — jamais à une fiche absente', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const html = renderToStaticMarkup(<DownloadPage language={language} />);
      expect(html).toContain('Google Play');
      expect(html).toContain('data-store="google-play"');
      expect(html).not.toContain('play.google.com');
    }
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    expect(html).toMatch(/<a[^>]*data-store="google-play"[^>]*href="\/"|<a[^>]*href="\/"[^>]*data-store="google-play"/);
    expect(html).toContain('Bientôt');
    expect(html).toContain('arrive bientôt sur Google Play');
  });

  test('une porte explicite mène au produit SERVI aujourd’hui — le web', () => {
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    expect(html).toContain('Ouvrir Meeshy dans le navigateur');
  });

  test('les captures iOS sont celles de l’App Store dans la langue du lecteur, et chaque fichier existe', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const { ios } = downloadShots(language);
      expect(ios.length).toBe(5);
      for (const shot of ios) {
        expect(shot.src).toContain(`/store-shots/ios/${language}/`);
        expect(existsSync(join(PUBLIC, shot.src))).toBe(true);
      }
    }
  });

  test('les captures Android existent en clair ET en sombre ; une langue sans capture retombe sur l’anglais', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const { android } = downloadShots(language);
      expect(android.length).toBe(4);
      for (const shot of android) {
        expect(existsSync(join(PUBLIC, shot.src))).toBe(true);
        expect(existsSync(join(PUBLIC, shot.darkSrc))).toBe(true);
      }
    }
    expect(downloadShots('ar').android[0]?.src).toContain('/store-shots/android/ar/');
    expect(downloadShots('de').android[0]?.src).toContain('/android/en/');
  });

  test('chaque capture porte un texte alternatif, sa taille, et la page nomme ses deux galeries', () => {
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    const images = html.match(/<img [^>]*>/g) ?? [];
    expect(images.length).toBe(9);
    for (const image of images) {
      expect(image).toMatch(/alt="[^"]{8,}"/);
      expect(image).toContain('width="400"');
      expect(image).toContain('height="866"');
    }
    expect(html).toContain('Captures de Meeshy sur iPhone');
    expect(html).toContain('Captures de Meeshy sur Android');
  });

  test('les liens vers les pages institutionnelles sont au pied de la page', () => {
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    for (const page of ['about', 'help', 'faq', 'contact', 'privacy', 'terms']) {
      expect(html).toContain(`href="/${page}"`);
    }
  });

  test('en : la page parle anglais — le destinataire n’a pas choisi le français', () => {
    const html = renderToStaticMarkup(<DownloadPage language="en" />);
    expect(html).toContain('Get Meeshy');
    expect(html).toContain('Coming soon');
    expect(html).not.toContain('navigateur');
  });

  test('ar : la page parle arabe, et se lit de droite à gauche', () => {
    const html = renderToStaticMarkup(<DownloadPage language="ar" />);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(renderToStaticMarkup(<DownloadPage language="fr" />)).toContain('dir="ltr"');
    expect(html).toContain('Meeshy');
    expect(html).toContain('المتصفح');
    expect(html).toContain('قريبًا');
  });
});
