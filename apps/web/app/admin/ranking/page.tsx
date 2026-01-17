'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy } from 'lucide-react';
import { useRankingData } from '@/hooks/use-ranking-data';
import { useRankingFilters } from '@/hooks/use-ranking-filters';
import {
  RankingFilters,
  RankingTable,
  RankingStats,
  RankingPodium
} from '@/components/admin/ranking';

export default function AdminRankingPage() {
  const router = useRouter();

  const {
    entityType,
    setEntityType,
    criterion,
    setCriterion,
    period,
    setPeriod,
    limit,
    setLimit,
    criteriaSearch,
    setCriteriaSearch
  } = useRankingFilters();

  const { rankings, loading, error, refetch } = useRankingData({
    entityType,
    criterion,
    period,
    limit
  });

  return (
    <AdminLayout currentPage="/admin/ranking">
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 rounded-lg p-6 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/admin')}
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
              <div>
                <h1 className="text-2xl font-bold flex items-center space-x-2">
                  <Trophy className="h-7 w-7" />
                  <span>Classements</span>
                </h1>
                <p className="text-yellow-100 mt-1">
                  Classez les utilisateurs, conversations, messages et liens selon différents critères
                </p>
              </div>
            </div>
          </div>
        </div>

        <RankingFilters
          entityType={entityType}
          criterion={criterion}
          period={period}
          limit={limit}
          criteriaSearch={criteriaSearch}
          onEntityTypeChange={setEntityType}
          onCriterionChange={setCriterion}
          onPeriodChange={setPeriod}
          onLimitChange={setLimit}
          onCriteriaSearchChange={setCriteriaSearch}
        />

        {!loading && rankings.length > 0 && (
          <RankingStats
            rankings={rankings}
            criterion={criterion}
            entityType={entityType}
          />
        )}

        <RankingTable
          entityType={entityType}
          rankings={rankings}
          criterion={criterion}
          loading={loading}
          error={error}
          onRetry={refetch}
        />

        {!loading && rankings.length >= 3 && (
          <RankingPodium
            rankings={rankings}
            entityType={entityType}
            criterion={criterion}
          />
        )}
      </div>
    </AdminLayout>
  );
}
