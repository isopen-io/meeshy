'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User as UserType } from '@/types';
import { getUserInitials } from '@/utils/user';
import { toast } from 'sonner';
import { Upload, Camera, Lock, Eye, EyeOff, Languages, Monitor, Wand2, CheckCircle2, AlertCircle, Mail, Phone, Send, Loader2, Edit, Check, X } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { buildApiUrl } from '@/lib/config';
import { validateAvatarFile } from '@/utils/avatar-upload';
import { AvatarCropDialog } from './avatar-crop-dialog';
import { authManager } from '@/services/auth-manager.service';
import { Separator } from '@/components/ui/separator';
import { SoundFeedback } from '@/hooks/use-accessibility';
import { useFieldValidation } from '@/hooks/use-field-validation';
import { usePhoneValidation } from '@/hooks/use-phone-validation';
import { COUNTRY_CODES } from '@/constants/countries';
import type { CountryCode } from 'libphonenumber-js';

interface UserSettingsProps {
  user: UserType | null;
  onUserUpdate: (user: UserType) => void;
}

// Available languages
const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
];

export function UserSettings({ user, onUserUpdate }: UserSettingsProps) {

  const { t } = useI18n('settings');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    phoneNumber: '',
    bio: '',
    systemLanguage: '',
    regionalLanguage: '',
    customDestinationLanguage: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Password form state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  // Email verification state
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  // Phone verification state
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [isSendingPhoneCode, setIsSendingPhoneCode] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);

  // Username change state
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [showUsernameDialog, setShowUsernameDialog] = useState(false);
  const [usernamePassword, setUsernamePassword] = useState('');
  const [isChangingUsername, setIsChangingUsername] = useState(false);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);

  // Email change state
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // Phone change state
  const [isChangingPhone, setIsChangingPhone] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState(COUNTRY_CODES[0]);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [pendingPhoneCode, setPendingPhoneCode] = useState('');
  const [showPendingPhoneVerification, setShowPendingPhoneVerification] = useState(false);

  // Field validation hooks
  const usernameValidation = useFieldValidation({
    value: newUsername,
    disabled: !isEditingUsername,
    t,
    type: 'username'
  });

  const emailValidation = useFieldValidation({
    value: newEmail,
    disabled: !isChangingEmail || newEmail === formData.email,
    t,
    type: 'email'
  });

  // Validation robuste du téléphone avec libphonenumber-js
  const phoneValidation = usePhoneValidation({
    countryCode: selectedPhoneCountry.code as CountryCode,
    phoneNumber: newPhone,
    disabled: !isChangingPhone,
    checkAvailability: true,
  });

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        displayName: user.displayName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        bio: user.bio || '',
        systemLanguage: user.systemLanguage || 'en',
        regionalLanguage: user.regionalLanguage || '',
        customDestinationLanguage: user.customDestinationLanguage || '',
      });
    }
  }, [user]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  /**
   * Auto-save language preferences immediately on change
   */
  const handleLanguageChange = async (field: 'systemLanguage' | 'regionalLanguage' | 'customDestinationLanguage', value: string) => {
    if (!user) return;

    // Ne pas envoyer de requête si la valeur est invalide (<  2 caractères)
    // car le backend valide strictement les codes de langue
    // SAUF pour customDestinationLanguage vide (pour le vider)
    if (value && value.length < 2) {
      toast.error(t('profile.validation.invalidLanguageCode', 'Code de langue invalide (minimum 2 caractères)'));
      return;
    }

    // Optimistic update
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    try {
      // Construire le payload
      const payload: Record<string, string | null> = {};

      if (value) {
        // Valeur non vide : envoyer la valeur
        payload[field] = value;
      } else if (field === 'customDestinationLanguage') {
        // customDestinationLanguage vide : envoyer null explicitement pour vider
        payload[field] = null;
      } else {
        // Autres champs vides : ne rien envoyer (garde la valeur existante)
        return;
      }

      const response = await fetch(buildApiUrl('/users/me'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('profile.actions.updateError'));
      }

      const responseData = await response.json();

      // Update user with API response
      const updatedUser: UserType = {
        ...user,
        ...responseData.data.user
      };

      onUserUpdate(updatedUser);
      toast.success(t('profile.actions.languageUpdated', 'Langue mise à jour'));
    } catch (error) {
      console.error('Error updating language:', error);
      toast.error(error instanceof Error ? error.message : t('profile.actions.updateError'));

      // Rollback optimistic update
      setFormData(prev => ({
        ...prev,
        [field]: user[field] || ''
      }));
    }
  };

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validation du fichier
      const validation = validateAvatarFile(file);
      if (!validation.valid) {
        toast.error(validation.error || 'Fichier invalide');
        return;
      }

      // Lire le fichier et afficher le dialogue de recadrage
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
        setShowAvatarDialog(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validation du fichier
      const validation = validateAvatarFile(file);
      if (!validation.valid) {
        toast.error(validation.error || 'Fichier invalide');
        return;
      }

      // Lire le fichier et afficher le dialogue de recadrage
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
        setShowAvatarDialog(true);
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * Gère l'upload du fichier recadré
   */
  const handleCroppedFile = async (croppedFile: File) => {
    if (!user) return;

    setIsUploadingAvatar(true);
    try {
      // Étape 1: Upload du fichier recadré vers l'API Next.js
      const formData = new FormData();
      formData.append('avatar', croppedFile);

      const uploadResponse = await fetch('/api/upload/avatar', {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Erreur lors de l\'upload du fichier');
      }

      const uploadData = await uploadResponse.json();
      const imageUrl = uploadData.data.url;

      // Étape 2: Mettre à jour l'avatar dans la base de données via l'API backend
      const updateResponse = await fetch(buildApiUrl('/users/me/avatar'), {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify({ avatar: imageUrl })
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(errorData.error || 'Erreur lors de la mise à jour de l\'avatar');
      }

      const responseData = await updateResponse.json();
      const updatedUser: UserType = {
        ...user,
        avatar: responseData.data.avatar
      };
      
      onUserUpdate(updatedUser);
      toast.success('Photo de profil mise à jour avec succès');
      
      // Fermer le dialogue et nettoyer
      setShowAvatarDialog(false);
      setAvatarPreview(null);
    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'upload de l\'avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  /**
   * Gérer le changement de username
   */
  const handleUsernameChange = async () => {
    if (!newUsername || usernameValidation.status !== 'available') {
      toast.error(t('profile.username.error', 'Username invalide ou non disponible'));
      return;
    }

    if (!usernamePassword) {
      toast.error(t('profile.password.required', 'Mot de passe requis'));
      return;
    }

    setIsChangingUsername(true);
    try {
      const response = await fetch(buildApiUrl('/users/me/username'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify({
          newUsername,
          currentPassword: usernamePassword
        })
      });

      const data = await response.json();

      if (response.status === 429) {
        toast.error(data.error || t('profile.username.rateLimit', 'Changement limité à une fois tous les 30 jours'));
        return;
      }

      if (response.ok && data.success) {
        toast.success(t('profile.username.success', 'Username modifié avec succès !'));

        // Mettre à jour l'utilisateur
        const updatedUser: UserType = {
          ...user,
          username: data.data.username
        };
        onUserUpdate(updatedUser);

        // Réinitialiser
        setIsEditingUsername(false);
        setShowUsernameDialog(false);
        setUsernamePassword('');
        setNewUsername('');
      } else {
        toast.error(data.error || t('profile.username.error', 'Erreur lors du changement'));
      }
    } catch (error) {
      console.error('Error changing username:', error);
      toast.error(t('profile.username.error', 'Erreur lors du changement'));
    } finally {
      setIsChangingUsername(false);
    }
  };

  /**
   * Initier le changement d'email
   */
  const handleInitiateEmailChange = async () => {
    if (!newEmail || emailValidation.status !== 'valid') {
      toast.error(t('profile.email.invalidOrTaken', 'Email invalide ou déjà utilisé'));
      return;
    }

    setIsSavingEmail(true);
    try {
      const response = await fetch(buildApiUrl('/users/me/change-email'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify({ newEmail })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(t('profile.email.verificationSent', 'Email de vérification envoyé à la nouvelle adresse'));
        setPendingEmail(data.data.pendingEmail);
        setNewEmail('');
        setIsChangingEmail(false);
      } else {
        toast.error(data.error || t('profile.email.error', 'Erreur lors du changement'));
      }
    } catch (error) {
      console.error('Error initiating email change:', error);
      toast.error(t('profile.email.error', 'Erreur lors du changement'));
    } finally {
      setIsSavingEmail(false);
    }
  };

  /**
   * Initier le changement de téléphone
   */
  const handleInitiatePhoneChange = async () => {
    if (!newPhone || phoneValidation.status !== 'valid' || !phoneValidation.formattedE164) {
      toast.error(t('profile.phone.invalidOrTaken', 'Téléphone invalide ou déjà utilisé'));
      return;
    }

    setIsSavingPhone(true);
    try {
      // Envoyer le numéro au format E.164
      const response = await fetch(buildApiUrl('/users/me/change-phone'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify({ newPhoneNumber: phoneValidation.formattedE164 })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(t('profile.phone.codeSent', 'Code envoyé par SMS'));
        setPendingPhone(data.data.pendingPhoneNumber);
        setShowPendingPhoneVerification(true);
        setNewPhone('');
        setIsChangingPhone(false);
      } else {
        toast.error(data.error || t('profile.phone.error', 'Erreur lors du changement'));
      }
    } catch (error) {
      console.error('Error initiating phone change:', error);
      toast.error(t('profile.phone.error', 'Erreur lors du changement'));
    } finally {
      setIsSavingPhone(false);
    }
  };

  /**
   * Vérifier le changement de téléphone
   */
  const handleVerifyPendingPhone = async () => {
    if (!pendingPhoneCode || pendingPhoneCode.length !== 6) {
      toast.error(t('profile.verification.phone.invalidCode', 'Le code doit contenir 6 chiffres'));
      return;
    }

    setIsVerifyingPhone(true);
    try {
      const response = await fetch(buildApiUrl('/users/me/verify-phone-change'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify({ code: pendingPhoneCode })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(t('profile.phone.changed', 'Téléphone modifié avec succès !'));

        // Mettre à jour l'utilisateur
        const updatedUser: UserType = {
          ...user,
          phoneNumber: data.data.newPhoneNumber,
          phoneVerifiedAt: new Date()
        };
        onUserUpdate(updatedUser);

        // Réinitialiser
        setPendingPhone(null);
        setShowPendingPhoneVerification(false);
        setPendingPhoneCode('');
      } else {
        toast.error(data.error || t('profile.phone.verifyError', 'Code invalide ou expiré'));
      }
    } catch (error) {
      console.error('Error verifying phone change:', error);
      toast.error(t('profile.phone.verifyError', 'Erreur lors de la vérification'));
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  /**
   * Charger les suggestions de username depuis l'API
   */
  useEffect(() => {
    const loadSuggestions = async () => {
      if (usernameValidation.status === 'taken' && newUsername) {
        try {
          const response = await fetch(
            buildApiUrl(`/auth/check-availability?username=${encodeURIComponent(newUsername)}`)
          );
          const data = await response.json();
          if (data.success && data.data.suggestions) {
            setUsernameSuggestions(data.data.suggestions);
          }
        } catch (error) {
          console.error('Error loading username suggestions:', error);
        }
      } else {
        setUsernameSuggestions([]);
      }
    };

    loadSuggestions();
  }, [usernameValidation.status, newUsername]);

  /**
   * Renvoyer l'email de vérification
   */
  const handleResendEmailVerification = async () => {
    if (!user?.email) {
      toast.error(t('profile.verification.email.noEmail', 'Aucun email configuré'));
      return;
    }

    setIsResendingEmail(true);
    try {
      const response = await fetch(buildApiUrl('/auth/resend-verification'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: user.email })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(t('profile.verification.email.sent', 'Email de vérification envoyé ! Vérifiez votre boîte mail.'));
      } else {
        toast.error(data.error || t('profile.verification.email.error', 'Erreur lors de l\'envoi'));
      }
    } catch (error) {
      console.error('Error resending email verification:', error);
      toast.error(t('profile.verification.email.error', 'Erreur lors de l\'envoi'));
    } finally {
      setIsResendingEmail(false);
    }
  };

  /**
   * Envoyer le code SMS de vérification
   */
  const handleSendPhoneCode = async () => {
    if (!user?.phoneNumber) {
      toast.error(t('profile.verification.phone.noPhone', 'Aucun numéro de téléphone configuré'));
      return;
    }

    setIsSendingPhoneCode(true);
    try {
      const response = await fetch(buildApiUrl('/auth/send-phone-code'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber: user.phoneNumber })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(t('profile.verification.phone.codeSent', 'Code envoyé par SMS !'));
        setPhoneCodeSent(true);
      } else {
        toast.error(data.error || t('profile.verification.phone.sendError', 'Erreur lors de l\'envoi du code'));
      }
    } catch (error) {
      console.error('Error sending phone code:', error);
      toast.error(t('profile.verification.phone.sendError', 'Erreur lors de l\'envoi du code'));
    } finally {
      setIsSendingPhoneCode(false);
    }
  };

  /**
   * Vérifier le code SMS
   */
  const handleVerifyPhoneCode = async () => {
    if (!user?.phoneNumber) return;

    if (!phoneVerificationCode || phoneVerificationCode.length !== 6) {
      toast.error(t('profile.verification.phone.invalidCode', 'Le code doit contenir 6 chiffres'));
      return;
    }

    setIsVerifyingPhone(true);
    try {
      const response = await fetch(buildApiUrl('/auth/verify-phone'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: user.phoneNumber,
          code: phoneVerificationCode
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(t('profile.verification.phone.verified', 'Téléphone vérifié avec succès !'));

        // Mettre à jour l'utilisateur localement
        const updatedUser: UserType = {
          ...user,
          phoneVerifiedAt: new Date()
        };
        onUserUpdate(updatedUser);

        // Réinitialiser l'état
        setShowPhoneVerification(false);
        setPhoneVerificationCode('');
        setPhoneCodeSent(false);
      } else {
        toast.error(data.error || t('profile.verification.phone.verifyError', 'Code invalide ou expiré'));
      }
    } catch (error) {
      console.error('Error verifying phone code:', error);
      toast.error(t('profile.verification.phone.verifyError', 'Erreur lors de la vérification'));
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Exclude language fields (already auto-saved)
      const { systemLanguage, regionalLanguage, customDestinationLanguage, ...profileData } = formData;

      // Appel API pour sauvegarder les modifications
      const response = await fetch(buildApiUrl('/users/me'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify(profileData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('profile.actions.updateError'));
      }

      const responseData = await response.json();

      // Mettre à jour l'utilisateur avec les données retournées par l'API
      const updatedUser: UserType = {
        ...user,
        ...responseData.data.user
      };

      onUserUpdate(updatedUser);
      toast.success(responseData.data.message || t('profile.actions.profileUpdated'));
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      toast.error(error instanceof Error ? error.message : t('profile.actions.updateError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Password handling functions
  const handlePasswordInputChange = (field: string, value: string) => {
    setPasswordData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const validatePasswordForm = (): boolean => {
    if (!passwordData.currentPassword) {
      toast.error(t('security.password.errors.currentRequired'));
      return false;
    }

    if (!passwordData.newPassword) {
      toast.error(t('security.password.errors.newRequired'));
      return false;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t('security.password.errors.mismatch'));
      return false;
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      toast.error(t('security.password.errors.samePassword'));
      return false;
    }

    return true;
  };

  const handlePasswordSave = async () => {
    if (!validatePasswordForm()) {
      return;
    }

    setIsPasswordLoading(true);
    try {
      const response = await fetch(buildApiUrl('/users/me/password'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
          confirmPassword: passwordData.confirmPassword
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || t('security.password.errors.updateFailed'));
      }

      toast.success(responseData.message || t('security.password.updateSuccess'));

      // Reset password form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error('Password change error:', error);
      toast.error(error instanceof Error ? error.message : t('security.password.errors.updateFailed'));
    } finally {
      setIsPasswordLoading(false);
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">{t('noUserConnected')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{t('profile.photo.title')}</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('profile.photo.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Avatar className="h-24 w-24 sm:h-20 sm:w-20">
              <AvatarImage src={user.avatar} alt={user.username} />
              <AvatarFallback className="text-lg">
                {getUserInitials(user)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCameraCapture}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('profile.photo.uploadImage')}
              </Button>
              {/* Bouton caméra visible uniquement sur mobile */}
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:hidden"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4 mr-2" />
                {t('profile.photo.takePhoto')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{t('profile.personalInfo.title')}</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('profile.personalInfo.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="settings-firstName" className="text-sm sm:text-base">{t('profile.personalInfo.firstName')}</Label>
              <Input
                id="settings-firstName"
                name="firstName"
                autoComplete="given-name"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder={t('profile.personalInfo.firstName')}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-lastName" className="text-sm sm:text-base">{t('profile.personalInfo.lastName')}</Label>
              <Input
                id="settings-lastName"
                name="lastName"
                autoComplete="family-name"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                placeholder={t('profile.personalInfo.lastName')}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-displayName" className="text-sm sm:text-base">{t('profile.personalInfo.displayName')}</Label>
            <Input
              id="settings-displayName"
              name="displayName"
              autoComplete="nickname"
              value={formData.displayName}
              onChange={(e) => handleInputChange('displayName', e.target.value)}
              placeholder={t('profile.personalInfo.displayNamePlaceholder')}
              className="w-full"
            />
          </div>

          {/* Email avec validation et changement */}
          <div className="space-y-2">
            <Label htmlFor="settings-email" className="text-sm sm:text-base">
              {t('profile.personalInfo.email')}
            </Label>

            {isChangingEmail ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    id="settings-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nouveau@email.com"
                    className={`w-full pl-10 pr-24 ${
                      emailValidation.status === 'valid' ? 'border-green-500' :
                      emailValidation.status === 'taken' ? 'border-red-500' : ''
                    }`}
                  />

                  {/* Indicateur de statut à gauche */}
                  {(emailValidation.status === 'checking' || emailValidation.status === 'valid' || emailValidation.status === 'taken') && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      {emailValidation.status === 'checking' && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {emailValidation.status === 'valid' && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {emailValidation.status === 'taken' && (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                  )}

                  {/* Boutons Enregistrer et Annuler à droite */}
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                      size="sm"
                      onClick={handleInitiateEmailChange}
                      disabled={isSavingEmail || emailValidation.status !== 'valid' || !newEmail}
                      className="h-8 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700 text-white"
                      title={t('profile.actions.save', 'Enregistrer')}
                    >
                      {isSavingEmail ? (
                        <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3 sm:mr-1" />
                      )}
                      <span className="hidden sm:inline text-xs">{t('profile.actions.save', 'Enregistrer')}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsChangingEmail(false);
                        setNewEmail('');
                      }}
                      className="h-8 px-2 sm:px-3"
                      title={t('profile.actions.cancel', 'Annuler')}
                    >
                      <X className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline text-xs">{t('profile.actions.cancel', 'Annuler')}</span>
                    </Button>
                  </div>
                </div>

                {emailValidation.errorMessage && (
                  <p className="text-xs text-red-600">{emailValidation.errorMessage}</p>
                )}

                {emailValidation.status === 'valid' && (
                  <p className="text-xs text-green-600">{t('profile.email.available', 'Email disponible')}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                    {user.emailVerifiedAt ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                    )}
                  </div>
                  <Input
                    id="settings-email"
                    type="email"
                    value={user.email}
                    disabled
                    className="bg-muted w-full pl-10 pr-24"
                  />
                  {/* Bouton Modifier à droite de l'input */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsChangingEmail(true);
                      setNewEmail('');
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-2 sm:px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                    title={t('profile.actions.edit', 'Modifier')}
                  >
                    <Edit className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline text-xs">{t('profile.actions.edit', 'Modifier')}</span>
                  </Button>
                </div>

                {/* Messages informatifs */}
                {!user.emailVerifiedAt && (
                  <p className="text-xs text-amber-600">
                    {t('profile.verification.email.notVerified', 'Email non vérifié')} •{' '}
                    <button
                      onClick={handleResendEmailVerification}
                      disabled={isResendingEmail}
                      className="text-blue-600 hover:text-blue-700 underline"
                    >
                      {isResendingEmail ? t('profile.verification.sending', 'Envoi...') : t('profile.verification.resend', 'Renvoyer')}
                    </button>
                  </p>
                )}

                {pendingEmail && (
                  <Alert className="bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
                    <Mail className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <AlertDescription className="ml-2 text-xs text-purple-800 dark:text-purple-300">
                      <p className="font-medium">{t('profile.email.pending', 'Changement en attente')}</p>
                      <p className="mt-1">{t('profile.email.pendingMessage', `Vérifiez ${pendingEmail} pour confirmer`)}</p>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>

          {/* Téléphone avec badge de vérification et changement */}
          {/* Téléphone avec validation et changement */}
          <div className="space-y-2">
            <Label htmlFor="settings-phoneNumber" className="text-sm sm:text-base">
              {t('profile.personalInfo.phoneNumber')}
            </Label>

            {isChangingPhone ? (
              <div className="space-y-2">
                {/* Sélecteur de pays + Input téléphone */}
                <div className="flex gap-2">
                  {/* Country code selector */}
                  <select
                    value={selectedPhoneCountry.code}
                    onChange={(e) => {
                      const country = COUNTRY_CODES.find((c) => c.code === e.target.value);
                      if (country) setSelectedPhoneCountry(country);
                    }}
                    className="w-[90px] px-2 py-2 rounded-md text-sm border-2 border-gray-200 dark:border-gray-700 focus:border-purple-500 focus:outline-none focus:ring-0"
                  >
                    {COUNTRY_CODES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.dial}
                      </option>
                    ))}
                  </select>

                  {/* Phone number input with validation */}
                  <div className="relative flex-1">
                    <Input
                      id="settings-phoneNumber"
                      type="tel"
                      inputMode="tel"
                      value={newPhone}
                      onChange={(e) => {
                        // Format as you type
                        const formatted = phoneValidation.formatAsYouType(e.target.value);
                        setNewPhone(formatted);
                      }}
                      placeholder="6 12 34 56 78"
                      className={`w-full pl-10 pr-24 ${
                        phoneValidation.status === 'valid' ? 'border-green-500' :
                        phoneValidation.status === 'exists' ? 'border-red-500' :
                        phoneValidation.status === 'invalid' && newPhone ? 'border-red-500' : ''
                      }`}
                    />

                    {/* Indicateur de statut à gauche */}
                    {(phoneValidation.status === 'checking' || phoneValidation.status === 'valid' || phoneValidation.status === 'exists' || phoneValidation.status === 'invalid') && newPhone && (
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                        {phoneValidation.status === 'checking' && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {phoneValidation.status === 'valid' && (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                        {(phoneValidation.status === 'exists' || phoneValidation.status === 'invalid') && (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                    )}

                    {/* Boutons Enregistrer et Annuler à droite */}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                      <Button
                        size="sm"
                        onClick={handleInitiatePhoneChange}
                        disabled={isSavingPhone || phoneValidation.status !== 'valid' || !newPhone || !phoneValidation.formattedE164}
                        className="h-8 px-2 sm:px-3 bg-purple-600 hover:bg-purple-700 text-white"
                        title={t('profile.actions.save', 'Enregistrer')}
                      >
                        {isSavingPhone ? (
                          <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3 sm:mr-1" />
                        )}
                        <span className="hidden sm:inline text-xs">{t('profile.actions.save', 'Enregistrer')}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsChangingPhone(false);
                          setNewPhone('');
                        }}
                        className="h-8 px-2 sm:px-3"
                        title={t('profile.actions.cancel', 'Annuler')}
                      >
                        <X className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline text-xs">{t('profile.actions.cancel', 'Annuler')}</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {phoneValidation.errorMessage && newPhone && (
                  <p className="text-xs text-red-600">{phoneValidation.errorMessage}</p>
                )}

                {phoneValidation.status === 'valid' && newPhone && (
                  <p className="text-xs text-green-600">
                    {t('profile.phone.available', 'Numéro disponible')} ({phoneValidation.formattedE164})
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                    {user.phoneVerifiedAt ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                    )}
                  </div>
                  <Input
                    id="settings-phoneNumber"
                    type="tel"
                    value={user.phoneNumber || ''}
                    disabled
                    className="bg-muted w-full pl-10 pr-24"
                    placeholder={t('profile.personalInfo.phoneNumberPlaceholder', 'Aucun numéro')}
                  />
                  {/* Bouton Modifier à droite de l'input */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsChangingPhone(true);
                      setNewPhone('');
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-2 sm:px-3 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950"
                    title={t('profile.actions.edit', 'Modifier')}
                  >
                    <Edit className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline text-xs">{t('profile.actions.edit', 'Modifier')}</span>
                  </Button>
                </div>

                {/* Messages informatifs */}
                {!user.phoneVerifiedAt && user.phoneNumber && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-600">
                      {t('profile.verification.phone.notVerified', 'Téléphone non vérifié')}
                    </p>
                    {!showPhoneVerification ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowPhoneVerification(true)}
                        className="text-purple-700 border-purple-300 hover:bg-purple-100 text-xs"
                      >
                        <Phone className="h-3 w-3 mr-1" />
                        {t('profile.verification.phone.start', 'Vérifier par SMS')}
                      </Button>
                    ) : (
                      <div className="space-y-3 p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-md">
                        {!phoneCodeSent ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={handleSendPhoneCode}
                              disabled={isSendingPhoneCode}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
                            >
                              <Send className="h-3 w-3 mr-1" />
                              {isSendingPhoneCode ? t('profile.verification.sending', 'Envoi...') : t('profile.verification.phone.sendCode', 'Envoyer le code')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowPhoneVerification(false)}
                              className="text-xs"
                            >
                              {t('profile.actions.cancel', 'Annuler')}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label htmlFor="phone-code" className="text-sm">
                              {t('profile.verification.phone.enterCode', 'Code reçu par SMS')}
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                id="phone-code"
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={phoneVerificationCode}
                                onChange={(e) => setPhoneVerificationCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="000000"
                                className="w-32 text-center text-lg font-mono"
                              />
                              <Button
                                size="sm"
                                onClick={handleVerifyPhoneCode}
                                disabled={isVerifyingPhone || phoneVerificationCode.length !== 6}
                                className="bg-purple-600 hover:bg-purple-700 text-white"
                              >
                                {isVerifyingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Changement de téléphone en attente */}
                {pendingPhone && (
                  <Alert className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
                    <Phone className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <AlertDescription className="ml-2 text-xs text-orange-800 dark:text-orange-300">
                      <p className="font-medium mb-1">{t('profile.phone.pending', 'Changement en attente')}</p>
                      <p className="mb-3">{t('profile.phone.pendingMessage', `Code envoyé à ${pendingPhone}`)}</p>

                      {!showPendingPhoneVerification ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowPendingPhoneVerification(true)}
                          className="text-orange-700 border-orange-300 hover:bg-orange-100 text-xs"
                        >
                          {t('profile.verification.phone.enterCode', 'Entrer le code')}
                        </Button>
                      ) : (
                        <div className="space-y-2 pt-2">
                          <Label htmlFor="pending-phone-code" className="text-sm">
                            {t('profile.verification.phone.enterCode', 'Code reçu par SMS')}
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="pending-phone-code"
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={pendingPhoneCode}
                              onChange={(e) => setPendingPhoneCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="000000"
                              className="w-32 text-center text-lg font-mono"
                            />
                            <Button
                              size="sm"
                              onClick={handleVerifyPendingPhone}
                              disabled={isVerifyingPhone || pendingPhoneCode.length !== 6}
                              className="bg-orange-600 hover:bg-orange-700 text-white"
                            >
                              {isVerifyingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : t('profile.verification.verify', 'Vérifier')}
                            </Button>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleInitiatePhoneChange}
                            disabled={isChangingPhone}
                            className="text-xs"
                          >
                            {t('profile.verification.resend', 'Renvoyer le code')}
                          </Button>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-bio" className="text-sm sm:text-base">{t('profile.personalInfo.bio')}</Label>
            <Textarea
              id="settings-bio"
              value={formData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              placeholder={t('profile.personalInfo.bioPlaceholder')}
              className="w-full min-h-[100px]"
              maxLength={2000}
            />
            <p className="text-xs sm:text-sm text-muted-foreground text-right">
              {formData.bio.length}/2000
            </p>
          </div>

          {/* Username avec validation et changement */}
          <div className="space-y-2">
            <Label htmlFor="settings-username" className="text-sm sm:text-base">
              {t('profile.personalInfo.username')}
            </Label>

            {isEditingUsername ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    id="settings-username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="nouveau_username"
                    className={`w-full pl-10 pr-24 ${
                      usernameValidation.status === 'available' ? 'border-green-500' :
                      usernameValidation.status === 'taken' ? 'border-red-500' : ''
                    }`}
                  />

                  {/* Indicateur de statut à gauche */}
                  {(usernameValidation.status === 'checking' || usernameValidation.status === 'available' || usernameValidation.status === 'taken') && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      {usernameValidation.status === 'checking' && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {usernameValidation.status === 'available' && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {usernameValidation.status === 'taken' && (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                  )}

                  {/* Boutons Enregistrer et Annuler à droite */}
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => setShowUsernameDialog(true)}
                      disabled={usernameValidation.status !== 'available' || !newUsername}
                      className="h-8 px-2 sm:px-3 bg-indigo-600 hover:bg-indigo-700 text-white"
                      title={t('profile.username.save', 'Enregistrer')}
                    >
                      <Check className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline text-xs">{t('profile.username.save', 'Enregistrer')}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsEditingUsername(false);
                        setNewUsername('');
                        setUsernameSuggestions([]);
                      }}
                      className="h-8 px-2 sm:px-3"
                      title={t('profile.actions.cancel', 'Annuler')}
                    >
                      <X className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline text-xs">{t('profile.actions.cancel', 'Annuler')}</span>
                    </Button>
                  </div>
                </div>

                {usernameValidation.errorMessage && (
                  <p className="text-xs text-red-600">{usernameValidation.errorMessage}</p>
                )}

                {usernameValidation.status === 'available' && (
                  <p className="text-xs text-green-600">{t('profile.username.available', 'Username disponible !')}</p>
                )}

                {/* Suggestions si username pris */}
                {usernameValidation.status === 'taken' && usernameSuggestions.length > 0 && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-xs text-blue-800 dark:text-blue-300 mb-2">
                      {t('profile.username.suggestions', 'Suggestions disponibles :')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {usernameSuggestions.map((suggestion) => (
                        <Button
                          key={suggestion}
                          variant="outline"
                          size="sm"
                          onClick={() => setNewUsername(suggestion)}
                          className="text-xs"
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-xs text-amber-800 dark:text-amber-300 ml-2">
                    {t('profile.username.warning', 'Le changement de username est limité à une fois tous les 30 jours.')}
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="relative">
                <Input
                  id="settings-username"
                  value={user.username}
                  disabled
                  className="bg-muted w-full pr-24"
                />
                {/* Bouton Modifier à droite de l'input */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditingUsername(true);
                    setNewUsername(user.username);
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-2 sm:px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                  title={t('profile.actions.edit', 'Modifier')}
                >
                  <Edit className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline text-xs">{t('profile.actions.edit', 'Modifier')}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Dialog pour confirmer le changement de username */}
          <Dialog open={showUsernameDialog} onOpenChange={setShowUsernameDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('profile.username.confirmTitle', 'Confirmer le changement de username')}</DialogTitle>
                <DialogDescription>
                  {t('profile.username.confirmDescription', 'Entrez votre mot de passe pour confirmer le changement.')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="username-password">{t('profile.password.current', 'Mot de passe actuel')}</Label>
                  <Input
                    id="username-password"
                    type="password"
                    value={usernamePassword}
                    onChange={(e) => setUsernamePassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowUsernameDialog(false);
                    setUsernamePassword('');
                  }}
                >
                  {t('profile.actions.cancel', 'Annuler')}
                </Button>
                <Button
                  onClick={handleUsernameChange}
                  disabled={isChangingUsername || !usernamePassword}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isChangingUsername && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('profile.actions.confirm', 'Confirmer')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-4 pt-6 mr-6">

          <Button 
              variant="outline" 
              className="w-full sm:w-auto" 
              onClick={() => {
                if (user) {
                  setFormData({
                    firstName: user.firstName || '',
                    lastName: user.lastName || '',
                    displayName: user.displayName || '',
                    email: user.email || '',
                    phoneNumber: user.phoneNumber || '',
                    bio: user.bio || '',
                  });
                }
              }}
            >
              {t('profile.actions.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isLoading} className="w-full sm:w-auto">
              {isLoading ? t('profile.actions.saving') : t('profile.actions.save')}
            </Button>

          </div>

      </Card>

      {/* Languages Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <CardTitle className="text-lg sm:text-xl">
              {t('profile.languages.title', 'Language Preferences')}
            </CardTitle>
          </div>
          <CardDescription className="text-sm sm:text-base">
            {t('profile.languages.description', 'Configure your language settings')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* NOTE: Interface Language is managed in Application Settings tab */}

          {/* System Language */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Monitor className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.languages.system.label', 'System Language')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.languages.system.description', 'Main language for your messages')}
                </p>
              </div>
            </div>
            <Select
              value={formData.systemLanguage || 'en'}
              onValueChange={(value) => handleLanguageChange('systemLanguage', value)}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Regional Language */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Languages className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.languages.regional.label', 'Regional Language')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.languages.regional.description', 'Secondary language (optional)')}
                </p>
              </div>
            </div>
            <Select
              value={formData.regionalLanguage || 'none'}
              onValueChange={(value) => handleLanguageChange('regionalLanguage', value === 'none' ? '' : value)}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('translation.mainLanguages.none', 'None')}</SelectItem>
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Destination Language */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Wand2 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.languages.custom.label', 'Custom Language')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.languages.custom.description', 'Specific translation target (optional)')}
                </p>
              </div>
            </div>
            <Select
              value={formData.customDestinationLanguage || 'none'}
              onValueChange={(value) =>
                handleLanguageChange('customDestinationLanguage', value === 'none' ? '' : value)
              }
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('translation.mainLanguages.none', 'None')}</SelectItem>
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Separator */}
      <Separator className="my-6" />

      {/* Security - Password Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-lg sm:text-xl">{t('security.password.title')}</CardTitle>
          </div>
          <CardDescription className="text-sm sm:text-base">
            {t('security.password.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Current password */}
          <div className="space-y-2">
            <Label htmlFor="current-password" className="text-sm sm:text-base">
              {t('security.password.currentPassword')}
            </Label>
            <div className="relative">
              <Input
                id="current-password"
                name="current-password"
                type={showPasswords.current ? 'text' : 'password'}
                value={passwordData.currentPassword}
                onChange={(e) => handlePasswordInputChange('currentPassword', e.target.value)}
                placeholder={t('security.password.currentPasswordPlaceholder')}
                className="w-full pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => {
                  SoundFeedback.playClick();
                  togglePasswordVisibility('current');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm outline-none"
                aria-label={showPasswords.current ? t('security.password.hidePassword', 'Masquer le mot de passe') : t('security.password.showPassword', 'Afficher le mot de passe')}
                aria-pressed={showPasswords.current}
              >
                {showPasswords.current ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* New password */}
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-sm sm:text-base">
              {t('security.password.newPassword')}
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                name="new-password"
                type={showPasswords.new ? 'text' : 'password'}
                value={passwordData.newPassword}
                onChange={(e) => handlePasswordInputChange('newPassword', e.target.value)}
                placeholder={t('security.password.newPasswordPlaceholder')}
                className="w-full pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => {
                  SoundFeedback.playClick();
                  togglePasswordVisibility('new');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm outline-none"
                aria-label={showPasswords.new ? t('security.password.hidePassword', 'Masquer le mot de passe') : t('security.password.showPassword', 'Afficher le mot de passe')}
                aria-pressed={showPasswords.new}
              >
                {showPasswords.new ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('security.password.requirements')}
            </p>
          </div>

          {/* Confirm new password */}
          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-sm sm:text-base">
              {t('security.password.confirmPassword')}
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                name="confirm-password"
                type={showPasswords.confirm ? 'text' : 'password'}
                value={passwordData.confirmPassword}
                onChange={(e) => handlePasswordInputChange('confirmPassword', e.target.value)}
                placeholder={t('security.password.confirmPasswordPlaceholder')}
                className="w-full pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => {
                  SoundFeedback.playClick();
                  togglePasswordVisibility('confirm');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm outline-none"
                aria-label={showPasswords.confirm ? t('security.password.hidePassword', 'Masquer le mot de passe') : t('security.password.showPassword', 'Afficher le mot de passe')}
                aria-pressed={showPasswords.confirm}
              >
                {showPasswords.confirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-4 pt-4">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setPasswordData({
                  currentPassword: '',
                  newPassword: '',
                  confirmPassword: '',
                });
              }}
              disabled={isPasswordLoading}
            >
              {t('security.password.cancel')}
            </Button>
            <Button
              onClick={handlePasswordSave}
              disabled={isPasswordLoading || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
              className="w-full sm:w-auto"
            >
              {isPasswordLoading ? t('security.password.updating') : t('security.password.update')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialogue de recadrage d'avatar */}
      {avatarPreview && (
        <AvatarCropDialog
          open={showAvatarDialog}
          onClose={() => {
            setShowAvatarDialog(false);
            setAvatarPreview(null);
          }}
          imageSrc={avatarPreview}
          onCropComplete={handleCroppedFile}
          isUploading={isUploadingAvatar}
        />
      )}
    </div>
  );
}
