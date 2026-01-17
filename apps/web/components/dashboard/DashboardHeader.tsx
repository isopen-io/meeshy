import { MessageSquare, Link2, Users, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardHeaderProps {
  userName: string;
  t: (key: string, params?: Record<string, string>) => string;
  onShareApp: () => void;
  onCreateLink: () => void;
  onCreateConversation: () => void;
  onCreateCommunity: () => void;
  prefetchShareAffiliate?: Record<string, unknown>;
}

export function DashboardHeader({
  userName,
  t,
  onShareApp,
  onCreateLink,
  onCreateConversation,
  onCreateCommunity,
  prefetchShareAffiliate,
}: DashboardHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t('greeting', { name: userName })}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">{t('overview')}</p>
        </div>

        <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            className="bg-purple-600 hover:bg-purple-700 flex-1 sm:flex-none"
            onClick={onShareApp}
            {...prefetchShareAffiliate}
          >
            <Share2 className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{t('actions.shareApp')}</span>
            <span className="sm:hidden">{t('shareApp')}</span>
          </Button>
          <Button className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none" onClick={onCreateLink}>
            <Link2 className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{t('actions.createLink')}</span>
            <span className="sm:hidden">{t('createLink')}</span>
          </Button>
          <Button onClick={onCreateConversation} className="bg-blue-600 hover:bg-blue-700 flex-1 sm:flex-none">
            <MessageSquare className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{t('actions.createConversation')}</span>
            <span className="sm:hidden">{t('createConversation')}</span>
          </Button>
          <Button variant="outline" onClick={onCreateCommunity} className="flex-1 sm:flex-none">
            <Users className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{t('actions.createCommunity')}</span>
            <span className="sm:hidden">{t('createCommunity')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
