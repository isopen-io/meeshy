'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { User } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

interface VoiceProfileConsentProps {
  hasConsent: boolean;
  hasVoiceCloningConsent: boolean;
  onConsentChange: (type: 'recording' | 'cloning', granted: boolean) => void;
}

/**
 * Component pour gérer les consentements vocaux
 * Features:
 * - Toggle consentement enregistrement
 * - Toggle consentement clonage
 * - Description claire des permissions
 */
export function VoiceProfileConsent({
  hasConsent,
  hasVoiceCloningConsent,
  onConsentChange,
}: VoiceProfileConsentProps) {
  const { t } = useI18n('settings');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          {t('voiceProfile.consents.title', 'Consentements vocaux')}
        </CardTitle>
        <CardDescription>
          {t('voiceProfile.consents.description', 'Autorisations requises pour créer et utiliser votre profil vocal')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>{t('voiceProfile.consents.recording', 'Enregistrement vocal')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('voiceProfile.consents.recordingDesc', 'Permet de créer un profil vocal à partir de votre voix')}
            </p>
          </div>
          <Switch
            checked={hasConsent}
            onCheckedChange={(checked) => onConsentChange('recording', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>{t('voiceProfile.consents.cloning', 'Clonage vocal')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('voiceProfile.consents.cloningDesc', 'Permet de cloner votre voix dans d\'autres langues')}
            </p>
          </div>
          <Switch
            checked={hasVoiceCloningConsent}
            onCheckedChange={(checked) => onConsentChange('cloning', checked)}
            disabled={!hasConsent}
          />
        </div>
      </CardContent>
    </Card>
  );
}
