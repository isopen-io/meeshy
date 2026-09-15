import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup as render } from 'react-dom/server';

import { UNREAD_BADGE_CORNER, UNREAD_BADGE_RUNG, UnreadCornerBadge, UnreadRungBadge } from './unread-badge';

/**
 * **LA PASTILLE DE COIN REVIENT AVEC SON PREMIER APPELANT** (#6219, #6288) —
 * le bouton flottant de droite. Cotes de `NotificationBadge`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/FloatingButtons.swift:700-745`) :
 * hauteur 18, plancher carré 18, 6 de rembourrage, décalée de `(+16, −16)`,
 * ombre à 0,5 du rouge sémantique.
 */
describe('la pastille de coin', () => {
  test('les cotes d’iOS', () => {
    const { minimumSize, horizontalPadding, offsetX, offsetY, shadowOpacity } = UNREAD_BADGE_CORNER;
    expect({ minimumSize, horizontalPadding, offsetX, offsetY, shadowOpacity }).toEqual({
      minimumSize: 18,
      horizontalPadding: 6,
      offsetX: 16,
      offsetY: -16,
      shadowOpacity: 0.5,
    });
  });

  test('le portillon vit dans l’atome : rien à zéro ni en négatif', () => {
    expect(render(<UnreadCornerBadge count={0} />)).toBe('');
    expect(render(<UnreadCornerBadge count={-2} />)).toBe('');
  });

  test('trois non-lues : « 3 », `data-unread` porte le compte RÉEL, rouge sémantique', () => {
    const html = render(<UnreadCornerBadge count={3} />);
    expect(html).toContain('data-unread="3"');
    expect(html).toContain('>3<');
    expect(html).toContain('var(--color-error)');
    expect(html).toContain('min-width:18px');
  });

  test('au-delà de 99 : « 99+ », et le compte réel reste lisible par les gates', () => {
    const html = render(<UnreadCornerBadge count={4312} />);
    expect(html).toContain('>99+<');
    expect(html).toContain('data-unread="4312"');
  });

  test('décorative : le bouton qui la porte s’annonce, elle se tait', () => {
    expect(render(<UnreadCornerBadge count={3} />)).toContain('aria-hidden="true"');
  });

  test('elle se nomme par sa POSE : les gates la distinguent de celle d’un barreau', () => {
    expect(render(<UnreadCornerBadge count={3} />)).toContain('data-badge-pose="corner"');
  });
});

/**
 * **LA PASTILLE D'UN BARREAU DE L'ÉCHELLE** (#6219) — la troisième pose d'iOS,
 * `ThemedActionButton(badge:)` (`apps/ios/Meeshy/Features/Main/Views/
 * RootViewComponents.swift:66-78`) : capsule BLANCHE, encre de la TEINTE du
 * barreau, plancher 16, rembourrage 5, corps 9, décalée de `size × 0,33`.
 * Rouge sur un barreau rouge (#FF6B6B), la pastille de coin serait invisible.
 */
describe('la pastille d’un barreau', () => {
  const TEINTE = '#FF6B6B';

  test('les cotes d’iOS', () => {
    expect(UNREAD_BADGE_RUNG).toEqual({ minimumSize: 16, horizontalPadding: 5, fontSize: 9, offsetRatio: 0.33 });
  });

  test('le portillon vit dans l’atome : rien à zéro ni en négatif', () => {
    expect(render(<UnreadRungBadge count={0} tint={TEINTE} size={46} />)).toBe('');
    expect(render(<UnreadRungBadge count={-1} tint={TEINTE} size={46} />)).toBe('');
  });

  test('trois non-lues : « 3 » sur capsule blanche, à l’encre de la teinte, jamais au rouge d’erreur', () => {
    const html = render(<UnreadRungBadge count={3} tint={TEINTE} size={46} />);
    expect(html).toContain('data-unread="3"');
    expect(html).toContain('data-badge-pose="rung"');
    expect(html).toContain('>3<');
    expect(html).toContain('background-color:#fff');
    expect(html).toContain(TEINTE);
    expect(html).not.toContain('var(--color-error)');
    expect(html).toContain('min-width:16px');
  });

  test('posée au coin du barreau : `size × 0,33` depuis son centre', () => {
    expect(render(<UnreadRungBadge count={3} tint={TEINTE} size={46} />)).toContain(
      'translate(calc(-50% + 15.18px), calc(-50% - 15.18px))',
    );
  });

  test('au-delà de 99 : « 99+ », le compte réel reste lisible', () => {
    const html = render(<UnreadRungBadge count={4312} tint={TEINTE} size={46} />);
    expect(html).toContain('>99+<');
    expect(html).toContain('data-unread="4312"');
  });

  test('décorative : c’est le barreau qui annonce le compte', () => {
    expect(render(<UnreadRungBadge count={3} tint={TEINTE} size={46} />)).toContain('aria-hidden="true"');
  });
});
