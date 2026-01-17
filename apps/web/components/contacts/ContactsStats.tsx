import React from 'react';

interface ContactsStatsProps {
  stats: {
    total: number;
    connected: number;
    pending: number;
    affiliates: number;
  };
  t: (key: string) => string;
}

const ContactsStats = React.memo<ContactsStatsProps>(({ stats, t }) => {
  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-800">
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground dark:text-gray-400">{t('stats.totalContacts')}</p>
        <p className="text-2xl font-bold text-foreground dark:text-gray-100">{stats.total}</p>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground dark:text-gray-400">{t('stats.connected')}</p>
        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.connected}</p>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground dark:text-gray-400">{t('stats.pending')}</p>
        <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.pending}</p>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground dark:text-gray-400">{t('stats.affiliates')}</p>
        <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{stats.affiliates}</p>
      </div>
    </div>
  );
});

ContactsStats.displayName = 'ContactsStats';

export default ContactsStats;
