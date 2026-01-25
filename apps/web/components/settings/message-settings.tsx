'use client';

/**
 * Message Settings Component
 * Configuration des préférences de messages avec auto-save
 * Utilise le hook usePreferences pour les mises à jour automatiques
 */

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { MessageSquare, Type, Image as ImageIcon, FileText, Loader2, AlertCircle, Languages } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePreferences } from '@/hooks/use-preferences';
import type { MessagePreference } from '@meeshy/shared/types/preferences';

export default function MessageSettings() {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  // Hook usePreferences avec auto-save
  const {
    preferences,
    isLoading,
    isSaving,
    error,
    updateField,
  } = usePreferences<MessagePreference>('message');

  // Memoize loading state
  const LoadingState = useMemo(() => (
    <div
      className="flex items-center justify-center py-12"
      role="status"
      aria-label={t('message.loading', 'Chargement des préférences de messages')}
    >
      <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-muted-foreground`} />
      <span className="sr-only">{t('message.loading', 'Chargement...')}</span>
    </div>
  ), [t, reducedMotion]);

  // Memoize error state
  const ErrorState = useMemo(() => (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ), [error]);

  if (isLoading) {
    return LoadingState;
  }

  if (error) {
    return ErrorState;
  }

  if (!preferences) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t('message.noData', 'Impossible de charger les préférences de messages')}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Composition */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('message.composition.title', 'Composition des messages')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('message.composition.description', 'Configurer comment vous rédigez et envoyez vos messages')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.sendOnEnter', 'Envoyer avec Entrée')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.sendOnEnterDesc', 'Appuyez sur Entrée pour envoyer, Maj+Entrée pour nouvelle ligne')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.sendOnEnter}
              onCheckedChange={(checked) => updateField('sendOnEnter', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Type className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.showFormattingToolbar', 'Barre de formatage')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.showFormattingToolbarDesc', 'Afficher la barre d\'outils de formatage de texte')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.showFormattingToolbar}
              onCheckedChange={(checked) => updateField('showFormattingToolbar', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.enableMarkdown', 'Markdown')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.enableMarkdownDesc', 'Activer le formatage Markdown (**gras**, *italique*, etc.)')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.enableMarkdown}
              onCheckedChange={(checked) => updateField('enableMarkdown', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <span className="text-xl mt-0.5">😊</span>
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.enableEmoji', 'Émojis')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.enableEmojiDesc', 'Activer le sélecteur d\'émojis')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.enableEmoji}
              onCheckedChange={(checked) => updateField('enableEmoji', checked)}
              disabled={isSaving}
            />
          </div>

          {preferences.enableEmoji && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Label className="text-sm font-medium">
                {t('message.emojiSkinTone', 'Teinte de peau des émojis')}
              </Label>
              <Select
                value={preferences.emojiSkinTone}
                onValueChange={(value: 'default' | 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark') =>
                  updateField('emojiSkinTone', value)
                }
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('message.skinTone.default', 'Par défaut')}</SelectItem>
                  <SelectItem value="light">{t('message.skinTone.light', 'Claire')}</SelectItem>
                  <SelectItem value="medium-light">{t('message.skinTone.mediumLight', 'Moyennement claire')}</SelectItem>
                  <SelectItem value="medium">{t('message.skinTone.medium', 'Moyenne')}</SelectItem>
                  <SelectItem value="medium-dark">{t('message.skinTone.mediumDark', 'Moyennement foncée')}</SelectItem>
                  <SelectItem value="dark">{t('message.skinTone.dark', 'Foncée')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-corrections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Type className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('message.corrections.title', 'Corrections automatiques')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('message.corrections.description', 'Correction orthographique et grammaticale')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Type className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.autoCorrect', 'Correction automatique')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.autoCorrectDesc', 'Corriger automatiquement les fautes de frappe')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.autoCorrectEnabled}
              onCheckedChange={(checked) => updateField('autoCorrectEnabled', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.spellCheck', 'Vérification orthographique')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.spellCheckDesc', 'Souligner les fautes d\'orthographe')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.spellCheckEnabled}
              onCheckedChange={(checked) => updateField('spellCheckEnabled', checked)}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Prévisualisation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <ImageIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('message.preview.title', 'Prévisualisations')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('message.preview.description', 'Aperçus de liens et médias')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.linkPreview', 'Aperçu des liens')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.linkPreviewDesc', 'Afficher un aperçu des liens partagés')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.linkPreviewEnabled}
              onCheckedChange={(checked) => updateField('linkPreviewEnabled', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <ImageIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.imagePreview', 'Aperçu des images')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.imagePreviewDesc', 'Afficher les images en ligne dans les messages')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.imagePreviewEnabled}
              onCheckedChange={(checked) => updateField('imagePreviewEnabled', checked)}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Brouillons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('message.drafts.title', 'Brouillons')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('message.drafts.description', 'Gestion des messages non envoyés')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.saveDrafts', 'Sauvegarder les brouillons')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.saveDraftsDesc', 'Conserver les messages non envoyés')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.saveDrafts}
              onCheckedChange={(checked) => updateField('saveDrafts', checked)}
              disabled={isSaving}
            />
          </div>

          {preferences.saveDrafts && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Label className="text-sm font-medium">
                {t('message.draftExpiration', 'Expiration des brouillons (jours)')}
              </Label>
              <Select
                value={preferences.draftExpirationDays.toString()}
                onValueChange={(value) => updateField('draftExpirationDays', parseInt(value))}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 jours</SelectItem>
                  <SelectItem value="30">30 jours</SelectItem>
                  <SelectItem value="60">60 jours</SelectItem>
                  <SelectItem value="90">90 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formatage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Type className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('message.formatting.title', 'Formatage par défaut')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('message.formatting.description', 'Style de texte par défaut')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('message.fontSize', 'Taille de police')}
            </Label>
            <Select
              value={preferences.defaultFontSize}
              onValueChange={(value: 'small' | 'medium' | 'large') =>
                updateField('defaultFontSize', value)
              }
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">{t('message.fontSize.small', 'Petite')}</SelectItem>
                <SelectItem value="medium">{t('message.fontSize.medium', 'Moyenne')}</SelectItem>
                <SelectItem value="large">{t('message.fontSize.large', 'Grande')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('message.textAlign', 'Alignement du texte')}
            </Label>
            <Select
              value={preferences.defaultTextAlign}
              onValueChange={(value: 'left' | 'center' | 'right') =>
                updateField('defaultTextAlign', value)
              }
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">{t('message.textAlign.left', 'Gauche')}</SelectItem>
                <SelectItem value="center">{t('message.textAlign.center', 'Centré')}</SelectItem>
                <SelectItem value="right">{t('message.textAlign.right', 'Droite')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Traduction automatique */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Languages className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('message.translation.title', 'Traduction automatique')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('message.translation.description', 'Traduire automatiquement les messages entrants')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Languages className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('message.autoTranslate', 'Traduction automatique')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('message.autoTranslateDesc', 'Traduire automatiquement les messages reçus')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.autoTranslateIncoming}
              onCheckedChange={(checked) => updateField('autoTranslateIncoming', checked)}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Limites de messages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Type className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('message.limits.title', 'Limites de messages')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('message.limits.description', 'Configurer la longueur maximale des messages')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm sm:text-base">
                {t('message.maxCharacters', 'Limite de caractères')}
              </Label>
              <span className="text-sm font-medium text-muted-foreground">
                {preferences.maxCharacterLimit.toLocaleString()} {t('message.characters', 'caractères')}
              </span>
            </div>
            <Slider
              value={[preferences.maxCharacterLimit]}
              onValueChange={(value) => updateField('maxCharacterLimit', value[0])}
              min={100}
              max={10000}
              step={100}
              disabled={isSaving}
              className="w-full"
            />
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('message.maxCharactersDesc', 'Définir le nombre maximum de caractères autorisés par message (entre 100 et 10 000)')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
