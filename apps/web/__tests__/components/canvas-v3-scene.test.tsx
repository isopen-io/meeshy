/**
 * F1 — `CanvasV3Scene`, le rendu v3 du web : un composant PUR.
 *
 * Ce qui est jugé ici, c'est la fidélité de la scène à sa POSE — ancres,
 * bandes, ratio du porteur, table des 18 styles, ordre des plans — et la
 * TOLÉRANCE de lecture : un kind réservé n'a jamais le droit de casser le
 * rendu. La pose animée (keyframes, transitions de clip) et la parité des
 * lecteurs sont jugées par les suites F7a voisines
 * (`canvas-v3-scene-animation`, `canvas-v3-scene-parity`).
 */
import { render, screen } from '@testing-library/react';
import { TEXT_EFFECTS } from '@/lib/story-text-effect';
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema, type CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import { CanvasV3Scene } from '@/components/v2/CanvasV3Scene';

const FIXTURES = join(__dirname, '../../../../packages/shared/fixtures/canvas-v3');

function fixture(name: string): CanvasV3 {
  return CanvasV3Schema.parse(JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')));
}

function textObject(payload: Record<string, unknown>): CanvasV3 {
  return {
    v: 3,
    scenes: [
      {
        id: 's1',
        objects: [
          {
            id: 't1',
            kind: 'text',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 0,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload,
          },
        ],
      },
    ],
  };
}

const ALL_STYLES = [
  'bold', 'neon', 'typewriter', 'handwriting', 'classic', 'calligraphy',
  'cartoon', 'futuristic', 'fantasy', 'curve', 'tag', 'italic', 'retro',
  'elegant', 'poster', 'bubble', 'note', 'brush',
] as const;

describe('CanvasV3Scene — la scène v3 (F1)', () => {
  it('renders the minimal-text fixture at its free anchor', () => {
    render(<CanvasV3Scene doc={fixture('minimal-text')} sceneIndex={0} />);

    const text = screen.getByTestId('canvas-v3-object-t1');
    expect(text).toHaveTextContent('Bonjour');
    expect(text.style.left).toBe('50%');
    expect(text.style.top).toBe('42%');
  });

  it('letterboxes the 16:9 carrier inside a 9:16 scene and files each text in its band', () => {
    const mediaById = new Map([
      ['64b000000000000000000001', { url: '/m/reel.mp4', mimeType: 'video/mp4', aspectRatio: 16 / 9 }],
    ]);
    render(<CanvasV3Scene doc={fixture('reel-16x9-bands')} sceneIndex={0} mediaById={mediaById} />);

    expect(screen.getByTestId('canvas-v3-scene').style.aspectRatio).toBe('9 / 16');
    expect(Number(screen.getByTestId('canvas-v3-object-m1').style.aspectRatio)).toBeCloseTo(16 / 9, 4);

    const top = screen.getByTestId('canvas-v3-object-t1');
    const bottom = screen.getByTestId('canvas-v3-object-t2');
    expect(top).toHaveTextContent('Le titre');
    expect(top.className).toContain('band-top');
    expect(top.style.top).toBe('6%');
    expect(bottom).toHaveTextContent('legende du film');
    expect(bottom.className).toContain('band-bottom');
    expect(bottom.style.bottom).toBe('6%');
  });

  it('maps the 18 text styles, poster condensed-bold, italic slanted — and none glows by itself (#4870)', () => {
    for (const style of ALL_STYLES) {
      const { unmount } = render(<CanvasV3Scene doc={textObject({ text: 'A', textStyle: style })} />);
      const el = screen.getByTestId('canvas-v3-object-t1');
      expect(el.style.fontFamily).not.toBe('');
      // Un style est une POLICE : la lueur vit sur l'axe EFFET, jamais sur une
      // famille — « neon » brillait ici sans briller sur iOS, où la story est
      // composée.
      expect(el.style.textShadow).not.toContain('currentColor');
      unmount();
    }

    const poster = render(<CanvasV3Scene doc={textObject({ text: 'A', textStyle: 'poster' })} />);
    const posterEl = screen.getByTestId('canvas-v3-object-t1');
    expect(posterEl.style.fontFamily).toContain('Avenir Next Condensed');
    expect(posterEl.style.fontWeight).toBe('800');
    poster.unmount();

    const italic = render(<CanvasV3Scene doc={textObject({ text: 'A', textStyle: 'italic' })} />);
    const italicEl = screen.getByTestId('canvas-v3-object-t1');
    expect(italicEl.style.fontStyle).toBe('italic');
    expect(italicEl.style.fontFamily).toContain('Georgia');
    italic.unmount();
  });

  it('falls back to the default style on an unknown textStyle instead of throwing', () => {
    const known = render(<CanvasV3Scene doc={textObject({ text: 'A', textStyle: 'bold' })} />);
    const expected = screen.getByTestId('canvas-v3-object-t1').getAttribute('style');
    known.unmount();

    expect(() =>
      render(<CanvasV3Scene doc={textObject({ text: 'A', textStyle: 'houdini-2099' })} />)
    ).not.toThrow();
    expect(screen.getByTestId('canvas-v3-object-t1').getAttribute('style')).toBe(expected);
  });

  it('stacks bg under content under fg, then by z inside a plane', () => {
    const doc: CanvasV3 = {
      v: 3,
      scenes: [
        {
          id: 's1',
          objects: [
            {
              id: 'fgText', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 1,
              transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'devant' },
            },
            {
              id: 'bgMedia', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0,
              transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { background: '#112233' },
            },
            {
              id: 'carrier', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 2,
              transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { mediaURL: '/m/a.jpg', mediaType: 'image' },
            },
          ],
        },
      ],
    };
    render(<CanvasV3Scene doc={doc} />);

    expect(screen.getByTestId('canvas-v3-object-bgMedia').style.zIndex).toBe('0');
    expect(screen.getByTestId('canvas-v3-object-carrier').style.zIndex).toBe('12');
    expect(screen.getByTestId('canvas-v3-object-fgText').style.zIndex).toBe('21');
  });

  it('ignores a reserved kind silently — reading tolerance, never a throw', () => {
    const doc = {
      v: 3,
      scenes: [
        {
          id: 's1',
          objects: [
            {
              id: 'vote', kind: 'interactive', anchor: { t: 'free', x: 0.5, y: 0.2 }, plane: 'fg', z: 0,
              transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { question: 'Alors ?' },
            },
            {
              id: 't1', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 0,
              transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'Bonjour' },
            },
          ],
        },
      ],
    } as unknown as CanvasV3;

    expect(() => render(<CanvasV3Scene doc={doc} />)).not.toThrow();
    expect(screen.getByTestId('canvas-v3-object-t1')).toHaveTextContent('Bonjour');
    expect(screen.queryByTestId('canvas-v3-object-vote')).toBeNull();
    expect(screen.queryByText('Alors ?')).toBeNull();
  });

  it('resolves the reader languages IN ORDER, the origin competing at its own rank', () => {
    const doc: CanvasV3 = {
      v: 3,
      scenes: [
        {
          id: 's1',
          objects: [
            {
              id: 't1', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 0,
              transform: { scale: 1, rotation: 0, opacity: 1 }, locale: 'en',
              payload: { text: 'Hello', translations: { fr: 'Bonjour' } },
            },
          ],
        },
      ],
    };

    const frFirst = render(<CanvasV3Scene doc={doc} preferredLanguages={['fr', 'en']} />);
    expect(screen.getByTestId('canvas-v3-object-t1')).toHaveTextContent('Bonjour');
    frFirst.unmount();

    const enFirst = render(<CanvasV3Scene doc={doc} preferredLanguages={['en', 'fr']} />);
    expect(screen.getByTestId('canvas-v3-object-t1')).toHaveTextContent('Hello');
    enFirst.unmount();

    const noMatch = render(<CanvasV3Scene doc={doc} preferredLanguages={['de']} />);
    expect(screen.getByTestId('canvas-v3-object-t1')).toHaveTextContent('Hello');
    noMatch.unmount();
  });
});

