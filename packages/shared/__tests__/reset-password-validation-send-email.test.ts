/**
 * `resetPasswordValidationSchema` de `types/validation.ts` — la case « Prévenir
 * le membre » de l'administration web envoie `sendEmail: boolean`. Le schéma,
 * `.strict()`, ne connaissait que `newPassword` et `reason` et refusait donc
 * le corps entier. Son homonyme `types/validation/admin-user.ts` (celui de la
 * route) le déclarait déjà : les deux copies disent désormais la même chose.
 */
import { describe, it, expect } from 'vitest';
import { resetPasswordValidationSchema } from '../types/validation.js';
import { resetPasswordValidationSchema as schemaDeLaRoute } from '../types/validation/admin-user.js';

const MOT_DE_PASSE = 'Xq7!vLp2#rTz9@wK';

describe('resetPasswordValidationSchema — sendEmail', () => {
  it.each([true, false])('accepte sendEmail: %p', (sendEmail) => {
    const r = resetPasswordValidationSchema.safeParse({ newPassword: MOT_DE_PASSE, sendEmail });
    expect(r.success).toBe(true);
    expect(r.success && r.data.sendEmail).toBe(sendEmail);
  });

  it('sendEmail reste facultatif', () => {
    expect(resetPasswordValidationSchema.safeParse({ newPassword: MOT_DE_PASSE }).success).toBe(true);
  });

  it('refuse un sendEmail non booléen et une clé inconnue', () => {
    expect(resetPasswordValidationSchema.safeParse({ newPassword: MOT_DE_PASSE, sendEmail: 'oui' }).success).toBe(false);
    expect(resetPasswordValidationSchema.safeParse({ newPassword: MOT_DE_PASSE, notify: true }).success).toBe(false);
  });

  it('le schéma de la route accepte le même corps', () => {
    const corps = { newPassword: MOT_DE_PASSE, sendEmail: false, reason: 'Compte compromis signalé' };
    expect(schemaDeLaRoute.safeParse(corps).success).toBe(true);
    expect(resetPasswordValidationSchema.safeParse(corps).success).toBe(true);
  });
});
