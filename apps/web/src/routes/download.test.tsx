import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SiteHeader } from '@/landing/site-chrome';
import { LANDING_COPY } from '@/landing/landing-copy';
import { siteHref } from '@/lib/institutional-href';
import { isAppPath } from '@/routes/app-paths';

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

  test('les captures Android existent en clair ET en sombre, dans la langue du lecteur — aucune ne retombe (#8804)', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const { android } = downloadShots(language);
      expect(android.length).toBe(4);
      for (const shot of android) {
        expect(shot.src).toContain(`/store-shots/android/${language}/`);
        expect(existsSync(join(PUBLIC, shot.src))).toBe(true);
        expect(existsSync(join(PUBLIC, shot.darkSrc))).toBe(true);
      }
    }
  });

  test('chaque capture porte un texte alternatif, sa taille, et la page nomme ses deux galeries', () => {
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    const images = (html.match(/<img [^>]*>/g) ?? []).filter((image) => image.includes('/store-shots/'));
    expect(images.length).toBe(9);
    for (const image of images) {
      expect(image).toMatch(/alt="[^"]{8,}"/);
      expect(image).toContain('width="400"');
      expect(image).toContain('height="866"');
    }
    expect(html).toContain('Captures de Meeshy sur iPhone');
    expect(html).toContain('Captures de Meeshy sur Android');
  });

  test('les liens vers les pages institutionnelles sont au pied PARTAGÉ de meeshy.me (#10071)', () => {
    const html = renderToStaticMarkup(<DownloadPage language="fr" />);
    expect(html).toContain('class="ld-footer"');
    for (const page of ['about', 'help', 'faq', 'contact', 'privacy', 'terms']) {
      expect(html).toContain(`href="/${page}"`);
    }
  });

  test('l’en-tête est celui de la landing, dans la langue du lecteur : mes conversations, sans porte d’entrée anonyme (#10071, #10784, #12500)', () => {
    const fr = renderToStaticMarkup(<DownloadPage language="fr" />);
    expect(fr).toContain('class="ld-header"');
    expect(fr).toContain('<span class="ld-wordmark">Meeshy</span>');
    expect(fr).toMatch(/<a href="\/chats"[^>]*>Mes conversations<\/a>/);
    expect(fr).not.toContain('href="/login"');
    expect(fr).not.toContain('Entrer sans compte');
    expect(fr).not.toContain('#rejoindre');
    const en = renderToStaticMarkup(<DownloadPage language="en" />);
    expect(en).toMatch(/<a href="\/chats"[^>]*>My conversations<\/a>/);
    expect(en).not.toContain('Sign in');
    expect(en).not.toContain('Join without an account');
    expect(en).toContain('href="/en#world"');
  });

  test('dans la coque, chaque lien de l’en-tête est une route de l’application ou l’adresse publique — jamais « page introuvable » (#12930)', () => {
    const html = renderToStaticMarkup(
      <SiteHeader language="en" copy={LANDING_COPY.en} onLanding={false} languageControl={null} siteHref={(path) => siteHref(path, { shell: true })} />,
    );
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1] ?? '');
    expect(hrefs).toContain('https://meeshy.me/faq');
    expect(hrefs).toContain('https://meeshy.me/en#world');
    expect(hrefs).toContain('https://meeshy.me/en');
    expect(hrefs).toContain('/chats');
    for (const href of hrefs) {
      expect(href.startsWith('https://meeshy.me/') || isAppPath(new URL(href, 'https://localhost').pathname)).toBe(true);
    }
  });

  test('le sélecteur de langue de l’en-tête change la langue de LA PAGE — elle est traduite, elle ne renvoie pas ailleurs', () => {
    const html = renderToStaticMarkup(<DownloadPage language="es" />);
    expect(html).toMatch(/<select[^>]*data-download-language/);
    expect(html).not.toContain('data-landing-language');
    expect(html).toMatch(/<option value="es"[^>]*selected/);
  });

  test('en : la page parle anglais — le destinataire n’a pas choisi le français', () => {
    const html = renderToStaticMarkup(<DownloadPage language="en" />);
    expect(html).toContain('Get Meeshy');
    expect(html).toContain('Coming soon');
    expect(html).not.toContain('navigateur');
  });

  test('ar : la page parle arabe — son sens de lecture vient du document (#8803)', () => {
    const html = renderToStaticMarkup(<DownloadPage language="ar" />);
    expect(html).toContain('Meeshy');
    expect(html).toContain('المتصفح');
    expect(html).toContain('قريبًا');
  });
});
