'use client';

import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

type NotificationSkeletonProps = {
  count?: number;
};

function SingleSkeleton() {
  return (
    <div className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl border border-white/30 dark:border-gray-700/40 p-4">
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-[60%]" />
            <Skeleton className="h-3 w-[15%]" />
          </div>
          <Skeleton className="h-3 w-[80%]" />
          <Skeleton className="h-3 w-[30%]" />
        </div>
      </div>
    </div>
  );
}

export const NotificationSkeleton = memo(function NotificationSkeleton({
  count = 5,
}: NotificationSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <SingleSkeleton key={i} />
      ))}
    </div>
  );
});
