'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Upload, Camera, Lock, Eye, EyeOff, Languages, Monitor, Wand2 } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { buildApiUrl } from '@/lib/config';
import { validateAvatarFile } from '@/utils/avatar-upload';
import { AvatarCropDialog } from './avatar-crop-dialog';
import { authManager } from '@/services/auth-manager.service';
import { Separator } from '@/components/ui/separator';
import { SoundFeedback } from '@/hooks/use-accessibility';

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
        ...responseData.data
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
        ...responseData.data
      };
      
      onUserUpdate(updatedUser);
      toast.success(responseData.message || t('profile.actions.profileUpdated'));
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="settings-email" className="text-sm sm:text-base">{t('profile.personalInfo.email')}</Label>
              <Input
                id="settings-email"
                name="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder={t('profile.personalInfo.emailPlaceholder')}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-phoneNumber" className="text-sm sm:text-base">{t('profile.personalInfo.phoneNumber')}</Label>
              <Input
                id="settings-phoneNumber"
                name="phoneNumber"
                type="tel"
                autoComplete="tel"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                placeholder={t('profile.personalInfo.phoneNumberPlaceholder')}
                className="w-full"
              />
            </div>
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

          <div className="space-y-2">
            <Label htmlFor="settings-username" className="text-sm sm:text-base">{t('profile.personalInfo.username')}</Label>
            <Input
              id="settings-username"
              value={user.username}
              disabled
              className="bg-muted w-full"
            />
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('profile.personalInfo.usernameCannotChange')}
            </p>
          </div>
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
