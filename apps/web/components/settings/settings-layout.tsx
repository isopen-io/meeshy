'use client';

import { useState, useEffect, useCallback } from 'react';
import { ResponsiveLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Languages,
  Bell,
  Shield,
  User,
  Palette,
  Save,
  RotateCcw,
  Lock,
  Mic,
  FileAudio,
  Video,
  Info
} from 'lucide-react';
import { User as UserType, SUPPORTED_LANGUAGES, LanguageCode } from '@/types';
import { FontSelector } from '@/components/settings/font-selector';
import { LanguageSelector } from '@/components/settings/language-selector';
import { toast } from 'sonner';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { useI18n } from '@/hooks/useI18n';
import { authManager } from '@/services/auth-manager.service';

interface SettingsLayoutProps {
  currentUser: UserType;
  initialTab?: string;
}

interface SettingsSection {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function SettingsLayout({ currentUser, initialTab = 'profile' }: SettingsLayoutProps) {

  const { t } = useI18n('settings');
  // États principaux
  const [selectedSection, setSelectedSection] = useState<string>(initialTab);
  const [localSettings, setLocalSettings] = useState<Partial<UserType>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sections des paramètres
  const settingsSections: SettingsSection[] = [
    {
      id: 'profile',
      title: t('profile.title'),
      description: t('profile.description'),
      icon: User
    },
    {
      id: 'language',
      title: t('language.title'),
      description: t('language.description'),
      icon: Languages
    },
    {
      id: 'notifications',
      title: t('notifications.title'),
      description: t('notifications.description'),
      icon: Bell
    },
    {
      id: 'privacy',
      title: t('privacy.title'),
      description: t('privacy.description'),
      icon: Shield
    },
    {
      id: 'appearance',
      title: t('theme.title'),
      description: t('theme.description'),
      icon: Palette
    }
  ];

  // Initialiser les paramètres locaux
  useEffect(() => {
    setLocalSettings({
      systemLanguage: currentUser.systemLanguage,
      regionalLanguage: currentUser.regionalLanguage,
      customDestinationLanguage: currentUser.customDestinationLanguage,
      autoTranslateEnabled: currentUser.autoTranslateEnabled,
      translateToSystemLanguage: currentUser.translateToSystemLanguage,
      translateToRegionalLanguage: currentUser.translateToRegionalLanguage,
      useCustomDestination: currentUser.useCustomDestination,
      // Encryption & Transcription
      encryptionPreference: currentUser.encryptionPreference || 'optional',
      autoTranscriptionEnabled: (currentUser as { autoTranscriptionEnabled?: boolean }).autoTranscriptionEnabled ?? true,
    });
  }, [currentUser]);

