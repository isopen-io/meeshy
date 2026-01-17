'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Settings, Save, RotateCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { useVoiceSettings } from '@/hooks/use-voice-settings';
import type { VoiceCloningQualityPreset } from '@meeshy/shared/types/voice-api';
import { useEffect } from 'react';

interface VoiceSettingsPanelProps {
  profileExists: boolean;
  reducedMotion: boolean;
}

/**
 * Component pour gérer les paramètres de clonage vocal
 * Features:
 * - Preset de qualité (fast/balanced/high_quality)
 * - Sliders pour exaggeration, cfg_weight, temperature, top_p
 * - Sauvegarde et reset des paramètres
 * - Indication de changements non sauvegardés
 */
export function VoiceSettingsPanel({ profileExists, reducedMotion }: VoiceSettingsPanelProps) {
  const { t } = useI18n('settings');
  const {
    voiceCloningSettings,
    isSavingSettings,
    hasUnsavedChanges,
    loadSettings,
    updateSetting,
    saveSettings,
    resetSettings,
  } = useVoiceSettings();

  // Charger les paramètres quand le profil existe
  useEffect(() => {
    if (profileExists) {
      loadSettings();
    }
  }, [profileExists, loadSettings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t('voiceProfile.settings.title', 'Paramètres de clonage vocal')}
        </CardTitle>
        <CardDescription>
          {t('voiceProfile.settings.description', 'Ajustez les paramètres pour personnaliser le rendu de votre voix clonée')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preset de qualité */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t('voiceProfile.settings.qualityPreset', 'Preset de qualité')}</Label>
            <Badge variant="outline">{voiceCloningSettings.voiceCloningQualityPreset}</Badge>
          </div>
          <Select
            value={voiceCloningSettings.voiceCloningQualityPreset}
            onValueChange={(value: VoiceCloningQualityPreset) =>
              updateSetting('voiceCloningQualityPreset', value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fast">
                {t('voiceProfile.settings.presetFast', '⚡ Rapide - Génération plus rapide')}
              </SelectItem>
              <SelectItem value="balanced">
                {t('voiceProfile.settings.presetBalanced', '⚖️ Équilibré - Recommandé')}
              </SelectItem>
              <SelectItem value="high_quality">
                {t('voiceProfile.settings.presetHighQuality', '✨ Haute qualité - Meilleur rendu')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Exagération (Expressivité) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t('voiceProfile.settings.exaggeration', 'Expressivité')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('voiceProfile.settings.exaggerationDesc', 'Amplifie les caractéristiques vocales')}
              </p>
            </div>
            <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
              {voiceCloningSettings.voiceCloningExaggeration.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[voiceCloningSettings.voiceCloningExaggeration]}
            onValueChange={([value]) => updateSetting('voiceCloningExaggeration', value)}
            min={0}
            max={1}
            step={0.05}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('voiceProfile.settings.natural', 'Naturel')}</span>
            <span>{t('voiceProfile.settings.expressive', 'Expressif')}</span>
          </div>
        </div>

        {/* CFG Weight */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t('voiceProfile.settings.cfgWeight', 'Guidance (CFG)')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('voiceProfile.settings.cfgWeightDesc', 'Fidélité au texte vs créativité. 0 = réduit le transfert d\'accent')}
              </p>
            </div>
            <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
              {voiceCloningSettings.voiceCloningCfgWeight.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[voiceCloningSettings.voiceCloningCfgWeight]}
            onValueChange={([value]) => updateSetting('voiceCloningCfgWeight', value)}
            min={0}
            max={1}
            step={0.05}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('voiceProfile.settings.creative', 'Créatif')}</span>
            <span>{t('voiceProfile.settings.strict', 'Strict')}</span>
          </div>
        </div>

        {/* Température */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t('voiceProfile.settings.temperature', 'Température')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('voiceProfile.settings.temperatureDesc', 'Variabilité de la génération')}
              </p>
            </div>
            <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
              {voiceCloningSettings.voiceCloningTemperature.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[voiceCloningSettings.voiceCloningTemperature]}
            onValueChange={([value]) => updateSetting('voiceCloningTemperature', value)}
            min={0.1}
            max={2}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('voiceProfile.settings.deterministic', 'Déterministe')}</span>
            <span>{t('voiceProfile.settings.variable', 'Variable')}</span>
          </div>
        </div>

        {/* Top-P */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>{t('voiceProfile.settings.topP', 'Top-P (Nucleus)')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('voiceProfile.settings.topPDesc', 'Filtrage des tokens improbables')}
              </p>
            </div>
            <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
              {voiceCloningSettings.voiceCloningTopP.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[voiceCloningSettings.voiceCloningTopP]}
            onValueChange={([value]) => updateSetting('voiceCloningTopP', value)}
            min={0.5}
            max={1}
            step={0.05}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('voiceProfile.settings.focused', 'Focalisé')}</span>
            <span>{t('voiceProfile.settings.diverse', 'Diversifié')}</span>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={resetSettings}
            disabled={isSavingSettings}
            className="flex-1"
          >
            <RotateCw className="h-4 w-4 mr-2" />
            {t('voiceProfile.settings.reset', 'Réinitialiser')}
          </Button>
          <Button
            onClick={saveSettings}
            disabled={isSavingSettings || !hasUnsavedChanges}
            className="flex-1"
          >
            {isSavingSettings ? (
              <Loader2 className={cn("h-4 w-4 mr-2", !reducedMotion && "animate-spin")} />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t('voiceProfile.settings.save', 'Sauvegarder')}
          </Button>
        </div>

        {hasUnsavedChanges && (
          <p className="text-xs text-amber-500 text-center">
            {t('voiceProfile.settings.unsavedChanges', '⚠️ Modifications non sauvegardées')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
