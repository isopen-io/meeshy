import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * UN LIEN EXTERNE TOUCHÉ DANS LA COQUE ANDROID S'OUVRE AU-DESSUS DE MEESHY
 * (#9858). Capacitor lance un `ACTION_VIEW` nu (`Bridge.launchIntent`) : le
 * lien d'un message ouvrait l'application du navigateur, et l'on quittait la
 * conversation. iPhone ouvre l'aperçu dans `SFSafariViewController` ; la coque
 * essaie l'app native qui gère le lien, puis un Custom Tab. La coque ne se
 * compile pas ici : ce témoin lit le Java comme du texte. La règle de tri est
 * tenue par `ExternalLinkRulesTest.java`.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(ROOT, 'android');
const JAVA = join(ANDROID, 'app', 'src', 'main', 'java', 'me', 'meeshy', 'app');
const sansCommentaires = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const lire = (chemin: string): string => sansCommentaires(readFileSync(chemin, 'utf8'));

describe('un lien externe dans la coque Android (#9858)', () => {
  const plugin = lire(join(JAVA, 'MeeshyLinksPlugin.java'));

  test('le pont des liens reprend la navigation externe avant Capacitor', () => {
    expect(plugin).toMatch(/public Boolean shouldOverrideLoad\(\s*Uri \w+\s*\)/);
    expect(plugin).toContain('ExternalLinkRules.opensOutside(');
    expect(plugin).toContain('getBridge().getAppUrl()');
  });

  test("l'app native qui gère le lien passe d'abord, le Custom Tab ensuite", () => {
    const natif = plugin.indexOf('FLAG_ACTIVITY_REQUIRE_NON_BROWSER');
    const onglet = plugin.indexOf('new CustomTabsIntent.Builder()');
    expect(natif).toBeGreaterThan(-1);
    expect(onglet).toBeGreaterThan(natif);
    expect(plugin).toContain('.launchUrl(');
    expect(plugin).toContain('ActivityNotFoundException');
  });

  test('la coque embarque androidx.browser, à une version déclarée', () => {
    const app = readFileSync(join(ANDROID, 'app', 'build.gradle'), 'utf8');
    const variables = readFileSync(join(ANDROID, 'variables.gradle'), 'utf8');
    expect(app).toContain('implementation "androidx.browser:browser:$androidxBrowserVersion"');
    expect(variables).toMatch(/androidxBrowserVersion = '\d+\.\d+\.\d+'/);
  });
});
