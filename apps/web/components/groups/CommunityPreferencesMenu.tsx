'use client';

import { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Pin, BellOff, Archive, Bell, BellRing, BellMinus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCommunityPreferencesQuery,
  useUpdateCommunityPreferencesMutation,
} from '@/hooks/queries';
import type { CommunityNotificationLevel } from '@meeshy/shared/types/user-preferences';
import { toast } from 'sonner';

interface CommunityPreferencesMenuProps {
  communityId: string;
  t: (key: string) => string;
}

const DEFAULT_PREFS = {
  isPinned: false,
  isMuted: false,
  isArchived: false,
  notificationLevel: 'all' as CommunityNotificationLevel,
};

const NOTIFICATION_OPTIONS: Array<{
  value: CommunityNotificationLevel;
  icon: typeof Bell;
  labelKey: string;
}> = [
  { value: 'all', icon: BellRing, labelKey: 'preferences.notifAll' },
  { value: 'mentions', icon: BellMinus, labelKey: 'preferences.notifMentions' },
  { value: 'none', icon: BellOff, labelKey: 'preferences.notifNone' },
];

export const CommunityPreferencesMenu = memo(function CommunityPreferencesMenu({
  communityId,
  t,
}: CommunityPreferencesMenuProps) {
  const { data: preferences } = useCommunityPreferencesQuery(communityId);
  const updateMutation = useUpdateCommunityPreferencesMutation();

  const prefs = preferences ?? DEFAULT_PREFS;

  const togglePreference = useCallback(
    async (key: 'isPinned' | 'isMuted' | 'isArchived') => {
      try {
        await updateMutation.mutateAsync({
          communityId,
          data: { [key]: !prefs[key] },
        });
      } catch {
        toast.error(t('preferences.updateError'));
      }
    },
    [communityId, prefs, updateMutation, t]
  );

  const setNotificationLevel = useCallback(
    async (level: CommunityNotificationLevel) => {
      try {
        await updateMutation.mutateAsync({
          communityId,
          data: { notificationLevel: level },
        });
      } catch {
        toast.error(t('preferences.updateError'));
      }
    },
    [communityId, updateMutation, t]
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <PreferenceButton
          active={prefs.isPinned}
          icon={Pin}
          label={t('preferences.pin')}
          onClick={() => togglePreference('isPinned')}
          disabled={updateMutation.isPending}
        />
        <PreferenceButton
          active={prefs.isMuted}
          icon={BellOff}
          label={t('preferences.mute')}
          onClick={() => togglePreference('isMuted')}
          disabled={updateMutation.isPending}
        />
        <PreferenceButton
          active={prefs.isArchived}
          icon={Archive}
          label={t('preferences.archive')}
          onClick={() => togglePreference('isArchived')}
          disabled={updateMutation.isPending}
        />
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          {t('preferences.notifications')}
        </p>
        <div className="flex gap-1">
          {NOTIFICATION_OPTIONS.map(({ value, icon: Icon, labelKey }) => (
            <Button
              key={value}
              variant="ghost"
              size="sm"
              className={cn(
                'flex-1 text-xs h-8',
                prefs.notificationLevel === value && 'bg-primary/10 text-primary'
              )}
              onClick={() => setNotificationLevel(value)}
              disabled={updateMutation.isPending}
            >
              <Icon className="h-3 w-3 mr-1" />
              {t(labelKey)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
});

interface PreferenceButtonProps {
  active: boolean;
  icon: typeof Pin;
  label: string;
  onClick: () => void;
  disabled: boolean;
}

const PreferenceButton = memo(function PreferenceButton({
  active,
  icon: Icon,
  label,
  onClick,
  disabled,
}: PreferenceButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'flex-1 text-xs h-9',
        active && 'bg-primary/10 text-primary'
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-3.5 w-3.5 mr-1.5" />
      {label}
    </Button>
  );
});
