'use client';

/**
 * iOS Install Prompt
 * Guide visuel pour installer la PWA sur iOS
 *
 * Features:
 * - Instructions étape par étape
 * - Détection automatique si déjà installé
 * - Peut être dismissé
 * - Animation smooth
 */

import { useState, useEffect } from 'react';
import { X, Share, Plus, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { iosNotifications } from '@/utils/ios-notification-manager';

interface IOSInstallPromptProps {
  /**
   * Callback quand le prompt est fermé
   */
  onDismiss?: () => void;

  /**
   * Afficher même si déjà dismissé (pour settings page)
   */
  forceShow?: boolean;
}

export function IOSInstallPrompt({ onDismiss, forceShow = false }: IOSInstallPromptProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    // Vérifier si on devrait afficher le prompt
    const shouldShow = iosNotifications.shouldShowInstallPrompt();
    const isInstalled = iosNotifications.isInstalled();
    const safari = iosNotifications.isIOS();

    setIsSafari(safari);

    // Ne pas afficher si:
    // - Pas iOS
    // - Déjà installé
    // - Ne devrait pas être affiché (selon les règles)
    // - A été dismissé récemment (sauf forceShow)
    if (!safari || isInstalled || (!shouldShow && !forceShow)) {
      setIsVisible(false);
      return;
    }

    // Vérifier si déjà dismissé récemment
    if (!forceShow) {
      const wasDismissed = iosNotifications.getIOSNotificationManager().wasInstallPromptRecentlyDismissed(7);
      if (wasDismissed) {
        setIsVisible(false);
        return;
      }
    }

    setIsVisible(true);
  }, [forceShow]);

  const handleDismiss = () => {
    setIsVisible(false);
    iosNotifications.getIOSNotificationManager().recordInstallDismissal();
    onDismiss?.();
  };

  if (!isVisible) {
    return null;
  }

  const instructions = iosNotifications.getInstallInstructions();

  return (
    <Card className="relative border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>

      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/50">
            <Smartphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Install Meeshy App</CardTitle>
            <CardDescription>
              Get the full experience with push notifications on iOS
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="space-y-3">
          {!isSafari && (
            <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong>Note:</strong> You need to open Meeshy in Safari to install the app.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {instructions.map((instruction, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold mt-0.5">
                  {index + 1}
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm">{instruction}</p>
                  {index === 0 && isSafari && (
                    <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                      <Share className="h-4 w-4" />
                      <span className="text-xs">Look for the Share button</span>
                    </div>
                  )}
                  {index === 1 && (
                    <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                      <Plus className="h-4 w-4" />
                      <span className="text-xs">Tap the "Add to Home Screen" option</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Benefits */}
        <div className="pt-3 border-t space-y-2">
          <p className="text-sm font-medium">Why install?</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>✅ Receive notifications even when closed</li>
            <li>✅ Faster access from your Home Screen</li>
            <li>✅ Full-screen experience without browser UI</li>
            <li>✅ Works offline</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={handleDismiss} className="flex-1">
            Maybe Later
          </Button>
          {!isSafari && (
            <Button variant="default" className="flex-1" asChild>
              <a href="safari://" target="_blank" rel="noopener noreferrer">
                Open in Safari
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact version for banners/headers
 */
export function IOSInstallBanner({ onDismiss }: { onDismiss?: () => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const shouldShow = iosNotifications.shouldShowInstallPrompt();
    const isInstalled = iosNotifications.isInstalled();

    if (!shouldShow || isInstalled) {
      setIsVisible(false);
      return;
    }

    const wasDismissed = iosNotifications.getIOSNotificationManager().wasInstallPromptRecentlyDismissed(7);
    setIsVisible(!wasDismissed);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    iosNotifications.getIOSNotificationManager().recordInstallDismissal();
    onDismiss?.();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-900">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Smartphone className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Install Meeshy for push notifications</p>
              <p className="text-xs text-muted-foreground">
                Tap <Share className="inline h-3 w-3" /> then "Add to Home Screen"
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleDismiss} className="flex-shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