  // Sauvegarder les paramètres
  const saveSettings = useCallback(async () => {
    setIsSaving(true);
    try {
      const token = authManager.getAuthToken();
      const response = await fetch(buildApiUrl(API_ENDPOINTS.AUTH.ME), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(localSettings)
      });

      if (response.ok) {
        setHasChanges(false);
        toast.success('Paramètres sauvegardés avec succès');
      } else {
        toast.error('Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  }, [localSettings]);

  // Réinitialiser les paramètres
  const resetSettings = useCallback(() => {
    setLocalSettings({
      systemLanguage: currentUser.systemLanguage,
      regionalLanguage: currentUser.regionalLanguage,
      customDestinationLanguage: currentUser.customDestinationLanguage,
      autoTranslateEnabled: currentUser.autoTranslateEnabled,
      translateToSystemLanguage: currentUser.translateToSystemLanguage,
      translateToRegionalLanguage: currentUser.translateToRegionalLanguage,
      useCustomDestination: currentUser.useCustomDestination,
      // Encryption & Transcription
      encryptionPreference: currentUser.encryptionPreference || 'optional',
      autoTranscriptionEnabled: (currentUser as { autoTranscriptionEnabled?: boolean }).autoTranscriptionEnabled ?? true,
    });
    setHasChanges(false);
    toast.info('Paramètres réinitialisés');
  }, [currentUser]);

  // Mettre à jour un paramètre
  const updateSetting = useCallback((key: string, value: unknown) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  // Contenu de la sidebar
  const sidebarContent = (
    <div className="space-y-2">
      {settingsSections.map((section) => {
        const IconComponent = section.icon;
        return (
          <Card 
            key={section.id}
            className={`cursor-pointer transition-colors hover:bg-gray-50 ${
              selectedSection === section.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
            }`}
            onClick={() => setSelectedSection(section.id)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <IconComponent className="w-4 h-4 mr-2" />
                {section.title}
              </CardTitle>
              <CardDescription className="text-xs">
                {section.description}
              </CardDescription>
            </CardHeader>
          </Card>
        );
      })}

      {/* Actions de sauvegarde */}
      {hasChanges && (
        <>
          <Separator className="my-4" />
          <div className="space-y-2">
            <Button 
              onClick={saveSettings} 
              disabled={isSaving}
              className="w-full"
              size="sm"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
            <Button 
              onClick={resetSettings} 
              variant="outline"
              className="w-full"
              size="sm"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Réinitialiser
            </Button>
          </div>
        </>
      )}
    </div>
  );

  // Rendu du contenu selon la section sélectionnée
  const renderSectionContent = () => {
    switch (selectedSection) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Informations du profil</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nom d'utilisateur</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded-md">
                    {currentUser.username}
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded-md">
                    {currentUser.email}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'language':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Paramètres de langue</h3>
              
              {/* Section Interface - Langues limitées */}
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">Langue d'interface</Label>
                  <p className="text-sm text-gray-500 mb-3">Choisissez la langue de l'interface utilisateur</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="systemLanguage" className="text-sm">Langue du système</Label>
                      <LanguageSelector
                        value={localSettings.systemLanguage}
                        onValueChange={(value) => updateSetting('systemLanguage', value)}
                        languages={SUPPORTED_LANGUAGES}
                        placeholder="Choisir la langue du système"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="regionalLanguage" className="text-sm">Langue régionale</Label>
                      <LanguageSelector
                        value={localSettings.regionalLanguage}
                        onValueChange={(value) => updateSetting('regionalLanguage', value)}
                        languages={SUPPORTED_LANGUAGES}
                        placeholder="Choisir la langue régionale"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Section Traduction - Options en 2 colonnes */}
                <div>
                  <Label className="text-base font-medium">Options de traduction</Label>
                  <p className="text-sm text-gray-500 mb-3">Configurez la traduction automatique des messages</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="text-sm font-medium">Traduction automatique</Label>
                        <p className="text-xs text-gray-500">Activer la traduction automatique</p>
                      </div>
                      <Switch
                        checked={localSettings.autoTranslateEnabled}
                        onCheckedChange={(checked) => updateSetting('autoTranslateEnabled', checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="text-sm font-medium">Traduire vers la langue système</Label>
                        <p className="text-xs text-gray-500">Traduire vers votre langue système</p>
                      </div>
                      <Switch
                        checked={localSettings.translateToSystemLanguage}
                        onCheckedChange={(checked) => updateSetting('translateToSystemLanguage', checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="text-sm font-medium">Traduire vers la langue régionale</Label>
                        <p className="text-xs text-gray-500">Traduire vers votre langue régionale</p>
                      </div>
                      <Switch
                        checked={localSettings.translateToRegionalLanguage}
                        onCheckedChange={(checked) => updateSetting('translateToRegionalLanguage', checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="text-sm font-medium">Utiliser une langue personnalisée</Label>
                        <p className="text-xs text-gray-500">Définir une langue de destination spécifique</p>
                      </div>
                      <Switch
                        checked={localSettings.useCustomDestination}
                        onCheckedChange={(checked) => updateSetting('useCustomDestination', checked)}
                      />
                    </div>
                  </div>
                </div>

                {/* Section Langue personnalisée */}
                {localSettings.useCustomDestination && (
                  <div>
                    <Label htmlFor="customDestinationLanguage" className="text-sm">Langue de destination personnalisée</Label>
                    <LanguageSelector
                      value={localSettings.customDestinationLanguage || ''}
                      onValueChange={(value) => updateSetting('customDestinationLanguage', value)}
                      languages={SUPPORTED_LANGUAGES}
                      placeholder="Choisir une langue de destination"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Paramètres de notification</h3>
              <div className="text-center text-gray-500 py-8">
                Paramètres de notification à implémenter
              </div>
            </div>
          </div>
        );

      case 'privacy':
        return (
          <div className="space-y-6">
            {/* Section Encryption */}
            <div>
              <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-600" />
                Chiffrement des conversations
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Configurez le niveau de chiffrement par défaut pour vos nouvelles conversations
              </p>

              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-gray-50/50">
                  <Label className="text-sm font-medium mb-3 block">
                    Mode de chiffrement par défaut
                  </Label>
                  <Select
                    value={localSettings.encryptionPreference as string || 'optional'}
                    onValueChange={(value) => updateSetting('encryptionPreference', value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisir le mode de chiffrement" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disabled">
                        <div className="flex flex-col">
                          <span className="font-medium">Désactivé</span>
                          <span className="text-xs text-gray-500">Pas de chiffrement - Traduction disponible</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="optional">
                        <div className="flex flex-col">
                          <span className="font-medium">Optionnel (Recommandé)</span>
                          <span className="text-xs text-gray-500">Choisir par conversation - Équilibre sécurité/fonctionnalités</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="always">
                        <div className="flex flex-col">
                          <span className="font-medium">Toujours actif</span>
                          <span className="text-xs text-gray-500">E2EE automatique - Maximum de sécurité</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Info box about encryption modes */}
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-blue-700">
                        <p className="font-medium mb-1">À propos du chiffrement:</p>
                        <ul className="space-y-1 list-disc list-inside">
                          <li><strong>E2EE</strong>: Chiffrement de bout-en-bout (Signal Protocol) - Pas de traduction possible</li>
                          <li><strong>Hybride</strong>: Double chiffrement - Traduction disponible</li>
                          <li><strong>Serveur</strong>: Chiffrement côté serveur - Traduction disponible</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section Transcription */}
            <div>
              <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                <Mic className="w-5 h-5 text-purple-600" />
                Transcription automatique
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Transcrivez automatiquement les messages audio et vidéo sur votre appareil
              </p>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50/50">
                  <div className="flex items-start gap-3">
                    <FileAudio className="w-5 h-5 text-purple-600 mt-0.5" />
                    <div>
                      <Label className="text-sm font-medium">Transcrire les audios automatiquement</Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Convertit automatiquement les messages vocaux en texte lorsqu'aucune transcription n'existe
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={localSettings.autoTranscriptionEnabled as boolean ?? true}
                    onCheckedChange={(checked) => updateSetting('autoTranscriptionEnabled', checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50/50 opacity-60">
                  <div className="flex items-start gap-3">
                    <Video className="w-5 h-5 text-purple-600 mt-0.5" />
                    <div>
                      <Label className="text-sm font-medium">Transcrire les vidéos automatiquement</Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Extrait le texte des vidéos (bientôt disponible)
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={false}
                    disabled
                  />
                </div>

                {/* Info about on-device transcription */}
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-md">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-purple-700">
                      <p className="font-medium mb-1">Transcription locale:</p>
                      <p>
                        La transcription s'effectue directement sur votre appareil pour préserver votre confidentialité.
                        Cela peut consommer plus de batterie et de données mobiles.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section Translation (linked) */}
            <div>
              <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                <Languages className="w-5 h-5 text-green-600" />
                Traduction automatique
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Configurez la traduction automatique dans l'onglet "Langue"
              </p>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Traduction automatique activée</Label>
                  <p className="text-xs text-gray-500 mt-1">
                    {localSettings.autoTranslateEnabled
                      ? 'Les messages seront traduits automatiquement'
                      : 'Cliquez pour activer la traduction automatique'}
                  </p>
                </div>
                <Switch
                  checked={localSettings.autoTranslateEnabled as boolean ?? false}
                  onCheckedChange={(checked) => updateSetting('autoTranslateEnabled', checked)}
                />
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Paramètres d'apparence</h3>
              <p className="text-sm text-gray-500 mb-6">
                Personnalisez l'apparence de votre interface utilisateur
              </p>
              
              {/* Sélecteur de police avec aperçus visuels */}
              <FontSelector />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Contenu principal
  const mainContent = (
    <div className="h-full">
      <ScrollArea className="h-full">
        <div className="p-6">
          {renderSectionContent()}
        </div>
      </ScrollArea>
    </div>
  );

  const selectedSectionData = settingsSections.find(s => s.id === selectedSection);

  return (
    <ResponsiveLayout>
      <div className="h-full flex bg-background">
        {/* Sidebar */}
        <div className="w-80 border-r bg-card/50 flex flex-col">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold">Paramètres</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {sidebarContent}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{selectedSectionData?.title}</h1>
                <p className="text-muted-foreground">{selectedSectionData?.description}</p>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            {mainContent}
          </div>
        </div>
      </div>
    </ResponsiveLayout>
  );
}
