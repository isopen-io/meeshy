/**
 * `resetPasswordValidationSchema` — #6831.
 *
 * Le schéma laissait passer n'importe quelle clé inconnue (pas de `.strict()`,
 * contrairement à son homonyme de `types/validation.ts`) : un appelant pouvait
 * poser un champ qui n'existe pas sans qu'aucune erreur ne remonte. Cette
 * suite fige le contrat une fois `.strict()` posé — les champs déclarés
 * passent, un champ en trop est refusé.
 */

import { describe, it, expect } from 'vitest';
import { resetPasswordValidationSchema } from '../admin-user.js';

describe('resetPasswordValidationSchema', () => {
  it('accepte newPassword seul', () => {
    const result = resetPasswordValidationSchema.safeParse({ newPassword: 'abcdef' });
    expect(result.success).toBe(true);
  });

  it('accepte sendEmail et reason, les deux déclarés optionnels', () => {
    const result = resetPasswordValidationSchema.safeParse({
      newPassword: 'abcdef',
      sendEmail: true,
      reason: 'Compte compromis, réponse à un incident',
    });
    expect(result.success).toBe(true);
  });

  it('refuse une clé inconnue (.strict())', () => {
    const result = resetPasswordValidationSchema.safeParse({
      newPassword: 'abcdef',
      notifyByEmail: true, // ← nom plausible, pas le champ déclaré
    });
    expect(result.success).toBe(false);
  });
});
