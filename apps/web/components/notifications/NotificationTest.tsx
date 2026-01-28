'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, MessageSquare, Users, Settings, Globe, Phone } from 'lucide-react';
import { notificationSocketIO } from '@/services/notification-socketio.singleton';
import { NotificationTypeEnum } from '@/types/notification';
import type { Notification } from '@/types/notification';

export function NotificationTest() {
  const createTestNotification = (
    type: Notification['type'],
    title: string,
    content: string,
    actorName?: string
  ) => {
    // Créer une notification de test au format Structure Groupée V2
    const testNotification: Notification = {
      id: `test-${type}-${Date.now()}`,
      userId: 'current-user',
      type,
      priority: 'normal',
      content,

      // Actor (qui a déclenché)
      actor: actorName
        ? {
            id: 'test-user',
            username: actorName.toLowerCase().replace(' ', ''),
            displayName: actorName,
            avatar: null,
          }
        : undefined,

      // Context (où c'est arrivé)
      context: {
        conversationId: type.includes('message') || type.includes('mention') ? 'test-conv-123' : undefined,
        conversationTitle: 'Test Conversation',
        messageId: type.includes('message') ? 'test-msg-456' : undefined,
      },

      // Metadata (données type-spécifiques)
      metadata: {
        messagePreview: type.includes('message') ? content : undefined,
        test: true,
      },

      // State (statut lecture)
      state: {
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      },

      // Delivery (suivi multi-canal)
      delivery: {
        emailSent: false,
        pushSent: false,
      },
    };

    // Simuler la réception d'une notification via Socket.IO
    // Le hook useNotificationsManagerRQ écoute ces événements et affichera automatiquement le toast
    console.log('[NotificationTest] Simulating notification:', testNotification);

    // Émettre directement via le callback des listeners
    const callbacks = (notificationSocketIO as any).notificationCallbacks;
    if (callbacks) {
      callbacks.forEach((cb: (n: Notification) => void) => cb(testNotification));
    }
  };

  const testNotifications = [
    {
      type: NotificationTypeEnum.NEW_MESSAGE,
      title: 'Nouveau message',
      content: 'Vous avez reçu un nouveau message',
      actor: 'John Doe',
      icon: MessageSquare,
      color: 'bg-blue-500',
    },
    {
      type: NotificationTypeEnum.USER_MENTIONED,
      title: 'Vous avez été mentionné',
      content: '@vous a été mentionné dans une conversation',
      actor: 'Alice Martin',
      icon: MessageSquare,
      color: 'bg-orange-500',
    },
    {
      type: NotificationTypeEnum.MISSED_CALL,
      title: 'Appel manqué',
      content: 'Appel manqué',
      actor: 'Bob Smith',
      icon: Phone,
      color: 'bg-red-500',
    },
    {
      type: NotificationTypeEnum.MEMBER_JOINED,
      title: 'Membre ajouté',
      content: 'a rejoint la conversation',
      actor: 'Charlie Brown',
      icon: Users,
      color: 'bg-green-500',
    },
    {
      type: NotificationTypeEnum.SYSTEM,
      title: 'Mise à jour système',
      content: 'Une nouvelle version est disponible',
      actor: undefined,
      icon: Settings,
      color: 'bg-gray-500',
    },
    {
      type: NotificationTypeEnum.TRANSLATION_COMPLETED,
      title: 'Traduction disponible',
      content: 'Votre traduction est prête',
      actor: undefined,
      icon: Globe,
      color: 'bg-purple-500',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bell className="h-5 w-5" />
          <span>Test du Système de Notifications v2</span>
        </CardTitle>
        <CardDescription>
          Testez les notifications avec la Structure Groupée V2 + Socket.IO
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
              onClick={() =>
                createTestNotification(test.type, test.title, test.content, test.actor)
              }
            >
              <div className={`w-3 h-3 rounded-full ${test.color} mr-3`} />
              <Icon className="h-4 w-4 mr-2" />
              {test.title}
            </Button>
          );
        })}

        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Cliquez sur un bouton pour simuler une notification Socket.IO
          </p>
          <p className="text-xs text-muted-foreground text-center mt-1">
            Les toasts s'affichent automatiquement via useNotificationsManagerRQ
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

