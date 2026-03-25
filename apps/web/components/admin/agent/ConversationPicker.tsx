'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { conversationsCrudService } from '@/services/conversations/crud.service';
import { Conversation } from '@meeshy/shared/types';
import { Search, Plus, X, Loader2, MessageSquare, Users, Globe } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

interface ConversationPickerProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClear?: () => void;
  label?: string;
  placeholder?: string;
}

export function ConversationPicker({ selectedId, onSelect, onClear, label, placeholder = "Chercher une conversation..." }: ConversationPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch] = useDebounce(searchTerm, 500);
  const [results, setResults] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const fetchSelected = useCallback(async () => {
    if (!selectedId) {
      setSelectedConversation(null);
      return;
    }
    try {
      const conv = await conversationsCrudService.getConversation(selectedId);
      setSelectedConversation(conv);
    } catch (err) {
      console.error('Error fetching selected conversation:', err);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchSelected();
  }, [fetchSelected]);

  const searchConversations = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const response = await conversationsCrudService.searchConversations(query);
      setResults(response || []);
    } catch (err) {
      console.error('Error searching conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    searchConversations(debouncedSearch);
  }, [debouncedSearch, searchConversations]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'direct': return <MessageSquare className="h-4 w-4" />;
      case 'group': return <Users className="h-4 w-4" />;
      case 'public': return <Globe className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-3">
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}

      <div className="flex items-center gap-2">
        {selectedConversation ? (
          <div className="flex-1 flex items-center justify-between p-3 rounded-lg border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-800">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                {getIcon(selectedConversation.type)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-indigo-900 dark:text-indigo-100 truncate">
                  {selectedConversation.title || "Sans titre"}
                </span>
                <span className="text-xs text-indigo-600/70 dark:text-indigo-400/70 font-mono">
                  {selectedConversation.id}
                </span>
              </div>
            </div>
            {onClear && (
              <Button variant="ghost" size="sm" onClick={onClear} className="h-8 w-8 p-0 text-indigo-500 hover:bg-indigo-100">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal h-12 border-dashed border-gray-300">
                <Search className="mr-2 h-4 w-4 text-gray-400" />
                {placeholder}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 shadow-xl border-gray-200 dark:border-gray-800" align="start">
              <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 rounded-t-lg">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    autoFocus
                    placeholder="Chercher par titre, ID ou identifier..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 h-10 bg-white dark:bg-gray-800"
                  />
                </div>
              </div>
              <ScrollArea className="h-[350px]">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                    <span className="text-sm text-gray-500">Recherche dans les salons...</span>
                  </div>
                ) : results.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {results.map(conv => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          onSelect(conv.id);
                          setSearchTerm('');
                          setOpen(false);
                        }}
                        className="w-full text-left p-3 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all group border border-transparent hover:border-indigo-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                            {getIcon(conv.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {conv.title || "Sans titre"}
                              </span>
                              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter opacity-70">
                                {conv.type}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-400 font-mono truncate max-w-[150px]">
                                {conv.id}
                              </span>
                              {conv.identifier && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <span className="text-xs text-indigo-500 italic">#{conv.identifier}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <Plus className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-all mr-2" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : searchTerm.length >= 2 ? (
                  <div className="p-12 text-center text-sm text-gray-400 italic">
                    Aucune conversation trouvée pour &quot;{searchTerm}&quot;
                  </div>
                ) : (
                  <div className="p-12 text-center text-sm text-gray-400 italic flex flex-col items-center gap-2">
                    <MessageSquare className="h-8 w-8 opacity-20" />
                    Entrez au moins 2 caractères pour rechercher
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
