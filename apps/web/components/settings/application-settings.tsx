'use client';

/**
 * Application Settings Component
 * Configuration des préférences d'application avec auto-save
 * Utilise le hook usePreferences pour les mises à jour automatiques
 */

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Palette,
  Type,
  Layout,
  Sparkles,
  Eye,
  Keyboard,
  Loader2,
  AlertCircle,
  Globe,
  Lightbulb
} from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePreferences } from '@/hooks/use-preferences';
import type { ApplicationPreference } from '@meeshy/shared/types/preferences';

export default function ApplicationSettings() {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  // Hook usePreferences avec auto-save
  const {
    preferences,
    isLoading,
    isSaving,
    error,
    updateField,
  } = usePreferences<ApplicationPreference>('application');

  // Memoize loading state
  const LoadingState = useMemo(() => (
    <div
      className="flex items-center justify-center py-12"
      role="status"
      aria-label={t('application.loading', 'Chargement des préférences d\'application')}
    >
      <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-muted-foreground`} />
      <span className="sr-only">{t('application.loading', 'Chargement...')}</span>
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
          {t('application.noData', 'Impossible de charger les préférences d\'application')}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Thème */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Palette className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.theme.title', 'Apparence')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.theme.description', 'Personnaliser le thème et les couleurs')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('application.theme.mode', 'Mode d\'affichage')}
            </Label>
            <Select
              value={preferences.theme}
              onValueChange={(value: 'light' | 'dark' | 'auto') =>
                updateField('theme', value)
              }
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('application.theme.light', 'Clair')}</SelectItem>
                <SelectItem value="dark">{t('application.theme.dark', 'Sombre')}</SelectItem>
                <SelectItem value="auto">{t('application.theme.auto', 'Automatique (système)')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('application.accentColor', 'Couleur d\'accentuation')}
            </Label>
            <Select
              value={preferences.accentColor}
              onValueChange={(value) => updateField('accentColor', value)}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blue">{t('application.color.blue', 'Bleu')}</SelectItem>
                <SelectItem value="green">{t('application.color.green', 'Vert')}</SelectItem>
                <SelectItem value="purple">{t('application.color.purple', 'Violet')}</SelectItem>
                <SelectItem value="red">{t('application.color.red', 'Rouge')}</SelectItem>
                <SelectItem value="orange">{t('application.color.orange', 'Orange')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Langue de l'interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Globe className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.language.title', 'Langue')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.language.description', 'Langue de l\'interface utilisateur')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('application.interfaceLanguage', 'Langue de l\'interface')}
            </Label>
            <Select
              value={preferences.interfaceLanguage}
              onValueChange={(value) => updateField('interfaceLanguage', value)}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Typographie */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Type className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.typography.title', 'Typographie')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.typography.description', 'Paramètres de police et de lecture')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('application.fontSize', 'Taille de police')}
            </Label>
            <Select
              value={preferences.fontSize}
              onValueChange={(value: 'small' | 'medium' | 'large') =>
                updateField('fontSize', value)
              }
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">{t('application.fontSize.small', 'Petite')}</SelectItem>
                <SelectItem value="medium">{t('application.fontSize.medium', 'Moyenne')}</SelectItem>
                <SelectItem value="large">{t('application.fontSize.large', 'Grande')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('application.fontFamily', 'Police de caractères')}
            </Label>
            <Select
              value={preferences.fontFamily}
              onValueChange={(value) => updateField('fontFamily', value)}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inter">Inter (par défaut)</SelectItem>
                <SelectItem value="system">Système</SelectItem>
                <SelectItem value="roboto">Roboto</SelectItem>
                <SelectItem value="open-sans">Open Sans</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('application.lineHeight', 'Hauteur de ligne')}
            </Label>
            <Select
              value={preferences.lineHeight}
              onValueChange={(value: 'tight' | 'normal' | 'relaxed' | 'loose') =>
                updateField('lineHeight', value)
              }
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tight">{t('application.lineHeight.tight', 'Serrée')}</SelectItem>
                <SelectItem value="normal">{t('application.lineHeight.normal', 'Normale')}</SelectItem>
                <SelectItem value="relaxed">{t('application.lineHeight.relaxed', 'Détendue')}</SelectItem>
                <SelectItem value="loose">{t('application.lineHeight.loose', 'Lâche')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Disposition */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Layout className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.layout.title', 'Disposition')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.layout.description', 'Organisation de l\'interface')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Layout className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.compactMode', 'Mode compact')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.compactModeDesc', 'Réduire les espacements pour afficher plus d\'informations')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.compactMode}
              onCheckedChange={(checked) => updateField('compactMode', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('application.sidebarPosition', 'Position de la barre latérale')}
            </Label>
            <Select
              value={preferences.sidebarPosition}
              onValueChange={(value: 'left' | 'right') =>
                updateField('sidebarPosition', value)
              }
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">{t('application.sidebar.left', 'Gauche')}</SelectItem>
                <SelectItem value="right">{t('application.sidebar.right', 'Droite')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.showAvatars', 'Afficher les avatars')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.showAvatarsDesc', 'Afficher les photos de profil dans les listes')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.showAvatars}
              onCheckedChange={(checked) => updateField('showAvatars', checked)}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Animations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.animations.title', 'Animations')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.animations.description', 'Effets visuels et transitions')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Sparkles className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.animations', 'Animations')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.animationsDesc', 'Activer les transitions et effets visuels')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.animationsEnabled}
              onCheckedChange={(checked) => updateField('animationsEnabled', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.reducedMotion', 'Mouvement réduit')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.reducedMotionDesc', 'Minimiser les animations pour le confort visuel')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.reducedMotion}
              onCheckedChange={(checked) => updateField('reducedMotion', checked)}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Accessibilité */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.accessibility.title', 'Accessibilité')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.accessibility.description', 'Options pour une meilleure accessibilité')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.highContrast', 'Contraste élevé')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.highContrastDesc', 'Améliorer la lisibilité avec des couleurs contrastées')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.highContrastMode}
              onCheckedChange={(checked) => updateField('highContrastMode', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.screenReader', 'Optimisé pour lecteur d\'écran')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.screenReaderDesc', 'Améliorer la compatibilité avec les lecteurs d\'écran')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.screenReaderOptimized}
              onCheckedChange={(checked) => updateField('screenReaderOptimized', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Keyboard className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.keyboardShortcuts', 'Raccourcis clavier')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.keyboardShortcutsDesc', 'Activer la navigation au clavier')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.keyboardShortcutsEnabled}
              onCheckedChange={(checked) => updateField('keyboardShortcutsEnabled', checked)}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Expérience */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Lightbulb className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.experience.title', 'Expérience')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.experience.description', 'Fonctionnalités expérimentales et télémétrie')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Lightbulb className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.betaFeatures', 'Fonctionnalités bêta')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.betaFeaturesDesc', 'Activer les nouvelles fonctionnalités en cours de développement')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.betaFeaturesEnabled}
              onCheckedChange={(checked) => updateField('betaFeaturesEnabled', checked)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.telemetry', 'Télémétrie')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.telemetryDesc', 'Partager des données d\'utilisation anonymes pour améliorer l\'application')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.telemetryEnabled}
              onCheckedChange={(checked) => updateField('telemetryEnabled', checked)}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
