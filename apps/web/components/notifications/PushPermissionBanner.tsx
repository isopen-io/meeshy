'use client';

import { memo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';

export const PushPermissionBanner = memo(function PushPermissionBanner() {
  const { t } = useI18n('notifications');
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
      toast.success(t('push.enabled'));
    } else if (result === 'denied') {
      toast.error(t('push.denied'));
    }
  }, []);

  if (permission !== 'default' || dismissed) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
        <Bell className="h-5 w-5 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {t('push.title')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('push.description')}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <Button size="sm" variant="default" onClick={handleRequest}>
          {t('push.enable')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
          aria-label={t('dismiss')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
