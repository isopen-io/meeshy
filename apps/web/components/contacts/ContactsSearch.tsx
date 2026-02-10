import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Share2 } from 'lucide-react';

interface ContactsSearchProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onInviteClick: () => void;
  t: (key: string) => string;
}

const ContactsSearch = React.memo<ContactsSearchProps>(({
  searchQuery,
  onSearchChange,
  onInviteClick,
  t
}) => {
  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
        <Input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 h-12 text-base border-2 focus:border-primary dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>

      <Button
        onClick={onInviteClick}
        variant="default"
        className="h-12 rounded-xl px-6 font-semibold shadow-md hover:shadow-lg transition-[color,box-shadow] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
      >
        <Share2 className="h-5 w-5 mr-2" />
        <span>{t('inviteContact')}</span>
      </Button>
    </div>
  );
});

ContactsSearch.displayName = 'ContactsSearch';

export default ContactsSearch;
