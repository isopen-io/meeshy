/**
 * Exemple d'utilisation du composant BetaPlayground
 *
 * Ce fichier montre comment intégrer le composant BetaPlayground
 * dans une page de paramètres Next.js
 */

'use client';

import { BetaPlayground } from '@/components/settings/BetaPlayground';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

/**
 * Exemple 1: Utilisation simple dans une page settings
 */
export function BetaSettingsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Beta Features</h1>
        <p className="text-muted-foreground mt-2">
          Test experimental AI features running directly in your browser
        </p>
      </div>

      <BetaPlayground />
    </div>
  );
}

/**
 * Exemple 2: Intégration avec un avertissement
 */
export function BetaSettingsPageWithWarning() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Beta Features</h1>
        <p className="text-muted-foreground mt-2">
          Test experimental AI features running directly in your browser
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          These features are experimental and may not work in all browsers.
          Some features require Chrome Canary with experimental flags enabled.
        </AlertDescription>
      </Alert>

      <BetaPlayground />
    </div>
  );
}

/**
 * Exemple 3: Intégration dans un layout avec sidebar
 */
export function BetaSettingsPageWithSidebar() {
  return (
    <div className="container mx-auto py-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <aside className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a href="#llm" className="block text-sm hover:underline">
                LLM Edge
              </a>
              <a href="#translation" className="block text-sm hover:underline">
                Translation
              </a>
              <a href="#transcription" className="block text-sm hover:underline">
                Transcription
              </a>
              <a href="#tts" className="block text-sm hover:underline">
                Text-to-Speech
              </a>
            </CardContent>
          </Card>
        </aside>

        {/* Main content */}
        <main className="lg:col-span-3">
          <BetaPlayground />
        </main>
      </div>
    </div>
  );
}

/**
 * Exemple 4: Page Next.js complète avec metadata
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Beta Playground - Test Edge AI Models',
  description: 'Test and experiment with browser-based AI models including LLM, Translation, Speech Recognition, and Text-to-Speech',
};

export default function BetaPlaygroundPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Beta Playground
          </h1>
          <p className="text-lg text-muted-foreground">
            Test cutting-edge AI features running entirely in your browser
          </p>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Privacy First
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                All processing happens in your browser. No data is sent to servers.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Lightning Fast
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Edge models run directly on your device for instant results.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Offline Ready
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Works without internet once models are downloaded.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Experimental
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Features may require specific browsers or experimental flags.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Playground */}
        <BetaPlayground />

        {/* Footer Help */}
        <Card>
          <CardHeader>
            <CardTitle>Need Help?</CardTitle>
            <CardDescription>
              Having trouble with a feature? Here are some common solutions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium text-sm mb-2">LLM Edge not available?</h4>
              <p className="text-sm text-muted-foreground">
                Make sure you're using Chrome Canary and enable the Built-in AI flag at
                <code className="mx-1 px-1 py-0.5 bg-muted rounded text-xs">
                  chrome://flags/#optimization-guide-on-device-model
                </code>
              </p>
            </div>

            <div>
              <h4 className="font-medium text-sm mb-2">Speech Recognition not working?</h4>
              <p className="text-sm text-muted-foreground">
                Grant microphone permissions when prompted. This feature works best in Chrome or Edge.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-sm mb-2">Translation API unavailable?</h4>
              <p className="text-sm text-muted-foreground">
                This API is still in development. Check back with Chrome 125+ or later versions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Exemple 5: Integration avec un système de tabs existant
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeSettings } from '@/components/settings/theme-settings';
import { NotificationSettings } from '@/components/settings/notification-settings';

export function SettingsPageWithBetaTab() {
  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="beta">Beta Features</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <ThemeSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="beta">
          <BetaPlayground />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Exemple 6: Utilisation avec un conditional rendering
 */
export function ConditionalBetaPlayground() {
  // Vérifier si l'utilisateur est un beta tester
  const isBetaTester = true; // Remplacer par votre logique

  if (!isBetaTester) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Beta Features</CardTitle>
          <CardDescription>
            Access to beta features is currently limited to beta testers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Want to become a beta tester? Contact us at beta@meeshy.com
          </p>
        </CardContent>
      </Card>
    );
  }

  return <BetaPlayground />;
}

/**
 * Exemple 7: Integration avec analytics
 */
export function BetaPlaygroundWithAnalytics() {
  // Tracker l'utilisation des features beta
  const trackBetaUsage = (feature: string, action: string) => {
    console.log(`Beta Feature Used: ${feature} - ${action}`);
    // Intégrer votre système d'analytics ici
    // analytics.track('beta_feature_used', { feature, action });
  };

  return (
    <div className="container mx-auto py-6">
      <BetaPlayground />

      {/* Note: Pour tracker les actions, vous devrez créer un wrapper
          ou étendre le composant BetaPlayground */}
    </div>
  );
}
