'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette, Monitor, Sun, Moon, Languages } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme, useAppActions, useCurrentInterfaceLanguage, useLanguageActions } from '@/stores';
import { useI18n } from '@/hooks/useI18n';
import { useLanguage } from '@/hooks/compatibility-hooks';
import { INTERFACE_LANGUAGES } from '@/types/frontend';

interface ThemeConfig {
  accentColor: string;
  fontSize: 'small' | 'medium' | 'large';
  compactMode: boolean;
  animationsEnabled: boolean;
  fontFamily: string;
  lineHeight: 'tight' | 'normal' | 'relaxed' | 'loose';
}

export function ThemeSettings() {
  const { t } = useI18n('settings');
  // Utiliser Zustand pour le thème global
  const theme = useTheme();
  const { setTheme } = useAppActions();
  // Utiliser Zustand pour la langue
  const currentInterfaceLanguage = useCurrentInterfaceLanguage();
  const { setInterfaceLanguage } = useLanguageActions();

  // Debug: afficher la langue actuelle
  useEffect(() => {
  }, [currentInterfaceLanguage]);
  
  const [config, setConfig] = useState<ThemeConfig>({
    accentColor: 'blue',
    fontSize: 'medium',
    compactMode: false,
    animationsEnabled: true,
    fontFamily: 'inter',
    lineHeight: 'normal',
  });

  useEffect(() => {
    const savedConfig = localStorage.getItem('meeshy-theme-config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      // Ne pas charger le thème depuis localStorage car géré par Zustand
      const { theme: _, ...rest } = parsed;
      setConfig({ ...config, ...rest });
    }
  }, []);

  const handleConfigChange = (key: keyof ThemeConfig, value: string | boolean) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    localStorage.setItem('meeshy-theme-config', JSON.stringify(newConfig));
    toast.success(t('theme.settingsUpdated'));
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto') => {
    setTheme(newTheme);
    toast.success(t('theme.settingsUpdated'));
  };

  const handleInterfaceLanguageChange = (languageCode: string) => {
    setInterfaceLanguage(languageCode);
    toast.success(t('theme.interfaceLanguageUpdated'));
 };

  const accentColors = [
    { value: 'blue', label: t('theme.accentColor.blue'), color: 'bg-blue-500' },
    { value: 'green', label: t('theme.accentColor.green'), color: 'bg-green-500' },
    { value: 'purple', label: t('theme.accentColor.purple'), color: 'bg-purple-500' },
    { value: 'red', label: t('theme.accentColor.red'), color: 'bg-red-500' },
    { value: 'orange', label: t('theme.accentColor.orange'), color: 'bg-orange-500' },
    { value: 'pink', label: t('theme.accentColor.pink'), color: 'bg-pink-500' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Palette className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('theme.title')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('theme.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <Label className="text-sm sm:text-base">{t('theme.displayMode.title')}</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => handleThemeChange('light')}
                className="flex items-center gap-2 justify-center sm:justify-start"
              >
                <Sun className="h-4 w-4" />
                <span className="text-sm sm:text-base">{t('theme.displayMode.light')}</span>
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => handleThemeChange('dark')}
                className="flex items-center gap-2 justify-center sm:justify-start"
              >
                <Moon className="h-4 w-4" />
                <span className="text-sm sm:text-base">{t('theme.displayMode.dark')}</span>
              </Button>
              <Button
                variant={theme === 'auto' ? 'default' : 'outline'}
                onClick={() => handleThemeChange('auto')}
                className="flex items-center gap-2 justify-center sm:justify-start"
              >
                <Monitor className="h-4 w-4" />
                <span className="text-sm sm:text-base">{t('theme.displayMode.system')}</span>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm sm:text-base">{t('theme.accentColor.title')}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {accentColors.map((color) => (
                <Button
                  key={color.value}
                  variant={config.accentColor === color.value ? 'default' : 'outline'}
                  onClick={() => handleConfigChange('accentColor', color.value)}
                  className="flex items-center gap-2 justify-center sm:justify-start text-sm"
                >
                  <div className={`w-3 h-3 rounded-full ${color.color}`} />
                  <span className="hidden sm:inline">{color.label}</span>
                </Button>
              ))}
            </div>
          </div>


        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{t('theme.ui.title')}</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('theme.ui.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Première ligne en deux colonnes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Colonne 1 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm sm:text-base">{t('theme.ui.fontSize.title')}</Label>
                <Select
                  value={config.fontSize}
                  onValueChange={(value) => handleConfigChange('fontSize', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">{t('theme.ui.fontSize.small')}</SelectItem>
                    <SelectItem value="medium">{t('theme.ui.fontSize.medium')}</SelectItem>
                    <SelectItem value="large">{t('theme.ui.fontSize.large')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm sm:text-base">{t('theme.ui.fontFamily.title')}</Label>
                <Select
                  value={config.fontFamily || 'inter'}
                  onValueChange={(value) => handleConfigChange('fontFamily', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inter">Inter</SelectItem>
                    <SelectItem value="nunito">Nunito</SelectItem>
                    <SelectItem value="poppins">Poppins</SelectItem>
                    <SelectItem value="open-sans">Open Sans</SelectItem>
                    <SelectItem value="lato">Lato</SelectItem>
                    <SelectItem value="comic-neue">Comic Neue</SelectItem>
                    <SelectItem value="lexend">Lexend</SelectItem>
                    <SelectItem value="roboto">Roboto</SelectItem>
                    <SelectItem value="geist">Geist</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('theme.ui.fontFamily.description')}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm sm:text-base">{t('theme.ui.lineHeight.title')}</Label>
                <Select
                  value={config.lineHeight || 'normal'}
                  onValueChange={(value) => handleConfigChange('lineHeight', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tight">{t('theme.ui.lineHeight.tight')}</SelectItem>
                    <SelectItem value="normal">{t('theme.ui.lineHeight.normal')}</SelectItem>
                    <SelectItem value="relaxed">{t('theme.ui.lineHeight.relaxed')}</SelectItem>
                    <SelectItem value="loose">{t('theme.ui.lineHeight.loose')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('theme.ui.lineHeight.description')}
                </p>
              </div>
            </div>

            {/* Colonne 2 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm sm:text-base">{t('theme.ui.interfaceLanguage.title')}</Label>
                <Select
                  value={currentInterfaceLanguage}
                  onValueChange={handleInterfaceLanguageChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERFACE_LANGUAGES.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        <div className="flex items-center gap-2">
                          <span>{language.flag}</span>
                          <span>{language.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('theme.ui.interfaceLanguage.description')}
                </p>
              </div>

              <div className="flex flex-col gap-3 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 flex-1">
                    <Label className="text-sm sm:text-base">{t('theme.ui.compactMode.title')}</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {t('theme.ui.compactMode.description')}
                    </p>
                  </div>
                  <Switch
                    checked={config.compactMode}
                    onCheckedChange={(checked) => handleConfigChange('compactMode', checked)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 flex-1">
                    <Label className="text-sm sm:text-base">{t('theme.ui.animations.title')}</Label>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {t('theme.ui.animations.description')}
                    </p>
                  </div>
                  <Switch
                    checked={config.animationsEnabled}
                    onCheckedChange={(checked) => handleConfigChange('animationsEnabled', checked)}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{t('theme.preview.title')}</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('theme.preview.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-3 sm:p-4 border rounded-lg bg-muted/50">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span 
                  className={`font-medium ${config.fontSize === 'small' ? 'text-sm' : config.fontSize === 'large' ? 'text-lg' : 'text-base'}`}
                  style={{ 
                    fontFamily: `var(--font-${config.fontFamily})`,
                    lineHeight: config.lineHeight === 'tight' ? '1.25' : 
                               config.lineHeight === 'relaxed' ? '1.75' : 
                               config.lineHeight === 'loose' ? '2' : '1.5'
                  }}
                >
                                    {t('theme.preview.exampleMessage')}
                </span>
                <span className="text-xs text-muted-foreground">12:34</span>
              </div>
              <p 
                className={`text-muted-foreground ${config.fontSize === 'small' ? 'text-xs' : config.fontSize === 'large' ? 'text-base' : 'text-sm'}`}
                style={{ 
                  fontFamily: `var(--font-${config.fontFamily})`,
                  lineHeight: config.lineHeight === 'tight' ? '1.25' : 
                             config.lineHeight === 'relaxed' ? '1.75' : 
                             config.lineHeight === 'loose' ? '2' : '1.5'
                }}
              >
                                {t('theme.preview.exampleText')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
