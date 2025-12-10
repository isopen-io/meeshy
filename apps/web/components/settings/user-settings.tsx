'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User as UserType } from '@/types';
import { getUserInitials } from '@/utils/user';
import { toast } from 'sonner';
import { Upload, Camera } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { buildApiUrl } from '@/lib/config';
import { validateAvatarFile } from '@/utils/avatar-upload';
import { AvatarCropDialog } from './avatar-crop-dialog';
import { authManager } from '@/services/auth-manager.service';

interface UserSettingsProps {
  user: UserType | null;
  onUserUpdate: (user: UserType) => void;
}

export function UserSettings({ user, onUserUpdate }: UserSettingsProps) {

  const { t } = useI18n('settings');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    phoneNumber: '',
    bio: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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
  }, [user]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
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
      // Appel API pour sauvegarder les modifications
      const response = await fetch(buildApiUrl('/users/me'), {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify(formData)
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
                type="email"
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
                type="tel"
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
