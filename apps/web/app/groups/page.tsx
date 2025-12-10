'use client';

import { GroupsLayout } from '@/components/groups/groups-layout';
import { Suspense } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { AuthGuard } from '@/components/auth/AuthGuard';

function GroupsPageContent() {
  return <GroupsLayout />;
}

function GroupsPageFallback() {
  const { t } = useI18n('groups');
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
