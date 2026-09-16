/**
 * `passwordResetNotifier` — #6831.
 *
 * `sendEmail` traversait la validation de `POST /admin/users/:userId/reset-password`
 * sans jamais être lu : un admin qui le posait à `true` recevait un 200 et
 * personne n'était prévenu. Extrait en fonction pure (exportée par
 * `routes/admin/users.ts`) pour être testé sans enregistrer toute la route —
 * `admin-user-routes.test.ts` porte déjà sa dette de taille héritée
 * (`gateway-test-file-size-budget.test.ts`), il ne faut rien lui ajouter.
 */

import { describe, it, expect } from '@jest/globals';
import { passwordResetNotifier } from '../../../../routes/admin/users';
import type { EmailService } from '../../../../services/EmailService';
import type { FullUser } from '@meeshy/shared/types';

function makeTargetUser(overrides: Partial<FullUser> = {}): FullUser {
  return {
    id: '507f1f77bcf86cd799439011',
    email: 'target@example.com',
    firstName: 'Target',
    lastName: 'User',
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
    ...overrides,
  } as FullUser;
}

describe('passwordResetNotifier', () => {
  it("envoie une alerte 'password_changed' à la cible, dans sa langue résolue", async () => {
    const sendSecurityAlertEmail = jest.fn().mockResolvedValue({ success: true });
    const emailService = { sendSecurityAlertEmail } as unknown as EmailService;

    await passwordResetNotifier(emailService)(makeTargetUser());

    expect(sendSecurityAlertEmail).toHaveBeenCalledWith({
      to: 'target@example.com',
      name: 'Target User',
      alertType: 'password_changed',
      details: '',
      language: 'fr',
    });
  });

  it('sans aucune préférence de langue renseignée, retombe sur le repli du site (en)', async () => {
    const sendSecurityAlertEmail = jest.fn().mockResolvedValue({ success: true });
    const emailService = { sendSecurityAlertEmail } as unknown as EmailService;

    await passwordResetNotifier(emailService)(makeTargetUser({
      systemLanguage: '',
      regionalLanguage: '',
      customDestinationLanguage: null,
    }));

    expect(sendSecurityAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' })
    );
  });
});
