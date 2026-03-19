'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { LanguageSelector } from '@/components/translation/language-selector';
import { Badge } from '@/components/ui/badge';
import { User as UserType } from '@/types';
import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';
import { toast } from 'sonner';
import { Globe, Languages, Target } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';

interface LanguageSettingsProps {
  user: UserType | null;
  onUserUpdate: (user: UserType) => void;
}

export function LanguageSettings({ user, onUserUpdate }: LanguageSettingsProps) {

  const { t } = useI18n('settings');
  const [settings, setSettings] = useState({
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: '',
    autoTranslateEnabled: true,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setSettings({
        systemLanguage: user.systemLanguage,
        regionalLanguage: user.regionalLanguage,
        customDestinationLanguage: user.customDestinationLanguage || '',
        autoTranslateEnabled: user.autoTranslateEnabled,
      });
    }
  }, [user]);

  const handleSettingChange = (key: string, value: boolean | string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Appel API pour sauvegarder les modifications des paramètres de langue
      const response = await fetch(buildApiUrl('/users/me'), {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('translation.actions.updateError'));
      }

      const responseData = await response.json();
      
      // Mettre à jour l'utilisateur avec les données retournées par l'API
      const updatedUser: UserType = {
        ...user,
        ...responseData.data
      };
      
      onUserUpdate(updatedUser);
      toast.success(responseData.message || t('translation.actions.settingsUpdated'));
    } catch (err) {
      console.error('Erreur lors de la mise à jour des paramètres de langue:', err);
      toast.error(err instanceof Error ? err.message : t('translation.actions.updateError'));
    } finally {
      setIsLoading(false);
    }
  };

  const getLanguageFlag = (code: string) => {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
    return lang?.flag || '🌐';
  };

  const getLanguageName = (code: string) => {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
    return lang?.name || code;
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
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Globe className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('translation.mainLanguages.title')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('translation.mainLanguages.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="systemLanguage" className="text-sm sm:text-base">{t('translation.mainLanguages.systemLanguage')}</Label>
              <LanguageSelector
                value={settings.systemLanguage}
                onValueChange={(value) => handleSettingChange('systemLanguage', value)}
                placeholder={t('translation.mainLanguages.systemLanguage')}
                className="w-full"
              />
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('translation.mainLanguages.systemLanguageDescription')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="regionalLanguage" className="text-sm sm:text-base">{t('translation.mainLanguages.regionalLanguage')}</Label>
              <LanguageSelector
                value={settings.regionalLanguage}
                onValueChange={(value) => handleSettingChange('regionalLanguage', value)}
                placeholder={t('translation.mainLanguages.regionalLanguage')}
                className="w-full"
              />
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('translation.mainLanguages.regionalLanguageDescription')}
              </p>
            </div>

            <div className="space-y-2 lg:col-span-2 xl:col-span-1">
              <Label htmlFor="customDestinationLanguage" className="text-sm sm:text-base">{t('translation.mainLanguages.customDestinationLanguage')}</Label>
              <LanguageSelector
                value={settings.customDestinationLanguage || ""}
                onValueChange={(value) => handleSettingChange('customDestinationLanguage', value)}
                placeholder={t('translation.mainLanguages.selectLanguage')}
                className="w-full"
              />
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('translation.mainLanguages.customDestinationLanguageDescription')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Languages className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('translation.autoTranslation.title')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('translation.autoTranslation.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label htmlFor="autoTranslateEnabled" className="text-sm sm:text-base">{t('translation.autoTranslation.enabled')}</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('translation.autoTranslation.enabledDescription')}
              </p>
            </div>
            <Switch
              id="autoTranslateEnabled"
              checked={settings.autoTranslateEnabled}
              onCheckedChange={(checked) => handleSettingChange('autoTranslateEnabled', checked)}
            />
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Target className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('translation.preview.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <Badge variant="secondary" className="text-xs sm:text-sm w-fit">{t('translation.preview.systemLanguage')}</Badge>
              <span className="flex items-center gap-1 text-sm sm:text-base">
                {getLanguageFlag(settings.systemLanguage)} {getLanguageName(settings.systemLanguage)}
              </span>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <Badge variant="secondary" className="text-xs sm:text-sm w-fit">{t('translation.preview.regionalLanguage')}</Badge>
              <span className="flex items-center gap-1 text-sm sm:text-base">
                {getLanguageFlag(settings.regionalLanguage)} {getLanguageName(settings.regionalLanguage)}
              </span>
            </div>
            {settings.customDestinationLanguage && (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <Badge variant="secondary" className="text-xs sm:text-sm w-fit">{t('translation.preview.customLanguage')}</Badge>
                <span className="flex items-center gap-1 text-sm sm:text-base">
                  {getLanguageFlag(settings.customDestinationLanguage)} {getLanguageName(settings.customDestinationLanguage)}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <Badge variant={settings.autoTranslateEnabled ? "default" : "outline"} className="text-xs sm:text-sm w-fit">
                {t('translation.preview.autoTranslation')}
              </Badge>
              <span className="text-sm sm:text-base">{settings.autoTranslateEnabled ? t('translation.preview.enabled') : t('translation.preview.disabled')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-4">
        <Button 
          variant="outline" 
          className="w-full sm:w-auto" 
          onClick={() => {
            if (user) {
              setSettings({
                systemLanguage: user.systemLanguage,
                regionalLanguage: user.regionalLanguage,
                customDestinationLanguage: user.customDestinationLanguage || '',
                autoTranslateEnabled: user.autoTranslateEnabled,
              });
            }
          }}
        >
          {t('translation.actions.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={isLoading} className="w-full sm:w-auto">
          {isLoading ? t('translation.actions.saving') : t('translation.actions.save')}
        </Button>
      </div>
    </div>
  );
}
