'use client';

import { GroupsLayout } from '@/components/groups/groups-layout';
import { Suspense } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';

function GroupsPageContent() {
  return <GroupsLayout />;
}

function GroupsPageFallback() {
  return <div>Chargement des groupes...</div>;
}

export default function GroupsPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<GroupsPageFallback />}>
        <GroupsPageContent />
      </Suspense>
    </AuthGuard>
  );
}
