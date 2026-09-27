/**
 * LA VÉRIFICATION DU NUMÉRO PAR SMS — sortie d'`AuthService` (#8238), dont le
 * fichier dépassait le budget de taille avant que la loi du délai de grâce n'y
 * entre. Le texte des trois fonctions est INCHANGÉ : seule leur adresse bouge,
 * et `AuthService` garde ses méthodes publiques, qui délèguent ici.
 *
 * @module services/auth/phone-verification
 */

import crypto from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { generateNumericCode } from '../../utils/verification-code';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { smsService } from '../SmsService';

const logger = enhancedLogger.child({ module: 'AuthService' });

export type PhoneVerificationStore = Pick<PrismaClient, 'user'>;

const hashCode = (code: string): string => crypto.createHash('sha256').update(code).digest('hex');

/**
 * Send phone verification code via SMS
 * NOTE: This is a placeholder - integrate Twilio/Vonage for production
 */
export async function sendPhoneVerificationCode(
  prisma: PhoneVerificationStore,
  phoneNumber: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanPhone = phoneNumber.replace(/\s+/g, '').trim();

    // Find user by phone number
    const user = await prisma.user.findFirst({
      where: {
        phoneNumber: { contains: cleanPhone.replace(/^\+/, ''), mode: 'insensitive' },
        isActive: true
      }
    });

    if (!user) {
      // Don't reveal if phone exists - but we need a user for verification
      logger.warn(`[AUTH_SERVICE] ⚠️ Numéro non trouvé cleanPhone=${cleanPhone}`);
      return { success: false, error: 'Numéro de téléphone non associé à un compte.' };
    }

    // Already verified?
    if (user.phoneVerifiedAt) {
      return { success: false, error: 'Ce numéro est déjà vérifié.' };
    }

    // Generate 6-digit code
    const code = generateNumericCode();
    const hashedCode = hashCode(code);
    const codeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with code
    await prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerificationCode: hashedCode,
        phoneVerificationExpiry: codeExpiry
      }
    });

    // Send SMS via multi-provider SmsService
    const smsResult = await smsService.sendVerificationCode(user.phoneNumber || cleanPhone, code);

    if (!smsResult.success) {
      logger.error('[AUTH_SERVICE] ❌ Échec envoi SMS', smsResult.error);
    logger.info(`Utilisateur trouvé userId=${user.id}`);
      return { success: false, error: 'Erreur lors de l\'envoi du SMS.' };
    }

    logger.info(`[AUTH_SERVICE] ✅ SMS envoyé via ${smsResult.provider} - messageId: ${smsResult.messageId}`);
    return { success: true };

  } catch (error) {
    logger.error('[AUTH_SERVICE] ❌ Erreur envoi code SMS', error);
    return { success: false, error: 'Erreur lors de l\'envoi du code.' };
  }
}

/**
 * Verify phone with SMS code
 */
export async function verifyPhoneCode(
  prisma: PhoneVerificationStore,
  phoneNumber: string,
  code: string,
): Promise<{ success: boolean; error?: string; verifiedUserId?: string }> {
  try {
    const cleanPhone = phoneNumber.replace(/\s+/g, '').trim();
    const hashedCode = hashCode(code);

    // Find user with matching phone and code
    const user = await prisma.user.findFirst({
      where: {
        phoneNumber: { contains: cleanPhone.replace(/^\+/, ''), mode: 'insensitive' },
        phoneVerificationCode: hashedCode,
        phoneVerificationExpiry: { gt: new Date() }
      }
    });

    if (!user) {
      // Check if code expired
      const expiredUser = await prisma.user.findFirst({
        where: {
          phoneNumber: { contains: cleanPhone.replace(/^\+/, ''), mode: 'insensitive' },
          phoneVerificationCode: hashedCode
        }
      });

      if (expiredUser) {
        return { success: false, error: 'Le code a expiré. Veuillez en demander un nouveau.' };
      }
      return { success: false, error: 'Code invalide.' };
    }

    // Already verified?
    if (user.phoneVerifiedAt) {
      return { success: true }; // Already verified
    }

    // Update user as phone verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerifiedAt: new Date(),
        phoneVerificationCode: null,
        phoneVerificationExpiry: null
      }
    });

    logger.info(`[AUTH_SERVICE] ✅ Téléphone vérifié pour user.phoneNumber=${user.phoneNumber}`);
    // `verifiedUserId` n'est posé que sur une vérification NEUVE : c'est elle, et
    // elle seule, qui peut annoncer une arrivée aux carnets (#8105).
    return { success: true, verifiedUserId: user.id };

  } catch (error) {
    logger.error('[AUTH_SERVICE] ❌ Erreur vérification téléphone', error);
    return { success: false, error: 'Erreur lors de la vérification.' };
  }
}

/**
 * Check if user phone is verified
 */
export async function isPhoneVerified(prisma: PhoneVerificationStore, userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phoneVerifiedAt: true }
    });
    return !!user?.phoneVerifiedAt;
  } catch (error) {
    logger.error('[AUTH_SERVICE] Error checking phone verification', error);
    return false;
  }
}
