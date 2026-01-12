'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Key, RefreshCw, CheckCircle, AlertTriangle, Lock, ShieldOff, ShieldCheck, MessageSquare } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { API_CONFIG } from '@/lib/config';
import { cn } from '@/lib/utils';
import { authManager } from '@/services/auth-manager.service';
import { useI18n } from '@/hooks/useI18n';

type EncryptionPreference = 'disabled' | 'optional' | 'always';

interface EncryptionData {
  encryptionPreference: EncryptionPreference;
  hasSignalKeys: boolean;
  signalRegistrationId: number | null;
  signalPreKeyBundleVersion: number | null;
  lastKeyRotation: string | null;
}

const DEFAULT_ENCRYPTION_DATA: EncryptionData = {
  encryptionPreference: 'optional',
  hasSignalKeys: false,
  signalRegistrationId: null,
  signalPreKeyBundleVersion: null,
  lastKeyRotation: null,
};

// Local encryption settings (stored in localStorage)
interface LocalEncryptionSettings {
  defaultEncryptionEnabled: boolean;
  showEncryptionIndicator: boolean;
  requireEncryptionForMedia: boolean;
}

const LOCAL_SETTINGS_KEY = 'meeshy-encryption-settings';

const DEFAULT_LOCAL_SETTINGS: LocalEncryptionSettings = {
  defaultEncryptionEnabled: true,
  showEncryptionIndicator: true,
  requireEncryptionForMedia: true,
};

