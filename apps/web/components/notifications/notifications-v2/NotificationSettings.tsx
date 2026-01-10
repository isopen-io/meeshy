'use client';

/**
 * Notification Settings Component
 * Page de configuration des notifications
 *
 * Features:
 * - Toggle push notifications ON/OFF
 * - Status actuel (Autorisées, Bloquées, Non supportées)
 * - Test notification button
 * - Informations spécifiques iOS
 */

import { useState, useEffect } from 'react';
import { Bell, BellOff, TestTube, AlertCircle, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fcm, NotificationPermission } from '@/utils/fcm-manager';
import { iosNotifications } from '@/utils/ios-notification-manager';
import { NotificationPermissionPrompt } from './NotificationPermissionPrompt';

export function NotificationSettings() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosCapabilities, setIOSCapabilities] = useState<any>(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  useEffect(() => {
    checkNotificationStatus();
  }, []);

  const checkNotificationStatus = async () => {
    // Vérifier support
    const supported = await fcm.isSupported();
    setIsSupported(supported);

    // Vérifier permission
    const currentPermission = fcm.getPermissionStatus();
    setPermission(currentPermission);

    // Vérifier iOS
    const ios = iosNotifications.isIOS();
    setIsIOS(ios);

    if (ios) {
      const capabilities = iosNotifications.getCapabilities();
      setIOSCapabilities(capabilities);
    }

    // Obtenir le token actuel si disponible
    const token = fcm.getCurrentToken();
    setCurrentToken(token);
  };

  const handleToggleNotifications = async () => {
    if (permission === 'granted') {
      // Désactiver: supprimer le token
      const success = await fcm.deleteToken();
      if (success) {
        setCurrentToken(null);
        // Note: On ne peut pas révoquer la permission navigateur,
        // mais on supprime le token FCM
        alert('Notifications disabled. To fully disable, please change your browser settings.');
      }
    } else if (permission === 'default') {
      // Activer: demander permission
      setShowPermissionPrompt(true);
    } else {
      // Bloqué: guider l'utilisateur
      alert(
        'Notifications are blocked. Please enable them in your browser settings:\n\n' +
        '1. Click the lock icon in the address bar\n' +
        '2. Find "Notifications" setting\n' +
        '3. Change to "Allow"\n' +
        '4. Refresh this page'
      );
    }
  };

  const handleTestNotification = async () => {
    if (permission !== 'granted') {
      alert('Please enable notifications first');
      return;
    }

    setIsTestingNotification(true);

    try {
      // Créer une notification test
      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification('Test Notification', {
        body: 'This is a test notification from Meeshy!',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [200, 100, 200],
        tag: 'test-notification',
        data: {
          url: '/notifications',
        },
      });

      // Success feedback
      setTimeout(() => {
        setIsTestingNotification(false);
      }, 1000);
    } catch (error) {
      console.error('Test notification error:', error);
      alert('Failed to send test notification. Please check your browser settings.');
      setIsTestingNotification(false);
    }
  };

  const handlePermissionGranted = async () => {
    await checkNotificationStatus();
    setShowPermissionPrompt(false);
  };

  const getStatusBadge = () => {
    switch (permission) {
      case 'granted':
        return (
          <Badge variant="default" className="bg-green-500">
            <Check className="h-3 w-3 mr-1" />
            Enabled
          </Badge>
        );
      case 'denied':
        return (
          <Badge variant="destructive">
            <BellOff className="h-3 w-3 mr-1" />
            Blocked
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <AlertCircle className="h-3 w-3 mr-1" />
            Not configured
          </Badge>
        );
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Push Notifications</CardTitle>
              <CardDescription>
                Manage how you receive notifications from Meeshy
              </CardDescription>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* iOS Warning */}
          {isIOS && iosCapabilities && !iosCapabilities.canReceivePushNotifications && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {iosCapabilities.reason}
                {iosCapabilities.needsHomeScreenInstall && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPermissionPrompt(true)}
                    >
                      View Installation Guide
                    </Button>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Not Supported Warning */}
          {!isSupported && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Push notifications are not supported on your device or browser.
                You will only receive in-app notifications.
              </AlertDescription>
            </Alert>
          )}

          {/* Main Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="push-notifications" className="text-base">
                Push Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications even when Meeshy is closed
              </p>
            </div>
            <Switch
              id="push-notifications"
              checked={permission === 'granted'}
              onCheckedChange={handleToggleNotifications}
              disabled={!isSupported || (isIOS && !iosCapabilities?.canReceivePushNotifications)}
            />
          </div>

          {/* Test Notification */}
          {permission === 'granted' && (
            <div className="pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleTestNotification}
                disabled={isTestingNotification}
                className="w-full"
              >
                {isTestingNotification ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Sending Test...
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    Send Test Notification
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Token Info (Debug) */}
          {process.env.NODE_ENV === 'development' && currentToken && (
            <div className="pt-4 border-t">
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Developer Info
                </summary>
                <div className="mt-2 p-2 bg-muted rounded text-[10px] font-mono break-all">
                  <p className="font-semibold mb-1">FCM Token:</p>
                  <p>{currentToken}</p>
                </div>
              </details>
            </div>
          )}

          {/* Additional Info */}
          <div className="pt-4 border-t space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong>What notifications will I receive?</strong>
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 ml-4">
              <li>• New messages from contacts</li>
              <li>• Group chat mentions and replies</li>
              <li>• Important system updates</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              You can manage notification preferences in your browser settings at any time.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Permission Prompt Dialog */}
      <NotificationPermissionPrompt
        open={showPermissionPrompt}
        onClose={() => setShowPermissionPrompt(false)}
        onPermissionGranted={handlePermissionGranted}
        onPermissionDenied={() => setShowPermissionPrompt(false)}
        onDismissed={() => setShowPermissionPrompt(false)}
      />
    </>
  );
}
