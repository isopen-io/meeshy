import { renderToStaticMarkup } from 'react-dom/server';

import { DOCUMENT_LANGUAGE } from '../app/document-language';
import RootLayout from '../app/layout';
import NotFound from '../app/not-found';

const markup = (): string =>
  renderToStaticMarkup(
    <RootLayout>
      <NotFound />
    </RootLayout>,
  );

describe('le 404 de la v3', () => {
  it("est celui de la v3, pas la chaîne anglaise codée en dur par le framework", () => {
    expect(markup()).not.toContain('This page could not be found');
    expect(markup()).toContain('Page introuvable');
  });

  it('est servi dans la langue que la coquille déclare', () => {
    expect(markup()).toContain(`<html lang="${DOCUMENT_LANGUAGE}"`);
  });

  it('pose le repère principal que le gate a11y exige', () => {
    expect(markup()).toContain('<main id="main-content">');
  });

  it("annonce l'erreur par un titre, jamais par un simple paragraphe", () => {
    expect(markup()).toMatch(/<h1[^>]*>/);
  });

  it("ne charge aucun script hors celui du thème", () => {
    expect(markup()).not.toContain('<script src=');
  });
});
