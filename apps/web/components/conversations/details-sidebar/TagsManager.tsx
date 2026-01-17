'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X as XIcon, Plus, Tag as TagIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { userPreferencesService } from '@/services/user-preferences.service';
import { toast } from 'sonner';
import { getTagColor } from '@/utils/tag-colors';
import { useI18n } from '@/hooks/use-i18n';
import type { User } from '@meeshy/shared/types';
import type { AnonymousParticipant } from '@meeshy/shared/types/anonymous';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Helper to detect anonymous users
function isAnonymousUser(user: any): user is AnonymousParticipant {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

interface TagsManagerProps {
  conversationId: string;
  currentUser: User;
  onTagsUpdated?: () => void;
}

/**
 * Component for managing user-specific conversation tags
 * Provides autocomplete and tag suggestions
 */
export function TagsManager({ conversationId, currentUser, onTagsUpdated }: TagsManagerProps) {
  const { t } = useI18n('conversations');
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [allUserTags, setAllUserTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Load user's tags
  useEffect(() => {
    if (isAnonymousUser(currentUser)) {
      setLocalTags([]);
      setAllUserTags([]);
      setIsLoading(false);
      return;
    }

    const loadTags = async () => {
      try {
        setIsLoading(true);
        // Load current conversation tags
        const prefs = await userPreferencesService.getPreferences(conversationId);
        setLocalTags(prefs?.tags ? [...prefs.tags] : []);

        // Load all user tags from all preferences
        const allPrefs = await userPreferencesService.getAllPreferences();
        const uniqueTags = new Set<string>();
        allPrefs.forEach(p => p.tags.forEach(tag => uniqueTags.add(tag)));
        setAllUserTags(Array.from(uniqueTags).sort());
      } catch (error) {
        console.error('Error loading tags:', error);
        setLocalTags([]);
        setAllUserTags([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadTags();
  }, [conversationId, currentUser]);

  const handleAddTag = async (tagToAdd: string) => {
    const trimmedTag = tagToAdd.trim();
    if (!trimmedTag) return;

    if (localTags.includes(trimmedTag)) {
      toast.error(t('conversationDetails.tagAlreadyExists'));
      return;
    }

    try {
      const updatedTags = [...localTags, trimmedTag];
      setLocalTags(updatedTags);
      setSearchQuery('');
      setIsDropdownOpen(false);

      await userPreferencesService.updateTags(conversationId, updatedTags);
      toast.success(t('conversationDetails.tagAdded'));

      if (!allUserTags.includes(trimmedTag)) {
        setAllUserTags([...allUserTags, trimmedTag].sort());
      }

      onTagsUpdated?.();
    } catch (error) {
      console.error('Error adding tag:', error);
      toast.error(t('conversationDetails.tagAddError'));
      setLocalTags(localTags);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    try {
      const updatedTags = localTags.filter(t => t !== tagToRemove);
      setLocalTags(updatedTags);

      await userPreferencesService.updateTags(conversationId, updatedTags);
      toast.success(t('conversationDetails.tagRemoved'));
      onTagsUpdated?.();
    } catch (error) {
      console.error('Error removing tag:', error);
      toast.error(t('conversationDetails.tagRemoveError'));
      setLocalTags([...localTags, tagToRemove]);
    }
  };

  const availableTags = allUserTags.filter(tag => !localTags.includes(tag));
  const filteredTags = availableTags.filter(tag =>
    tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isNewTag = searchQuery.trim().length > 0 &&
    !allUserTags.some(tag => tag.toLowerCase() === searchQuery.toLowerCase());

  if (isLoading) {
    return <div className="text-xs text-muted-foreground italic">{t('common.loading') || 'Loading...'}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Display current tags */}
      <div className="flex flex-wrap gap-2">
        {localTags.map((tag) => {
          const colors = getTagColor(tag);
          return (
            <Badge
              key={tag}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs border",
                colors.bg,
                colors.text,
                colors.border
              )}
            >
              <TagIcon className="h-3 w-3" />
              <span>{tag}</span>
              <button
                onClick={() => handleRemoveTag(tag)}
                className="ml-1 hover:opacity-70 rounded-full p-0.5 transition-opacity"
                aria-label={`Remove tag ${tag}`}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        {localTags.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            {t('conversationDetails.noTags')}
          </p>
        )}
      </div>

      {/* Search/Add tag dropdown */}
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-left font-normal h-9"
          >
            <TagIcon className="h-4 w-4 mr-2" />
            <span className="text-muted-foreground">{t('conversationDetails.searchOrAddTag')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('conversationDetails.searchTag')}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                {isNewTag ? (
                  <div className="p-2">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleAddTag(searchQuery)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('conversationDetails.createTag', { tag: searchQuery })}
                    </Button>
                  </div>
                ) : (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    {t('conversationDetails.noTagsFound')}
                  </div>
                )}
              </CommandEmpty>
              <CommandGroup heading={t('conversationDetails.availableTags')}>
                {filteredTags.map((tag) => {
                  const colors = getTagColor(tag);
                  return (
                    <CommandItem
                      key={tag}
                      onSelect={() => handleAddTag(tag)}
                      className="cursor-pointer"
                    >
                      <Badge
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 text-xs border mr-2",
                          colors.bg,
                          colors.text,
                          colors.border
                        )}
                      >
                        <TagIcon className="h-3 w-3" />
                        {tag}
                      </Badge>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
