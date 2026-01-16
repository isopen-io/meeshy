'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Phone, Mail, LogIn, UserPlus, ArrowRight, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { phoneTransferService } from '@/services/phone-transfer.service';

interface PhoneOwnerInfo {
  maskedDisplayName: string;
  maskedUsername: string;
  maskedEmail: string;
  avatarUrl?: string;
  phoneNumber: string;
  phoneCountryCode: string;
}

interface PendingRegistration {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  systemLanguage?: string;
  regionalLanguage?: string;
}

interface PhoneExistsModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneOwnerInfo: PhoneOwnerInfo;
  pendingRegistration: PendingRegistration;
  /** Called when user chooses to continue without phone - parent should re-register without phone */
  onContinueWithoutPhone: (registration: PendingRegistration) => void;
  /** Called when phone transfer succeeded - parent should re-register WITH phone AND transferToken */
  onPhoneTransferred: (registration: PendingRegistration, transferToken: string) => void;
}

type ModalStep = 'choice' | 'verify_code' | 'success';

/**
 * Modal displayed when a user tries to register with a phone number
 * that already belongs to another account.
 *
 * At this point, NO account has been created yet.
 * The user must choose:
 * 1. "C'est mon compte" → Go to login
 * 2. "Continuer sans ce numéro" → Create account WITHOUT phone
 * 3. "Transférer le numéro" → Verify SMS, then create account WITH phone
 */
export function PhoneExistsModal({
  isOpen,
  onClose,
  phoneOwnerInfo,
  pendingRegistration,
  onContinueWithoutPhone,
  onPhoneTransferred,
}: PhoneExistsModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<ModalStep>('choice');
  const [transferId, setTransferId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Handle "Recover my account" - go to login/reset password
  const handleRecoverAccount = () => {
    onClose();
    router.push('/login');
  };

  // Handle "Continue without phone" - create account without phone
  const handleContinueWithoutPhone = () => {
    onContinueWithoutPhone(pendingRegistration);
    onClose();
  };

  // Handle "Transfer phone to new account" - send SMS verification
  // Note: At this point, no account exists yet. We need to create a temporary transfer session.
  const handleInitiateTransfer = async () => {
    setIsLoading(true);
    try {
      // For phone transfer during registration, we use a special flow:
      // 1. Check phone ownership (already done to show this modal)
      // 2. Send SMS to current owner's phone
      // 3. If verified, the parent component will create the account WITH phone

      const result = await phoneTransferService.initiateTransferForRegistration({
        phoneNumber: phoneOwnerInfo.phoneNumber,
        phoneCountryCode: phoneOwnerInfo.phoneCountryCode,
        // Pass pending registration info so backend can validate
        pendingUsername: pendingRegistration.username,
        pendingEmail: pendingRegistration.email,
      });

      if (result.success && result.transferId) {
        setTransferId(result.transferId);
        setStep('verify_code');
        startResendCooldown();
        toast.success('Code SMS envoyé !');
      } else {
        toast.error(result.error || 'Erreur lors de l\'envoi du code');
      }
    } catch (error) {
      toast.error('Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  // Verify SMS code
  const handleVerifyCode = async () => {
    if (!transferId || code.length !== 6) return;

    setIsLoading(true);
    try {
      const result = await phoneTransferService.verifyTransferForRegistration({
        transferId,
        code,
      });

      if (result.success && result.verified && result.transferToken) {
        setStep('success');
        toast.success('Vérification réussie !');
        setTimeout(() => {
          // Parent will create the account WITH phone transfer token
          onPhoneTransferred(pendingRegistration, result.transferToken!);
          onClose();
        }, 1500);
      } else {
        toast.error(result.error || 'Code invalide');
      }
    } catch (error) {
      toast.error('Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend SMS code
  const handleResendCode = async () => {
    if (!transferId || !canResend) return;

    setIsLoading(true);
    try {
      const result = await phoneTransferService.resendCode({ transferId });
      if (result.success) {
        toast.success('Nouveau code envoyé !');
        startResendCooldown();
      } else {
        toast.error(result.error || 'Impossible de renvoyer le code');
      }
    } catch (error) {
      toast.error('Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  // Start cooldown for resend button
  const startResendCooldown = () => {
    setCanResend(false);
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Format code input
  const handleCodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        {step === 'choice' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-amber-500" />
                Numéro déjà associé
              </DialogTitle>
              <DialogDescription>
                Ce numéro de téléphone est déjà associé à un compte existant.
              </DialogDescription>
            </DialogHeader>

            {/* Account Info Card */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  {phoneOwnerInfo.avatarUrl && (
                    <AvatarImage src={phoneOwnerInfo.avatarUrl} alt={phoneOwnerInfo.maskedDisplayName} />
                  )}
                  <AvatarFallback className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    {getInitials(phoneOwnerInfo.maskedDisplayName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {phoneOwnerInfo.maskedDisplayName}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    @{phoneOwnerInfo.maskedUsername}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Mail className="h-4 w-4" />
                <span>{phoneOwnerInfo.maskedEmail}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              {/* Primary: Recover account */}
              <Button
                onClick={handleRecoverAccount}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <LogIn className="h-4 w-4 mr-2" />
                C'est mon compte - Me connecter
              </Button>

              {/* Secondary: Continue without phone */}
              <Button
                onClick={handleContinueWithoutPhone}
                variant="outline"
                className="w-full"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Ce n'est pas mon compte - Continuer sans numéro
              </Button>

              {/* Tertiary: Transfer phone */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-gray-900 px-2 text-gray-500">ou</span>
                </div>
              </div>

              <Button
                onClick={handleInitiateTransfer}
                variant="ghost"
                className="w-full text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Transférer le numéro vers mon nouveau compte
              </Button>
              <p className="text-xs text-center text-gray-500">
                Un code SMS sera envoyé pour vérifier la propriété du numéro
              </p>
            </div>
          </>
        )}

        {step === 'verify_code' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-blue-500" />
                Vérification SMS
              </DialogTitle>
              <DialogDescription>
                Entrez le code à 6 chiffres envoyé au {phoneOwnerInfo.phoneNumber}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Code Input */}
              <div className="flex justify-center">
                <label htmlFor="phone-exists-code" className="sr-only">
                  Code de vérification à 6 chiffres
                </label>
                <Input
                  id="phone-exists-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="000000"
                  className="text-center text-2xl tracking-widest font-mono w-48 h-14"
                  autoComplete="one-time-code"
                  aria-describedby="phone-exists-code-desc"
                />
                <span id="phone-exists-code-desc" className="sr-only">
                  Entrez le code à 6 chiffres envoyé par SMS
                </span>
              </div>

              {/* Verify Button */}
              <Button
                onClick={handleVerifyCode}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isLoading || code.length !== 6}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Vérifier
              </Button>

              {/* Resend */}
              <div className="text-center">
                {canResend ? (
                  <Button
                    variant="link"
                    onClick={handleResendCode}
                    disabled={isLoading}
                    className="text-blue-600"
                  >
                    Renvoyer le code
                  </Button>
                ) : (
                  <p className="text-sm text-gray-500">
                    Renvoyer dans {resendCooldown}s
                  </p>
                )}
              </div>

              {/* Cancel */}
              <Button
                variant="ghost"
                onClick={() => setStep('choice')}
                className="w-full"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Annuler
              </Button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                Vérification réussie !
              </DialogTitle>
              <DialogDescription>
                Création de votre compte en cours...
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
