'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, MessageSquare, UserPlus, Settings } from 'lucide-react';
import { toast } from 'sonner';

interface NotificationConfig {
  newMessages: boolean;
  mentions: boolean;
  groupInvitations: boolean;
  systemUpdates: boolean;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  emailNotifications: boolean;
  mobileNotifications: boolean;
}

export function NotificationSettings() {
  const [config, setConfig] = useState<NotificationConfig>({
    newMessages: true,
    mentions: true,
    groupInvitations: true,
    systemUpdates: false,
    soundEnabled: true,
    desktopNotifications: true,
    emailNotifications: false,
    mobileNotifications: true,
  });

  useEffect(() => {
    const savedConfig = localStorage.getItem('meeshy-notification-config');
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    }
  }, []);

  const handleConfigChange = (key: keyof NotificationConfig, value: boolean) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    localStorage.setItem('meeshy-notification-config', JSON.stringify(newConfig));
    toast.success('Paramètres de notifications mis à jour');
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        toast.success('Notifications autorisées');
      } else {
        toast.error('Notifications refusées');
      }
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            Types de notifications
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Choisissez les événements pour lesquels vous souhaitez être notifié
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Nouveaux messages</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Notifications pour tous les nouveaux messages
                </p>
              </div>
            </div>
            <Switch
              checked={config.newMessages}
              onCheckedChange={(checked) => handleConfigChange('newMessages', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Bell className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Mentions</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Quand quelqu&apos;un vous mentionne dans un message
                </p>
              </div>
            </div>
            <Switch
              checked={config.mentions}
              onCheckedChange={(checked) => handleConfigChange('mentions', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <Label>Invitations de groupe</Label>
                <p className="text-sm text-muted-foreground">
                  Notifications d&apos;invitations à rejoindre des groupes
                </p>
              </div>
            </div>
            <Switch
              checked={config.groupInvitations}
              onCheckedChange={(checked) => handleConfigChange('groupInvitations', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <Label>Mises à jour système</Label>
                <p className="text-sm text-muted-foreground">
                  Notifications de nouvelles fonctionnalités et mises à jour
                </p>
              </div>
            </div>
            <Switch
              checked={config.systemUpdates}
              onCheckedChange={(checked) => handleConfigChange('systemUpdates', checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Méthodes de notification</CardTitle>
          <CardDescription>
            Configurez comment vous souhaitez recevoir les notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Son de notification</Label>
              <p className="text-sm text-muted-foreground">
                Joue un son lors de la réception de notifications
              </p>
            </div>
            <Switch
              checked={config.soundEnabled}
              onCheckedChange={(checked) => handleConfigChange('soundEnabled', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Notifications bureau</Label>
              <p className="text-sm text-muted-foreground">
                Affiche des notifications sur votre bureau
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={config.desktopNotifications}
                onCheckedChange={(checked) => handleConfigChange('desktopNotifications', checked)}
              />
              {config.desktopNotifications && 'Notification' in window && Notification.permission === 'default' && (
                <button
                  onClick={requestNotificationPermission}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Autoriser
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Notifications email</Label>
              <p className="text-sm text-muted-foreground">
                Reçoit des notifications par email pour les messages importants
              </p>
            </div>
            <Switch
              checked={config.emailNotifications}
              onCheckedChange={(checked) => handleConfigChange('emailNotifications', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Notifications mobiles</Label>
              <p className="text-sm text-muted-foreground">
                Push notifications sur vos appareils mobiles
              </p>
            </div>
            <Switch
              checked={config.mobileNotifications}
              onCheckedChange={(checked) => handleConfigChange('mobileNotifications', checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>État des permissions</CardTitle>
          <CardDescription>
            Statut actuel des autorisations de notification
          </CardDescription>
        </CardHeader>
        <CardContent>
          {'Notification' in window ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Notifications navigateur</span>
                <span className={`text-sm ${
                  Notification.permission === 'granted' 
                    ? 'text-green-600' 
                    : Notification.permission === 'denied' 
                    ? 'text-red-600' 
                    : 'text-orange-600'
                }`}>
                  {Notification.permission === 'granted' 
                    ? 'Autorisées' 
                    : Notification.permission === 'denied' 
                    ? 'Refusées' 
                    : 'En attente'}
                </span>
              </div>
              {Notification.permission === 'denied' && (
                <p className="text-sm text-muted-foreground">
                  Les notifications ont été refusées. Vous pouvez les réactiver dans les paramètres de votre navigateur.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Les notifications ne sont pas supportées par votre navigateur.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
