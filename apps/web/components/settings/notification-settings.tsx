'use client';

/**
 * Notification Settings Component
 * Composant de configuration des préférences de notifications
 * Utilise le hook usePreferences (React Query) avec optimistic updates
 */

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Bell,
  MessageSquare,
  UserPlus,
  Settings,
  Clock,
  AtSign,
  Heart,
  PhoneMissed,
  Reply,
  Loader2,
  AlertCircle,
  Mail,
  Volume2,
  Vibrate,
  Users,
  LogOut,
  Eye,
  BadgeIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { usePreferences } from '@/hooks/use-preferences';
import type { NotificationPreference } from '@meeshy/shared/types/preferences';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences';

/**
 * Validation DND: startTime doit être différent de endTime
 */
function validateDndTimes(startTime: string, endTime: string): boolean {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Permet le cas où endTime est le lendemain (ex: 22:00 -> 08:00)
  // Dans ce cas, c'est valide si startMinutes > endMinutes
  return startMinutes !== endMinutes;
}

export function NotificationSettings() {
  const reducedMotion = useReducedMotion();

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Hook usePreferences avec React Query
  const {
    data: preferences,
    isLoading,
    isUpdating,
    error,
    consentViolations,
    updatePreferences,
  } = usePreferences<'notification'>('notification', {
    onError: (error) => {
      console.error('[NotificationSettings] Error:', error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    },
    onSuccess: () => {
      // Toast uniquement si sauvegarde manuelle (pas debounced)
      // Le debounce affichera son propre toast
    },
  });

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  /**
   * Debounced update (800ms)
   */
  const debouncedUpdate = useCallback((updates: Partial<NotificationPreference>) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        await updatePreferences(updates);
        toast.success('Préférences enregistrées');
      } catch (err) {
        // Error handled by onError callback
      }
    }, 800);
  }, [updatePreferences]);

  /**
   * Update a single field with debouncing
   */
  const updateField = useCallback(<K extends keyof NotificationPreference>(
    field: K,
    value: NotificationPreference[K]
  ) => {
    debouncedUpdate({ [field]: value } as Partial<NotificationPreference>);
  }, [debouncedUpdate]);

  /**
   * Gestion du changement DND avec validation
   */
  const handleDndTimeChange = useCallback((field: 'dndStartTime' | 'dndEndTime', value: string) => {
    if (!preferences) return;

    const startTime = field === 'dndStartTime' ? value : preferences.dndStartTime;
    const endTime = field === 'dndEndTime' ? value : preferences.dndEndTime;

    if (!validateDndTimes(startTime, endTime)) {
      toast.error('L\'heure de début doit être différente de l\'heure de fin');
      return;
    }

    updateField(field, value);
  }, [preferences, updateField]);

  /**
   * Reset to defaults
   */
  const handleReset = useCallback(async () => {
    if (!window.confirm('Voulez-vous vraiment réinitialiser toutes les préférences de notification ?')) {
      return;
    }

    try {
      await updatePreferences(NOTIFICATION_PREFERENCE_DEFAULTS);
      toast.success('Préférences réinitialisées');
    } catch (err) {
      // Error handled by onError callback
    }
  }, [updatePreferences]);

  /**
   * Vérifier l'état des permissions navigateur
   */
  const browserPermission = useMemo(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }, []);

  /**
   * Demander la permission navigateur
   */
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]" role="status" aria-label="Chargement des préférences">
        <Loader2 className={`h-8 w-8 ${reducedMotion ? '' : 'animate-spin'} text-primary`} />
        <span className="sr-only">Chargement des préférences de notification...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  // No data state
  if (!preferences) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Aucune préférence disponible</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Indicateur de sauvegarde */}
      {isUpdating && (
        <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <Loader2 className={`h-4 w-4 ${reducedMotion ? '' : 'animate-spin'} text-blue-600 dark:text-blue-400`} />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            Sauvegarde en cours...
          </AlertDescription>
        </Alert>
      )}

      {/* Consent violations */}
      {consentViolations && consentViolations.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-medium">Consentements requis manquants:</p>
              <ul className="list-disc list-inside">
                {consentViolations.map((violation, index) => (
                  <li key={index}>{violation.message}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

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
          {/* Push Notifications */}
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
                onCheckedChange={(checked) => updateField('pushEnabled', checked)}
                disabled={isUpdating}
              />
              {preferences.pushEnabled && browserPermission === 'default' && (
                <button
                  onClick={requestNotificationPermission}
                  className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Autoriser
                </button>
              )}
            </div>
          </div>

          {/* Email Notifications */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Notifications email</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Recevoir un récapitulatif par email
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.emailEnabled}
              onCheckedChange={(checked) => updateField('emailEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Sound */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Volume2 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Sons de notification</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Jouer un son pour les nouvelles notifications
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.soundEnabled}
              onCheckedChange={(checked) => updateField('soundEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Vibration */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Vibrate className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Vibration</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Faire vibrer pour les nouvelles notifications (mobile)
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.vibrationEnabled}
              onCheckedChange={(checked) => updateField('vibrationEnabled', checked)}
              disabled={isUpdating}
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
          {/* New Message */}
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
              onCheckedChange={(checked) => updateField('newMessageEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Reply */}
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
              onCheckedChange={(checked) => updateField('replyEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Mention */}
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
              onCheckedChange={(checked) => updateField('mentionEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Reaction */}
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
              onCheckedChange={(checked) => updateField('reactionEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Contact Request */}
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
              onCheckedChange={(checked) => updateField('contactRequestEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Group Invite */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Invitations de groupe</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Quand vous êtes invité à rejoindre un groupe
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.groupInviteEnabled}
              onCheckedChange={(checked) => updateField('groupInviteEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Member Joined */}
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
              onCheckedChange={(checked) => updateField('memberJoinedEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Member Left */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <LogOut className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Membres partis</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Quand un membre quitte un groupe
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.memberLeftEnabled}
              onCheckedChange={(checked) => updateField('memberLeftEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Conversation Activity */}
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
              onCheckedChange={(checked) => updateField('conversationEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Missed Call */}
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
              onCheckedChange={(checked) => updateField('missedCallEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Voicemail */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Volume2 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Messages vocaux</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Notifications pour les nouveaux messages vocaux
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.voicemailEnabled}
              onCheckedChange={(checked) => updateField('voicemailEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* System */}
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
              onCheckedChange={(checked) => updateField('systemEnabled', checked)}
              disabled={isUpdating}
            />
          </div>
        </CardContent>
      </Card>

      {/* Do Not Disturb */}
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
                <Label className="text-sm sm:text-base">Activer &quot;Ne pas déranger&quot;</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Suspendre les notifications pendant une période définie
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.dndEnabled}
              onCheckedChange={(checked) => updateField('dndEnabled', checked)}
              disabled={isUpdating}
            />
          </div>

          {preferences.dndEnabled && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <Label htmlFor="dndStart" className="text-sm font-medium">Heure de début</Label>
                <Input
                  id="dndStart"
                  type="time"
                  value={preferences.dndStartTime}
                  onChange={(e) => handleDndTimeChange('dndStartTime', e.target.value)}
                  className="mt-1"
                  disabled={isUpdating}
                />
              </div>
              <div>
                <Label htmlFor="dndEnd" className="text-sm font-medium">Heure de fin</Label>
                <Input
                  id="dndEnd"
                  type="time"
                  value={preferences.dndEndTime}
                  onChange={(e) => handleDndTimeChange('dndEndTime', e.target.value)}
                  className="mt-1"
                  disabled={isUpdating}
                />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground mt-2">
                Pendant cette période, vous ne recevrez aucune notification push ou sonore.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Affichage des notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
            Affichage des notifications
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            Contrôlez ce qui est affiché dans les notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6">
          {/* Show Preview */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Eye className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Aperçu du message</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Afficher le contenu du message dans la notification
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.showPreview}
              onCheckedChange={(checked) => updateField('showPreview', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Show Sender Name */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <UserPlus className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Nom de l&apos;expéditeur</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Afficher le nom de l&apos;expéditeur dans la notification
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.showSenderName}
              onCheckedChange={(checked) => updateField('showSenderName', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Group Notifications */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Grouper les notifications</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Regrouper plusieurs notifications en une seule
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.groupNotifications}
              onCheckedChange={(checked) => updateField('groupNotifications', checked)}
              disabled={isUpdating}
            />
          </div>

          {/* Badge */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 flex-1">
              <BadgeIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="space-y-1 flex-1">
                <Label className="text-sm sm:text-base">Badge de notification</Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Afficher le nombre de notifications non lues
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.notificationBadgeEnabled}
              onCheckedChange={(checked) => updateField('notificationBadgeEnabled', checked)}
              disabled={isUpdating}
            />
          </div>
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
          {browserPermission !== 'unsupported' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Notifications navigateur</span>
                <span className={`text-sm ${
                  browserPermission === 'granted'
                    ? 'text-green-600 dark:text-green-400'
                    : browserPermission === 'denied'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-orange-600 dark:text-orange-400'
                }`}>
                  {browserPermission === 'granted'
                    ? 'Autorisées'
                    : browserPermission === 'denied'
                    ? 'Refusées'
                    : 'En attente'}
                </span>
              </div>
              {browserPermission === 'denied' && (
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

      {/* Actions */}
      <div className="flex justify-start">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={isUpdating}
        >
          Réinitialiser aux valeurs par défaut
        </Button>
      </div>
    </div>
  );
}
