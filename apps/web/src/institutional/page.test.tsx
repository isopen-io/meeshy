/** @jsxImportSource preact */
import { describe, expect, test } from 'bun:test';
import { render } from 'preact-render-to-string';

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
 * LES PAGES INSTITUTIONNELLES SERVENT LE LOGO ET LA SIGNATURE (#5606).
 *
 * `InstitutionalPage` est le rendu partagé des sept pages — un seul test
 * suffit à prouver « au moins un écran » (§ critère de fin, ligne 2) ; les
 * quatre autres contenus (`contact.ts`, `partners.ts`, `privacy.ts`,
 * `terms.ts`) traversent exactement le même composant.
 */
describe('InstitutionalPage — en-tête (logo) et pied (signature)', () => {
  const html = render(<InstitutionalPage page={PAGE_ABOUT} version="3.1.0" />);

  test('l’en-tête sert le logo — décoratif, le mot « Meeshy » adjacent porte le nom', () => {
    // `preact-render-to-string` sérialise un `alt=""` en attribut nu `alt`
    // (sans `=""`) — le témoin lit donc le TAG entier plutôt que de chercher
    // une sous-chaîne dont la forme dépend du moteur de rendu.
    expect(html).toContain('<img src="/brand/logo.png" width="40" height="40" alt/>');
  });

  test('le pied porte la signature de marque', () => {
    expect(html).toContain('Meeshy 3.1.0');
    expect(html).toContain('Services CEO');
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
