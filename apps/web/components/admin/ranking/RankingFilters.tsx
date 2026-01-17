import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Users, MessageSquare, FileText, LinkIcon, Calendar } from 'lucide-react';
import { RANKING_CRITERIA } from './constants';

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

const PERIODS = [
  { value: '1d', label: 'Dernier jour (24h)' },
  { value: '7d', label: 'Dernière semaine (7j)' },
  { value: '30d', label: 'Dernier mois (30j)' },
  { value: '90d', label: 'Dernier trimestre (90j)' },
  { value: '180d', label: 'Dernier semestre (180j)' },
  { value: '365d', label: 'Dernière année (365j)' },
  { value: 'all', label: 'Tous les temps' }
];

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
          <span>Filtres de classement</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Type d'entité
              </label>
              <Select value={entityType} onValueChange={onEntityTypeChange}>
                <SelectTrigger className="border-yellow-300 focus:ring-yellow-500">
                  <SelectValue placeholder="Sélectionnez le type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="users">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span>Utilisateurs</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="conversations">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="h-4 w-4" />
                      <span>Conversations</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="messages">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4" />
                      <span>Messages</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="links">
                    <div className="flex items-center space-x-2">
                      <LinkIcon className="h-4 w-4" />
                      <span>Liens</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Critère
              </label>
              <Select value={criterion} onValueChange={onCriterionChange}>
                <SelectTrigger className="border-yellow-300 focus:ring-yellow-500">
                  <SelectValue placeholder="Sélectionnez le critère" />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 p-2 border-b border-gray-200 dark:border-gray-700">
                    <input
                      type="text"
                      placeholder="Filtrer les critères..."
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
                        Aucun critère trouvé
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
                Période
              </label>
              <Select value={period} onValueChange={onPeriodChange}>
                <SelectTrigger className="border-yellow-300 focus:ring-yellow-500">
                  <SelectValue placeholder="Sélectionnez la période" />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
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
                Nombre de résultats
              </label>
              <Select value={limit.toString()} onValueChange={(value) => onLimitChange(parseInt(value))}>
                <SelectTrigger className="border-yellow-300 focus:ring-yellow-500">
                  <SelectValue placeholder="Nombre de résultats" />
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
