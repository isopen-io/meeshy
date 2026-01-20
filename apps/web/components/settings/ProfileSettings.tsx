/**
 * DEPRECATED: This component is not currently used in production.
 * The active profile settings component is UserSettings.tsx
 * This file is kept for reference/example purposes only.
 *
 * If you need to use this component, note that language preferences
 * need to be updated to use /users/me API instead of /me/preferences/application
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Mail,
  User as UserIcon,
  Lock,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Languages,
  Monitor,
  Wand2
} from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { useAuth } from '@/hooks/use-auth';
import { usePreferences } from '@/hooks/use-preferences';
import { SoundFeedback } from '@/hooks/use-accessibility';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';

interface ProfileSettingsProps {
  onAccountDeleted?: () => void;
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

export function ProfileSettings({ onAccountDeleted }: ProfileSettingsProps) {
  const { t } = useI18n('settings');
  const { user, logout } = useAuth();

  // NOTE: Message translation languages are now managed via /users/me API
  // This component manages: systemLanguage, regionalLanguage, customDestinationLanguage
  // Interface language (interfaceLanguage) is managed in ApplicationSettings via /me/preferences/application

  // Email change state
  const [emailData, setEmailData] = useState({
    newEmail: '',
    verificationCode: '',
  });
  const [emailStep, setEmailStep] = useState<'input' | 'verify'>('input');
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  // Username change state
  const [usernameData, setUsernameData] = useState({
    newUsername: '',
  });
  const [isUsernameLoading, setIsUsernameLoading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameCheckDebounce, setUsernameCheckDebounce] = useState<NodeJS.Timeout | null>(null);

  // Password change state
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

  // Account deletion state
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    password: '',
    confirmText: '',
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showFinalDeleteDialog, setShowFinalDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ===== EMAIL CHANGE FUNCTIONS =====
  const handleEmailChange = async () => {
    if (!emailData.newEmail) {
      toast.error(t('profile.account.email.errors.emailRequired', 'Email is required'));
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailData.newEmail)) {
      toast.error(t('profile.account.email.errors.invalidEmail', 'Invalid email format'));
      return;
    }

    setIsEmailLoading(true);
    try {
      const response = await fetch(buildApiUrl('/auth/me/email/request'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`,
        },
        body: JSON.stringify({ email: emailData.newEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('profile.account.email.errors.requestFailed', 'Failed to request email change'));
      }

      toast.success(t('profile.account.email.codeSent', 'Verification code sent to your new email'));
      setEmailStep('verify');
    } catch (error) {
      console.error('Email change request error:', error);
      toast.error(error instanceof Error ? error.message : t('profile.account.email.errors.requestFailed', 'Failed to request email change'));
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleEmailVerification = async () => {
    if (!emailData.verificationCode) {
      toast.error(t('profile.account.email.errors.codeRequired', 'Verification code is required'));
      return;
    }

    setIsEmailLoading(true);
    try {
      const response = await fetch(buildApiUrl('/auth/me/email/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`,
        },
        body: JSON.stringify({
          email: emailData.newEmail,
          code: emailData.verificationCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('profile.account.email.errors.verifyFailed', 'Failed to verify email'));
      }

      toast.success(t('profile.account.email.updateSuccess', 'Email updated successfully'));
      setEmailData({ newEmail: '', verificationCode: '' });
      setEmailStep('input');

      // Refresh user data
      window.location.reload();
    } catch (error) {
      console.error('Email verification error:', error);
      toast.error(error instanceof Error ? error.message : t('profile.account.email.errors.verifyFailed', 'Failed to verify email'));
    } finally {
      setIsEmailLoading(false);
    }
  };

  // ===== USERNAME CHANGE FUNCTIONS =====
  const checkUsernameAvailability = async (username: string) => {
    if (!username || username === user?.username) {
      setUsernameAvailable(null);
      return;
    }

    try {
      const response = await fetch(buildApiUrl(`/auth/check-username?username=${encodeURIComponent(username)}`), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authManager.getAuthToken()}`,
        },
      });

      const data = await response.json();
      setUsernameAvailable(data.available === true);
    } catch (error) {
      console.error('Username check error:', error);
      setUsernameAvailable(null);
    }
  };

  const handleUsernameInputChange = (value: string) => {
    setUsernameData({ newUsername: value });

    // Clear existing debounce
    if (usernameCheckDebounce) {
      clearTimeout(usernameCheckDebounce);
    }

    // Set new debounce
    const timeout = setTimeout(() => {
      checkUsernameAvailability(value);
    }, 500);

    setUsernameCheckDebounce(timeout);
  };

  const handleUsernameChange = async () => {
    if (!usernameData.newUsername) {
      toast.error(t('profile.account.username.errors.usernameRequired', 'Username is required'));
      return;
    }

    if (usernameAvailable !== true) {
      toast.error(t('profile.account.username.errors.usernameNotAvailable', 'Username is not available'));
      return;
    }

    setIsUsernameLoading(true);
    try {
      const response = await fetch(buildApiUrl('/auth/me'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`,
        },
        body: JSON.stringify({ username: usernameData.newUsername }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('profile.account.username.errors.updateFailed', 'Failed to update username'));
      }

      toast.success(t('profile.account.username.updateSuccess', 'Username updated successfully'));
      setUsernameData({ newUsername: '' });
      setUsernameAvailable(null);

      // Refresh user data
      window.location.reload();
    } catch (error) {
      console.error('Username update error:', error);
      toast.error(error instanceof Error ? error.message : t('profile.account.username.errors.updateFailed', 'Failed to update username'));
    } finally {
      setIsUsernameLoading(false);
    }
  };

  // ===== PASSWORD CHANGE FUNCTIONS =====
  const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
    const newValue = !showPasswords[field];
    setShowPasswords(prev => ({
      ...prev,
      [field]: newValue,
    }));
    if (newValue) {
      SoundFeedback.playToggleOn();
    } else {
      SoundFeedback.playToggleOff();
    }
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

    if (passwordData.newPassword.length < 6) {
      toast.error(t('security.password.errors.tooShort'));
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

  const handlePasswordChange = async () => {
    if (!validatePasswordForm()) {
      return;
    }

    setIsPasswordLoading(true);
    try {
      const response = await fetch(buildApiUrl('/auth/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`,
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
          confirmPassword: passwordData.confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('security.password.errors.updateFailed'));
      }

      toast.success(t('security.password.updateSuccess'));
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

  // ===== ACCOUNT DELETION FUNCTIONS =====
  const handleDeleteAccountRequest = () => {
    setShowDeleteDialog(true);
  };

  const handleFirstDeleteConfirmation = () => {
    if (!deleteConfirmation.password) {
      toast.error(t('profile.account.delete.errors.passwordRequired', 'Password is required'));
      return;
    }

    setShowDeleteDialog(false);
    setShowFinalDeleteDialog(true);
  };

  const handleFinalDeleteConfirmation = async () => {
    const requiredText = 'DELETE';
    if (deleteConfirmation.confirmText !== requiredText) {
      toast.error(t('profile.account.delete.errors.confirmTextMismatch', `Please type "${requiredText}" to confirm`));
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(buildApiUrl('/auth/me'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`,
        },
        body: JSON.stringify({
          password: deleteConfirmation.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('profile.account.delete.errors.deleteFailed', 'Failed to delete account'));
      }

      toast.success(t('profile.account.delete.deleteSuccess', 'Account deleted successfully'));

      // Clear all data and logout
      logout();

      // Call callback if provided
      if (onAccountDeleted) {
        onAccountDeleted();
      }
    } catch (error) {
      console.error('Account deletion error:', error);
      toast.error(error instanceof Error ? error.message : t('profile.account.delete.errors.deleteFailed', 'Failed to delete account'));
    } finally {
      setIsDeleting(false);
      setShowFinalDeleteDialog(false);
      setDeleteConfirmation({ password: '', confirmText: '' });
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
      {/* Email Change Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-lg sm:text-xl">
              {t('profile.account.email.title', 'Change Email')}
            </CardTitle>
          </div>
          <CardDescription className="text-sm sm:text-base">
            {t('profile.account.email.description', 'Update your email address with verification')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <Label className="text-sm sm:text-base">
              {t('profile.account.email.currentEmail', 'Current Email')}
            </Label>
            <Input
              type="email"
              value={user.email || ''}
              disabled
              className="bg-muted w-full"
            />
          </div>

          {emailStep === 'input' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-email" className="text-sm sm:text-base">
                  {t('profile.account.email.newEmail', 'New Email')}
                </Label>
                <Input
                  id="new-email"
                  type="email"
                  value={emailData.newEmail}
                  onChange={(e) => setEmailData({ ...emailData, newEmail: e.target.value })}
                  placeholder={t('profile.account.email.newEmailPlaceholder', 'your.new.email@example.com')}
                  className="w-full"
                  autoComplete="email"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-4 pt-4">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    SoundFeedback.playClick();
                    setEmailData({ newEmail: '', verificationCode: '' });
                  }}
                  disabled={isEmailLoading}
                >
                  {t('profile.actions.cancel')}
                </Button>
                <Button
                  onClick={() => {
                    SoundFeedback.playClick();
                    handleEmailChange();
                  }}
                  disabled={isEmailLoading || !emailData.newEmail}
                  className="w-full sm:w-auto"
                >
                  {isEmailLoading
                    ? t('profile.account.email.sending', 'Sending...')
                    : t('profile.account.email.sendCode', 'Send Verification Code')}
                </Button>
              </div>
            </>
          )}

          {emailStep === 'verify' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="verification-code" className="text-sm sm:text-base">
                  {t('profile.account.email.verificationCode', 'Verification Code')}
                </Label>
                <Input
                  id="verification-code"
                  type="text"
                  value={emailData.verificationCode}
                  onChange={(e) => setEmailData({ ...emailData, verificationCode: e.target.value })}
                  placeholder={t('profile.account.email.verificationCodePlaceholder', 'Enter the 6-digit code')}
                  className="w-full"
                  maxLength={6}
                />
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('profile.account.email.verificationHelp', 'Check your new email for the verification code')}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-4 pt-4">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    SoundFeedback.playClick();
                    setEmailStep('input');
                    setEmailData({ newEmail: '', verificationCode: '' });
                  }}
                  disabled={isEmailLoading}
                >
                  {t('profile.actions.cancel')}
                </Button>
                <Button
                  onClick={() => {
                    SoundFeedback.playClick();
                    handleEmailVerification();
                  }}
                  disabled={isEmailLoading || !emailData.verificationCode}
                  className="w-full sm:w-auto"
                >
                  {isEmailLoading
                    ? t('profile.account.email.verifying', 'Verifying...')
                    : t('profile.account.email.verify', 'Verify Email')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
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
          {/* Interface Language */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Languages className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.languages.interface.label', 'Interface Language')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.languages.interface.description', 'Language for menus and buttons')}
                </p>
              </div>
            </div>
            <Select
              value={languagePrefs?.interfaceLanguage || 'en'}
              onValueChange={(value) => handleLanguageChange('interfaceLanguage', value)}
              disabled={isLanguageLoading}
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
              value={languagePrefs?.systemLanguage || 'en'}
              onValueChange={(value) => handleLanguageChange('systemLanguage', value)}
              disabled={isLanguageLoading}
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
              value={languagePrefs?.regionalLanguage || 'none'}
              onValueChange={(value) => handleLanguageChange('regionalLanguage', value === 'none' ? undefined : value)}
              disabled={isLanguageLoading}
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
              value={languagePrefs?.customDestinationLanguage || 'none'}
              onValueChange={(value) =>
                handleLanguageChange('customDestinationLanguage', value === 'none' ? undefined : value)
              }
              disabled={isLanguageLoading}
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

      {/* Username Change Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="text-lg sm:text-xl">
              {t('profile.account.username.title', 'Change Username')}
            </CardTitle>
          </div>
          <CardDescription className="text-sm sm:text-base">
            {t('profile.account.username.description', 'Update your unique username')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <Label className="text-sm sm:text-base">
              {t('profile.account.username.currentUsername', 'Current Username')}
            </Label>
            <Input
              type="text"
              value={user.username}
              disabled
              className="bg-muted w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-username" className="text-sm sm:text-base">
              {t('profile.account.username.newUsername', 'New Username')}
            </Label>
            <div className="relative">
              <Input
                id="new-username"
                type="text"
                value={usernameData.newUsername}
                onChange={(e) => handleUsernameInputChange(e.target.value)}
                placeholder={t('profile.account.username.newUsernamePlaceholder', 'Enter your new username')}
                className="w-full pr-10"
              />
              {usernameData.newUsername && usernameAvailable !== null && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameAvailable ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {usernameData.newUsername && usernameAvailable !== null && (
              <p className={`text-xs sm:text-sm ${usernameAvailable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {usernameAvailable
                  ? t('profile.account.username.available', 'Username is available')
                  : t('profile.account.username.notAvailable', 'Username is already taken')}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-4 pt-4">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                SoundFeedback.playClick();
                setUsernameData({ newUsername: '' });
                setUsernameAvailable(null);
              }}
              disabled={isUsernameLoading}
            >
              {t('profile.actions.cancel')}
            </Button>
            <Button
              onClick={() => {
                SoundFeedback.playClick();
                handleUsernameChange();
              }}
              disabled={isUsernameLoading || !usernameData.newUsername || usernameAvailable !== true}
              className="w-full sm:w-auto"
            >
              {isUsernameLoading
                ? t('profile.account.username.updating', 'Updating...')
                : t('profile.account.username.update', 'Update Username')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password Change Section */}
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
                type={showPasswords.current ? 'text' : 'password'}
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                placeholder={t('security.password.currentPasswordPlaceholder')}
                className="w-full pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('current')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm outline-none"
                aria-label={showPasswords.current ? t('security.password.hidePassword', 'Hide password') : t('security.password.showPassword', 'Show password')}
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
                type={showPasswords.new ? 'text' : 'password'}
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                placeholder={t('security.password.newPasswordPlaceholder')}
                className="w-full pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('new')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm outline-none"
                aria-label={showPasswords.new ? t('security.password.hidePassword', 'Hide password') : t('security.password.showPassword', 'Show password')}
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
                type={showPasswords.confirm ? 'text' : 'password'}
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                placeholder={t('security.password.confirmPasswordPlaceholder')}
                className="w-full pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('confirm')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm outline-none"
                aria-label={showPasswords.confirm ? t('security.password.hidePassword', 'Hide password') : t('security.password.showPassword', 'Show password')}
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
              className="w-full sm:w-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onClick={() => {
                SoundFeedback.playClick();
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
              onClick={() => {
                SoundFeedback.playClick();
                handlePasswordChange();
              }}
              disabled={isPasswordLoading || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
              className="w-full sm:w-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {isPasswordLoading ? t('security.password.updating') : t('security.password.update')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account Deletion Section */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
            <CardTitle className="text-lg sm:text-xl text-red-600 dark:text-red-400">
              {t('profile.account.delete.title', 'Delete Account')}
            </CardTitle>
          </div>
          <CardDescription className="text-sm sm:text-base">
            {t('profile.account.delete.description', 'Permanently delete your account and all associated data')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm font-medium text-red-900 dark:text-red-100">
                  {t('profile.account.delete.warning', 'Warning: This action cannot be undone')}
                </p>
                <ul className="text-xs sm:text-sm text-red-800 dark:text-red-200 space-y-1 list-disc list-inside">
                  <li>{t('profile.account.delete.consequence1', 'All your messages will be permanently deleted')}</li>
                  <li>{t('profile.account.delete.consequence2', 'Your profile and settings will be removed')}</li>
                  <li>{t('profile.account.delete.consequence3', 'You will be logged out immediately')}</li>
                  <li>{t('profile.account.delete.consequence4', 'This action is irreversible')}</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="destructive"
              onClick={() => {
                SoundFeedback.playClick();
                handleDeleteAccountRequest();
              }}
              className="w-full sm:w-auto"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('profile.account.delete.deleteButton', 'Delete My Account')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* First Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('profile.account.delete.confirmTitle', 'Confirm Account Deletion')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                {t('profile.account.delete.confirmDescription', 'Please enter your password to continue with account deletion.')}
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-password" className="text-sm">
                  {t('profile.account.delete.passwordLabel', 'Your Password')}
                </Label>
                <Input
                  id="delete-password"
                  type="password"
                  value={deleteConfirmation.password}
                  onChange={(e) => setDeleteConfirmation({ ...deleteConfirmation, password: e.target.value })}
                  placeholder={t('profile.account.delete.passwordPlaceholder', 'Enter your password')}
                  className="w-full"
                  autoComplete="current-password"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmation({ password: '', confirmText: '' })}>
              {t('profile.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFirstDeleteConfirmation}
              disabled={!deleteConfirmation.password}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {t('profile.account.delete.continue', 'Continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Final Delete Confirmation Dialog */}
      <AlertDialog open={showFinalDeleteDialog} onOpenChange={setShowFinalDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('profile.account.delete.finalConfirmTitle', 'Final Confirmation')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p className="font-medium text-red-600 dark:text-red-400">
                {t('profile.account.delete.finalWarning', 'This is your last chance. This action is permanent and irreversible.')}
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm-text" className="text-sm">
                  {t('profile.account.delete.confirmTextLabel', 'Type "DELETE" to confirm')}
                </Label>
                <Input
                  id="delete-confirm-text"
                  type="text"
                  value={deleteConfirmation.confirmText}
                  onChange={(e) => setDeleteConfirmation({ ...deleteConfirmation, confirmText: e.target.value })}
                  placeholder="DELETE"
                  className="w-full font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowFinalDeleteDialog(false);
                setDeleteConfirmation({ password: '', confirmText: '' });
              }}
              disabled={isDeleting}
            >
              {t('profile.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFinalDeleteConfirmation}
              disabled={isDeleting || deleteConfirmation.confirmText !== 'DELETE'}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting
                ? t('profile.account.delete.deleting', 'Deleting...')
                : t('profile.account.delete.finalConfirm', 'Delete Permanently')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
