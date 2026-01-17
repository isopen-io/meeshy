import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Award } from 'lucide-react';
import { RankingItem } from '@/hooks/use-ranking-data';
import { UserRankCard } from './UserRankCard';
import { ConversationRankCard } from './ConversationRankCard';
import { MessageRankCard } from './MessageRankCard';
import { LinkRankCard } from './LinkRankCard';

interface RankingTableProps {
  entityType: 'users' | 'conversations' | 'messages' | 'links';
  rankings: RankingItem[];
  criterion: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function RankingTable({
  entityType,
  rankings,
  criterion,
  loading,
  error,
  onRetry
}: RankingTableProps) {
  const renderRankCard = (item: RankingItem) => {
    switch (entityType) {
      case 'users':
        return <UserRankCard key={item.id} item={item} criterion={criterion} />;
      case 'conversations':
        return <ConversationRankCard key={item.id} item={item} criterion={criterion} />;
      case 'messages':
        return <MessageRankCard key={item.id} item={item} criterion={criterion} />;
      case 'links':
        return <LinkRankCard key={item.id} item={item} criterion={criterion} />;
      default:
        return null;
    }
  };

  const getTitle = () => {
    switch (entityType) {
      case 'users':
        return 'Classement des utilisateurs';
      case 'conversations':
        return 'Classement des conversations';
      case 'messages':
        return 'Classement des messages';
      case 'links':
        return 'Classement des liens';
      default:
        return 'Classement';
    }
  };

  return (
    <Card className="border-yellow-200 dark:border-yellow-800">
      <CardHeader className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Award className="h-5 w-5 text-yellow-600" />
            <span>{getTitle()}</span>
          </div>
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            {rankings.length} résultats
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button onClick={onRetry} className="mt-4 bg-yellow-600 hover:bg-yellow-700">
              Réessayer
            </Button>
          </div>
        ) : rankings.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Aucun résultat trouvé
          </div>
        ) : (
          <div className="space-y-3">
            {rankings.map(renderRankCard)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
