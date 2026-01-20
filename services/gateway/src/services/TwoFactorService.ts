/**
 * TwoFactorService - Service complet pour l'authentification à deux facteurs (2FA)
 *
 * Fonctionnalités:
 * - Configuration du 2FA (génération secret + QR code)
 * - Activation du 2FA (vérification du premier code)
 * - Désactivation du 2FA (avec mot de passe)
 * - Vérification des codes TOTP
 * - Génération et utilisation des codes de secours
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Constants
const APP_NAME = 'Meeshy';
const TOTP_WINDOW = 1; // Allow 1 step before/after (90 seconds total)
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;

export interface TwoFactorSetupResult {
  success: boolean;
  secret?: string; // Base32 encoded (for manual entry)
  qrCodeDataUrl?: string; // Data URL for QR code image
  otpauthUrl?: string; // otpauth:// URL for authenticator apps
  error?: string;
}

export interface TwoFactorEnableResult {
  success: boolean;
  backupCodes?: string[]; // Plain text backup codes (shown only once)
  error?: string;
}

export interface TwoFactorVerifyResult {
  success: boolean;
  error?: string;
  usedBackupCode?: boolean;
}

export interface TwoFactorStatusResult {
  enabled: boolean;
  enabledAt: Date | null;
  hasBackupCodes: boolean;
  backupCodesCount: number;
}

export interface TwoFactorDisableResult {
  success: boolean;
  error?: string;
}

export interface BackupCodesResult {
  success: boolean;
  backupCodes?: string[];
  error?: string;
}

export class TwoFactorService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Génère un hash SHA-256 pour les codes de secours
   */
  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Génère un code de secours aléatoire
   */
  private generateBackupCode(): string {
    // Generate random alphanumeric code (uppercase for readability)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars: 0,O,1,I
    let code = '';
    for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
      code += chars.charAt(crypto.randomInt(chars.length));
    }
    // Format: XXXX-XXXX for readability
    return `${code.slice(0, 4)}-${code.slice(4)}`;
  }

  /**
   * Génère plusieurs codes de secours
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      codes.push(this.generateBackupCode());
    }
    return codes;
  }

  /**
   * Étape 1: Configuration du 2FA - Génère un secret et un QR code
   * Le secret est stocké temporairement jusqu'à confirmation
   */
  async setup(userId: string): Promise<TwoFactorSetupResult> {
    try {
      // Récupérer l'utilisateur
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          twoFactorEnabledAt: true
        }
      });

      if (!user) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }

      // Vérifier si 2FA est déjà activé
      if (user.twoFactorEnabledAt) {
        return { success: false, error: '2FA est déjà activé sur ce compte' };
      }

      // Générer un nouveau secret TOTP
      const secret = speakeasy.generateSecret({
        name: `${APP_NAME}:${user.email}`,
        issuer: APP_NAME,
        length: 32 // 256 bits
      });

      // Stocker le secret temporairement (pas encore activé)
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorPendingSecret: secret.base32
        }
      });

      // Générer le QR code
      const otpauthUrl = secret.otpauth_url!;
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 256,
        margin: 2
      });

      console.log('[2FA] Setup initiated for user:', user.username);

      return {
        success: true,
        secret: secret.base32,
        qrCodeDataUrl,
        otpauthUrl
      };

    } catch (error) {
      console.error('[2FA] Setup error:', error);
      return { success: false, error: 'Erreur lors de la configuration du 2FA' };
    }
  }

  /**
   * Étape 2: Activer le 2FA - Vérifie le premier code et active le 2FA
   * Génère également les codes de secours
   */
  async enable(userId: string, code: string): Promise<TwoFactorEnableResult> {
    try {
      // Récupérer l'utilisateur avec le secret temporaire
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          twoFactorPendingSecret: true,
          twoFactorEnabledAt: true
        }
      });

      if (!user) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }

      // Vérifier si 2FA est déjà activé
      if (user.twoFactorEnabledAt) {
        return { success: false, error: '2FA est déjà activé sur ce compte' };
      }

      // Vérifier qu'un setup a été initié
      if (!user.twoFactorPendingSecret) {
        return { success: false, error: 'Veuillez d\'abord initier la configuration du 2FA' };
      }

      // Vérifier le code TOTP
      const isValid = speakeasy.totp.verify({
        secret: user.twoFactorPendingSecret,
        encoding: 'base32',
        token: code,
        window: TOTP_WINDOW
      });

      if (!isValid) {
        return { success: false, error: 'Code invalide. Veuillez réessayer.' };
      }

      // Générer les codes de secours
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = backupCodes.map(c => this.hashBackupCode(c.replace('-', '')));

      // Activer le 2FA
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: user.twoFactorPendingSecret,
          twoFactorPendingSecret: null, // Clear pending secret
          twoFactorBackupCodes: hashedBackupCodes,
          twoFactorEnabledAt: new Date()
        }
      });

      console.log('[2FA] Enabled for user:', user.username);

      return {
        success: true,
        backupCodes // Return plain text codes (shown only once!)
      };

    } catch (error) {
      console.error('[2FA] Enable error:', error);
      return { success: false, error: 'Erreur lors de l\'activation du 2FA' };
    }
  }

  /**
   * Désactiver le 2FA - Requiert le mot de passe et optionnellement un code 2FA
   */
  async disable(userId: string, password: string, code?: string): Promise<TwoFactorDisableResult> {
    try {
      // Récupérer l'utilisateur
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          password: true,
          twoFactorSecret: true,
          twoFactorEnabledAt: true
        }
      });

      if (!user) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }

      // Vérifier si 2FA est activé
      if (!user.twoFactorEnabledAt || !user.twoFactorSecret) {
        return { success: false, error: '2FA n\'est pas activé sur ce compte' };
      }

      // Vérifier le mot de passe
      const passwordValid = await bcrypt.compare(password, user.password);
      if (!passwordValid) {
        return { success: false, error: 'Mot de passe incorrect' };
      }

      // Vérifier le code 2FA si fourni
      if (code) {
        const isValid = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: code,
          window: TOTP_WINDOW
        });

        if (!isValid) {
          return { success: false, error: 'Code 2FA invalide' };
        }
      }

      // Désactiver le 2FA
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorBackupCodes: [],
          twoFactorEnabledAt: null
        }
      });

      console.log('[2FA] Disabled for user:', user.username);

      return { success: true };

    } catch (error) {
      console.error('[2FA] Disable error:', error);
      return { success: false, error: 'Erreur lors de la désactivation du 2FA' };
    }
  }

  /**
   * Vérifier un code TOTP ou un code de secours
   */
  async verify(userId: string, code: string): Promise<TwoFactorVerifyResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          twoFactorSecret: true,
          twoFactorBackupCodes: true,
          twoFactorEnabledAt: true
        }
      });

      if (!user) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }

      // Vérifier si 2FA est activé
      if (!user.twoFactorEnabledAt || !user.twoFactorSecret) {
        return { success: false, error: '2FA n\'est pas activé sur ce compte' };
      }

      // Nettoyer le code (enlever les tirets pour les codes de secours)
      const cleanCode = code.replace(/-/g, '').toUpperCase();

      // Essayer d'abord le code TOTP (6 chiffres)
      if (/^\d{6}$/.test(cleanCode)) {
        const isValid = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: cleanCode,
          window: TOTP_WINDOW
        });

        if (isValid) {
          return { success: true, usedBackupCode: false };
        }
      }

      // Essayer les codes de secours (8 caractères alphanumériques)
      if (/^[A-Z0-9]{8}$/.test(cleanCode)) {
        const hashedCode = this.hashBackupCode(cleanCode);
        const backupCodeIndex = user.twoFactorBackupCodes.indexOf(hashedCode);

        if (backupCodeIndex !== -1) {
          // Supprimer le code utilisé
          const updatedCodes = [...user.twoFactorBackupCodes];
          updatedCodes.splice(backupCodeIndex, 1);

          await this.prisma.user.update({
            where: { id: userId },
            data: { twoFactorBackupCodes: updatedCodes }
          });

          console.log('[2FA] Backup code used for user:', userId, '- Remaining:', updatedCodes.length);

          return { success: true, usedBackupCode: true };
        }
      }

      return { success: false, error: 'Code invalide' };

    } catch (error) {
      console.error('[2FA] Verify error:', error);
      return { success: false, error: 'Erreur lors de la vérification du code' };
    }
  }

  /**
   * Obtenir le statut 2FA d'un utilisateur
   */
  async getStatus(userId: string): Promise<TwoFactorStatusResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorBackupCodes: true,
        twoFactorEnabledAt: true
      }
    });

    if (!user) {
      return {
        enabled: false,
        enabledAt: null,
        hasBackupCodes: false,
        backupCodesCount: 0
      };
    }

    const enabled = !!user.twoFactorEnabledAt;
    const backupCodesCount = user.twoFactorBackupCodes?.length || 0;

    return {
      enabled,
      enabledAt: user.twoFactorEnabledAt || null,
      hasBackupCodes: backupCodesCount > 0,
      backupCodesCount
    };
  }

  /**
   * Régénérer les codes de secours (nécessite vérification 2FA)
   */
  async regenerateBackupCodes(userId: string, code: string): Promise<BackupCodesResult> {
    try {
      // Vérifier le code 2FA d'abord
      const verifyResult = await this.verify(userId, code);

      if (!verifyResult.success) {
        return { success: false, error: verifyResult.error };
      }

      // Ne pas permettre la régénération avec un code de secours
      if (verifyResult.usedBackupCode) {
        return { success: false, error: 'Veuillez utiliser votre application d\'authentification pour cette opération' };
      }

      // Générer de nouveaux codes
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = backupCodes.map(c => this.hashBackupCode(c.replace('-', '')));

      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorBackupCodes: hashedBackupCodes }
      });

      console.log('[2FA] Backup codes regenerated for user:', userId);

      return {
        success: true,
        backupCodes
      };

    } catch (error) {
      console.error('[2FA] Regenerate backup codes error:', error);
      return { success: false, error: 'Erreur lors de la régénération des codes de secours' };
    }
  }

  /**
   * Annuler la configuration en cours (avant activation)
   */
  async cancelSetup(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorPendingSecret: null }
      });

      console.log('[2FA] Setup cancelled for user:', userId);
      return { success: true };

    } catch (error) {
      console.error('[2FA] Cancel setup error:', error);
      return { success: false, error: 'Erreur lors de l\'annulation' };
    }
  }

  /**
   * Vérifier si un utilisateur a le 2FA activé (pour le flow de login)
   */
  async isEnabled(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabledAt: true
      }
    });

    return !!user?.twoFactorEnabledAt;
  }
}
