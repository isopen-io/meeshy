'use client';

/**
 * Message Settings Component
 * Configuration des préférences de messages
 * Synchronisé avec l'API backend /user-preferences/messages
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MessageSquare,
  Send,
  Type,
  Eye,
  Save,
  Languages,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/use-i18n';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { MessagePreference } from '@meeshy/shared/types/preferences';

const DEFAULT_PREFERENCES: MessagePreference = {
  sendOnEnter: true,
  showFormattingToolbar: true,
  enableMarkdown: true,
  enableEmoji: true,
  emojiSkinTone: 'default',
  autoCorrectEnabled: false,
  spellCheckEnabled: true,
  linkPreviewEnabled: true,
  imagePreviewEnabled: true,
  saveDrafts: true,
  draftExpirationDays: 30,
  defaultFontSize: 'medium',
  defaultTextAlign: 'left',
  autoTranslateIncoming: false,
  autoTranslateLanguages: []
};

export function MessageSettings() {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  const [preferences, setPreferences] = useState<MessagePreference>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load preferences from API
  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiService.get<{ success: boolean; data: MessagePreference }>(
        '/user-preferences/messages'
      );

      if (response.success && response.data) {
        const { data } = response;
        // Remove metadata fields if present
        const prefs = 'data' in data ? data.data : data;
        setPreferences(prev => ({ ...prev, ...prefs }));
      }
    } catch (err: any) {
      console.error('[MessageSettings] Error loading preferences:', err);
      setError(err.message || t('messages.loadError', 'Erreur lors du chargement des préférences'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Save preferences with optimistic updates
  const savePreferences = async () => {
    setSaving(true);

    // Optimistic update
    const previousPrefs = { ...preferences };

    try {
      const response = await apiService.put<{ success: boolean; data: MessagePreference }>(
        '/user-preferences/messages',
        preferences
      );

      if (response.success) {
        toast.success(t('messages.saveSuccess', 'Préférences de messages enregistrées'));
        setHasChanges(false);
      } else {
        // Rollback on failure
        setPreferences(previousPrefs);
        throw new Error(response.message || 'Erreur lors de l\'enregistrement');
      }
    } catch (err: any) {
      console.error('[MessageSettings] Error saving preferences:', err);
      setPreferences(previousPrefs);
      toast.error(err.message || t('messages.saveError', 'Erreur lors de l\'enregistrement'));
    } finally {
      setSaving(false);
    }
  };

  const handlePreferenceChange = <K extends keyof MessagePreference>(
    key: K,
    value: MessagePreference[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-[400px]"
        role="status"
        aria-label={t('messages.loading', 'Chargement des préférences de messages')}
      >
        <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-primary`} />
        <span className="sr-only">{t('messages.loading', 'Chargement...')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Composition Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('messages.composition.title', 'Composition de messages')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('messages.composition.description', 'Paramètres d\'envoi et de formatage')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Send className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="sendOnEnter" className="text-sm sm:text-base">
                  {t('messages.sendOnEnter', 'Envoyer avec Entrée')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('messages.sendOnEnterDesc', 'Appuyez sur Entrée pour envoyer (Shift+Entrée pour nouvelle ligne)')}
                </p>
              </div>
            </div>
            <Switch
              id="sendOnEnter"
              checked={preferences.sendOnEnter}
              onCheckedChange={(checked) => handlePreferenceChange('sendOnEnter', checked)}
              disabled={saving}
              aria-label={t('messages.sendOnEnter', 'Envoyer avec Entrée')}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Type className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="formattingToolbar" className="text-sm sm:text-base">
                  {t('messages.formattingToolbar', 'Barre de formatage')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('messages.formattingToolbarDesc', 'Afficher les outils de mise en forme')}
                </p>
              </div>
            </div>
            <Switch
              id="formattingToolbar"
              checked={preferences.showFormattingToolbar}
              onCheckedChange={(checked) => handlePreferenceChange('showFormattingToolbar', checked)}
              disabled={saving}
              aria-label={t('messages.formattingToolbar', 'Barre de formatage')}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="markdown" className="text-sm sm:text-base">
                  {t('messages.markdown', 'Support Markdown')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('messages.markdownDesc', 'Activer le formatage Markdown (**gras**, *italique*, etc.)')}
                </p>
              </div>
            </div>
            <Switch
              id="markdown"
              checked={preferences.enableMarkdown}
              onCheckedChange={(checked) => handlePreferenceChange('enableMarkdown', checked)}
              disabled={saving}
              aria-label={t('messages.markdown', 'Support Markdown')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto-corrections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Type className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('messages.corrections.title', 'Corrections automatiques')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('messages.corrections.description', 'Aide à la saisie et corrections')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Type className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="autocorrect" className="text-sm sm:text-base">
                  {t('messages.autocorrect', 'Correction automatique')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('messages.autocorrectDesc', 'Corriger automatiquement les fautes de frappe')}
                </p>
              </div>
            </div>
            <Switch
              id="autocorrect"
              checked={preferences.autoCorrectEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('autoCorrectEnabled', checked)}
              disabled={saving}
              aria-label={t('messages.autocorrect', 'Correction automatique')}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Type className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="spellcheck" className="text-sm sm:text-base">
                  {t('messages.spellcheck', 'Vérification orthographique')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('messages.spellcheckDesc', 'Souligner les erreurs d\'orthographe')}
                </p>
              </div>
            </div>
            <Switch
              id="spellcheck"
              checked={preferences.spellCheckEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('spellCheckEnabled', checked)}
              disabled={saving}
              aria-label={t('messages.spellcheck', 'Vérification orthographique')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preview Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('messages.previews.title', 'Prévisualisations')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('messages.previews.description', 'Affichage des liens et médias')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="linkPreviews" className="text-sm sm:text-base">
                  {t('messages.linkPreviews', 'Prévisualisation des liens')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('messages.linkPreviewsDesc', 'Afficher un aperçu enrichi des liens')}
                </p>
              </div>
            </div>
            <Switch
              id="linkPreviews"
              checked={preferences.linkPreviewEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('linkPreviewEnabled', checked)}
              disabled={saving}
              aria-label={t('messages.linkPreviews', 'Prévisualisation des liens')}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="imagePreviews" className="text-sm sm:text-base">
                  {t('messages.imagePreviews', 'Prévisualisation des images')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('messages.imagePreviewsDesc', 'Afficher les images directement dans les messages')}
                </p>
              </div>
            </div>
            <Switch
              id="imagePreviews"
              checked={preferences.imagePreviewEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('imagePreviewEnabled', checked)}
              disabled={saving}
              aria-label={t('messages.imagePreviews', 'Prévisualisation des images')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Draft Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Save className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('messages.drafts.title', 'Brouillons')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('messages.drafts.description', 'Gestion des messages en cours')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Save className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="saveDrafts" className="text-sm sm:text-base">
                  {t('messages.saveDrafts', 'Sauvegarder les brouillons')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('messages.saveDraftsDesc', 'Conserver automatiquement les messages non envoyés')}
                </p>
              </div>
            </div>
            <Switch
              id="saveDrafts"
              checked={preferences.saveDrafts}
              onCheckedChange={(checked) => handlePreferenceChange('saveDrafts', checked)}
              disabled={saving}
              aria-label={t('messages.saveDrafts', 'Sauvegarder les brouillons')}
            />
          </div>

          {preferences.saveDrafts && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <Label htmlFor="draftExpiration" className="text-sm font-medium">
                {t('messages.draftExpiration', 'Expiration des brouillons')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="draftExpiration"
                  type="number"
                  min={1}
                  max={90}
                  value={preferences.draftExpirationDays}
                  onChange={(e) => handlePreferenceChange('draftExpirationDays', parseInt(e.target.value) || 30)}
                  className="w-24"
                  disabled={saving}
                  aria-label={t('messages.draftExpirationDays', 'Nombre de jours')}
                />
                <span className="text-sm text-muted-foreground">
                  {t('messages.draftExpirationUnit', 'jours')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('messages.draftExpirationDesc', 'Les brouillons seront automatiquement supprimés après cette période')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Text Formatting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Type className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('messages.formatting.title', 'Formatage par défaut')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('messages.formatting.description', 'Apparence des messages')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <Label htmlFor="fontSize" className="text-sm font-medium">
              {t('messages.fontSize', 'Taille de police')}
            </Label>
            <Select
              value={preferences.defaultFontSize}
              onValueChange={(value: 'small' | 'medium' | 'large') => handlePreferenceChange('defaultFontSize', value)}
              disabled={saving}
            >
              <SelectTrigger id="fontSize" aria-label={t('messages.fontSize', 'Taille de police')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">{t('messages.fontSizeSmall', 'Petite')}</SelectItem>
                <SelectItem value="medium">{t('messages.fontSizeMedium', 'Moyenne')}</SelectItem>
                <SelectItem value="large">{t('messages.fontSizeLarge', 'Grande')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="textAlign" className="text-sm font-medium">
              {t('messages.textAlign', 'Alignement du texte')}
            </Label>
            <Select
              value={preferences.defaultTextAlign}
              onValueChange={(value: 'left' | 'center' | 'right') => handlePreferenceChange('defaultTextAlign', value)}
              disabled={saving}
            >
              <SelectTrigger id="textAlign" aria-label={t('messages.textAlign', 'Alignement du texte')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">{t('messages.textAlignLeft', 'Gauche')}</SelectItem>
                <SelectItem value="center">{t('messages.textAlignCenter', 'Centré')}</SelectItem>
                <SelectItem value="right">{t('messages.textAlignRight', 'Droite')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Translation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Languages className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('messages.translation.title', 'Traduction automatique')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('messages.translation.description', 'Traduire automatiquement les messages entrants')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Languages className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label htmlFor="autoTranslate" className="text-sm sm:text-base">
                  {t('messages.autoTranslate', 'Traduction automatique')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('messages.autoTranslateDesc', 'Traduire les messages dans votre langue préférée')}
                </p>
              </div>
            </div>
            <Switch
              id="autoTranslate"
              checked={preferences.autoTranslateIncoming}
              onCheckedChange={(checked) => handlePreferenceChange('autoTranslateIncoming', checked)}
              disabled={saving}
              aria-label={t('messages.autoTranslate', 'Traduction automatique')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={savePreferences}
            disabled={saving}
            className="shadow-lg"
            aria-label={t('messages.save', 'Enregistrer les modifications')}
          >
            {saving ? (
              <>
                <Loader2 className={`mr-2 h-4 w-4 ${reducedMotion ? '' : 'animate-spin'}`} />
                {t('messages.saving', 'Enregistrement...')}
              </>
            ) : (
              t('messages.save', 'Enregistrer les modifications')
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
