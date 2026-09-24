import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * LES PNG DE MARQUE SERVIS SONT LES OCTETS DE LEUR SOURCE iOS (#5606).
 *
 * Directive porteur 2026-09-07 soir : les actifs de marque se RÉCUPÈRENT, ils
 * ne se redessinent pas. Ce témoin le prouve à l'octet — pas à la taille, pas
 * au format : `Buffer.equals` sur le fichier SERVI et sur son imageset source.
 * C'est le témoin RAPIDE du gate de divergence (`generate-icons.py --check`,
 * scripts/generate-icons.py) pour les trois copies octet pour octet du
 * pipeline : il rougit à chaque `bun test`, sans reconstruire quoi que ce
 * soit, sur tout octet qui diverge — y compris un fichier simplement absent
 * (`readFileSync` lève, le test échoue).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../..');
const XCASSETS = join(REPO, 'apps/ios/Meeshy/Assets.xcassets');
const APP = join(HERE, '..');

describe('les actifs de marque servis sont des copies octet pour octet de leur source iOS', () => {
  test('public/brand/logo.png ≡ MeeshyLogo.imageset/MeeshyLogo@3x.png', () => {
    const served = readFileSync(join(APP, 'public/brand/logo.png'));
    const source = readFileSync(join(XCASSETS, 'MeeshyLogo.imageset/MeeshyLogo@3x.png'));
    expect(served.equals(source)).toBe(true);
  });

  test('public/brand/signature-mask.png ≡ AppIconFooter.imageset/AppIconFooter@3x.png', () => {
    const served = readFileSync(join(APP, 'public/brand/signature-mask.png'));
    const source = readFileSync(join(XCASSETS, 'AppIconFooter.imageset/AppIconFooter@3x.png'));
    expect(served.equals(source)).toBe(true);
  });

  test('ios/App/App/…/AppIcon-512@2x.png ≡ Icon-Light-1024x1024.png (copie #5604, épinglée ici)', () => {
    const iconset = join(APP, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
    /* La coque iOS n'est pas générée dans tous les arbres — `generate_ios_assets()`
       la garde de la même façon côté générateur. Mais la garde porte sur la
       COQUE, pas sur le fichier : si l'`appiconset` existe, la copie DOIT y
       être. Un `try/catch` autour de la lecture rendait ce témoin increvable
       (vert sur une copie juste comme sur un fichier effacé), ce qui est le
       défaut même que ce fichier existe pour attraper — revue de #5606. */
    if (!existsSync(iconset)) return;
    const served = readFileSync(join(iconset, 'AppIcon-512@2x.png'));
    const source = readFileSync(join(XCASSETS, 'AppIcon.appiconset/Icon-Light-1024x1024.png'));
    expect(served.equals(source)).toBe(true);
  });
});
