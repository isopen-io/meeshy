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
  test('le formulaire d’entrée sans compte a quitté la page, ses règles aussi (#10784)', () => {
    for (const selector of ['.ld-form', '.ld-step', '.ld-field', '.ld-error']) expect(css).not.toMatch(new RegExp(`^\\${selector}[ {]`, 'm'));
  });

  test('le QR vers /world a une seule règle, et garde son fond blanc quel que soit le thème (#10784)', () => {
    expect(topLevelRuleCount('.ld-qr')).toBe(1);
    expect(topLevelRuleCount('.ld-qr img')).toBe(1);
    const html = renderToStaticMarkup(<LandingPage language="fr" copy={LANDING_COPY.fr} />);
    expect(html.match(/class="ld-qr"/g)?.length).toBe(2);
  });

  test('sur un écran tactile, le QR et sa consigne s’effacent devant le lien : on ne flashe pas son propre écran (#10811)', () => {
    const coarse = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(coarse).toMatch(/\.ld-qr img,\s*\.ld-qr-scan \{\s*display: none;/);
    expect(topLevelRuleCount('.ld-qr-link')).toBe(1);
  });

  test('la pastille numérotée des cartes « Trois gestes » porte sa propre classe', () => {
    const html = renderToStaticMarkup(<LandingPage language="fr" copy={LANDING_COPY.fr} />);
    expect(html).toContain('class="ld-step-num"');
    expect(topLevelRuleCount('.ld-step-num')).toBe(1);
  });
});
