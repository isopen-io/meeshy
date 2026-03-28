'use client';

import { memo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';

export const PushPermissionBanner = memo(function PushPermissionBanner() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }

    setPermission(Notification.permission);

    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' as PermissionName }).then((status) => {
        status.onchange = () => {
          setPermission(Notification.permission);
        };
      }).catch(() => {
        // permissions.query not supported for notifications in this browser
      });
    }
  }, []);

  const handleRequest = useCallback(async () => {
    if (!('Notification' in window)) return;

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      toast.success('Push notifications enabled');
    } else if (result === 'denied') {
      toast.error('Push notifications denied. You can change this in your browser settings.');
    }
  }, []);

  if (permission !== 'default' || dismissed) return null;

  return (
    <div className="backdrop-blur-xl bg-blue-50/80 dark:bg-blue-950/40 rounded-2xl border border-blue-200/50 dark:border-blue-800/40 p-4 mb-4 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50">
        <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
          Enable push notifications
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Get notified even when the app is in the background
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="default"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleRequest}
        >
          Enable
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
