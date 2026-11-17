import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount, spokenText } from '@/test-support/kit-mount';

import { MeeshyBadge, MeeshyBadgeAnchor, meeshyBadgeCountSpoken, meeshyBadgeCountText, meeshyBadgeRecipe, type MeeshyBadgeSize } from './meeshy-badge';

const { mount, act } = kitMount();

const SIZES: readonly MeeshyBadgeSize[] = [18, 22, 28, 36];

describe('MeeshyBadge — la loi du compte', () => {
  test('zéro ou négatif : rien', () => {
    expect(meeshyBadgeCountText(0)).toBe('');
    expect(meeshyBadgeCountText(-3)).toBe('');
    expect(meeshyBadgeCountText(Number.NaN)).toBe('');
  });

  test('plafond : 99 reste 99, 100 écrit « 99+ », la voix dit le vrai nombre', () => {
    expect(meeshyBadgeCountText(1)).toBe('1');
    expect(meeshyBadgeCountText(99)).toBe('99');
    expect(meeshyBadgeCountText(100)).toBe('99+');
    expect(meeshyBadgeCountText(1204)).toBe('99+');
    expect(meeshyBadgeCountText(150, { cap: 50 })).toBe('50+');
    expect(meeshyBadgeCountSpoken(1204)).toBe('1204');
    expect(meeshyBadgeCountSpoken(0)).toBe('');
  });

  test('un quota s’écrit « 2 / 3 »', () => {
    expect(meeshyBadgeCountText(2, { of: 3 })).toBe('2 / 3');
    expect(meeshyBadgeCountSpoken(2, { of: 3 })).toBe('2 / 3');
  });
});

describe('MeeshyBadge — la recette en valeurs', () => {
  test('quatre hauteurs, corps 10 · 11 · 12 · 12,5, glyphe 11 · 13 · 16, écart 5', () => {
    const measured = SIZES.map((size) => {
      const recipe = meeshyBadgeRecipe({ size });
      return [recipe.height, recipe.fontSize, recipe.gap];
    });
    expect(measured).toEqual([
      [18, 10, 5],
      [22, 11, 5],
      [28, 12, 5],
      [36, 12.5, 5],
    ]);
    expect(meeshyBadgeRecipe({ size: 18 }).glyphSize).toBe(11);
    expect(meeshyBadgeRecipe({ size: 28 }).glyphSize).toBe(13);
    expect(meeshyBadgeRecipe({ size: 36 }).glyphSize).toBe(16);
  });

  test('les quatre surfaces : verre, tonale à 16 %, aplat, contour de 1,5', () => {
    expect(meeshyBadgeRecipe({ surface: 'glass' }).fill).toBe('glass');
    expect(meeshyBadgeRecipe({ surface: 'tonal' })).toMatchObject({ fill: 'tint', fillOpacity: 0.16, borderWidth: 0 });
    expect(meeshyBadgeRecipe({ surface: 'solid' })).toMatchObject({ fill: 'solid', ink: 'onSolid' });
    expect(meeshyBadgeRecipe({ surface: 'outline' })).toMatchObject({ fill: 'none', borderWidth: 1.5 });
  });

  test('un compte à rattraper est rouge, quelle que soit la couleur d’accent de l’hôte', () => {
    expect(meeshyBadgeRecipe({ kind: 'err', surface: 'solid' }).tone).toBe('err');
    expect(meeshyBadgeRecipe({ kind: 'err', surface: 'tonal' }).tone).toBe('err');
  });

  test('la teinte libre remplace la couleur du genre mais pas son sens', () => {
    const recipe = meeshyBadgeRecipe({ kind: 'ok', tint: '#14b8a6' });
    expect(recipe.tone).toBe('tint');
    expect(recipe.kind).toBe('ok');
  });

  test('périmé : désaturé à 62 % ; désactivé : 40 % ; courant : bord d’accent', () => {
    expect(meeshyBadgeRecipe({ isStale: true })).toMatchObject({ opacity: 0.62, isDesaturated: true });
    expect(meeshyBadgeRecipe({ isInteractive: true, isEnabled: false })).toMatchObject({ opacity: 0.4, isActionEnabled: false });
    expect(meeshyBadgeRecipe({ isCurrent: true }).hasAccentRim).toBe(true);
  });

  test('inerte : ni cible ni rôle ; touchable : cible de 44 qui déborde sans changer l’encombrement', () => {
    const inert = meeshyBadgeRecipe({ size: 22 });
    expect(inert).toMatchObject({ role: 'none', targetSide: 0 });
    const touch = meeshyBadgeRecipe({ size: 22, isInteractive: true });
    expect(touch).toMatchObject({ role: 'button', targetSide: 44 });
    expect(touch.hitSlackBlock).toBe(11);
    expect(touch.height).toBe(inert.height);
  });

  test('pressé : échelle 0,94', () => {
    expect(meeshyBadgeRecipe({ isInteractive: true, isPressed: true }).scale).toBe(0.94);
  });

  test('la queue de bulle : rayon 18, 6 au coin tourné vers l’avatar', () => {
    expect(meeshyBadgeRecipe({ shape: 'bubble' }).radii).toEqual({ start: 18, end: 18, endBottom: 18, startBottom: 6 });
    expect(meeshyBadgeRecipe({ shape: 'capsule' }).radii).toBeNull();
  });

  test('multi-ligne : rayon 14, trois lignes au plus', () => {
    expect(meeshyBadgeRecipe({ lineLimit: 3 })).toMatchObject({ radius: 14, maxLines: 3, isFullWidth: true });
    expect(meeshyBadgeRecipe({ lineLimit: 1 })).toMatchObject({ maxLines: 1, isFullWidth: false });
  });

  test('le détourage : anneau de 3 à la couleur du fond, décalage d’un quart de la hauteur', () => {
    expect(meeshyBadgeRecipe({ size: 22 }).cutout).toEqual({ ring: 3, offset: 5.5 });
    expect(meeshyBadgeRecipe({ size: 18 }).cutout.offset).toBe(4.5);
  });
});

