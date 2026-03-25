'use client';

import React, { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { usersService } from '@/services/users.service';
import { User } from '@/types';
import { cn } from '@/lib/utils';

interface UserDisplayProps {
  userId?: string;
  user?: User;
  showUsername?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function UserDisplay({ userId, user: initialUser, showUsername = true, className, size = 'md' }: UserDisplayProps) {
  const [user, setUser] = useState<User | undefined>(initialUser);
  const [loading, setLoading] = useState(!initialUser && !!userId);

  useEffect(() => {
    if (!initialUser && userId) {
      setLoading(true);
      usersService.getUserProfile(userId)
        .then(res => {
          if (res.success && res.data) {
            setUser(res.data);
          }
        })
        .catch(err => console.error('Error fetching user profile:', err))
        .finally(() => setLoading(false));
    }
  }, [userId, initialUser]);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Skeleton className={cn(
          "rounded-full",
          size === 'sm' ? "h-6 w-6" : size === 'md' ? "h-8 w-8" : "h-10 w-10"
        )} />
        <div className="space-y-1">
          <Skeleton className="h-3 w-20" />
          {showUsername && <Skeleton className="h-2 w-12" />}
        </div>
      </div>
    );
  }

  if (!user && userId) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Avatar className={cn(
          size === 'sm' ? "h-6 w-6" : size === 'md' ? "h-8 w-8" : "h-10 w-10"
        )}>
          <AvatarFallback className="text-[10px]">?</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="text-xs font-mono text-gray-500">{userId.slice(0, 8)}...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const displayName = usersService.getDisplayName(user);
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className={cn("flex items-center gap-2 overflow-hidden", className)}>
      <Avatar className={cn(
        "shrink-0",
        size === 'sm' ? "h-6 w-6" : size === 'md' ? "h-8 w-8" : "h-10 w-10"
      )}>
        <AvatarImage src={user.avatar} alt={displayName} />
        <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={displayName}>
          {displayName}
        </span>
        {showUsername && (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            @{user.username}
          </span>
        )}
      </div>
    </div>
  );
}
