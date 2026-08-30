'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Settings, Bell, Clock, MessageSquare, PhoneMissed, Users } from '@/lib/icons';
import { AtSign } from 'lucide-react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { toast } from 'sonner';
import { API_CONFIG } from '@/lib/config';
import { useI18n } from '@/hooks/use-i18n';
import { pickSubmitted } from '@/lib/preferences/submitted-preference-keys';

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

function NotificationPreferencesContent() {
  const { t } = useI18n('notifications');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  /**
   * Les clés que L'UTILISATEUR a touchées depuis le dernier enregistrement.
   *
   * L'état ci-dessus ne peut pas répondre à cette question : quand le
   * chargement échoue — hors ligne, 5xx, jeton expiré — il EST
   * `DEFAULT_PREFERENCES`, et rien ne l'en distingue. Une écriture construite
   * sur lui estampait donc les défauts de cet écran sur le document du serveur.
   *
   * Une `ref` plutôt qu'un état : rien ne se rend d'après cette liste, et un
   * rendu de plus par bascule serait payé pour rien.
   */
  const submittedKeys = useRef(new Set<string>());

  // Charger les préférences depuis la route UNIQUE (#4181)
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        // `?categories=notification` : une seule catégorie sur les sept, pas
        // les ~130 clés de l'agrégat entier pour n'en afficher que quinze.
        const response = await fetch(`${API_CONFIG.getApiUrl()}/me/preferences?categories=notification`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          // La route range chaque catégorie sous son NOM :
          // `{ success, data: { notification: {...} } }`.
          const document = data.success ? data.data?.notification : undefined;
          if (document) {
            // Les métadonnées de la LIGNE ne sont pas des réglages : les garder
            // dans un état typé `NotificationPreferences` était une dérive que
            // le commentaire précédent annonçait sans l'appliquer — `const
            // { ...prefs } = document` ne retire rien.
            const { id, userId, createdAt, updatedAt, ...prefs } = document;
            setPreferences(prev => ({ ...prev, ...prefs }));
          }
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Sauvegarder les préférences via l'API unifiée
  const savePreferences = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        toast.error(t('notifPrefs.notAuthenticated'));
        return;
      }

      // `PATCH` du seul SOUMIS, jamais `PUT` de l'état entier : cet écran
      // n'amorce que 15 des 33 champs du schéma, et la passerelle traite le
      // `PUT` en REMPLACEMENT (`schema.parse` puis `update: { notification }`,
      // Zod comblant l'absent par ses `default()`). Un enregistrement fait
      // après un chargement raté rallumait donc `callsEnabled` (les appels
      // entrants, catégorie délibérément indépendante de `pushEnabled`),
      // remettait `dndUtcOffsetMinutes` à 0 — la fenêtre « ne pas déranger »
      // repassant en UTC, neuf heures de décalage pour Tokyo — et rendait
      // `showPreview` à son défaut `true`, le contenu des messages revenant sur
      // l'écran verrouillé de qui l'avait masqué.
      const body = pickSubmitted(preferences, submittedKeys.current);
      if (Object.keys(body).length === 0) {
        toast.success(t('notifPrefs.saved'));
        return;
      }

      // Ce que CET envoi porte, retenu avant de partir : les interrupteurs
      // restent vivants pendant le vol, et un `clear()` au retour effacerait
      // une bascule faite entre-temps — elle ne partirait ni maintenant ni au
      // geste suivant, l'écran affichant une valeur que le serveur ignore.
      const inFlight = Object.keys(body);

      // Route UNIQUE de #4181 : le corps se range désormais PAR CATÉGORIE —
      // `mode=merge` (défaut) garde exactement le comportement d'avant, un
      // rejeu hors ligne compris.
      const response = await fetch(`${API_CONFIG.getApiUrl()}/me/preferences`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notification: body }),
      });

      if (response.ok) {
        for (const key of inFlight) submittedKeys.current.delete(key);
        toast.success(t('notifPrefs.saved'));
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || t('notifPrefs.saveError'));
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error(t('notifPrefs.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (key: keyof NotificationPreferences, value: boolean | string) => {
    submittedKeys.current.add(key);
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <DashboardLayout title={t('notifPrefs.pageTitle')}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" role="status" aria-label={t('notifPrefs.loading')}></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={t('notifPrefs.pageTitle')}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <Settings className="h-8 w-8" />
            {t('notifPrefs.pageTitle')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {t('notifPrefs.pageSubtitle')}
          </p>
        </div>

        <div className="space-y-6">
          {/* Canaux de notification */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                {t('notifPrefs.channels.title')}
              </CardTitle>
              <CardDescription>
                {t('notifPrefs.channels.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="push" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.channels.push.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.channels.push.description')}</span>
                </Label>
                <Switch
                  id="push"
                  checked={preferences.pushEnabled}
                  onCheckedChange={(checked) => updatePreference('pushEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="email" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.channels.email.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.channels.email.description')}</span>
                </Label>
                <Switch
                  id="email"
                  checked={preferences.emailEnabled}
                  onCheckedChange={(checked) => updatePreference('emailEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sound" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.channels.sound.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.channels.sound.description')}</span>
                </Label>
                <Switch
                  id="sound"
                  checked={preferences.soundEnabled}
                  onCheckedChange={(checked) => updatePreference('soundEnabled', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Types de notifications - Messages */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {t('notifPrefs.sections.messages.title')}
              </CardTitle>
              <CardDescription>
                {t('notifPrefs.sections.messages.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="newMessage" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.types.newMessage.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.types.newMessage.description')}</span>
                </Label>
                <Switch
                  id="newMessage"
                  checked={preferences.newMessageEnabled}
                  onCheckedChange={(checked) => updatePreference('newMessageEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="reply" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.types.reply.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.types.reply.description')}</span>
                </Label>
                <Switch
                  id="reply"
                  checked={preferences.replyEnabled}
                  onCheckedChange={(checked) => updatePreference('replyEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="conversation" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.types.conversation.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.types.conversation.description')}</span>
                </Label>
                <Switch
                  id="conversation"
                  checked={preferences.conversationEnabled}
                  onCheckedChange={(checked) => updatePreference('conversationEnabled', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Types de notifications - Interactions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AtSign className="h-5 w-5" />
                {t('notifPrefs.sections.interactions.title')}
              </CardTitle>
              <CardDescription>
                {t('notifPrefs.sections.interactions.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="mention" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.types.mention.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.types.mention.description')}</span>
                </Label>
                <Switch
                  id="mention"
                  checked={preferences.mentionEnabled}
                  onCheckedChange={(checked) => updatePreference('mentionEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="reaction" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.types.reaction.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.types.reaction.description')}</span>
                </Label>
                <Switch
                  id="reaction"
                  checked={preferences.reactionEnabled}
                  onCheckedChange={(checked) => updatePreference('reactionEnabled', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Types de notifications - Contacts & Membres */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('notifPrefs.sections.contacts.title')}
              </CardTitle>
              <CardDescription>
                {t('notifPrefs.sections.contacts.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="contactRequest" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.types.contactRequest.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.types.contactRequest.description')}</span>
                </Label>
                <Switch
                  id="contactRequest"
                  checked={preferences.contactRequestEnabled}
                  onCheckedChange={(checked) => updatePreference('contactRequestEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="memberJoined" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.types.memberJoined.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.types.memberJoined.description')}</span>
                </Label>
                <Switch
                  id="memberJoined"
                  checked={preferences.memberJoinedEnabled}
                  onCheckedChange={(checked) => updatePreference('memberJoinedEnabled', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Types de notifications - Appels & Système */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhoneMissed className="h-5 w-5" />
                {t('notifPrefs.sections.callsSystem.title')}
              </CardTitle>
              <CardDescription>
                {t('notifPrefs.sections.callsSystem.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="missedCall" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.types.missedCall.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.types.missedCall.description')}</span>
                </Label>
                <Switch
                  id="missedCall"
                  checked={preferences.missedCallEnabled}
                  onCheckedChange={(checked) => updatePreference('missedCallEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="system" className="flex flex-col">
                  <span className="font-medium">{t('notifPrefs.types.system.label')}</span>
                  <span className="text-sm text-gray-500">{t('notifPrefs.types.system.description')}</span>
                </Label>
                <Switch
                  id="system"
                  checked={preferences.systemEnabled}
                  onCheckedChange={(checked) => updatePreference('systemEnabled', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Ne pas déranger */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {t('notifPrefs.dnd.title')}
              </CardTitle>
              <CardDescription>
                {t('notifPrefs.dnd.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="dnd">
                  <span className="font-medium">{t('notifPrefs.dnd.enableLabel')}</span>
                </Label>
                <Switch
                  id="dnd"
                  checked={preferences.dndEnabled}
                  onCheckedChange={(checked) => updatePreference('dndEnabled', checked)}
                />
              </div>
              {preferences.dndEnabled && (
                <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div>
                    <Label htmlFor="dndStart" className="text-sm font-medium">{t('notifPrefs.dnd.startTime')}</Label>
                    <Input
                      id="dndStart"
                      type="time"
                      value={preferences.dndStartTime || '22:00'}
                      onChange={(e) => updatePreference('dndStartTime', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dndEnd" className="text-sm font-medium">{t('notifPrefs.dnd.endTime')}</Label>
                    <Input
                      id="dndEnd"
                      type="time"
                      value={preferences.dndEndTime || '08:00'}
                      onChange={(e) => updatePreference('dndEndTime', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <p className="col-span-2 text-sm text-gray-500 mt-2">
                    {t('notifPrefs.dnd.activePeriodNote')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Boutons d'action */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => window.location.href = '/notifications'}
            >
              {t('notifPrefs.cancel')}
            </Button>
            <Button onClick={savePreferences} disabled={saving}>
              {saving ? t('notifPrefs.saving') : t('notifPrefs.saveButton')}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function NotificationPreferencesPage() {
  return (
    <AuthGuard>
      <NotificationPreferencesContent />
    </AuthGuard>
  );
}
