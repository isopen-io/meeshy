'use client';

import { Suspense } from 'react';
import { SearchPageContent } from './SearchPageContent';
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Chargement...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}
