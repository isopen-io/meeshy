'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Re-export types
export type { MermaidDiagramProps } from './MermaidDiagramImpl';

// ======================
// Loading Skeleton for Mermaid Diagrams
// ======================

function MermaidSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 bg-gray-50 dark:bg-gray-800 rounded-lg ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-4 bg-purple-200 dark:bg-purple-800 rounded animate-pulse" />
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-24 w-full bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        <div className="flex justify-center gap-4">
          <div className="h-8 w-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-8 w-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ======================
// Dynamic Import for Mermaid (~500KB saved)
// ======================

export const MermaidDiagram = dynamic(
  () => import('./MermaidDiagramImpl').then((mod) => mod.MermaidDiagram),
  {
    ssr: false,
    loading: () => <MermaidSkeleton />
  }
);