describe('MeeshyBadge — le composant', () => {
  test('un compte à zéro ne rend rien et ne prend aucune place', () => {
    const container = mount(<MeeshyBadge content={{ count: 0 }} label="0 non lu" />);
    expect(container.children.length).toBe(0);
  });

  test('100 non lus : « 99+ » à l’œil, le vrai nombre à la voix', () => {
    const container = mount(<MeeshyBadge content={{ count: 100 }} label="100 non lus" />);
    const node = container.querySelector('[data-kit-badge]');
    expect(node === null ? '' : spokenText(node)).toBe('100 non lus');
    expect(node?.getAttribute('aria-label')).toBeNull();
    expect(node?.querySelector('[data-kit-badge-content]')?.textContent).toBe('99+');
  });

  test('sans label, le compte se dit par son vrai nombre', () => {
    const container = mount(<MeeshyBadge content={{ count: 150 }} />);
    const node = container.querySelector('[data-kit-badge]');
    expect(node === null ? '' : spokenText(node)).toBe('150');
  });

  test('un glyphe seul inerte se dit par son nom, pas par un aria-label qu’ARIA interdit sur un span', () => {
    const container = mount(<MeeshyBadge content={{ glyph: true }} leading={{ glyph: <i>l</i> }} label="Vérifié" />);
    const node = container.querySelector('[data-kit-badge]');
    expect(node === null ? '' : spokenText(node)).toBe('Vérifié');
    expect(node?.getAttribute('aria-label')).toBeNull();
  });

  test('un mot sans label se lit tel quel, une seule fois', () => {
    const container = mount(<MeeshyBadge content={{ label: 'Vérifié' }} />);
    const node = container.querySelector('[data-kit-badge]');
    expect(node === null ? '' : spokenText(node)).toBe('Vérifié');
  });

  test('inerte : un texte sans rôle ; avec onPress : un bouton nommé', () => {
    const inert = mount(<MeeshyBadge content={{ label: 'Vérifié' }} />);
    expect(inert.querySelector('button')).toBeNull();
    expect(inert.querySelector('[data-kit-badge]')?.getAttribute('role')).toBeNull();
    const calls: string[] = [];
    const touch = mount(<MeeshyBadge content={{ glyph: true }} leading={{ glyph: <i>l</i> }} label="Niveau 24" onPress={() => calls.push('x')} />);
    const button = touch.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Niveau 24');
    act(() => button?.click());
    expect(calls).toEqual(['x']);
  });

  test('un glyphe sans nom échoue : « glyph sans label » ne passe pas', () => {
    expect(() => mount(<MeeshyBadge content={{ glyph: true }} leading={{ glyph: <i>l</i> }} />)).toThrow();
  });

  test('le glyphe et le point sont masqués à la voix', () => {
    const container = mount(<MeeshyBadge content={{ label: 'En ligne' }} leading="liveDot" />);
    expect(container.querySelector('[data-kit-badge-lead]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('l’heure et la durée sont en chasse fixe, le code en mono', () => {
    const time = mount(<MeeshyBadge content={{ time: '17:42' }} />);
    expect(time.querySelector('[data-kit-badge-content]')?.getAttribute('data-content')).toBe('time');
    const code = mount(<MeeshyBadge content={{ code: 'PT' }} />);
    expect(code.querySelector('[data-kit-badge-content]')?.getAttribute('data-content')).toBe('code');
  });

  test('l’ancre de coin pose la pastille sur l’hôte sans changer son encombrement', () => {
    const container = mount(
      <MeeshyBadgeAnchor alignment="topEnd" cutout="#101010" badge={<MeeshyBadge content={{ count: 3 }} label="3 non lus" size={18} />}>
        <span data-host>avatar</span>
      </MeeshyBadgeAnchor>,
    );
    const anchor = container.querySelector<HTMLElement>('[data-kit-badge-anchor]');
    expect(anchor?.getAttribute('data-alignment')).toBe('topEnd');
    expect(anchor?.style.getPropertyValue('--kit-badge-cutout')).toBe('#101010');
    expect(container.querySelector('[data-host]')).not.toBeNull();
  });
});

describe('MeeshyBadge — pureté', () => {
  test('aucun type du domaine, aucun singleton, aucun verre dessiné', () => {
    for (const file of ['./meeshy-badge.tsx', './meeshy-badge-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/backdrop-filter|@meeshy\/shared|@\/stores|@\/lib\/api/);
    }
  });
});
