'use client';

import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

type NotificationSkeletonProps = {
  count?: number;
};

function SingleSkeleton() {
  return (
    <div className="flex items-start gap-3 border-l-2 border-transparent px-4 py-3">
      <Skeleton className="h-11 w-11 flex-shrink-0 rounded-full" />
      <div className="flex-1 space-y-2 py-0.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-[55%]" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-[80%]" />
      </div>
    </div>
  );
}

export const NotificationSkeleton = memo(function NotificationSkeleton({
  count = 5,
}: NotificationSkeletonProps) {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: count }, (_, i) => (
        <SingleSkeleton key={i} />
      ))}
    </div>
  );
});
