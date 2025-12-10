'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, MessageSquare, Users, Settings, Globe } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import { notificationService } from '@/services/notification.service';
import type { Notification } from '@/services/notification.service';

export function NotificationTest() {
  const { showToast } = useNotifications();

  const createTestNotification = (type: Notification['type'], title: string, message: string) => {
    const testNotification: Notification = {
      id: `test-${type}-${Date.now()}`,
      type,
      title,
      message,
      timestamp: new Date(),
      isRead: false,
      data: { test: true, type }
    };

    // Simuler la réception d'une notification
    showToast(testNotification);
  };

  const testNotifications = [
    {
      type: 'message' as const,
      title: 'Nouveau message',
      message: 'Vous avez reçu un nouveau message de John Doe',
      icon: MessageSquare,
      color: 'bg-blue-500'
    },
    {
      type: 'conversation' as const,
      title: 'Membre ajouté',
      message: 'Alice a rejoint la conversation',
      icon: Users,
      color: 'bg-green-500'
    },
    {
      type: 'system' as const,
      title: 'Mise à jour système',
      message: 'Une nouvelle version est disponible',
      icon: Settings,
      color: 'bg-gray-500'
    },
    {
      type: 'translation' as const,
      title: 'Traduction disponible',
      message: '🇫🇷 Bonjour le monde\n🇺🇸 Hello world\n🇪🇸 Hola mundo',
      icon: Globe,
      color: 'bg-purple-500'
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bell className="h-5 w-5" />
          <span>Test du Système de Notifications</span>
        </CardTitle>
        <CardDescription>
          Testez les différents types de notifications du nouveau système unifié
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {testNotifications.map((test, index) => {
          const Icon = test.icon;
          return (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => createTestNotification(test.type, test.title, test.message)}
            >
              <div className={`w-3 h-3 rounded-full ${test.color} mr-3`} />
              <Icon className="h-4 w-4 mr-2" />
              {test.title}
            </Button>
          );
        })}
        
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Cliquez sur un bouton pour créer une notification de test
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

