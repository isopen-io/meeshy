import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AuthorPlate as AuthorPlateData } from '@/lib/game-photo/author-plate';

import { AuthorPlate } from './author-plate';

/**
 * LA PLAQUE D'AUTEUR, DESSINÉE (#10816) — un SVG unique pour les trois finis :
 * il lit la donnée de la plaque (`authorPlateOf`) et ne décide rien. C'est le
 * même dessin dans la carte posée et dans l'image exportée (`data-photo-art`).
 */
const plate = (over: Partial<AuthorPlateData> = {}): AuthorPlateData => ({
  family: 'achievement',
  finish: 'engrave',
  metal: 'silver',
  caption: 'Succès de',
  name: '@atabeth',
  monogram: 'AT',
  label: 'Succès de @atabeth',
  ...over,
});

const render = (props: Parameters<typeof AuthorPlate>[0]): string => renderToStaticMarkup(<AuthorPlate {...props} />);

describe('AuthorPlate', () => {
  test('grave le pseudo et la formule (en capitales), décoratif', () => {
    const html = render({ plate: plate(), width: 360 });
    expect(html).toContain('@atabeth');
    expect(html).toContain('SUCCÈS DE');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('viewBox="0 0 360 100"');
    expect(html).toContain('width="360"');
    expect(html).toContain('height="100"');
  });

  test('le fini et le métal se lisent sur le dessin', () => {
    for (const finish of ['engrave', 'emboss', 'scratch'] as const) {
      const html = render({ plate: plate({ finish, metal: 'gold' }), width: 200 });
      expect(html).toContain(`data-plate-finish="${finish}"`);
      expect(html).toContain('data-plate-metal="gold"');
    }
  });

  test('l’estampage pose un champ creusé ; le grattage, sa couche d’argent masquée', () => {
    expect(render({ plate: plate({ finish: 'emboss' }), width: 200 })).toContain('data-plate-field');
    const scratch = render({ plate: plate({ finish: 'scratch', metal: 'obsidian' }), width: 200 });
    expect(scratch).toContain('data-plate-scratch');
    expect(scratch).toContain('<mask');
  });

  test('le pseudo s’écrit de gauche à droite, même en arabe', () => {
    expect(render({ plate: plate({ caption: 'إنجاز' }), width: 200 })).toMatch(/<text[^>]*direction="ltr"[^>]*>@atabeth<\/text>/);
  });

  test('la photo de profil n’entre que si on la demande : l’image exportée garde le monogramme', () => {
    const withAvatar = plate({ avatar: 'https://cdn.test/a.jpg' });
    expect(render({ plate: withAvatar, width: 200, showAvatar: true })).toContain('href="https://cdn.test/a.jpg"');
    const exported = render({ plate: withAvatar, width: 200 });
    expect(exported).not.toContain('<image');
    expect(exported).toContain('>AT</text>');
  });

  test('aucune couleur écrite : les métaux sont des jetons', () => {
    const html = render({ plate: plate({ finish: 'scratch' }), width: 200 });
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b(?![-\w])/i);
    expect(html).toContain('var(--game-');
  });

  test('deux plaques sur une page ne se volent pas leurs dégradés', () => {
    const html = renderToStaticMarkup(
      <>
        <AuthorPlate plate={plate()} width={100} />
        <AuthorPlate plate={plate()} width={100} />
      </>,
    );
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
