import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA SAUVEGARDE ANDROID NE COPIE PAS LE STOCKAGE DE LA WEBVIEW (#10143).
 *
 * Sur le web, la session (`meeshy.session`) et le cache des requêtes restent
 * dans le navigateur. Dans la coque, ils vivent sous `app_webview/` : sans
 * exclusion, la sauvegarde Google et le transfert d'appareil les copient, et
 * un autre téléphone se restaure connecté. Les deux jeux de règles (API ≤ 30
 * et API 31+) excluent ce dossier, comme le credential d'appel (#8049).
 */

const XML = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res', 'xml');

function sansCommentaires(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

function section(source: string, balise: string): string {
  return source.match(new RegExp(`<${balise}>([\\s\\S]*?)</${balise}>`))?.[1] ?? '';
}

const WEBVIEW = /<exclude\s+domain="root"\s+path="app_webview\/"\s*\/>/;
const APPEL = /<exclude\s+domain="sharedpref"\s+path="meeshy_call_shell\.xml"\s*\/>/;

describe('la sauvegarde de la coque laisse la WebView sur l’appareil (#10143)', () => {
  test('sauvegarde complète (API ≤ 30)', () => {
    const regles = section(sansCommentaires(readFileSync(join(XML, 'backup_rules.xml'), 'utf8')), 'full-backup-content');
    expect(regles).toMatch(WEBVIEW);
    expect(regles).toMatch(APPEL);
  });

  for (const balise of ['cloud-backup', 'device-transfer']) {
    test(`${balise} (API 31+)`, () => {
      const regles = section(sansCommentaires(readFileSync(join(XML, 'data_extraction_rules.xml'), 'utf8')), balise);
      expect(regles).toMatch(WEBVIEW);
      expect(regles).toMatch(APPEL);
    });
  }
});
