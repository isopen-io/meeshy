'use client';

/**
 * Notification Permission Prompt
 * Prompt user-friendly pour demander la permission de notifications
 *
 * Features:
 * - Explique les bénéfices
 * - Adapté selon la plateforme (iOS vs autres)
 * - Guidance "Add to Home Screen" pour iOS si nécessaire
 * - États: "Autoriser", "Plus tard", "Jamais"
 */

import { useState, useEffect } from 'react';
import { Bell, BellOff, X, Smartphone, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fcm } from '@/utils/fcm-manager';
import { iosNotifications } from '@/utils/ios-notification-manager';
import { firebaseChecker } from '@/utils/firebase-availability-checker';

interface NotificationPermissionPromptProps {
  /**
   * Contrôle l'affichage du prompt
   */
  open: boolean;

  /**
   * Callback de fermeture
   */
  onClose: () => void;

  /**
   * Callback quand permission accordée
   */
  onPermissionGranted?: () => void;

  /**
   * Callback quand permission refusée
   */
  onPermissionDenied?: () => void;

  /**
   * Callback quand l'utilisateur choisit "Plus tard"
   */
  onDismissed?: () => void;
}

export function NotificationPermissionPrompt({
  open,
  onClose,
  onPermissionGranted,
  onPermissionDenied,
  onDismissed,
}: NotificationPermissionPromptProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [iosMessage, setIOSMessage] = useState('');

  // CRITICAL: Ne pas afficher si Firebase n'est pas disponible
  if (!firebaseChecker.isPushEnabled()) {
    return null;
  }

  useEffect(() => {
    // Détecter iOS et ses capacités
    const ios = iosNotifications.isIOS();
    setIsIOS(ios);

    if (ios) {
      const capabilities = iosNotifications.getCapabilities();
      setNeedsInstall(capabilities.needsHomeScreenInstall);
      setIOSMessage(iosNotifications.getUserMessage());
    }
  }, []);

  const handleAllow = async () => {
    setIsLoading(true);

    try {
      // Demander la permission
      const permission = await fcm.requestPermission();

      if (permission === 'granted') {
        onPermissionGranted?.();
        onClose();
      } else if (permission === 'denied') {
        onPermissionDenied?.();
        onClose();
      }
    } catch (error) {
      console.error('[NotificationPermissionPrompt] Error:', error);
      onPermissionDenied?.();
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLater = () => {
    onDismissed?.();
    onClose();
  };

  const handleNever = () => {
    // Enregistrer le refus dans localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('notification_permission_never', 'true');
    }
    onPermissionDenied?.();
    onClose();
  };

  // Si iOS et besoin d'installer, afficher un message différent
  if (isIOS && needsInstall) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Smartphone className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <DialogTitle>Install Meeshy</DialogTitle>
            </div>
            <DialogDescription className="text-base space-y-3 pt-2">
              <p>{iosMessage}</p>
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p className="font-medium text-sm text-foreground">How to install:</p>
                <ol className="space-y-2 text-sm">
                  {iosNotifications.getInstallInstructions().map((instruction, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="text-sm text-muted-foreground">
                After installation, you'll be able to receive notifications even when the app is closed.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleNever}>
              Not now
            </Button>
            <Button onClick={onClose}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Prompt normal (non-iOS ou iOS avec PWA installée)
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <DialogTitle>Enable Notifications</DialogTitle>
          </div>
          <DialogDescription className="text-base space-y-3 pt-2">
            <p>
              Stay connected with Meeshy! Receive notifications for:
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>New messages from your contacts</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Group chat activity</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Important updates</span>
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              {isIOS
                ? iosMessage
                : 'You can change this setting at any time in your account settings.'}
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="ghost"
              onClick={handleNever}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              <BellOff className="h-4 w-4 mr-2" />
              Never
            </Button>
            <Button
              variant="outline"
              onClick={handleLater}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              Later
            </Button>
          </div>
          <Button
            onClick={handleAllow}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Requesting...
              </>
            ) : (
              <>
                <Bell className="h-4 w-4 mr-2" />
                Allow Notifications
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
