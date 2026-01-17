import { MessageSquare, Link2, Users, Share2, Settings, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface QuickActionsWidgetProps {
  onCreateConversation: () => void;
  onCreateLink: () => void;
  onCreateGroup: () => void;
  onShare: () => void;
  onSettings: () => void;
  t: (key: string) => string;
  prefetchCreateConversation?: Record<string, unknown>;
  prefetchCreateLink?: Record<string, unknown>;
  prefetchShareAffiliate?: Record<string, unknown>;
}

export function QuickActionsWidget({
  onCreateConversation,
  onCreateLink,
  onCreateGroup,
  onShare,
  onSettings,
  t,
  prefetchCreateConversation,
  prefetchCreateLink,
  prefetchShareAffiliate,
}: QuickActionsWidgetProps) {
  return (
    <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-gray-100">
          <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          <span>{t('quickActions.title')}</span>
        </CardTitle>
        <CardDescription className="text-gray-600 dark:text-gray-400">
          {t('quickActions.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Button
            variant="outline"
            className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            onClick={onCreateConversation}
            {...prefetchCreateConversation}
          >
            <MessageSquare className="h-6 w-6" />
            <span>{t('quickActions.newConversation')}</span>
          </Button>

          <Button
            variant="outline"
            className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            onClick={onCreateLink}
            {...prefetchCreateLink}
          >
            <Link2 className="h-6 w-6" />
            <span>{t('quickActions.createLink')}</span>
          </Button>

          <Button
            variant="outline"
            className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            onClick={onCreateGroup}
          >
            <Users className="h-6 w-6" />
            <span>{t('quickActions.createCommunity')}</span>
          </Button>

          <Button
            variant="outline"
            className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            onClick={onShare}
            {...prefetchShareAffiliate}
          >
            <Share2 className="h-6 w-6" />
            <span>{t('quickActions.shareApp')}</span>
          </Button>

          <Button
            variant="outline"
            className="h-20 flex-col space-y-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            onClick={onSettings}
          >
            <Settings className="h-6 w-6" />
            <span>{t('quickActions.settings')}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
