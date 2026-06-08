'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, INTERFACE_LANGUAGES } from '@/types';
import { Globe } from 'lucide-react';
import { LanguageSelector } from '@/components/translation/language-selector';
import { useI18n } from '@/hooks/useI18n';

interface UserSettingsContentProps {
  user: User | null;
  localSettings: Partial<User>;
  onSettingUpdate: (key: keyof User, value: string | boolean) => void;
  children?: React.ReactNode;
}

export function UserSettingsContent({ user, localSettings, onSettingUpdate, children }: UserSettingsContentProps) {
  const { t } = useI18n('settings');
  const _getLanguageDisplay = (code: string) => {
    const lang = INTERFACE_LANGUAGES.find(l => l.code === code);
    return lang ? `${lang.flag} ${lang.name}` : code;
  };

  if (!user) return null;

  return (
    <div className="w-full">
      <Tabs defaultValue="translation" className="w-full">
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="translation" className="gap-2">
            <Globe className="h-4 w-4" />
            {t('tabs.translation')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="translation" className="space-y-4">
          {/* Configuration des langues */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('translation.mainLanguages.configurationTitle')}</CardTitle>
              <CardDescription>
                {t('translation.mainLanguages.configurationDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="systemLanguage">{t('translation.mainLanguages.systemLanguage')}</Label>
                  <LanguageSelector
                    value={localSettings.systemLanguage || ''}
                    onValueChange={(value) => onSettingUpdate('systemLanguage', value)}
                    placeholder={t('translation.mainLanguages.systemLanguagePlaceholder')}
                    interfaceOnly={false}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="regionalLanguage">{t('translation.mainLanguages.regionalLanguage')}</Label>
                  <LanguageSelector
                    value={localSettings.regionalLanguage || ''}
                    onValueChange={(value) => onSettingUpdate('regionalLanguage', value)}
                    placeholder={t('translation.mainLanguages.regionalLanguagePlaceholder')}
                    interfaceOnly={false}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customDestinationLanguage">{t('translation.mainLanguages.customDestinationLanguage')}</Label>
                <LanguageSelector
                  value={localSettings.customDestinationLanguage || ''}
                  onValueChange={(value) => onSettingUpdate('customDestinationLanguage', value)}
                  placeholder={t('translation.mainLanguages.customLanguagePlaceholder')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Paramètres de traduction */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('translation.autoTranslation.settingsTitle')}</CardTitle>
              <CardDescription>
                {t('translation.autoTranslation.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="autoTranslate" className="text-base font-medium">
                    {t('translation.autoTranslation.enabled')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('translation.autoTranslation.enabledDescription')}
                  </p>
                </div>
                <Switch
                  id="autoTranslate"
                  checked={localSettings.autoTranslateEnabled || false}
                  onCheckedChange={(checked) => onSettingUpdate('autoTranslateEnabled', checked)}
                />
              </div>

            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {children}
    </div>
  );
}
