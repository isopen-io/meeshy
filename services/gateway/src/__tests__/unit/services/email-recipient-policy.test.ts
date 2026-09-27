/**
 * Une adresse NON vérifiée ne reçoit que les e-mails dont l'USAGE prouve
 * l'adresse (#8238, précision porteur 2026-09-27) : vérification / activation,
 * code de connexion, réinitialisation du mot de passe, lien magique. Résumé,
 * notifications, diffusions, invitations, alertes : coupés.
 *
 * La garde est CENTRALE — dans `EmailService.sendEmail`, le passage de TOUT
 * envoi —, jamais posée site par site. Les témoins passent donc par les
 * méthodes publiques du service, famille par famille.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const mockSendViaBrevo = jest.fn(async (..._args: unknown[]) => ({ success: true, messageId: 'm-1' }));
jest.mock('../../../services/email/providers', () => ({
  sendViaBrevo: (...args: unknown[]) => mockSendViaBrevo(...args),
  sendViaSendGrid: jest.fn(),
  sendViaMailgun: jest.fn(),
}));

import { EmailService } from '../../../services/EmailService';
import {
  ADDRESS_PROVING_EMAIL_KINDS,
  emailMayLeave,
  prismaRecipientAddressLookup,
  registerEmailRecipientLookup,
  type RecipientAddressState,
} from '../../../services/email/recipient-policy';

const NON_VERIFIEE = 'lena@example.com';
const VERIFIEE = 'awa@example.com';
const INCONNUE = 'personne@example.com';

const lookup = async (address: string): Promise<RecipientAddressState> => {
  if (address === NON_VERIFIEE) return 'unverified';
  if (address === VERIFIEE) return 'verified';
  return 'unknown-recipient';
};

const service = () => new EmailService({ recipientLookup: lookup });
const parti = (to: string): boolean => mockSendViaBrevo.mock.calls.some((call) => (call[2] as { to: string }).to === to);

beforeEach(() => {
  process.env.BREVO_API_KEY = 'cle-de-test';
  mockSendViaBrevo.mockClear();
  registerEmailRecipientLookup(null);
});

type Envoi = (s: EmailService, to: string) => Promise<{ success: boolean }>;

const PROBANTES: ReadonlyArray<readonly [string, Envoi]> = [
  ['vérification / activation', (s, to) => s.sendEmailVerification({ to, name: 'Lena', verificationLink: 'https://x/v', verificationCode: '123456', expiryHours: 1, language: 'fr' })],
  ['code de connexion', (s, to) => s.sendLoginCodeEmail({ to, name: 'Lena', code: '123456', link: 'https://x/c', expiryMinutes: 15, language: 'fr' })],
  ['réinitialisation du mot de passe', (s, to) => s.sendPasswordResetEmail({ to, name: 'Lena', resetLink: 'https://x/r', expiryMinutes: 15, language: 'fr', intent: 'reset' })],
  ['lien magique', (s, to) => s.sendMagicLinkEmail({ to, name: 'Lena', magicLink: 'https://x/m', location: 'Paris', language: 'fr' })],
];

const COUPEES: ReadonlyArray<readonly [string, Envoi]> = [
  ['résumé quotidien', (s, to) => s.sendNotificationDigestEmail({ to, name: 'Lena', language: 'fr', unreadCount: 3, magicUrl: 'https://x/m', settingsUrl: 'https://x/s' })],
  ['notification', (s, to) => s.sendNotificationEmail({ to, name: 'Lena', notificationType: 'mention', details: 'x', language: 'fr' })],
  ['diffusion', (s, to) => s.sendBroadcastEmail({ to, recipientName: 'Lena', subject: 'x', body: 'y', language: 'fr', unsubscribeUrl: 'https://x/u' })],
  ['invitation', (s, to) => s.sendInvitationEmail({ to, senderName: 'Awa', downloadUrl: 'https://x/d' })],
  ['alerte de sécurité', (s, to) => s.sendSecurityAlertEmail({ to, name: 'Lena', alertType: 'x', details: 'y', language: 'fr' })],
];

describe('les familles dont l’usage PROUVE l’adresse partent vers une adresse non vérifiée', () => {
  it.each(PROBANTES)('%s', async (_famille, envoyer) => {
    const resultat = await envoyer(service(), NON_VERIFIEE);

    expect(resultat.success).toBe(true);
    expect(parti(NON_VERIFIEE)).toBe(true);
  });
});

describe('les autres familles sont COUPÉES tant que l’adresse n’est pas vérifiée', () => {
  it.each(COUPEES)('%s : coupée vers une adresse non vérifiée', async (_famille, envoyer) => {
    const resultat = await envoyer(service(), NON_VERIFIEE);

    expect(resultat.success).toBe(false);
    expect(parti(NON_VERIFIEE)).toBe(false);
  });

  it.each(COUPEES)('%s : part vers une adresse vérifiée', async (_famille, envoyer) => {
    const resultat = await envoyer(service(), VERIFIEE);

    expect(resultat.success).toBe(true);
    expect(parti(VERIFIEE)).toBe(true);
  });

  it('une adresse sans compte reçoit l’invitation (on n’invite que des inconnus)', async () => {
    await service().sendInvitationEmail({ to: INCONNUE, senderName: 'Awa', downloadUrl: 'https://x/d' });
    expect(parti(INCONNUE)).toBe(true);
  });
});

describe('la garde est fail-closed', () => {
  it('sans lecteur d’adresses enregistré, une famille non probante ne part pas', async () => {
    const resultat = await new EmailService().sendBroadcastEmail({ to: VERIFIEE, recipientName: 'Awa', subject: 'x', body: 'y', language: 'fr', unsubscribeUrl: 'https://x/u' });

    expect(resultat.success).toBe(false);
    expect(parti(VERIFIEE)).toBe(false);
  });

  it('le lecteur ENREGISTRÉ au démarrage sert les services construits sans option', async () => {
    registerEmailRecipientLookup(lookup);
    await new EmailService().sendBroadcastEmail({ to: VERIFIEE, recipientName: 'Awa', subject: 'x', body: 'y', language: 'fr', unsubscribeUrl: 'https://x/u' });
    expect(parti(VERIFIEE)).toBe(true);
  });

  it('une lecture qui lève coupe l’envoi', async () => {
    const enPanne = async (): Promise<RecipientAddressState> => {
      throw new Error('mongo');
    };
    await expect(emailMayLeave({ to: VERIFIEE, kind: 'broadcast', lookup: enPanne })).resolves.toBe(false);
  });

  it('un envoi sans famille déclarée est traité comme non probant', async () => {
    await expect(emailMayLeave({ to: NON_VERIFIEE, kind: undefined, lookup })).resolves.toBe(false);
  });

  it('les familles probantes sont nommées, et elles seules', () => {
    expect([...ADDRESS_PROVING_EMAIL_KINDS].sort()).toEqual(
      ['deletion_confirm', 'email_change', 'login_code', 'magic_link', 'password_reset', 'verification'].sort(),
    );
  });
});

describe('le lecteur Prisma', () => {
  const lire = (ligne: { emailVerifiedAt: Date | null } | null) => {
    const findFirst = jest.fn(async (_args: unknown) => ligne);
    return { lecteur: prismaRecipientAddressLookup({ user: { findFirst } } as never), findFirst };
  };

  it('cherche l’adresse sans tenir compte de la casse', async () => {
    const { lecteur, findFirst } = lire({ emailVerifiedAt: null });
    await expect(lecteur('Lena@Example.com')).resolves.toBe('unverified');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: 'lena@example.com', mode: 'insensitive' } }, select: { emailVerifiedAt: true } }),
    );
  });

  it('distingue vérifiée et sans compte', async () => {
    await expect(lire({ emailVerifiedAt: new Date(0) }).lecteur(VERIFIEE)).resolves.toBe('verified');
    await expect(lire(null).lecteur(INCONNUE)).resolves.toBe('unknown-recipient');
  });
});

describe('le câblage de production', () => {
  it('le serveur enregistre le lecteur Prisma au démarrage — sans lui, rien de non probant ne part', () => {
    const server = readFileSync(join(__dirname, '../../../server.ts'), 'utf8');
    expect(server).toMatch(/registerEmailRecipientLookup\(prismaRecipientAddressLookup\(this\.prisma\)\)/);
  });
});
