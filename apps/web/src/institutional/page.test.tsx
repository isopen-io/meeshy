import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup as render } from 'react-dom/server';

import { PAGE_ABOUT } from './about';
import { PAGE_CONTACT } from './contact';
import { PAGE_FAQ } from './faq';
import { PAGE_HELP } from './help';
import { PAGE_PARTNERS } from './partners';
import { PAGE_PRIVACY } from './privacy';
import { PAGE_TERMS } from './terms';
import { findMeeSticker } from '../lib/mee/catalog';
import { meeViewFiles } from './mee-views';
import { InstitutionalPage } from './page';

/**
 * LES PAGES STATIQUES PORTENT L'EN-TÊTE ET LE PIED DE LA LANDING (#10071).
 *
 * `InstitutionalPage` est le rendu partagé des sept pages : un témoin suffit
 * pour toutes. Ce qu'un lecteur arrivé par un moteur de recherche sur
 * « Confidentialité » doit pouvoir faire sans revenir en arrière : se
 * connecter, changer de langue, rejoindre l'aide — et plus « Entrer sans
 * compte » : l'entrée anonyme ne passe plus que par le QR de la landing (#10784).
 */
describe('InstitutionalPage — l’en-tête et le pied de meeshy.me (#10071)', () => {
  const html = render(<InstitutionalPage page={PAGE_ABOUT} version="3.1.0" />);

  test('l’en-tête est celui de la landing : la marque, la navigation, mes conversations, sans porte d’entrée anonyme (#10784, #12500)', () => {
    expect(html).toContain('class="ld-header"');
    expect(html).toContain('<img src="/brand/logo.png" alt="" width="36" height="36"/>');
    expect(html).toContain('<span class="ld-wordmark">Meeshy</span>');
    expect(html).toMatch(/<a href="\/chats"[^>]*>Mes conversations<\/a>/);
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('Se connecter');
    expect(html).not.toContain('Entrer sans compte');
    expect(html).not.toContain('#rejoindre');
    expect(html).toContain('href="/#world"');
    expect(html).toContain('href="/#comment"');
    expect(html).not.toContain('Retour à l’accueil');
  });

  test('le sélecteur de langue mène, SANS script, à la landing de la langue choisie', () => {
    expect(html).toContain('<details class="ld-language-menu">');
    for (const [code, path] of [['en', '/en'], ['ar', '/ar'], ['fr', '/']] as const) {
      expect(html).toMatch(new RegExp(`<a href="${path}" hrefLang="${code}" lang="${code}"`));
    }
    expect(html).not.toContain('<script');
  });

  test('le pied est celui de la landing, et mène à TOUTES les pages statiques', () => {
    expect(html).toContain('class="ld-footer"');
    for (const page of ['about', 'contact', 'partners', 'help', 'faq', 'privacy', 'terms', 'child-safety', 'download']) {
      expect(html).toContain(`href="/${page}"`);
    }
  });

  test('le lien d’évitement mène toujours au contenu', () => {
    expect(html).toContain('href="#contenu"');
    expect(html).toContain('id="contenu"');
  });

  test('le pied porte la signature de marque', () => {
    expect(html).toContain('Meeshy 3.1.0');
    expect(html).toContain('>by services.ceo<');
    expect(html).toContain('href="https://services.ceo"');
  });
});

/**
 * MEE ACCUEILLE LE LECTEUR SUR LES SEPT PAGES (#9034) — un sticker du
 * catalogue, animé en CSS pur (aucun script), et sa légende.
 */
describe('InstitutionalPage — la vue de Mee', () => {
  const pages = [PAGE_ABOUT, PAGE_CONTACT, PAGE_FAQ, PAGE_HELP, PAGE_PARTNERS, PAGE_PRIVACY, PAGE_TERMS];

  test('chaque page a sa vue de Mee, d’un sticker qui existe, et chacune la sienne', () => {
    const ids = pages.map((page) => page.mee?.sticker);
    ids.forEach((id) => expect(id !== undefined && findMeeSticker(id) !== undefined).toBe(true));
    expect(new Set(ids).size).toBe(pages.length);
  });

  test('la vue est rendue dans la page, animée sans script, légendée', () => {
    const html = render(<InstitutionalPage page={PAGE_CONTACT} version="3.1.0" />);
    expect(html).toContain('data-mee-view="mee-lettre"');
    expect(html).toContain('src="/mee/mee-lettre.svg"');
    expect(html).toContain('Mee porte votre message');
    expect(html).not.toContain('<script');
  });

  test('« À propos » présente Mee et Meo, avec leur galerie', () => {
    const html = render(<InstitutionalPage page={PAGE_ABOUT} version="3.1.0" />);
    expect(html).toContain('Mee et Meo, les mascottes de Meeshy');
    ['mee-coucou', 'duo-meo-bisou'].forEach((id) => expect(html).toContain(`data-mee-view="${id}"`));
  });

  test('chaque vue devient un fichier SVG animé, une fois par sticker', () => {
    const files = meeViewFiles(pages);
    expect(files.map((f) => f.path)).toContain('mee/mee-lettre.svg');
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
    expect(files.find((f) => f.path === 'mee/mee-lettre.svg')?.svg).toContain('@keyframes mee-flyR');
    expect(() => meeViewFiles([{ ...PAGE_TERMS, mee: { sticker: 'inconnu', caption: 'x' } }])).toThrow();
  });

  test('la FAQ répond à « Qui sont Mee et Meo ? »', () => {
    expect(JSON.stringify(PAGE_FAQ.sections)).toContain('Qui sont Mee et Meo ?');
  });
});
