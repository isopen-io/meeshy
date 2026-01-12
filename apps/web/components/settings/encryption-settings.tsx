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

const PREFERENCE_OPTIONS: {
  value: EncryptionPreference;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'disabled',
    label: 'Désactivé',
    description: 'Aucun chiffrement de bout en bout. Les messages transitent en clair sur le serveur.',
    icon: <ShieldOff className="h-5 w-5" />,
  },
  {
    value: 'optional',
    label: 'Optionnel',
    description: 'Le chiffrement E2EE est utilisé si le destinataire le supporte. Recommandé pour la compatibilité.',
    icon: <Shield className="h-5 w-5" />,
  },
  {
    value: 'always',
    label: 'Toujours',
    description: 'Force le chiffrement E2EE pour tous les messages. Les utilisateurs sans clés ne pourront pas vous contacter.',
    icon: <ShieldCheck className="h-5 w-5" />,
  },
];

export function EncryptionSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingKeys, setGeneratingKeys] = useState(false);
  const [data, setData] = useState<EncryptionData>(DEFAULT_ENCRYPTION_DATA);
  const [selectedPreference, setSelectedPreference] = useState<EncryptionPreference>('optional');
  const [hasChanges, setHasChanges] = useState(false);
  const [localSettings, setLocalSettings] = useState<LocalEncryptionSettings>(DEFAULT_LOCAL_SETTINGS);

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
        toast.error('Non authentifié');
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
          toast.success('Préférences de chiffrement mises à jour');
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error saving encryption preference:', error);
      toast.error('Erreur réseau');
    } finally {
      setSaving(false);
    }
  };

  const generateKeys = async () => {
    setGeneratingKeys(true);
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error('Non authentifié');
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
          toast.success('Clés de chiffrement générées avec succès');
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de la génération des clés');
      }
    } catch (error) {
      console.error('Error generating keys:', error);
      toast.error('Erreur réseau');
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
            État du chiffrement
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Statut de vos clés de chiffrement de bout en bout
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
                  {data.hasSignalKeys ? 'Clés de chiffrement actives' : 'Clés non générées'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.hasSignalKeys
                    ? `ID d'enregistrement: ${data.signalRegistrationId}`
                    : 'Générez vos clés pour activer le chiffrement E2EE'}
                </p>
              </div>
            </div>
            <Badge variant={data.hasSignalKeys ? 'default' : 'secondary'}>
              {data.hasSignalKeys ? 'Actif' : 'Inactif'}
            </Badge>
          </div>

          {data.hasSignalKeys && data.lastKeyRotation && (
            <div className="text-sm text-muted-foreground">
              Dernière rotation des clés: {new Date(data.lastKeyRotation).toLocaleDateString('fr-FR', {
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
                  Génération en cours...
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 mr-2" />
                  Générer les clés de chiffrement
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
            Nouvelles conversations
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Paramètres de chiffrement par défaut pour les nouvelles conversations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">Chiffrer par défaut</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Activer le chiffrement E2EE automatiquement pour les nouvelles conversations
              </p>
            </div>
            <Switch
              checked={localSettings.defaultEncryptionEnabled}
              onCheckedChange={(checked) => updateLocalSetting('defaultEncryptionEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">Afficher l&apos;indicateur</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Afficher l&apos;icône de chiffrement dans les conversations sécurisées
              </p>
            </div>
            <Switch
              checked={localSettings.showEncryptionIndicator}
              onCheckedChange={(checked) => updateLocalSetting('showEncryptionIndicator', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1">
              <Label className="text-sm sm:text-base">Chiffrer les médias</Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Exiger le chiffrement pour les photos, vidéos et fichiers
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
            Niveau de chiffrement
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Choisissez votre niveau de protection pour les messages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PREFERENCE_OPTIONS.map((option) => (
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
                  <span className="font-medium">{option.label}</span>
                  {selectedPreference === option.value && (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {option.description}
                </p>
              </div>
            </button>
          ))}

          {hasChanges && (
            <div className="flex justify-end pt-4">
              <Button onClick={savePreference} disabled={saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">À propos du chiffrement E2EE</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Le chiffrement de bout en bout (E2EE) garantit que seuls vous et votre correspondant
            pouvez lire vos messages. Même les serveurs Meeshy ne peuvent pas déchiffrer vos conversations.
          </p>
          <p>
            Meeshy utilise le protocole Signal, reconnu comme l&apos;un des plus sécurisés au monde.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Vos clés privées ne quittent jamais votre appareil</li>
            <li>Chaque message utilise une clé unique</li>
            <li>La rotation automatique des clés renforce la sécurité</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
