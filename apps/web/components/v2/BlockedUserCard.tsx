'use client';

import React, { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from './Dialog';
import { ShieldOff } from 'lucide-react';
import type { BlockedUser } from '@/types/contacts';

export interface BlockedUserCardProps {
  user: BlockedUser;
  onUnblock: (userId: string) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  className?: string;
}

export const BlockedUserCard = memo(function BlockedUserCard({
  user,
  onUnblock,
  t,
  className,
}: BlockedUserCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const displayName = user.displayName || user.username;

  return (
    <>
      <div
        className={cn(
          'p-4 flex items-center gap-4 transition-colors duration-200',
          'hover:bg-[var(--gp-hover)] opacity-75',
          className
        )}
      >
        <Avatar
          src={user.avatar}
          name={displayName}
          size="lg"
        />

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-[var(--gp-text-primary)]">
            {displayName}
          </p>
          <p className="text-sm truncate text-[var(--gp-text-muted)]">
            @{user.username}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfirm(true)}
          aria-label={t('actions.unblock')}
        >
          <ShieldOff className="w-4 h-4 mr-1" />
          {t('actions.unblock')}
        </Button>
      </div>

      <Dialog open={showConfirm} onClose={() => setShowConfirm(false)}>
        <DialogHeader>{t('blocked.confirmTitle')}</DialogHeader>
        <DialogBody>
          <p className="text-[var(--gp-text-secondary)]">
            {t('blocked.confirmMessage', { name: displayName })}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowConfirm(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onUnblock(user.id);
              setShowConfirm(false);
            }}
          >
            {t('actions.unblock')}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
});
