'use client';

/**
 * Notification Settings Component
 * Composant de configuration des préférences de notifications
 * Synchronisé avec l'API backend /user-preferences/notifications
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bell, MessageSquare, UserPlus, Settings, Clock, AtSign, Heart, PhoneMissed, Reply, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { API_CONFIG } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { useReducedMotion, SoundFeedback } from '@/hooks/use-accessibility';

/**
 * Interface des préférences de notifications
 * Correspond exactement au modèle Prisma NotificationPreference
 */
interface NotificationPreferences {
  // Global toggles
  pushEnabled: boolean;
  emailEnabled: boolean;
  soundEnabled: boolean;

  // Per-type preferences
  newMessageEnabled: boolean;
  missedCallEnabled: boolean;
  systemEnabled: boolean;
  conversationEnabled: boolean;
  replyEnabled: boolean;
  mentionEnabled: boolean;
  reactionEnabled: boolean;
  contactRequestEnabled: boolean;
  memberJoinedEnabled: boolean;

  // Do Not Disturb
  dndEnabled: boolean;
  dndStartTime?: string;
  dndEndTime?: string;
}

/**
 * Valeurs par défaut - correspondent à NOTIFICATION_PREFERENCES_DEFAULTS du backend
 */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  emailEnabled: true,
  soundEnabled: true,
  newMessageEnabled: true,
  missedCallEnabled: true,
  systemEnabled: true,
  conversationEnabled: true,
  replyEnabled: true,
  mentionEnabled: true,
  reactionEnabled: true,
  contactRequestEnabled: true,
  memberJoinedEnabled: true,
  dndEnabled: false,
  dndStartTime: '22:00',
  dndEndTime: '08:00',
};

export function NotificationSettings() {
  const reducedMotion = useReducedMotion();
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Charger les préférences depuis l'API
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const token = authManager.getAuthToken();
        if (!token) {
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_CONFIG.getApiUrl()}/user-preferences/notifications`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const { id, userId, isDefault, createdAt, updatedAt, ...prefs } = data.data;
            setPreferences(prev => ({ ...prev, ...prefs }));
          }
        }
      } catch (error) {
        console.error('Error loading notification preferences:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Sauvegarder les préférences
  const savePreferences = async () => {
    setSaving(true);
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error('Non authentifié');
        return;
      }

      const response = await fetch(`${API_CONFIG.getApiUrl()}/user-preferences/notifications`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        toast.success('Préférences de notifications enregistrées');
        setHasChanges(false);
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || 'Erreur lors de l\'enregistrement');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Erreur réseau');
    } finally {
      setSaving(false);
    }
  };

  const handlePreferenceChange = (key: keyof NotificationPreferences, value: boolean | string) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]" role="status" aria-label="Chargement des préférences">
        <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-primary`} />
        <span className="sr-only">Chargement des préférences de notification...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Canaux de notification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            Canaux de notification
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Choisissez comment vous souhaitez recevoir les notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Bell className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Notifications push</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Recevoir des notifications dans le navigateur
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={preferences.pushEnabled}
                onCheckedChange={(checked) => handlePreferenceChange('pushEnabled', checked)}
              />
              {preferences.pushEnabled && 'Notification' in window && Notification.permission === 'default' && (
                <button
                  onClick={requestNotificationPermission}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Autoriser
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Settings className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Notifications email</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Recevoir un récapitulatif par email
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.emailEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('emailEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Bell className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Sons de notification</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Jouer un son pour les nouvelles notifications
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.soundEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('soundEnabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Types de notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
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
                  Notifications pour les nouveaux messages reçus
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.newMessageEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('newMessageEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Reply className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Réponses</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Quand quelqu&apos;un répond à vos messages
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.replyEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('replyEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <AtSign className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Mentions</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Quand vous êtes mentionné (@) dans un message
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.mentionEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('mentionEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Heart className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Réactions</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Notifications pour les réactions à vos messages
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.reactionEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('reactionEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <UserPlus className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Demandes de contact</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Notifications pour les nouvelles demandes de contact
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.contactRequestEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('contactRequestEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <UserPlus className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Nouveaux membres</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Quand un membre rejoint un groupe
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.memberJoinedEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('memberJoinedEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Bell className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Activité de conversation</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Mises à jour et changements dans les conversations
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.conversationEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('conversationEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <PhoneMissed className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Appels manqués</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Notifications pour les appels manqués
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.missedCallEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('missedCallEnabled', checked)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Settings className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Notifications système</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Mises à jour importantes et annonces
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.systemEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('systemEnabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ne pas déranger */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            Ne pas déranger
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Définissez une plage horaire sans notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Activer "Ne pas déranger"</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Suspendre les notifications pendant une période définie
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.dndEnabled}
              onCheckedChange={(checked) => handlePreferenceChange('dndEnabled', checked)}
            />
          </div>

          {preferences.dndEnabled && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <Label htmlFor="dndStart" className="text-sm font-medium">Heure de début</Label>
                <Input
                  id="dndStart"
                  type="time"
                  value={preferences.dndStartTime || '22:00'}
                  onChange={(e) => handlePreferenceChange('dndStartTime', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="dndEnd" className="text-sm font-medium">Heure de fin</Label>
                <Input
                  id="dndEnd"
                  type="time"
                  value={preferences.dndEndTime || '08:00'}
                  onChange={(e) => handlePreferenceChange('dndEndTime', e.target.value)}
                  className="mt-1"
                />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground mt-2">
                Pendant cette période, vous ne recevrez aucune notification push ou sonore.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* État des permissions */}
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

      {/* Bouton de sauvegarde */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={savePreferences} disabled={saving} className="shadow-lg">
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </Button>
        </div>
      )}
    </div>
  );
}
