/**
 * Example: How to integrate ApplicationSettings in a settings page
 *
 * This file demonstrates various integration patterns for the ApplicationSettings component.
 * Choose the pattern that best fits your application architecture.
 */

import { ApplicationSettings } from './ApplicationSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationSettings } from './notification-settings';
import { PrivacySettings } from './privacy-settings';
import { EncryptionSettings } from './encryption-settings';

// ============================================================================
// Pattern 1: Simple Integration - Dedicated Page
// ============================================================================

/**
 * Simplest pattern: ApplicationSettings in its own page
 * Use this when you have separate routes for each settings category
 */
export function ApplicationSettingsPage() {
  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Application Settings</h1>
        <p className="text-muted-foreground">
          Customize the appearance, language, and behavior of your application
        </p>
      </div>

      <ApplicationSettings />
    </div>
  );
}

// ============================================================================
// Pattern 2: Tabbed Interface - Multiple Settings Sections
// ============================================================================

/**
 * Common pattern: ApplicationSettings as one tab among many
 * Use this for a unified settings experience with multiple categories
 */
export function UnifiedSettingsPage() {
  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Manage all your preferences in one place
        </p>
      </div>

      <Tabs defaultValue="application" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="application">Application</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="encryption">Encryption</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="application">
          <ApplicationSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacySettings />
        </TabsContent>

        <TabsContent value="encryption">
          <EncryptionSettings />
        </TabsContent>

        <TabsContent value="account">
          <div className="text-center py-12 text-muted-foreground">
            Account settings coming soon...
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Pattern 3: Modal/Drawer Integration - Quick Settings
// ============================================================================

/**
 * Advanced pattern: ApplicationSettings in a modal for quick access
 * Use this for keyboard shortcut-triggered settings (Cmd+,)
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function QuickSettingsButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Quick Settings">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Settings</DialogTitle>
          <DialogDescription>
            Quickly adjust your application preferences
          </DialogDescription>
        </DialogHeader>

        <ApplicationSettings />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Pattern 4: With Keyboard Shortcuts - Power User Experience
// ============================================================================

/**
 * Pro pattern: Add keyboard shortcuts for quick settings access
 * Use this for power users who prefer keyboard navigation
 */
import { useEffect, useState } from 'react';

export function SettingsWithShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+, or Ctrl+, to open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsOpen(true);
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Application Settings
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              (Cmd+, to toggle)
            </span>
          </DialogTitle>
          <DialogDescription>
            Customize your experience
          </DialogDescription>
        </DialogHeader>

        <ApplicationSettings />
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Pattern 5: Sidebar Navigation - Settings Dashboard
// ============================================================================

/**
 * Dashboard pattern: Sidebar navigation for settings
 * Use this for complex applications with many settings categories
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';

const settingsCategories = [
  { id: 'application', label: 'Application', icon: '⚙️' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'privacy', label: 'Privacy', icon: '🔒' },
  { id: 'encryption', label: 'Encryption', icon: '🔐' },
  { id: 'account', label: 'Account', icon: '👤' },
];

export function SettingsDashboard() {
  const [activeCategory, setActiveCategory] = useState('application');

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/30 p-6">
        <h2 className="text-lg font-semibold mb-4">Settings</h2>

        <nav className="space-y-1">
          {settingsCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2 rounded-lg text-left transition-colors',
                activeCategory === category.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              <span className="text-lg">{category.icon}</span>
              <span>{category.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {activeCategory === 'application' && <ApplicationSettings />}
        {activeCategory === 'notifications' && <NotificationSettings />}
        {activeCategory === 'privacy' && <PrivacySettings />}
        {activeCategory === 'encryption' && <EncryptionSettings />}
        {activeCategory === 'account' && (
          <div className="text-center py-12 text-muted-foreground">
            Account settings coming soon...
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Pattern 6: With Loading States and Error Boundaries
// ============================================================================

/**
 * Production-ready pattern: Error handling and loading states
 * Use this for robust production applications
 */
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function SettingsLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    </div>
  );
}

function SettingsErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <Alert variant="destructive" className="m-8">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Failed to load settings</AlertTitle>
      <AlertDescription>
        {error.message}
        <Button
          variant="outline"
          size="sm"
          onClick={resetErrorBoundary}
          className="mt-4"
        >
          Try Again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function RobustSettingsPage() {
  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Application Settings</h1>
        <p className="text-muted-foreground">
          Customize your experience
        </p>
      </div>

      <ErrorBoundary FallbackComponent={SettingsErrorFallback}>
        <Suspense fallback={<SettingsLoadingFallback />}>
          <ApplicationSettings />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

// ============================================================================
// Pattern 7: Controlled Component - External State Management
// ============================================================================

/**
 * Advanced pattern: Control ApplicationSettings from parent
 * Use this when you need to coordinate settings with other app state
 *
 * Note: This requires modifying ApplicationSettings to accept props
 * This is just a conceptual example
 */
import { useApplicationPreferences } from '@/hooks/use-application-preferences';

export function ControlledSettingsExample() {
  // Hypothetical hook that manages preferences globally
  const { preferences, updatePreferences, isLoading } = useApplicationPreferences();

  if (isLoading) {
    return <SettingsLoadingFallback />;
  }

  return (
    <div className="container max-w-4xl mx-auto py-8">
      {/* Custom header with actions */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Application Settings</h1>
          <p className="text-muted-foreground">
            Current theme: {preferences.theme}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => updatePreferences({ theme: 'light' })}>
            Force Light
          </Button>
          <Button variant="outline" onClick={() => updatePreferences({ theme: 'dark' })}>
            Force Dark
          </Button>
        </div>
      </div>

      <ApplicationSettings />
    </div>
  );
}

// ============================================================================
// Export all patterns for easy testing
// ============================================================================

export const examples = {
  simple: ApplicationSettingsPage,
  tabbed: UnifiedSettingsPage,
  modal: QuickSettingsButton,
  withShortcuts: SettingsWithShortcuts,
  dashboard: SettingsDashboard,
  robust: RobustSettingsPage,
  controlled: ControlledSettingsExample,
};
