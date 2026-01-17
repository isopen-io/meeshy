/**
 * Composant pour gérer le layout en grille des attachments
 */

'use client';

import React, { ReactNode } from 'react';

export interface AttachmentGridLayoutProps {
  children: ReactNode;
  attachmentCount: number;
  isOwnMessage?: boolean;
  className?: string;
}

export const AttachmentGridLayout = React.memo(function AttachmentGridLayout({
  children,
  attachmentCount,
  isOwnMessage = false,
  className = '',
}: AttachmentGridLayoutProps) {
  const getLayoutClasses = () => {
    if (attachmentCount === 1 || attachmentCount === 2) {
      return `flex flex-col gap-1 ${isOwnMessage ? 'items-end' : 'items-start'}`;
    } else if (attachmentCount <= 4) {
      return `grid grid-cols-2 gap-1 ${isOwnMessage ? 'justify-items-end' : 'justify-items-start'}`;
    } else {
      return `flex flex-wrap gap-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`;
    }
  };

  return (
    <div className={`${getLayoutClasses()} w-full max-w-full ${className}`}>
      {children}
    </div>
  );
});
