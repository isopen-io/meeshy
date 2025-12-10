'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bell, CheckCircle, AlertCircle, Info, XCircle, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Types pour les notifications
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationConfig {
  title: string;
  description?: string;
  type: NotificationType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Hook pour les notifications système
export function useNotifications() {
  const [isOnline, setIsOnline] = useState(true);

  // Surveiller l'état de la connexion (sans toasts)
  useEffect(() => {
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const notify = (config: NotificationConfig) => {
    // Désactiver les toasts sur mobile
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    if (isMobile) {
      return;
    }

    const { title, description, type, duration = 4000, action } = config;

    const getIcon = () => {
      switch (type) {
        case 'success':
          return <CheckCircle className="h-4 w-4 text-green-600" />;
        case 'error':
          return <XCircle className="h-4 w-4 text-red-600" />;
        case 'warning':
          return <AlertCircle className="h-4 w-4 text-yellow-600" />;
        case 'info':
        default:
          return <Info className="h-4 w-4 text-blue-600" />;
      }
    };

    toast(title, {
      description,
      duration,
      icon: getIcon(),
      action: action ? {
        label: action.label,
        onClick: action.onClick,
      } : undefined,
      className: `toast-${type}`,
    });
  };

  // Notifications prédéfinies
  const notifySuccess = (title: string, description?: string) => {
    notify({ title, description, type: 'success' });
  };

  const notifyError = (title: string, description?: string) => {
    notify({ title, description, type: 'error' });
  };

  const notifyWarning = (title: string, description?: string) => {
    notify({ title, description, type: 'warning' });
  };

  const notifyInfo = (title: string, description?: string) => {
    notify({ title, description, type: 'info' });
  };

  // Notifications spécifiques à l'application
  const notifyTranslationSuccess = (sourceLanguage: string, targetLanguage: string) => {
    notify({
      title: 'Message traduit',
      description: `Traduit de ${sourceLanguage} vers ${targetLanguage}`,
      type: 'success',
      duration: 2000,
    });
  };

  const notifyTranslationError = (error?: string) => {
    notify({
      title: 'Erreur de traduction',
      description: error || 'Impossible de traduire le message',
      type: 'error',
      duration: 4000,
    });
  };

  const notifyModelLoaded = (modelName: string) => {
    notify({
      title: 'Modèle chargé',
      description: `Le modèle ${modelName} est maintenant disponible`,
      type: 'success',
      duration: 3000,
    });
  };

  const notifyConnectionStatus = (connected: boolean, username?: string) => {
    // Toast de connexion désactivé pour éviter les notifications intrusives
  };

  const notifyUserJoined = (username: string) => {
    notify({
      title: 'Utilisateur connecté',
      description: `${username} a rejoint la conversation`,
      type: 'info',
      duration: 2000,
    });
  };

  const notifyUserLeft = (username: string) => {
    notify({
      title: 'Utilisateur déconnecté',
      description: `${username} a quitté la conversation`,
      type: 'info',
      duration: 2000,
    });
  };

  return {
    notify,
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
    notifyTranslationSuccess,
    notifyTranslationError,
    notifyModelLoaded,
    notifyConnectionStatus,
    notifyUserJoined,
    notifyUserLeft,
    isOnline,
  };
}

// Composant d'indicateur de statut de connexion
export function ConnectionStatus() {
  const { isOnline } = useNotifications();

  return (
    <div className="flex items-center gap-2">
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4 text-green-600" />
          <Badge variant="outline" className="text-green-600 border-green-600">
            En ligne
          </Badge>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 text-red-600" />
          <Badge variant="outline" className="text-red-600 border-red-600">
            Hors ligne
          </Badge>
        </>
      )}
    </div>
  );
}

// Composant de centre de notifications
export function NotificationCenter() {
  const [notificationCount] = useState(0);

  // Ici on pourrait implémenter un système de gestion des notifications persistantes
  // Pour l'instant, on affiche juste un indicateur

  return (
    <Button variant="ghost" size="sm" className="relative">
      <Bell className="h-4 w-4" />
      {notificationCount > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center"
        >
          {notificationCount > 9 ? '9+' : notificationCount}
        </Badge>
      )}
    </Button>
  );
}
