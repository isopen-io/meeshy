'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { getUserDisplayName } from '@/utils/user-display-name';
import { UserProfileContent, type UserProfileLoadState } from '@/components/profile/UserProfileContent';

interface ProfilePageProps {
  params: Promise<{
    id: string;
  }>;
}

/**
 * `/u/{id}` — la page profil COMPLÈTE. Le chrome (bouton retour,
 * `DashboardLayout`, titre de breadcrumb) reste ici ; le corps
 * (chargement/introuvable/chargé, actions) est `UserProfileContent`,
 * PARTAGÉ verbatim avec `UserProfileModal` (voir sa docstring) — cette page
 * reste l'accès complet que la modale renvoie via son lien « profil complet ».
 */
export default function ProfilePage({ params }: ProfilePageProps) {
  const router = useRouter();
  const { t } = useI18n('profile');
  const { t: tCommon } = useI18n('common');

  const [userId, setUserId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<UserProfileLoadState>({ loading: true, user: null });

  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params;
      const id = resolvedParams.id;

      if (!id || id === 'me') {
        router.push('/u');
        return;
      }

      setUserId(id);
    };
    resolveParams();
  }, [params, router]);

  const handleStateChange = useCallback((next: UserProfileLoadState) => {
    setLoadState(next);
  }, []);

  const headerTitle = loadState.user ? getUserDisplayName(loadState.user, t('title')) : t('title');

  return (
    <DashboardLayout title={headerTitle} hideSearch className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
      <div className="w-full px-4 md:px-8">
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {tCommon('back')}
          </Button>
        </div>

        {userId && (
          <UserProfileContent userId={userId} layout="page" onStateChange={handleStateChange} />
        )}
      </div>
    </DashboardLayout>
  );
}
