import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { User } from '@/types';
import { Share2, Mail, Link } from 'lucide-react';

interface AffiliateRelation {
  id: string;
  referredUser: User & { createdAt: string };
  status: string;
  createdAt: string;
  completedAt?: string;
  affiliateToken: {
    name: string;
    token: string;
    createdAt?: string;
  };
}

interface AffiliatesTabProps {
  affiliateRelations: AffiliateRelation[];
  getUserDisplayName: (user: User) => string;
  t: (key: string, params?: any) => string;
}

const AffiliatesTab = React.memo<AffiliatesTabProps>(({
  affiliateRelations,
  getUserDisplayName,
  t
}) => {
  const router = useRouter();

  if (affiliateRelations.length === 0) {
    return (
      <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
        <CardContent className="flex flex-col items-center justify-center py-16 px-6">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 blur-3xl rounded-full"></div>
            <div className="relative p-6 bg-gradient-to-br from-cyan-100 to-teal-100 dark:from-cyan-900/30 dark:to-teal-900/30 rounded-3xl">
              <Share2 className="h-16 w-16 text-cyan-600 dark:text-cyan-400" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3 text-center">{t('messages.noAffiliateContacts')}</h3>
          <p className="text-muted-foreground text-base mb-8 text-center max-w-md">
            {t('messages.noAffiliateContactsDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {affiliateRelations.map((relation) => (
        <Card key={relation.id} className="relative border-2 hover:border-cyan-500/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

          <CardContent className="relative z-10 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                <div className="relative flex-shrink-0">
                  <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white shadow-lg">
                    <AvatarImage src={relation.referredUser.avatar} alt={getUserDisplayName(relation.referredUser)} />
                    <AvatarFallback className="text-sm sm:text-lg font-bold">
                      {getUserDisplayName(relation.referredUser).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <OnlineIndicator
                    isOnline={getUserStatus(relation.referredUser) === 'online'}
                    status={getUserStatus(relation.referredUser)}
                    size="md"
                    className="absolute -bottom-0.5 -right-0.5"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white mb-1 break-words">
                    {getUserDisplayName(relation.referredUser)}
                  </h3>
                  <button
                    onClick={() => router.push(`/u/${relation.referredUser.id}`)}
                    className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 sm:mb-3 break-all transition-colors cursor-pointer text-left"
                  >
                    @{relation.referredUser.username}
                  </button>

                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${relation.referredUser.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                          {relation.referredUser.isOnline ? t('status.online') : t('status.offline')}
                        </span>
                      </div>

                      {relation.referredUser.email && (
                        <div className="flex items-center space-x-2 min-w-0">
                          <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                            {relation.referredUser.email}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 p-2 sm:p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                      <Link className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-cyan-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-cyan-600 uppercase tracking-wide block font-medium break-words">
                          {t('messages.linkUsed')}: {relation.affiliateToken.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});

AffiliatesTab.displayName = 'AffiliatesTab';

export default AffiliatesTab;
