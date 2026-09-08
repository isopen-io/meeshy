/**
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import RootLayout from '@/app/layout';
import { SpriteCritique, glyphesCritiques } from '@/app/sprite-critique';

/**
 * Le sous-sprite CRITIQUE, inliné dans la coquille (§ 8.5).
 *
 * Le § 8.5 sert le sprite des 72 glyphes en EXTERNE — une requête de plus, que
 * le budget de `/l/:token/expired` n'a pas : il en autorise DEUX, le document et
 * sa feuille. Les huit glyphes rendus au-dessus de la ligne de flottaison
 * voyagent donc DANS le document, et `packages/icons/critique.json` dit lesquels
 * et pourquoi, glyphe par glyphe.
 *
 * Ce témoin garde les deux moitiés de cette décision : la coquille inline bien
 * le fichier COMMITÉ (jamais une recopie de tracés), et elle l'inline de façon
 * INVISIBLE et MUETTE — un sprite qui se voit ou qui s'annonce à un lecteur
 * d'écran serait un défaut d'accessibilité posé sur toutes les pages à la fois.
 */

const CRITIQUE = readFileSync(
  join(__dirname, '..', 'node_modules', '@meeshy', 'icons', 'critical.svg'),
  'utf8',
);

const NOMS_CRITIQUES: readonly string[] = (
  JSON.parse(
    readFileSync(join(__dirname, '..', 'node_modules', '@meeshy', 'icons', 'critique.json'), 'utf8'),
  ) as { readonly glyphes: readonly { readonly nom: string }[] }
).glyphes.map((glyphe) => glyphe.nom);

describe('le sous-sprite critique', () => {
  it('porte exactement les glyphes que `critique.json` déclare', () => {
    expect(glyphesCritiques()).toEqual([...NOMS_CRITIQUES].sort());
  });

  it('inline les tracés COMMITÉS, jamais une seconde copie', () => {
    const rendu = renderToStaticMarkup(<SpriteCritique />);

    for (const nom of NOMS_CRITIQUES) {
      expect(rendu).toContain(`<symbol id="${nom}"`);
    }
    expect(CRITIQUE).toContain('<symbol id="ph-warning-circle"');
  });

  it('est invisible et muet — il ne coûte ni un pixel ni une annonce', () => {
    const rendu = renderToStaticMarkup(<SpriteCritique />);

    expect(rendu).toContain('aria-hidden="true"');
    expect(rendu).toContain('display:none');
  });

  it('voyage avec la coquille, donc avec la première réponse de toute page', () => {
    const html = renderToStaticMarkup(<RootLayout>{null}</RootLayout>);

    expect(html).toContain('<symbol id="ph-caret-left"');
    expect(html).not.toContain('sprite.svg');
  });
});
