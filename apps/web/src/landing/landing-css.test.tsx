import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import { LANDING_COPY } from './landing-copy';
import { LandingPage } from './landing-page';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/landing.css'), 'utf8');

const topLevelRuleCount = (selector: string): number =>
  css.split('\n').filter((line) => line.trim() === `${selector} {`).length;

describe('la feuille de la landing ne déclare pas deux fois la même classe', () => {
  test('le conteneur des étapes du formulaire (.ld-step) a une seule règle de premier niveau', () => {
    expect(topLevelRuleCount('.ld-step')).toBe(1);
  });

  test('la pastille numérotée des cartes « Trois gestes » porte sa propre classe', () => {
    const html = renderToStaticMarkup(<LandingPage language="fr" copy={LANDING_COPY.fr} />);
    expect(html).toContain('class="ld-step-num"');
    expect(topLevelRuleCount('.ld-step-num')).toBe(1);
  });
});
