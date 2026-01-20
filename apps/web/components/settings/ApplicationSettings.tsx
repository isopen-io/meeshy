'use client';

/**
 * Application Settings Component
 * Manages application preferences across 5 sections:
 * - Appearance (theme, accentColor, fontSize, fontFamily, lineHeight)
 * - Interface Language (interfaceLanguage only - message translation languages are in User profile)
 * - Layout (compactMode, sidebarPosition, showAvatars, animationsEnabled)
 * - Accessibility (reducedMotion, highContrast, screenReaderOptimized)
 * - Advanced (keyboardShortcuts, tutorials, betaFeatures, telemetry)
 *
 * NOTE: Message translation languages (systemLanguage, regionalLanguage, customDestinationLanguage)
 * are managed in the Profile tab via UserSettings component and stored in the User model.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Palette,
  Languages,
  LayoutGrid,
  Accessibility,
  Settings2,
  Monitor,
  Moon,
  Sun,
  Type,
  Eye,
  Sparkles,
  Keyboard,
  GraduationCap,
  TestTube,
  BarChart3,
  Loader2,
  SidebarLeft,
  SidebarRight,
  UserCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { API_CONFIG } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { useReducedMotion, SoundFeedback } from '@/hooks/use-accessibility';
import { useI18n } from '@/hooks/use-i18n';
import type { ApplicationPreference } from '@shared/types/preferences/application';

// Accent colors configuration
const ACCENT_COLORS = [
  { value: 'blue', label: 'Blue', color: 'bg-blue-500' },
  { value: 'green', label: 'Green', color: 'bg-green-500' },
  { value: 'purple', label: 'Purple', color: 'bg-purple-500' },
  { value: 'red', label: 'Red', color: 'bg-red-500' },
  { value: 'orange', label: 'Orange', color: 'bg-orange-500' },
  { value: 'pink', label: 'Pink', color: 'bg-pink-500' },
];

// Font families configuration
const FONT_FAMILIES = [
  { value: 'inter', label: 'Inter' },
  { value: 'system', label: 'System' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'open-sans', label: 'Open Sans' },
  { value: 'lato', label: 'Lato' },
];

// Line heights configuration
const LINE_HEIGHTS = [
  { value: 'tight', label: 'Tight' },
  { value: 'normal', label: 'Normal' },
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'loose', label: 'Loose' },
];

// Available languages
const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
];

export function ApplicationSettings() {
  const reducedMotion = useReducedMotion();
  const { t } = useI18n('settings');
  const [preferences, setPreferences] = useState<ApplicationPreference>({
    theme: 'auto',
    accentColor: 'blue',
    interfaceLanguage: 'en',
    fontSize: 'medium',
    fontFamily: 'inter',
    lineHeight: 'normal',
    compactMode: false,
    sidebarPosition: 'left',
    showAvatars: true,
    animationsEnabled: true,
    reducedMotion: false,
    highContrastMode: false,
    screenReaderOptimized: false,
    keyboardShortcutsEnabled: true,
    tutorialsCompleted: [],
    betaFeaturesEnabled: false,
    telemetryEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load preferences from API
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const token = authManager.getAuthToken();
        if (!token) {
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_CONFIG.getApiUrl()}/me/preferences/application`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const { id, userId, isDefault, createdAt, updatedAt, ...prefs } = data.data;
            setPreferences((prev) => ({ ...prev, ...prefs }));
          }
        }
      } catch (error) {
        console.error('Error loading application preferences:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Save preferences to API
  const savePreferences = async () => {
    setSaving(true);
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error(t('errors.updateSettings', 'Not authenticated'));
        return;
      }

      const response = await fetch(`${API_CONFIG.getApiUrl()}/me/preferences/application`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        toast.success(t('success.settingsUpdated', 'Application settings saved'));
        setHasChanges(false);
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || t('errors.updateSettings', 'Error saving settings'));
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error(t('errors.updateSettings', 'Network error'));
    } finally {
      setSaving(false);
    }
  };

  const handlePreferenceChange = <K extends keyof ApplicationPreference>(
    key: K,
    value: ApplicationPreference[K]
  ) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);

    // Play sound feedback for toggles
    if (typeof value === 'boolean') {
      if (value) {
        SoundFeedback.playToggleOn();
      } else {
        SoundFeedback.playToggleOff();
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]" role="status" aria-label={t('loadingSettings', 'Loading settings')}>
        <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-primary`} />
        <span className="sr-only">{t('loadingSettings', 'Loading application settings...')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Section 1: Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Palette className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.appearance.title', 'Appearance')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.appearance.description', 'Customize the visual appearance of the application')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Theme */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Monitor className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.appearance.theme.label', 'Theme')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.appearance.theme.description', 'Choose between light, dark, or auto mode')}
                </p>
              </div>
            </div>
            <Select
              value={preferences.theme}
              onValueChange={(value) => handlePreferenceChange('theme', value as 'light' | 'dark' | 'auto')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4" />
                    {t('theme.displayMode.light', 'Light')}
                  </div>
                </SelectItem>
                <SelectItem value="dark">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    {t('theme.displayMode.dark', 'Dark')}
                  </div>
                </SelectItem>
                <SelectItem value="auto">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    {t('theme.displayMode.system', 'System')}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Accent Color */}
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Palette className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.appearance.accentColor.label', 'Accent Color')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.appearance.accentColor.description', 'Choose the primary color for highlights and buttons')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handlePreferenceChange('accentColor', color.value)}
                  className={`relative w-12 h-12 rounded-lg ${color.color} transition-all ${
                    preferences.accentColor === color.value
                      ? 'ring-2 ring-offset-2 ring-primary scale-110'
                      : 'hover:scale-105'
                  }`}
                  aria-label={color.label}
                >
                  {preferences.accentColor === color.value && (
                    <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Type className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.appearance.fontSize.label', 'Font Size')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.appearance.fontSize.description', 'Adjust the size of text throughout the app')}
                </p>
              </div>
            </div>
            <Select
              value={preferences.fontSize}
              onValueChange={(value) => handlePreferenceChange('fontSize', value as 'small' | 'medium' | 'large')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">{t('theme.ui.fontSize.small', 'Small')}</SelectItem>
                <SelectItem value="medium">{t('theme.ui.fontSize.medium', 'Medium')}</SelectItem>
                <SelectItem value="large">{t('theme.ui.fontSize.large', 'Large')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Font Family */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Type className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.appearance.fontFamily.label', 'Font Family')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.appearance.fontFamily.description', 'Choose the typeface for the interface')}
                </p>
              </div>
            </div>
            <Select
              value={preferences.fontFamily}
              onValueChange={(value) => handlePreferenceChange('fontFamily', value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Line Height */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Type className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.appearance.lineHeight.label', 'Line Height')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.appearance.lineHeight.description', 'Adjust spacing between lines of text')}
                </p>
              </div>
            </div>
            <Select
              value={preferences.lineHeight}
              onValueChange={(value) => handlePreferenceChange('lineHeight', value as 'tight' | 'normal' | 'relaxed' | 'loose')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_HEIGHTS.map((lineHeight) => (
                  <SelectItem key={lineHeight.value} value={lineHeight.value}>
                    {t(`theme.ui.lineHeight.${lineHeight.value}`, lineHeight.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Interface Language */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Languages className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.languages.title', 'Interface Language')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.languages.description', 'Choose the language for menus, buttons and interface elements')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Interface Language */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Languages className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.languages.interface.label', 'Interface Language')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.languages.interface.description', 'Language for menus and buttons')}
                </p>
              </div>
            </div>
            <Select
              value={preferences.interfaceLanguage}
              onValueChange={(value) => handlePreferenceChange('interfaceLanguage', value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* NOTE: Message translation languages (systemLanguage, regionalLanguage, customDestinationLanguage) are managed in the Profile tab via UserSettings component */}

      {/* Section 3: Layout */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <LayoutGrid className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.layout.title', 'Layout')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.layout.description', 'Customize the interface layout and behavior')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Compact Mode */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <LayoutGrid className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.layout.compact.label', 'Compact Mode')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.layout.compact.description', 'Reduce spacing to show more content')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.compactMode}
              onCheckedChange={(checked) => handlePreferenceChange('compactMode', checked)}
            />
          </div>

          {/* Sidebar Position */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <SidebarLeft className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.layout.sidebar.label', 'Sidebar Position')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.layout.sidebar.description', 'Choose where the sidebar appears')}
                </p>
              </div>
            </div>
            <Select
              value={preferences.sidebarPosition}
              onValueChange={(value) => handlePreferenceChange('sidebarPosition', value as 'left' | 'right')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">
                  <div className="flex items-center gap-2">
                    <SidebarLeft className="h-4 w-4" />
                    {t('application.layout.sidebar.left', 'Left')}
                  </div>
                </SelectItem>
                <SelectItem value="right">
                  <div className="flex items-center gap-2">
                    <SidebarRight className="h-4 w-4" />
                    {t('application.layout.sidebar.right', 'Right')}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Show Avatars */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <UserCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.layout.avatars.label', 'Show Avatars')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.layout.avatars.description', 'Display profile pictures in messages')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.showAvatars}
              onCheckedChange={(checked) => handlePreferenceChange('showAvatars', checked)}
            />
          </div>

          {/* Animations Enabled */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Sparkles className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.layout.animations.label', 'Animations')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.layout.animations.description', 'Enable interface transitions and effects')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.animationsEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('animationsEnabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Accessibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Accessibility className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.accessibility.title', 'Accessibility')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.accessibility.description', 'Improve accessibility and usability')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Reduced Motion */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Accessibility className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.accessibility.reducedMotion.label', 'Reduced Motion')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.accessibility.reducedMotion.description', 'Minimize animations and motion effects')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.reducedMotion}
              onCheckedChange={(checked) => handlePreferenceChange('reducedMotion', checked)}
            />
          </div>

          {/* High Contrast Mode */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.accessibility.highContrast.label', 'High Contrast')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.accessibility.highContrast.description', 'Increase contrast for better visibility')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.highContrastMode}
              onCheckedChange={(checked) => handlePreferenceChange('highContrastMode', checked)}
            />
          </div>

          {/* Screen Reader Optimized */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Accessibility className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.accessibility.screenReader.label', 'Screen Reader Optimized')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.accessibility.screenReader.description', 'Optimize interface for screen readers')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.screenReaderOptimized}
              onCheckedChange={(checked) => handlePreferenceChange('screenReaderOptimized', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Advanced */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Settings2 className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('application.advanced.title', 'Advanced')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('application.advanced.description', 'Advanced features and preferences')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Keyboard Shortcuts */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Keyboard className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.advanced.keyboard.label', 'Keyboard Shortcuts')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.advanced.keyboard.description', 'Enable keyboard shortcuts for faster navigation')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.keyboardShortcutsEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('keyboardShortcutsEnabled', checked)}
            />
          </div>

          {/* Show Tutorials */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <GraduationCap className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.advanced.tutorials.label', 'Show Tutorials')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t(
                    'application.advanced.tutorials.description',
                    'Display tutorial messages and onboarding guides'
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handlePreferenceChange('tutorialsCompleted', []);
                toast.success(t('application.advanced.tutorials.reset', 'Tutorials reset'));
              }}
            >
              {t('application.advanced.tutorials.resetButton', 'Reset')}
            </Button>
          </div>

          {/* Beta Features */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <TestTube className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.advanced.beta.label', 'Beta Features')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.advanced.beta.description', 'Access experimental features (may be unstable)')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.betaFeaturesEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('betaFeaturesEnabled', checked)}
            />
          </div>

          {/* Telemetry */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <BarChart3 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">
                  {t('application.advanced.telemetry.label', 'Telemetry')}
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('application.advanced.telemetry.description', 'Share anonymous usage data to improve the app')}
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.telemetryEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('telemetryEnabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={savePreferences} disabled={saving} className="shadow-lg">
            {saving ? t('profile.actions.saving', 'Saving...') : t('profile.actions.save', 'Save changes')}
          </Button>
        </div>
      )}
    </div>
  );
}
