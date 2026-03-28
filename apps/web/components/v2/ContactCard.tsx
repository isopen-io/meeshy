'use client';

import React, { memo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { LanguageOrb } from './LanguageOrb';
import { Badge } from './Badge';
import { Button } from './Button';
import {
  MoreVertical,
  UserPlus,
  X,
  MessageSquare,
  Eye,
  Ban,
  Phone,
} from 'lucide-react';
import type { ContactV2 } from '@/hooks/v2/use-contacts-v2';

export type ContactAction =
  | 'message'
  | 'add'
  | 'cancel'
  | 'block'
  | 'viewProfile'
  | 'call';

export interface ContactCardProps {
  contact: ContactV2;
  hasPendingRequest?: boolean;
  pendingRequestId?: string;
  isFriend?: boolean;
  onAction: (action: ContactAction, contactId: string, requestId?: string) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  className?: string;
}

export const ContactCard = memo(function ContactCard({
  contact,
  hasPendingRequest = false,
  pendingRequestId,
  isFriend = false,
  onAction,
  t,
  className,
}: ContactCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        'p-4 flex items-center gap-4 transition-colors duration-200',
        'hover:bg-[var(--gp-hover)]',
        className
      )}
    >
      <Avatar
        src={contact.avatar}
        name={contact.name}
        size="lg"
        isOnline={contact.isOnline}
        languageOrb={
          <LanguageOrb
            code={contact.languageCode}
            size="sm"
            pulse={false}
            className="w-5 h-5 text-xs border-2 border-[var(--gp-surface)]"
          />
        }
      />

      <div className="flex-1 min-w-0">
        <Link
          href={`/v2/profile/${contact.id}`}
          className="font-medium truncate block text-[var(--gp-text-primary)] hover:underline"
        >
          {contact.name}
        </Link>
        <p className="text-sm truncate text-[var(--gp-text-muted)]">
          {contact.username}
        </p>
        {!contact.isOnline && contact.lastSeen && (
          <p className="text-xs text-[var(--gp-text-muted)]">{contact.lastSeen}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {contact.isOnline && (
          <Badge variant="success" size="sm">
            {t('status.online')}
          </Badge>
        )}

        {hasPendingRequest ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction('cancel', contact.id, pendingRequestId)}
            aria-label={t('actions.cancel')}
          >
            <X className="w-4 h-4 mr-1" />
            {t('actions.cancel')}
          </Button>
        ) : !isFriend ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onAction('add', contact.id)}
            aria-label={t('actions.add')}
          >
            <UserPlus className="w-4 h-4 mr-1" />
            {t('actions.add')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction('message', contact.id)}
            aria-label={t('actions.message')}
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
        )}

        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={t('actions.menu')}
            aria-expanded={menuOpen}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div
                className={cn(
                  'absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg py-1',
                  'bg-[var(--gp-surface-elevated)] border border-[var(--gp-border)]',
                  'shadow-[var(--gp-shadow-lg)]'
                )}
                role="menu"
              >
                <button
                  className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-[var(--gp-hover)] text-[var(--gp-text-primary)]"
                  onClick={() => {
                    onAction('viewProfile', contact.id);
                    setMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <Eye className="w-4 h-4" />
                  {t('actions.viewProfile')}
                </button>
                <button
                  className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-[var(--gp-hover)] text-[var(--gp-text-primary)]"
                  onClick={() => {
                    onAction('message', contact.id);
                    setMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <MessageSquare className="w-4 h-4" />
                  {t('actions.message')}
                </button>
                <button
                  className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-[var(--gp-hover)] text-[var(--gp-text-primary)]"
                  onClick={() => {
                    onAction('call', contact.id);
                    setMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <Phone className="w-4 h-4" />
                  {t('actions.call')}
                </button>
                <div className="border-t border-[var(--gp-border)] my-1" />
                <button
                  className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-[var(--gp-hover)] text-[var(--gp-error)]"
                  onClick={() => {
                    onAction('block', contact.id);
                    setMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <Ban className="w-4 h-4" />
                  {t('actions.block')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