export function EncryptionSettings() {
  const { t } = useI18n('settings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingKeys, setGeneratingKeys] = useState(false);
  const [data, setData] = useState<EncryptionData>(DEFAULT_ENCRYPTION_DATA);
  const [selectedPreference, setSelectedPreference] = useState<EncryptionPreference>('optional');
  const [hasChanges, setHasChanges] = useState(false);
  const [localSettings, setLocalSettings] = useState<LocalEncryptionSettings>(DEFAULT_LOCAL_SETTINGS);

  // Preference options with translations
  const preferenceOptions: {
    value: EncryptionPreference;
    labelKey: string;
    descriptionKey: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'disabled',
      labelKey: 'encryption.level.disabled.label',
      descriptionKey: 'encryption.level.disabled.description',
      icon: <ShieldOff className="h-5 w-5" />,
    },
    {
      value: 'optional',
      labelKey: 'encryption.level.optional.label',
      descriptionKey: 'encryption.level.optional.description',
      icon: <Shield className="h-5 w-5" />,
    },
    {
      value: 'always',
      labelKey: 'encryption.level.always.label',
      descriptionKey: 'encryption.level.always.description',
      icon: <ShieldCheck className="h-5 w-5" />,
    },
  ];

  // Load local settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_SETTINGS_KEY);
      if (saved) {
        setLocalSettings({ ...DEFAULT_LOCAL_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (error) {
      console.error('Error loading local encryption settings:', error);
    }
  }, []);

  // Save local settings to localStorage
  const updateLocalSetting = (key: keyof LocalEncryptionSettings, value: boolean) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(newSettings));
  };

  useEffect(() => {
    loadEncryptionPreferences();
  }, []);

  useEffect(() => {
    setHasChanges(selectedPreference !== data.encryptionPreference);
  }, [selectedPreference, data.encryptionPreference]);

  const loadEncryptionPreferences = async () => {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_CONFIG.getApiUrl()}/api/users/me/encryption-preferences`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setData(result.data);
          setSelectedPreference(result.data.encryptionPreference || 'optional');
        }
      }
    } catch (error) {
      console.error('Error loading encryption preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePreference = async () => {
    setSaving(true);
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error(t('encryption.errors.notAuthenticated'));
        return;
      }

      const response = await fetch(`${API_CONFIG.getApiUrl()}/api/users/me/encryption-preferences`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ encryptionPreference: selectedPreference }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setData(prev => ({ ...prev, encryptionPreference: selectedPreference }));
          setHasChanges(false);
          toast.success(t('encryption.actions.preferencesUpdated'));
        }
      } else {
        const error = await response.json();
        toast.error(error.error || t('encryption.errors.updateFailed'));
      }
    } catch (error) {
      console.error('Error saving encryption preference:', error);
      toast.error(t('encryption.errors.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const generateKeys = async () => {
    setGeneratingKeys(true);
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error(t('encryption.errors.notAuthenticated'));
        return;
      }

      const response = await fetch(`${API_CONFIG.getApiUrl()}/api/users/me/encryption-keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setData(prev => ({
            ...prev,
            hasSignalKeys: true,
            signalRegistrationId: result.data.signalRegistrationId,
            signalPreKeyBundleVersion: result.data.signalPreKeyBundleVersion,
            lastKeyRotation: new Date().toISOString(),
          }));
          toast.success(t('encryption.status.keysGenerated'));
        }
      } else {
        const error = await response.json();
        toast.error(error.error || t('encryption.errors.generateFailed'));
      }
    } catch (error) {
      console.error('Error generating keys:', error);
      toast.error(t('encryption.errors.networkError'));
    } finally {
      setGeneratingKeys(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Encryption Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('encryption.status.title')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('encryption.status.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              {data.hasSignalKeys ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
              )}
              <div>
                <p className="font-medium">
                  {data.hasSignalKeys ? t('encryption.status.keysActive') : t('encryption.status.keysNotGenerated')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.hasSignalKeys
                    ? `${t('encryption.status.registrationId')}: ${data.signalRegistrationId}`
                    : t('encryption.status.generateKeys')}
                </p>
              </div>
            </div>
            <Badge variant={data.hasSignalKeys ? 'default' : 'secondary'}>
              {data.hasSignalKeys ? t('encryption.status.active') : t('encryption.status.inactive')}
            </Badge>
          </div>

          {data.hasSignalKeys && data.lastKeyRotation && (
            <div className="text-sm text-muted-foreground">
              {t('encryption.status.lastRotation')}: {new Date(data.lastKeyRotation).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}

          {!data.hasSignalKeys && (
            <Button
              onClick={generateKeys}
              disabled={generatingKeys}
              className="w-full sm:w-auto"
            >
              {generatingKeys ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t('encryption.status.generating')}
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 mr-2" />
                  {t('encryption.status.generateButton')}
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Default Encryption Settings for New Conversations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('encryption.newConversations.title')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('encryption.newConversations.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">{t('encryption.newConversations.defaultEnabled')}</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('encryption.newConversations.defaultEnabledDescription')}
              </p>
            </div>
            <Switch
              checked={localSettings.defaultEncryptionEnabled}
              onCheckedChange={(checked) => updateLocalSetting('defaultEncryptionEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">{t('encryption.newConversations.showIndicator')}</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('encryption.newConversations.showIndicatorDescription')}
              </p>
            </div>
            <Switch
              checked={localSettings.showEncryptionIndicator}
              onCheckedChange={(checked) => updateLocalSetting('showEncryptionIndicator', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">{t('encryption.newConversations.encryptMedia')}</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('encryption.newConversations.encryptMediaDescription')}
              </p>
            </div>
            <Switch
              checked={localSettings.requireEncryptionForMedia}
              onCheckedChange={(checked) => updateLocalSetting('requireEncryptionForMedia', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Encryption Preference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Lock className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('encryption.level.title')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('encryption.level.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {preferenceOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedPreference(option.value)}
              className={cn(
                'w-full flex items-start gap-4 p-4 rounded-lg border text-left transition-colors',
                selectedPreference === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              )}
            >
              <div className={cn(
                'mt-0.5 p-2 rounded-full',
                selectedPreference === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}>
                {option.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t(option.labelKey)}</span>
                  {selectedPreference === option.value && (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t(option.descriptionKey)}
                </p>
              </div>
            </button>
          ))}

          {hasChanges && (
            <div className="flex justify-end pt-4">
              <Button onClick={savePreference} disabled={saving}>
                {saving ? t('encryption.actions.saving') : t('encryption.actions.save')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('encryption.about.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {t('encryption.about.description')}
          </p>
          <p>
            {t('encryption.about.protocol')}
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('encryption.about.features.privateKeys')}</li>
            <li>{t('encryption.about.features.uniqueKeys')}</li>
            <li>{t('encryption.about.features.autoRotation')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
