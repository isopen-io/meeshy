'use client';

import { GroupsLayout } from '@/components/groups/groups-layout';
import { Suspense } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useI18n } from '@/hooks/use-i18n';

function GroupsPageContent() {
  return <GroupsLayout />;
}

function GroupsPageFallback() {
  const { t } = useI18n('groups');
  return <div>{t('list.loadingGroups', 'Loading groups…')}</div>;
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
