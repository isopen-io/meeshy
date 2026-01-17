import { useState, useEffect } from 'react';

interface UseRankingFiltersResult {
  entityType: 'users' | 'conversations' | 'messages' | 'links';
  setEntityType: (type: 'users' | 'conversations' | 'messages' | 'links') => void;
  criterion: string;
  setCriterion: (criterion: string) => void;
  period: string;
  setPeriod: (period: string) => void;
  limit: number;
  setLimit: (limit: number) => void;
  criteriaSearch: string;
  setCriteriaSearch: (search: string) => void;
}

const DEFAULT_CRITERIA = {
  users: 'messages_sent',
  conversations: 'message_count',
  messages: 'most_reactions',
  links: 'tracking_links_most_visited'
} as const;

export function useRankingFilters(): UseRankingFiltersResult {
  const [entityType, setEntityType] = useState<'users' | 'conversations' | 'messages' | 'links'>('users');
  const [criterion, setCriterion] = useState('messages_sent');
  const [period, setPeriod] = useState('7d');
  const [limit, setLimit] = useState(50);
  const [criteriaSearch, setCriteriaSearch] = useState('');

  useEffect(() => {
    setCriteriaSearch('');
    setCriterion(DEFAULT_CRITERIA[entityType]);
  }, [entityType]);

  return {
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
  };
}
