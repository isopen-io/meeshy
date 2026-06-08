import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Users, MessageSquare, FileText, LinkIcon, Calendar } from 'lucide-react';
import { RANKING_CRITERIA } from './constants';
import { useI18n } from '@/hooks/useI18n';

interface RankingFiltersProps {
  entityType: 'users' | 'conversations' | 'messages' | 'links';
  criterion: string;
  period: string;
  limit: number;
  criteriaSearch: string;
  onEntityTypeChange: (type: 'users' | 'conversations' | 'messages' | 'links') => void;
  onCriterionChange: (criterion: string) => void;
  onPeriodChange: (period: string) => void;
  onLimitChange: (limit: number) => void;
  onCriteriaSearchChange: (search: string) => void;
}

const PERIOD_KEYS = ['1d', '7d', '30d', '90d', '180d', '365d', 'all'] as const;

export function RankingFilters({
  entityType,
  criterion,
  period,
  limit,
  criteriaSearch,
  onEntityTypeChange,
  onCriterionChange,
  onPeriodChange,
  onLimitChange,
  onCriteriaSearchChange
}: RankingFiltersProps) {
  const { t } = useI18n('admin');

  const periods = PERIOD_KEYS.map(key => ({
    value: key,
    label: t(`ranking.period${key === 'all' ? 'All' : key}`),
  }));

  const criteriaList = React.useMemo(() => {
    const criteria = RANKING_CRITERIA[entityType];
    if (criteriaSearch) {
      return criteria.filter(c =>
        c.label.toLowerCase().includes(criteriaSearch.toLowerCase())
      );
    }
    return criteria;
  }, [entityType, criteriaSearch]);

  return (
    <Card className="border-yellow-200 dark:border-yellow-800">
      <CardHeader className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20">
        <CardTitle className="flex items-center space-x-2">
          <Star className="h-5 w-5 text-yellow-600" />
          <span>{t('ranking.filtersTitle')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('ranking.entityType')}
              </label>
              <Select value={entityType} onValueChange={onEntityTypeChange}>
                <SelectTrigger className="border-yellow-300 focus:ring-yellow-500">
                  <SelectValue placeholder={t('ranking.selectEntity')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="users">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span>{t('ranking.entityUsers')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="conversations">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="h-4 w-4" />
                      <span>{t('ranking.entityConversations')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="messages">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4" />
                      <span>{t('ranking.entityMessages')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="links">
                    <div className="flex items-center space-x-2">
                      <LinkIcon className="h-4 w-4" />
                      <span>{t('ranking.entityLinks')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('ranking.criterion')}
              </label>
              <Select value={criterion} onValueChange={onCriterionChange}>
                <SelectTrigger className="border-yellow-300 focus:ring-yellow-500">
                  <SelectValue placeholder={t('ranking.selectCriterion')} />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 p-2 border-b border-gray-200 dark:border-gray-700">
                    <input
                      type="text"
                      placeholder={t('ranking.filterCriteria')}
                      value={criteriaSearch}
                      onChange={(e) => onCriteriaSearchChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:bg-gray-800 dark:text-gray-100"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-[320px] overflow-y-auto">
                    {criteriaList.length > 0 ? (
                      criteriaList.map((c) => {
                        const Icon = c.icon;
                        return (
                          <SelectItem key={c.value} value={c.value}>
                            <div className="flex items-center space-x-2">
                              <Icon className="h-4 w-4" />
                              <span>{c.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })
                    ) : (
                      <div className="p-4 text-sm text-center text-gray-500 dark:text-gray-400">
                        {t('ranking.noCriteriaFound')}
                      </div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('ranking.period')}
              </label>
              <Select value={period} onValueChange={onPeriodChange}>
                <SelectTrigger className="border-yellow-300 focus:ring-yellow-500">
                  <SelectValue placeholder={t('ranking.selectPeriod')} />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4" />
                        <span>{p.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('ranking.resultsCount')}
              </label>
              <Select value={limit.toString()} onValueChange={(value) => onLimitChange(parseInt(value))}>
                <SelectTrigger className="border-yellow-300 focus:ring-yellow-500">
                  <SelectValue placeholder={t('ranking.resultsCount')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="25">Top 25</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="100">Top 100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
