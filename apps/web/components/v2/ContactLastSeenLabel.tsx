'use client';

import { memo } from 'react';
import { usersService } from '@/services/users.service';
import { useUserStatusTick } from '@/stores/user-store';

export interface ContactLastSeenLabelProps {
  lastActiveAt?: string;
  t: (key: string, params?: Record<string, unknown>) => string;
  locale?: string;
  className?: string;
}

/**
 * Libellé « vu il y a X » vivant — feuille abonnée au tick présence du user
 * store (events socket + tick périodique 60 s) : le libellé relatif se
 * recalcule au render, jamais figé au fetch. Seule cette feuille re-rend,
 * pas la card ni la liste (Zero Unnecessary Re-render).
 */
export const ContactLastSeenLabel = memo(function ContactLastSeenLabel({
  lastActiveAt,
  t,
  locale,
  className,
}: ContactLastSeenLabelProps) {
  useUserStatusTick();

  if (!lastActiveAt) return null;

  return (
    <p className={className}>
      {usersService.formatLastSeenLabel(lastActiveAt, { t, locale })}
    </p>
  );
});
