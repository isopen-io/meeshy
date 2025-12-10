'use client';

import { Card, CardContent } from '@/components/ui/card';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 6 }: TableSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid gap-4 p-3 border rounded-lg animate-pulse dark:border-gray-700"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, j) => (
            <div key={j} className="flex items-center">
              {j === 0 && (
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 mr-3" />
              )}
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                {j === 0 && (
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-6">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3" />
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
      </CardContent>
    </Card>
  );
}
