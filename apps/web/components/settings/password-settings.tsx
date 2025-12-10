'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';

export function PasswordSettings() {

  const { t } = useI18n('settings');
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
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

  const validateForm = (): boolean => {
    if (!formData.currentPassword) {
      toast.error(t('security.password.errors.currentRequired'));
      return false;
    }

    if (!formData.newPassword) {
      toast.error(t('security.password.errors.newRequired'));
      return false;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error(t('security.password.errors.mismatch'));
      return false;
    }

    if (formData.currentPassword === formData.newPassword) {
      toast.error(t('security.password.errors.samePassword'));
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(buildApiUrl('/users/me/password'), {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
          confirmPassword: formData.confirmPassword
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || t('security.password.errors.updateFailed'));
      }

      toast.success(responseData.message || t('security.password.updateSuccess'));
      
      // Réinitialiser le formulaire
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error('Erreur lors du changement de mot de passe:', error);
      toast.error(error instanceof Error ? error.message : t('security.password.errors.updateFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
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
        {/* Mot de passe actuel */}
        <div className="space-y-2">
          <Label htmlFor="current-password" className="text-sm sm:text-base">
            {t('security.password.currentPassword')}
          </Label>
          <div className="relative">
            <Input
              id="current-password"
              type={showPasswords.current ? 'text' : 'password'}
              value={formData.currentPassword}
              onChange={(e) => handleInputChange('currentPassword', e.target.value)}
              placeholder={t('security.password.currentPasswordPlaceholder')}
              className="w-full pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('current')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              tabIndex={-1}
            >
              {showPasswords.current ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Nouveau mot de passe */}
        <div className="space-y-2">
          <Label htmlFor="new-password" className="text-sm sm:text-base">
            {t('security.password.newPassword')}
          </Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showPasswords.new ? 'text' : 'password'}
              value={formData.newPassword}
              onChange={(e) => handleInputChange('newPassword', e.target.value)}
              placeholder={t('security.password.newPasswordPlaceholder')}
              className="w-full pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('new')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              tabIndex={-1}
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

        {/* Confirmation du nouveau mot de passe */}
        <div className="space-y-2">
          <Label htmlFor="confirm-password" className="text-sm sm:text-base">
            {t('security.password.confirmPassword')}
          </Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showPasswords.confirm ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              placeholder={t('security.password.confirmPasswordPlaceholder')}
              className="w-full pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('confirm')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              tabIndex={-1}
            >
              {showPasswords.confirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-4 pt-4">
          <Button 
            variant="outline" 
            className="w-full sm:w-auto" 
            onClick={() => {
              setFormData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
              });
            }}
            disabled={isLoading}
          >
            {t('security.password.cancel')}
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isLoading || !formData.currentPassword || !formData.newPassword || !formData.confirmPassword}
            className="w-full sm:w-auto"
          >
            {isLoading ? t('security.password.updating') : t('security.password.update')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