/// L'axe EFFET (#4870) — `payload.textEffect`, lu par le MÊME helper que le
/// chemin legacy de `StoryViewer` (`lib/story-text-effect.ts`).
describe('CanvasV3Scene — l\'axe EFFET du texte (#4870)', () => {
  const shadowOf = (payload: Record<string, unknown>): string => {
    const { unmount } = render(<CanvasV3Scene doc={textObject({ text: 'A', textStyle: 'bold', ...payload })} />);
    const shadow = screen.getByTestId('canvas-v3-object-t1').style.textShadow;
    unmount();
    return shadow;
  };

  it('glow is a centered halo in the text colour, in em so it follows the font size', () => {
    const shadow = shadowOf({ textEffect: 'glow' });
    expect(shadow).toContain('currentColor');
    expect(shadow).toContain('0.36em');
  });

  it('shadow is a soft black drop shadow offset downwards', () => {
    const shadow = shadowOf({ textEffect: 'shadow' });
    expect(shadow).toContain('0.06em');
    expect(shadow).toContain('0.16em');
    expect(shadow).not.toContain('currentColor');
  });

  it('relief is a hard offset shadow — no blur', () => {
    const shadow = shadowOf({ textEffect: 'relief' });
    expect(shadow).toContain('0.05em 0.05em 0 ');
  });

  it('an absent or unknown effect keeps the readability veil, never throws', () => {
    expect(shadowOf({})).toContain('1px 4px');
    expect(shadowOf({ textEffect: 'effect-from-the-future' })).toContain('1px 4px');
  });

  it('the neon FONT plus the glow EFFECT glows exactly once — the axes are orthogonal', () => {
    const shadow = shadowOf({ textStyle: 'neon', textEffect: 'glow' });
    expect(shadow.split('currentColor').length - 1).toBe(1);
  });

  /// #5244 — dix effets de plus, et une encre CLAIRE que le booléen d'origine
  /// ne savait pas dire ; six de plus le 2026-09-05, l'axe portant vingt noms.
  it('the twenty-five effects all render, and none falls back to the veil', () => {
    for (const effect of TEXT_EFFECTS) {
      expect(shadowOf({ textEffect: effect })).not.toContain('1px 4px');
    }
    expect(TEXT_EFFECTS).toHaveLength(24); // les vingt-cinq moins « aucun », qui est l'absence
  });

  it('a light-ink relief paints WHITE — what "text colour or black" could not say', () => {
    for (const effect of ['emboss', 'letterpress']) {
      expect(shadowOf({ textEffect: effect })).toContain('255,255,255');
    }
  });

  /// **`currentColor` ne porte pas d'alpha.** Tant que la seule encre `text`
  /// était `glow` (opacité 1), personne ne pouvait le voir ; `glowSoft` (0,55)
  /// et `echo` (0,35) se seraient rendus PLEINS ici et translucides sur les
  /// deux clients natifs — une divergence introduite par l'élargissement
  /// lui-même.
  it('a translucent text-ink effect carries its alpha, not a bare currentColor', () => {
    for (const [effect, pourcent] of [['glowSoft', '55%'], ['echo', '35%']] as const) {
      const shadow = shadowOf({ textEffect: effect });
      expect(shadow).toContain('color-mix');
      expect(shadow).toContain(pourcent);
    }
  });
});
