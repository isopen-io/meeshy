'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usersService } from '@/services/users.service';
import { User } from '@/types';
import { Search, Plus, X, Loader2 } from 'lucide-react';
import { UserDisplay } from './UserDisplay';
import { useDebounce } from 'use-debounce';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

interface UserPickerProps {
  userIds: string[];
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  label?: string;
  placeholder?: string;
}

export function UserPicker({ userIds, onAdd, onRemove, label, placeholder = "Rechercher un utilisateur..." }: UserPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch] = useDebounce(searchTerm, 500);
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const searchUsers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const response = await usersService.searchUsers(query);
      if (response.success && response.data) {
        setResults(response.data);
      }
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    searchUsers(debouncedSearch);
  }, [debouncedSearch, searchUsers]);

  return (
    <div className="space-y-3">
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}

      <div className="flex flex-wrap gap-2 p-2 min-h-[44px] rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        {userIds.length === 0 && (
          <span className="text-sm text-gray-400 italic flex items-center px-2">Aucun utilisateur sélectionné</span>
        )}
        {userIds.map(id => (
          <div key={id} className="flex items-center gap-1 pl-1 pr-1 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 group transition-all hover:bg-indigo-100 dark:hover:bg-indigo-900/50">
            <UserDisplay userId={id} size="sm" showUsername={false} className="max-w-[150px]" />
            <button
              onClick={() => onRemove(id)}
              className="p-1 rounded-full text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200 transition-colors"
              title="Retirer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full border border-dashed border-indigo-300 text-indigo-500 hover:bg-indigo-50">
              <Plus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 shadow-lg border-gray-200 dark:border-gray-800" align="start">
            <div className="p-3 border-b border-gray-100 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  autoFocus
                  placeholder={placeholder}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-sm focus-visible:ring-indigo-500"
                />
              </div>
            </div>
            <ScrollArea className="h-64">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full p-4 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                  <span className="text-xs text-gray-400">Recherche...</span>
                </div>
              ) : results.length > 0 ? (
                <div className="p-1">
                  {results.map(user => (
                    <button
                      key={user.id}
                      disabled={userIds.includes(user.id)}
                      onClick={() => {
                        onAdd(user.id);
                        setSearchTerm('');
                        setOpen(false);
                      }}
                      className="w-full text-left p-3 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group flex items-center justify-between border border-transparent hover:border-indigo-100"
                    >
                      <div className="flex items-center gap-3">
                        <UserDisplay user={user} size="md" />
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="text-[9px] uppercase w-fit px-1.5 py-0">
                            {user.role}
                          </Badge>
                        </div>
                      </div>
                      {userIds.includes(user.id) ? (
                        <Badge variant="secondary" className="text-[10px] uppercase font-bold">Ajouté</Badge>
                      ) : (
                        <Plus className="h-4 w-4 text-gray-300 group-hover:text-indigo-500 transition-all" />
                      )}
                    </button>
                  ))}
                </div>
              ) : searchTerm.length >= 2 ? (
                <div className="p-8 text-center text-xs text-gray-400 italic">
                  Aucun utilisateur trouvé
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-gray-400 italic">
                  Entrez au moins 2 caractères
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
