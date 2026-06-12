'use client';

import { Suspense } from 'react';
import { SearchPageContent } from './SearchPageContent';
export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen" role="status" aria-busy="true">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 dark:border-gray-700 border-t-primary" />
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
