'use client';

import '@/lib/react-query/focus-manager';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createQueryClient } from '@/lib/react-query/query-client';
import { indexedDbPersister } from '@/lib/react-query/persister';
import { shouldDehydrateQuery } from '@/lib/react-query/persist-options';
import { initSettingsSync, destroySettingsSync } from '@/lib/settings-sync';

const ReactQueryDevtools =
  process.env.NODE_ENV === 'production'
    ? null
    : dynamic(
        () =>
          import('@tanstack/react-query-devtools').then(
            (m) => m.ReactQueryDevtools,
          ),
        { ssr: false },
      );

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => createQueryClient());

  useEffect(() => {
    initSettingsSync(queryClient);
    return () => destroySettingsSync();
  }, [queryClient]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: indexedDbPersister,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        buster: process.env.NEXT_PUBLIC_APP_VERSION ?? 'v1',
        dehydrateOptions: { shouldDehydrateQuery },
      }}
    >
      {children}
      {ReactQueryDevtools && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </PersistQueryClientProvider>
  );
}
