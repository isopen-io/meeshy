'use client';

import { useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff, RotateCcw, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { useVoiceRecording, MIN_RECORDING_SECONDS, MAX_RECORDING_SECONDS } from '@/hooks/use-voice-recording';
import { READING_TEXTS, AVAILABLE_LANGUAGES } from '@/lib/voice-profile-utils';
import { toast } from 'sonner';

const STOP_AFTER_SECONDS = 12;

interface VoiceRecorderProps {
  sourceLanguage: string;
  onSourceLanguageChange: (lang: string) => void;
  selectedPreviewLanguages: string[];
  onPreviewLanguagesChange: (langs: string[]) => void;
  hasVoiceCloningConsent: boolean;
  onRecordingComplete: (blob: Blob, url: string) => void;
  reducedMotion: boolean;
}

/**
 * Component pour enregistrer l'audio vocal
 * Features:
 * - Sélection de langue source
 * - Affichage du texte à lire
 * - Enregistrement audio avec timer
 * - Transcription en temps réel
 * - Sélection de langues pour preview
 */
export function VoiceRecorder({
  sourceLanguage,
  onSourceLanguageChange,
  selectedPreviewLanguages,
  onPreviewLanguagesChange,
  hasVoiceCloningConsent,
  onRecordingComplete,
  reducedMotion,
}: VoiceRecorderProps) {
  const { t } = useI18n('settings');

  const {
    isRecording,
    recordingTime,
    audioBlob,
    liveTranscript,
    startRecording,
    stopRecording,
    resetRecording,
  } = useVoiceRecording({
    sourceLanguage,
    onRecordingComplete,
  });

  const readingText = READING_TEXTS[sourceLanguage] || READING_TEXTS['en'];

  const handleSourceLanguageChange = useCallback((value: string) => {
    onSourceLanguageChange(value);
    // Auto-update preview languages to exclude source
    if (selectedPreviewLanguages.includes(value)) {
      const newLanguages = selectedPreviewLanguages.filter(l => l !== value);
      if (newLanguages.length === 0) {
        onPreviewLanguagesChange(
          AVAILABLE_LANGUAGES.filter(l => l.code !== value).slice(0, 3).map(l => l.code)
        );
      } else {
        onPreviewLanguagesChange(newLanguages);
      }
    }
  }, [selectedPreviewLanguages, onSourceLanguageChange, onPreviewLanguagesChange]);

  const handlePreviewLanguageToggle = useCallback((langCode: string) => {
    const isSelected = selectedPreviewLanguages.includes(langCode);
    if (isSelected) {
      onPreviewLanguagesChange(selectedPreviewLanguages.filter(l => l !== langCode));
    } else if (selectedPreviewLanguages.length < 5) {
      onPreviewLanguagesChange([...selectedPreviewLanguages, langCode]);
    } else {
      toast.error(t('voiceProfile.create.maxLanguages', 'Maximum 5 langues'));
    }
  }, [selectedPreviewLanguages, onPreviewLanguagesChange, t]);

  const languageNames: Record<string, string> = {
    fr: 'Français',
    en: 'English',
    es: 'Español',
    de: 'Deutsch',
    pt: 'Português',
    it: 'Italiano',
    nl: 'Nederlands',
    ru: 'Русский',
    zh: '中文',
    ja: '日本語',
    ko: '한국어',
    ar: 'العربية',
    sw: 'Kiswahili',
    am: 'አማርኛ',
    ha: 'Hausa',
    yo: 'Yorùbá',
    zu: 'isiZulu',
    ln: 'Lingála',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          {t('voiceProfile.create.title', 'Créer votre profil vocal')}
        </CardTitle>
        <CardDescription>
          {t('voiceProfile.create.description', 'Lisez le texte ci-dessous à haute voix pour créer votre profil vocal')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sélecteur de langue source */}
        <div className="space-y-2">
          <Label>{t('voiceProfile.create.sourceLanguage', 'Langue de lecture')}</Label>
          <p className="text-sm text-muted-foreground">
            {t('voiceProfile.create.sourceLanguageDesc', 'Sélectionnez la langue dans laquelle vous allez lire le texte')}
          </p>
          <Select value={sourceLanguage} onValueChange={handleSourceLanguageChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_LANGUAGES.map(lang => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.nativeName} ({lang.name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sélecteur des langues de preview */}
        {hasVoiceCloningConsent && (
          <div className="space-y-2">
            <Label>{t('voiceProfile.create.previewLanguages', 'Langues pour les aperçus vocaux')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('voiceProfile.create.previewLanguagesDesc', 'Sélectionnez les langues dans lesquelles générer des aperçus de votre voix clonée')}
            </p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_LANGUAGES.filter(lang => lang.code !== sourceLanguage).map(lang => {
                const isSelected = selectedPreviewLanguages.includes(lang.code);
                return (
                  <Button
                    key={lang.code}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePreviewLanguageToggle(lang.code)}
                    className="transition-all"
                  >
                    {lang.nativeName}
                    {isSelected && <Check className="h-3 w-3 ml-1" />}
                  </Button>
                );
              })}
            </div>
            {selectedPreviewLanguages.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('voiceProfile.create.selectedLanguages', 'Langues sélectionnées:')} {selectedPreviewLanguages.map(l => {
                  const lang = AVAILABLE_LANGUAGES.find(al => al.code === l);
                  return lang?.nativeName || l;
                }).join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Texte à lire */}
        <div className="p-4 bg-muted rounded-lg">
          <Label className="text-xs text-muted-foreground mb-2 block">
            {t('voiceProfile.create.readThis', 'Lisez ce texte à haute voix')} ({languageNames[sourceLanguage] || sourceLanguage})
          </Label>
          <p className="text-lg leading-relaxed">{readingText}</p>
        </div>

        {/* Transcription en temps réel */}
        {liveTranscript && isRecording && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <Label className="text-xs text-blue-600 dark:text-blue-400 mb-2 block">
              {t('voiceProfile.create.liveTranscript', 'Transcription en temps réel')}
            </Label>
            <p className="text-sm italic">{liveTranscript}</p>
          </div>
        )}

        {/* Contrôles d'enregistrement */}
        <div className="flex flex-col items-center gap-4">
          {/* Timer */}
          <div className="text-center">
            <div className="text-4xl font-mono tabular-nums">
              {recordingTime.toFixed(1)}s
            </div>
            <div className="text-sm text-muted-foreground">
              {recordingTime < MIN_RECORDING_SECONDS
                ? t('voiceProfile.create.minDuration', `Minimum ${MIN_RECORDING_SECONDS} secondes`)
                : recordingTime >= STOP_AFTER_SECONDS
                  ? t('voiceProfile.create.canStop', 'Vous pouvez arrêter maintenant')
                  : t('voiceProfile.create.keepGoing', 'Continuez encore un peu...')
              }
            </div>
          </div>

          {/* Barre de progression */}
          <div className="w-full max-w-md">
            <Progress
              value={(recordingTime / MAX_RECORDING_SECONDS) * 100}
              className={cn(
                "h-2",
                isRecording && !reducedMotion && "animate-pulse"
              )}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0s</span>
              <span className="text-green-500">{MIN_RECORDING_SECONDS}s min</span>
              <span>{MAX_RECORDING_SECONDS}s max</span>
            </div>
          </div>

          {/* Boutons de contrôle */}
          <div className="flex gap-4">
            {!audioBlob ? (
              <Button
                size="lg"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isRecording && recordingTime < MIN_RECORDING_SECONDS}
                variant={isRecording ? "destructive" : "default"}
                className="min-w-[180px]"
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-5 w-5 mr-2" />
                    {t('voiceProfile.create.stopRecording', 'Arrêter')}
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5 mr-2" />
                    {t('voiceProfile.create.startRecording', 'Commencer')}
                  </>
                )}
              </Button>
            ) : (
              <Button variant="outline" onClick={resetRecording}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {t('voiceProfile.create.retry', 'Recommencer')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
