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
import {
  useUserPreferencesStore,
  useEncryptionPreferences,
  type EncryptionPreference,
} from '@/stores';

export function EncryptionSettings() {
  const { t } = useI18n('settings');

  // Use centralized store
  const {
    preferences: encryptionData,
    update: updateEncryption,
    updateLocalSettings,
    sync: syncEncryption,
  } = useEncryptionPreferences();

  const isLoading = useUserPreferencesStore(state => state.isLoading);
  const isInitialized = useUserPreferencesStore(state => state.isInitialized);

  const [saving, setSaving] = useState(false);
  const [generatingKeys, setGeneratingKeys] = useState(false);
  const [selectedPreference, setSelectedPreference] = useState<EncryptionPreference>(
    encryptionData.encryptionPreference
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Sync selected preference with store when data changes
  useEffect(() => {
    setSelectedPreference(encryptionData.encryptionPreference);
  }, [encryptionData.encryptionPreference]);

  // Track changes
  useEffect(() => {
    setHasChanges(selectedPreference !== encryptionData.encryptionPreference);
  }, [selectedPreference, encryptionData.encryptionPreference]);

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

  const savePreference = async () => {
    setSaving(true);
    try {
      await updateEncryption({ encryptionPreference: selectedPreference });
      setHasChanges(false);
      toast.success(t('encryption.actions.preferencesUpdated'));
    } catch (error) {
      console.error('Error saving encryption preference:', error);
      toast.error(t('encryption.errors.updateFailed'));
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

      const response = await fetch(`${API_CONFIG.getApiUrl()}/users/me/encryption-keys`, {
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
          // Sync the store to get the updated key data
          await syncEncryption();
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

  if (!isInitialized || isLoading) {
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
              {encryptionData.hasSignalKeys ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
              )}
              <div>
                <p className="font-medium">
                  {encryptionData.hasSignalKeys ? t('encryption.status.keysActive') : t('encryption.status.keysNotGenerated')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {encryptionData.hasSignalKeys
                    ? `${t('encryption.status.registrationId')}: ${encryptionData.signalRegistrationId}`
                    : t('encryption.status.generateKeys')}
                </p>
              </div>
            </div>
            <Badge variant={encryptionData.hasSignalKeys ? 'default' : 'secondary'}>
              {encryptionData.hasSignalKeys ? t('encryption.status.active') : t('encryption.status.inactive')}
            </Badge>
          </div>

          {encryptionData.hasSignalKeys && encryptionData.lastKeyRotation && (
            <div className="text-sm text-muted-foreground">
              {t('encryption.status.lastRotation')}: {new Date(encryptionData.lastKeyRotation).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}

          {!encryptionData.hasSignalKeys && (
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
              checked={encryptionData.localSettings.autoEncryptNewConversations}
              onCheckedChange={(checked) => updateLocalSettings({ autoEncryptNewConversations: checked })}
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
              checked={encryptionData.localSettings.showEncryptionStatus}
              onCheckedChange={(checked) => updateLocalSettings({ showEncryptionStatus: checked })}
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
              checked={encryptionData.localSettings.warnOnUnencrypted}
              onCheckedChange={(checked) => updateLocalSettings({ warnOnUnencrypted: checked })}
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
