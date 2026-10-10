import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE MOT DE PASSE DE MEESHY.ME EST PROPOSÉ DANS LA COQUE ANDROID (#9530) —
 * jumeau de `webcredentials` côté iOS (AASA + `Meeshy.entitlements`). Le
 * Gestionnaire de mots de passe de Google ne relie les identifiants d'un site à
 * une app que si l'association est déclarée DES DEUX CÔTÉS : la relation
 * `get_login_creds` dans `assetlinks.json`, et `asset_statements` dans l'app.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETLINKS = join(RACINE, 'public', '.well-known', 'assetlinks.json');
const MAIN = join(RACINE, 'android', 'app', 'src', 'main');

type Declaration = { readonly relation: readonly string[]; readonly target: { readonly package_name?: string } };

const declarations = JSON.parse(readFileSync(ASSETLINKS, 'utf8')) as readonly Declaration[];
const relationsDe = (paquet: string): readonly string[] =>
  declarations.filter((declaration) => declaration.target.package_name === paquet).flatMap((declaration) => declaration.relation);

const sansCommentaires = (xml: string): string => xml.replace(/<!--[\s\S]*?-->/g, '');

describe('les identifiants de meeshy.me sont partagés avec la coque Android (#9530)', () => {
  test('le site délègue ses identifiants aux deux paquets de la coque', () => {
    expect(relationsDe('me.meeshy.app')).toContain('delegate_permission/common.get_login_creds');
    expect(relationsDe('me.meeshy.app.debug')).toContain('delegate_permission/common.get_login_creds');
  });

  test('les App Links restent déclarés', () => {
    expect(relationsDe('me.meeshy.app')).toContain('delegate_permission/common.handle_all_urls');
  });

  test('la coque déclare la réciproque, vers le assetlinks.json de meeshy.me', () => {
    const manifeste = sansCommentaires(readFileSync(join(MAIN, 'AndroidManifest.xml'), 'utf8'));
    const application = manifeste.slice(manifeste.indexOf('<application'), manifeste.indexOf('</application>'));
    expect(application).toMatch(/<meta-data\s+android:name="asset_statements"\s+android:resource="@string\/asset_statements"\s*\/>/);

    const chaines = sansCommentaires(readFileSync(join(MAIN, 'res', 'values', 'strings.xml'), 'utf8'));
    const declaration = /<string name="asset_statements" translatable="false">([\s\S]*?)<\/string>/.exec(chaines)?.[1] ?? '';
    const enonces = JSON.parse(declaration.replace(/\\"/g, '"')) as ReadonlyArray<{ readonly include?: string }>;
    expect(enonces.map((enonce) => enonce.include)).toContain('https://meeshy.me/.well-known/assetlinks.json');
  });
});
