import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA LANGUE CHOISIE DANS MEESHY GAGNE LES TEXTES NATIFS DE LA COQUE (#9749).
 * La page appelle `MeeshyLocale.setLocales({ tag, ifUnset })`
 * (`src/lib/shell-locale.ts`) ; la coque la pose comme langue de
 * l'application, celle que « Langue de l'app » d'Android affiche (#9748). La
 * règle (langues admises, « seulement si rien n'est posé ») est tenue par
 * `AppLocaleRulesTest.java`.
 */

const JAVA = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const lire = (fichier: string): string =>
  readFileSync(join(JAVA, fichier), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('la langue de l’application dans la coque Android (#9749)', () => {
  test('le plugin porte le nom et la méthode que la page appelle', () => {
    const plugin = lire('MeeshyLocalePlugin.java');
    expect(plugin).toContain('name = "MeeshyLocale"');
    expect(plugin).toMatch(/@PluginMethod\s+public void setLocales\(/);
    expect(plugin).toContain('AppLocaleRules.target(');
    expect(plugin).toContain('AppCompatDelegate.setApplicationLocales(');
    expect(plugin).toContain('AppCompatDelegate.getApplicationLocales()');
  });

  test('la coque l’enregistre avant de construire le pont', () => {
    const activite = lire('MainActivity.java');
    const enregistrement = activite.indexOf('registerPlugin(MeeshyLocalePlugin.class);');
    expect(enregistrement).toBeGreaterThan(-1);
    expect(enregistrement).toBeLessThan(activite.indexOf('super.onCreate(savedInstanceState);'));
  });
});
