import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LANDING_COPY } from './landing-copy';
import { LANDING_LANGUAGES } from './landing-languages';
import { LandingPage } from './landing-page';
import { SiteHeader } from './site-chrome';

/**
 * L'EN-TÊTE MÈNE À /download (#16407, demande porteur du 2026-11-05) — sur
 * toutes les pages publiques, landing comprise, et sur téléphone : le lien
 * n'est pas dans la `nav`, que la barre masque sous 640 px.
 */
const downloadLink = (html: string): string => /<a href="\/download"[^>]*>[^<]*<\/a>/.exec(html)?.[0] ?? '';
const header = (html: string): string => html.slice(html.indexOf('<header class="ld-header">'), html.indexOf('</header>'));

describe('l’en-tête des pages publiques porte « Download » (#16407)', () => {
  test('dans chaque langue, hors de la navigation masquée sur téléphone, sur une cible de bouton', () => {
    for (const language of LANDING_LANGUAGES) {
      const copy = LANDING_COPY[language];
      for (const onLanding of [true, false]) {
        const html = header(renderToStaticMarkup(<SiteHeader language={language} copy={copy} onLanding={onLanding} languageControl={null} />));
        const link = downloadLink(html);
        expect(link).toContain(`>${copy.navDownload}</a>`);
        expect(link).toContain('class="ld-btn ld-btn--ghost"');
        const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
        expect(nav).not.toContain('href="/download"');
      }
    }
  });

  test('la landing prérendue le sert dans son en-tête', () => {
    const html = renderToStaticMarkup(<LandingPage language="fr" copy={LANDING_COPY.fr} />);
    expect(downloadLink(header(html))).toContain('>Télécharger</a>');
  });

  test('le libellé est écrit dans la langue de la page, jamais recopié du français', () => {
    for (const language of LANDING_LANGUAGES.filter((language) => language !== 'fr')) {
      expect(LANDING_COPY[language].navDownload).not.toBe(LANDING_COPY.fr.navDownload);
      expect(LANDING_COPY[language].navDownload.length).toBeGreaterThan(0);
    }
  });
});
