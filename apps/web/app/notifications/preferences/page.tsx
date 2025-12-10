'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Settings, Bell, Clock, MessageSquare, PhoneMissed, Users } from '@/lib/icons';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { API_CONFIG } from '@/lib/config';

interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  soundEnabled: boolean;
  newMessageEnabled: boolean;
  missedCallEnabled: boolean;
  systemEnabled: boolean;
  conversationEnabled: boolean;
  dndEnabled: boolean;
  dndStartTime?: string;
  dndEndTime?: string;
}

function NotificationPreferencesContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    pushEnabled: true,
    emailEnabled: true,
    soundEnabled: true,
    newMessageEnabled: true,
    missedCallEnabled: true,
    systemEnabled: true,
    conversationEnabled: true,
    dndEnabled: false,
    dndStartTime: '22:00',
    dndEndTime: '08:00',
  });

  // Charger les préférences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        const response = await fetch(`${API_CONFIG.getApiUrl()}/notifications/preferences`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setPreferences(data.data);
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

  // Sauvegarder les préférences
  const savePreferences = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        toast.error('Non authentifié');
        return;
      }

      const response = await fetch(`${API_CONFIG.getApiUrl()}/notifications/preferences`, {
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
        toast.error('Erreur lors de l\'enregistrement');
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
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Settings className="h-8 w-8" />
            Préférences de notifications
          </h1>
          <p className="text-gray-600 mt-2">
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

          {/* Types de notifications */}
          <Card>
            <CardHeader>
              <CardTitle>Types de notifications</CardTitle>
              <CardDescription>
                Activez ou désactivez certains types de notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="newMessage" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <span className="font-medium">Nouveaux messages</span>
                </Label>
                <Switch
                  id="newMessage"
                  checked={preferences.newMessageEnabled}
                  onCheckedChange={(checked) => updatePreference('newMessageEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="missedCall" className="flex items-center gap-2">
                  <PhoneMissed className="h-4 w-4" />
                  <span className="font-medium">Appels manqués</span>
                </Label>
                <Switch
                  id="missedCall"
                  checked={preferences.missedCallEnabled}
                  onCheckedChange={(checked) => updatePreference('missedCallEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="conversation" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="font-medium">Activité de conversation</span>
                </Label>
                <Switch
                  id="conversation"
                  checked={preferences.conversationEnabled}
                  onCheckedChange={(checked) => updatePreference('conversationEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="system" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="font-medium">Notifications système</span>
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
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="dndStart">Début</Label>
                    <Input
                      id="dndStart"
                      type="time"
                      value={preferences.dndStartTime}
                      onChange={(e) => updatePreference('dndStartTime', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dndEnd">Fin</Label>
                    <Input
                      id="dndEnd"
                      type="time"
                      value={preferences.dndEndTime}
                      onChange={(e) => updatePreference('dndEndTime', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bouton de sauvegarde */}
          <div className="flex justify-end gap-3">
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
