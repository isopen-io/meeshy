'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, AlertCircle, Trash2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { VoiceProfileDetails } from '@meeshy/shared/types/voice-api';

interface VoiceProfileInfoProps {
  profile: VoiceProfileDetails;
  onDelete: () => void;
}

/**
 * Component pour afficher les informations du profil vocal existant
 * Features:
 * - Affichage des métriques (qualité, durée, version)
 * - Indication de besoin de calibration
 * - Bouton de suppression
 */
export function VoiceProfileInfo({ profile, onDelete }: VoiceProfileInfoProps) {
  const { t } = useI18n('settings');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Check className="h-5 w-5 text-green-500" />
          {t('voiceProfile.existing.title', 'Profil vocal actif')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground">{t('voiceProfile.existing.quality', 'Qualité')}</Label>
            <p className="font-medium">{profile.qualityScore}%</p>
          </div>
          <div>
            <Label className="text-muted-foreground">{t('voiceProfile.existing.duration', 'Durée audio')}</Label>
            <p className="font-medium">{(profile.audioDurationMs / 1000).toFixed(1)}s</p>
          </div>
          <div>
            <Label className="text-muted-foreground">{t('voiceProfile.existing.version', 'Version')}</Label>
            <p className="font-medium">v{profile.version}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">{t('voiceProfile.existing.expires', 'Expire')}</Label>
            <p className="font-medium">
              {profile.expiresAt
                ? new Date(profile.expiresAt).toLocaleDateString()
                : t('voiceProfile.existing.noExpiry', 'Pas d\'expiration')
              }
            </p>
          </div>
        </div>

        {profile.needsCalibration && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('voiceProfile.existing.needsCalibration', 'Votre profil nécessite une mise à jour pour maintenir sa qualité.')}
            </AlertDescription>
          </Alert>
        )}

        <Button variant="destructive" onClick={onDelete} className="w-full">
          <Trash2 className="h-4 w-4 mr-2" />
          {t('voiceProfile.existing.delete', 'Supprimer le profil vocal')}
        </Button>
      </CardContent>
    </Card>
  );
}
