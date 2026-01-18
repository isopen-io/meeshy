'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Settings, Bell, Clock, MessageSquare, PhoneMissed, Users, UserPlus } from '@/lib/icons';
import { AtSign, Heart, Reply } from 'lucide-react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { API_CONFIG } from '@/lib/config';

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
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  // Charger les préférences depuis l'API unifiée
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        // Utilise le nouvel endpoint unifié /me/preferences/notification
        const response = await fetch(`${API_CONFIG.getApiUrl()}/me/preferences/notification`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            // Exclure les champs non nécessaires pour l'état local (id, userId, isDefault, timestamps)
            const { id, userId, isDefault, createdAt, updatedAt, ...prefs } = data.data;
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
        toast.error('Non authentifié');
        return;
      }

      // Utilise le nouvel endpoint unifié /me/preferences/notification
      const response = await fetch(`${API_CONFIG.getApiUrl()}/me/preferences/notification`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        toast.success('Préférences enregistrées');
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

  const updatePreference = (key: keyof NotificationPreferences, value: boolean | string) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <DashboardLayout title="Préférences de notifications">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Préférences de notifications">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <Settings className="h-8 w-8" />
            Préférences de notifications
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Personnalisez vos notifications selon vos préférences
          </p>
        </div>

        <div className="space-y-6">
          {/* Canaux de notification */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Canaux de notification
              </CardTitle>
              <CardDescription>
                Choisissez comment vous souhaitez recevoir les notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="push" className="flex flex-col">
                  <span className="font-medium">Notifications push</span>
                  <span className="text-sm text-gray-500">Recevoir des notifications dans le navigateur</span>
                </Label>
                <Switch
                  id="push"
                  checked={preferences.pushEnabled}
                  onCheckedChange={(checked) => updatePreference('pushEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="email" className="flex flex-col">
                  <span className="font-medium">Notifications par email</span>
                  <span className="text-sm text-gray-500">Recevoir un récapitulatif par email</span>
                </Label>
                <Switch
                  id="email"
                  checked={preferences.emailEnabled}
                  onCheckedChange={(checked) => updatePreference('emailEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sound" className="flex flex-col">
                  <span className="font-medium">Son de notification</span>
                  <span className="text-sm text-gray-500">Jouer un son pour les nouvelles notifications</span>
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
                Notifications de messages
              </CardTitle>
              <CardDescription>
                Gérez les notifications liées aux messages et conversations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="newMessage" className="flex flex-col">
                  <span className="font-medium">Nouveaux messages</span>
                  <span className="text-sm text-gray-500">Notifications pour les nouveaux messages reçus</span>
                </Label>
                <Switch
                  id="newMessage"
                  checked={preferences.newMessageEnabled}
                  onCheckedChange={(checked) => updatePreference('newMessageEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="reply" className="flex flex-col">
                  <span className="font-medium">Réponses</span>
                  <span className="text-sm text-gray-500">Notifications quand quelqu'un répond à vos messages</span>
                </Label>
                <Switch
                  id="reply"
                  checked={preferences.replyEnabled}
                  onCheckedChange={(checked) => updatePreference('replyEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="conversation" className="flex flex-col">
                  <span className="font-medium">Activité de conversation</span>
                  <span className="text-sm text-gray-500">Notifications pour les mises à jour de conversations</span>
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
                Interactions
              </CardTitle>
              <CardDescription>
                Gérez les notifications pour les mentions et réactions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="mention" className="flex flex-col">
                  <span className="font-medium">Mentions</span>
                  <span className="text-sm text-gray-500">Notifications quand vous êtes mentionné (@)</span>
                </Label>
                <Switch
                  id="mention"
                  checked={preferences.mentionEnabled}
                  onCheckedChange={(checked) => updatePreference('mentionEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="reaction" className="flex flex-col">
                  <span className="font-medium">Réactions</span>
                  <span className="text-sm text-gray-500">Notifications pour les réactions à vos messages</span>
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
                Contacts et membres
              </CardTitle>
              <CardDescription>
                Gérez les notifications liées aux contacts et groupes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="contactRequest" className="flex flex-col">
                  <span className="font-medium">Demandes de contact</span>
                  <span className="text-sm text-gray-500">Notifications pour les nouvelles demandes de contact</span>
                </Label>
                <Switch
                  id="contactRequest"
                  checked={preferences.contactRequestEnabled}
                  onCheckedChange={(checked) => updatePreference('contactRequestEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="memberJoined" className="flex flex-col">
                  <span className="font-medium">Nouveaux membres</span>
                  <span className="text-sm text-gray-500">Notifications quand un membre rejoint un groupe</span>
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
                Appels et système
              </CardTitle>
              <CardDescription>
                Gérez les notifications d'appels et système
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="missedCall" className="flex flex-col">
                  <span className="font-medium">Appels manqués</span>
                  <span className="text-sm text-gray-500">Notifications pour les appels manqués</span>
                </Label>
                <Switch
                  id="missedCall"
                  checked={preferences.missedCallEnabled}
                  onCheckedChange={(checked) => updatePreference('missedCallEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="system" className="flex flex-col">
                  <span className="font-medium">Notifications système</span>
                  <span className="text-sm text-gray-500">Mises à jour importantes et annonces</span>
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
                Ne pas déranger
              </CardTitle>
              <CardDescription>
                Définissez une plage horaire pendant laquelle vous ne souhaitez pas recevoir de notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="dnd">
                  <span className="font-medium">Activer "Ne pas déranger"</span>
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
                    <Label htmlFor="dndStart" className="text-sm font-medium">Heure de début</Label>
                    <Input
                      id="dndStart"
                      type="time"
                      value={preferences.dndStartTime || '22:00'}
                      onChange={(e) => updatePreference('dndStartTime', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dndEnd" className="text-sm font-medium">Heure de fin</Label>
                    <Input
                      id="dndEnd"
                      type="time"
                      value={preferences.dndEndTime || '08:00'}
                      onChange={(e) => updatePreference('dndEndTime', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <p className="col-span-2 text-sm text-gray-500 mt-2">
                    Pendant cette période, vous ne recevrez aucune notification push ou sonore.
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
              Annuler
            </Button>
            <Button onClick={savePreferences} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer les préférences'}
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
