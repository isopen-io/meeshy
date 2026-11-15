import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LE CLAVIER RÉDUIT L'ÉCRAN, IL NE LE RECOUVRE PAS (#7799).
 *
 * Les écrans « application » (le fil, la liste, les composeurs) sont des
 * racines `h-dvh` + `overflow-hidden` dont l'en-tête et le composeur sont des
 * bords fixes : ils supposent que `100dvh` est la hauteur VISIBLE. Chrome
 * Android applique par défaut `resizes-visual` depuis sa version 108 : le
 * clavier ne réduit que le viewport visuel, `100dvh` garde sa hauteur, et le
 * composeur passe SOUS le clavier pendant que la page glisse et emporte
 * l'en-tête. La coque Android et l'app iOS réduisent, elles, la surface de
 * l'application. La clé ci-dessous rend au web ce comportement.
 */

const INDEX = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html');

function viewportContent(html: string): readonly string[] {
  const meta = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/);
  return (meta?.[1] ?? '').split(',').map((part) => part.trim());
}

describe('le viewport de index.html (#7799)', () => {
  const content = viewportContent(readFileSync(INDEX, 'utf8'));

  test('le clavier virtuel réduit le viewport de mise en page, donc 100dvh', () => {
    expect(content).toContain('interactive-widget=resizes-content');
  });

  test('et la safe-area reste exposée', () => {
    expect(content).toContain('viewport-fit=cover');
  });
});
