import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup as render } from 'react-dom/server';

import { UNREAD_BADGE_CORNER, UnreadCornerBadge } from './unread-badge';

/**
 * **LA PASTILLE DE COIN REVIENT AVEC SON PREMIER APPELANT** (#6219, #6288) —
 * le bouton flottant de droite. Cotes de `NotificationBadge`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/FloatingButtons.swift:700-745`) :
 * hauteur 18, plancher carré 18, 6 de rembourrage, décalée de `(+16, −16)`,
 * ombre à 0,5 du rouge sémantique.
 */
describe('la pastille de coin', () => {
  test('les cotes d’iOS', () => {
    expect(UNREAD_BADGE_CORNER).toMatchObject({ minimumSize: 18, horizontalPadding: 6, offsetX: 16, offsetY: -16, shadowOpacity: 0.5 });
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
});
