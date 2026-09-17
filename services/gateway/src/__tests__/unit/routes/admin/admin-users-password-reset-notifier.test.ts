/**
 * `passwordResetNotifier` — #6831.
 *
 * `sendEmail` traversait la validation de `POST /admin/users/:userId/reset-password`
 * sans jamais être lu : un admin qui le posait à `true` recevait un 200 et
 * personne n'était prévenu. Extrait en fonction pure (exportée par
 * `routes/admin/users.ts`) pour être testé sans enregistrer toute la route —
 * `admin-user-routes.test.ts` porte déjà sa dette de taille héritée
 * (`gateway-test-file-size-budget.test.ts`), il ne faut rien lui ajouter.
 *
 * La langue se résout côté `UserManagementService.resetPassword`, sur la
 * ligne Prisma non projetée (`recipient-language-projection-sweep.test.ts`,
 * #4642, exige que `recipientLanguage()` s'appelle là où le `select` est
 * garanti complet — pas ici, où la cible n'est plus qu'un objet déjà
 * découpé). Cette fonction ne fait donc que composer le transport.
 */

import { describe, it, expect } from '@jest/globals';
import { passwordResetNotifier } from '../../../../routes/admin/users';
import type { EmailService } from '../../../../services/EmailService';

describe('passwordResetNotifier', () => {
  it("envoie une alerte 'password_changed' à la cible, dans la langue déjà résolue", async () => {
    const sendSecurityAlertEmail = jest.fn().mockResolvedValue({ success: true });
    const emailService = { sendSecurityAlertEmail } as unknown as EmailService;

    await passwordResetNotifier(emailService)({
      to: 'target@example.com',
      name: 'Target User',
      language: 'fr',
    });

    expect(sendSecurityAlertEmail).toHaveBeenCalledWith({
      to: 'target@example.com',
      name: 'Target User',
      alertType: 'password_changed',
      details: '',
      language: 'fr',
    });
  });
});
