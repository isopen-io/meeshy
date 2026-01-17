'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  X,
  Edit,
  Save,
  Languages,
  Users,
  Link2,
  Copy,
  Check,
  Camera,
  Pencil,
  Trash2,
  Type,
  Smile
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import type { Conversation, User, Message } from '@meeshy/shared/types';
import type { AnonymousParticipant } from '@meeshy/shared/types/anonymous';
import { conversationsService } from '@/services/conversations.service';
import { userPreferencesService } from '@/services/user-preferences.service';
import { getLanguageDisplayName, getLanguageFlag } from '@/utils/language-utils';
import { toast } from 'sonner';
import { ConversationLinksSection } from './conversation-links-section';
import { CreateLinkButton } from './create-link-button';
import { UserRoleEnum } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/useI18n';
import { copyToClipboard } from '@/lib/clipboard';
import { ConversationImageUploadDialog } from './conversation-image-upload-dialog';
import { AttachmentService } from '@/services/attachmentService';
import { X as XIcon, Plus, Tag as TagIcon, Info, Folder } from 'lucide-react';
import { getTagColor } from '@/utils/tag-colors';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Helper pour détecter si un utilisateur est anonyme
function isAnonymousUser(user: any): user is AnonymousParticipant {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

// Tags Manager Component (User-specific) - Improved UX with autocomplete
interface TagsManagerProps {
  conversationId: string;
  currentUser: User;
  onTagsUpdated?: () => void;
}

function TagsManager({ conversationId, currentUser, onTagsUpdated }: TagsManagerProps) {
  const { t } = useI18n('conversations');
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [allUserTags, setAllUserTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Load user's tags for this conversation AND all user tags
  useEffect(() => {
    // CORRECTION: Ne pas charger les préférences pour les utilisateurs anonymes
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

    // Check if tag already exists
    if (localTags.includes(trimmedTag)) {
      toast.error(t('conversationDetails.tagAlreadyExists'));
      return;
    }

    try {
      // Optimistically update UI
      const updatedTags = [...localTags, trimmedTag];
      setLocalTags(updatedTags);
      setSearchQuery('');
      setIsDropdownOpen(false);

      // Update preferences
      await userPreferencesService.updateTags(conversationId, updatedTags);
      toast.success(t('conversationDetails.tagAdded'));

      // Add to all user tags if new
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

  // Filter available tags (exclude already added)
  const availableTags = allUserTags.filter(tag => !localTags.includes(tag));
  const filteredTags = availableTags.filter(tag =>
    tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check if search query is a new tag
  const isNewTag = searchQuery.trim().length > 0 &&
    !allUserTags.some(tag => tag.toLowerCase() === searchQuery.toLowerCase());

  if (isLoading) {
    return <div className="text-xs text-muted-foreground italic">{t('common.loading') || 'Chargement...'}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Display current tags with colored badges */}
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
                aria-label={`Supprimer le tag ${tag}`}
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

      {/* Search/Add tag with dropdown */}
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

// Category Selector Component (User-specific)
interface CategorySelectorProps {
  conversationId: string;
  currentUser: User;
  onCategoryUpdated?: () => void;
}

function CategorySelector({ conversationId, currentUser, onCategoryUpdated }: CategorySelectorProps) {
  const { t } = useI18n('conversations');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Load categories and current selection
  useEffect(() => {
    // CORRECTION: Ne pas charger les préférences pour les utilisateurs anonymes
    if (isAnonymousUser(currentUser)) {
      setCategories([]);
      setSelectedCategoryId(null);
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        // Load current category
        const prefs = await userPreferencesService.getPreferences(conversationId);
        setSelectedCategoryId(prefs?.categoryId || null);

        // Load all user categories and sort by order, then alphabetically
        const cats = await userPreferencesService.getCategories();
        const sortedCats = cats.sort((a, b) => {
          // Trier par order d'abord
          if (a.order !== b.order) {
            return a.order - b.order;
          }
          // Si même order, trier alphabétiquement
          return a.name.localeCompare(b.name);
        });
        setCategories(sortedCats);
      } catch (error) {
        console.error('Error loading categories:', error);
        setCategories([]);
        setSelectedCategoryId(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [conversationId, currentUser]);

  const handleSelectCategory = async (categoryId: string | null) => {
    try {
      setSelectedCategoryId(categoryId);
      setSearchQuery('');
      setIsDropdownOpen(false);

      await userPreferencesService.upsertPreferences(conversationId, { categoryId });
      toast.success(t(categoryId ? 'conversationDetails.categoryAssigned' : 'conversationDetails.categoryRemoved'));
      onCategoryUpdated?.();
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error(t('conversationDetails.categoryUpdateError'));
      setSelectedCategoryId(selectedCategoryId);
    }
  };

  const handleCreateCategory = async (name: string) => {
    try {
      // Créer la catégorie
      const newCategory = await userPreferencesService.createCategory({ name });
      const updatedCategories = [...categories, newCategory].sort((a, b) => {
        // Trier par order d'abord
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        // Si même order, trier alphabétiquement
        return a.name.localeCompare(b.name);
      });
      setCategories(updatedCategories);

      // Assigner immédiatement la catégorie à la conversation
      setSelectedCategoryId(newCategory.id);
      setSearchQuery('');
      setIsDropdownOpen(false);

      try {
        await userPreferencesService.upsertPreferences(conversationId, { categoryId: newCategory.id });
        toast.success(t('conversationDetails.categoryCreated'));
        onCategoryUpdated?.();
      } catch (updateError) {
        // Si l'assignation échoue, on retire la catégorie de l'état
        console.error('Error assigning category after creation:', updateError);
        setSelectedCategoryId(null);
        toast.error(t('conversationDetails.categoryUpdateError'));
      }
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error(t('conversationDetails.categoryCreateError'));
    }
  };

  const handleEditCategory = async (categoryId: string) => {
    if (!editingCategoryName.trim()) {
      toast.error(t('conversationDetails.categoryNameRequired'));
      return;
    }

    try {
      await userPreferencesService.updateCategory(categoryId, { name: editingCategoryName.trim() });

      // Mettre à jour la liste des catégories
      const updatedCategories = categories.map(cat =>
        cat.id === categoryId ? { ...cat, name: editingCategoryName.trim() } : cat
      );
      setCategories(updatedCategories);

      setEditingCategoryId(null);
      setEditingCategoryName('');
      toast.success(t('conversationDetails.categoryUpdated'));
      onCategoryUpdated?.();
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error(t('conversationDetails.categoryUpdateError'));
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    // Demander confirmation
    if (!confirm(t('conversationDetails.confirmDeleteCategory', { category: categoryName }))) {
      return;
    }

    try {
      await userPreferencesService.deleteCategory(categoryId);

      // Retirer la catégorie de la liste
      const updatedCategories = categories.filter(cat => cat.id !== categoryId);
      setCategories(updatedCategories);

      // Si la catégorie supprimée était sélectionnée, la désélectionner
      if (selectedCategoryId === categoryId) {
        setSelectedCategoryId(null);
      }

      toast.success(t('conversationDetails.categoryDeleted'));
      onCategoryUpdated?.();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error(t('conversationDetails.categoryDeleteError'));
    }
  };

  // Filter categories
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check if search query is a new category
  const isNewCategory = searchQuery.trim().length > 0 &&
    !categories.some(cat => cat.name.toLowerCase() === searchQuery.toLowerCase());

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  if (isLoading) {
    return <div className="text-xs text-muted-foreground italic">{t('common.loading') || 'Chargement...'}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Display current category */}
      {selectedCategory && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1 px-2 py-1 text-xs">
            <Folder className="h-3 w-3" />
            <span>{selectedCategory.name}</span>
            <button
              onClick={() => handleSelectCategory(null)}
              className="ml-1 hover:opacity-70 rounded-full p-0.5 transition-opacity"
              aria-label={t('conversationDetails.removeCategory')}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      {/* Select/Create category with dropdown */}
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-left font-normal h-9"
          >
            <Folder className="h-4 w-4 mr-2" />
            <span className="text-muted-foreground">
              {t(selectedCategory ? 'conversationDetails.changeCategory' : 'conversationDetails.assignToCategory')}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('conversationDetails.searchCategory')}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                {isNewCategory ? (
                  <div className="p-2">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleCreateCategory(searchQuery)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('conversationDetails.createCategory', { category: searchQuery })}
                    </Button>
                  </div>
                ) : (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    {t('conversationDetails.noCategoryFound')}
                  </div>
                )}
              </CommandEmpty>
              <CommandGroup heading={t('conversationDetails.availableCategories')}>
                {selectedCategory && (
                  <CommandItem
                    onSelect={() => handleSelectCategory(null)}
                    className="cursor-pointer text-muted-foreground"
                  >
                    <XIcon className="h-4 w-4 mr-2" />
                    {t('conversationDetails.noCategory')}
                  </CommandItem>
                )}
                {filteredCategories.map((category) => (
                  <CommandItem
                    key={category.id}
                    className="cursor-pointer group"
                    onSelect={() => {
                      if (editingCategoryId !== category.id) {
                        handleSelectCategory(category.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between w-full">
                      {editingCategoryId === category.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Folder className="h-4 w-4 flex-shrink-0" />
                          <Input
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') {
                                handleEditCategory(category.id);
                              } else if (e.key === 'Escape') {
                                setEditingCategoryId(null);
                                setEditingCategoryName('');
                              }
                            }}
                            className="h-7 flex-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditCategory(category.id);
                            }}
                          >
                            <Check className="h-3 w-3 text-green-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCategoryId(null);
                              setEditingCategoryName('');
                            }}
                          >
                            <XIcon className="h-3 w-3 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center flex-1">
                            <Folder className="h-4 w-4 mr-2" />
                            <span>{category.name}</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(category.id);
                                setEditingCategoryName(category.name);
                              }}
                              title={t('conversationDetails.editCategory')}
                            >
                              <Pencil className="h-3 w-3 text-blue-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCategory(category.id, category.name);
                              }}
                              title={t('conversationDetails.deleteCategory')}
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Customization Manager Component (customName and reaction)
interface CustomizationManagerProps {
  conversationId: string;
  currentUser: User;
  onPreferencesUpdated?: () => void;
}

function CustomizationManager({ conversationId, currentUser, onPreferencesUpdated }: CustomizationManagerProps) {
  const { t } = useI18n('conversations');
  const [customName, setCustomName] = useState('');
  const [reaction, setReaction] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingReaction, setIsEditingReaction] = useState(false);

  // Load current preferences
  useEffect(() => {
    if (isAnonymousUser(currentUser)) {
      setIsLoading(false);
      return;
    }

    const loadPreferences = async () => {
      try {
        setIsLoading(true);
        const prefs = await userPreferencesService.getPreferences(conversationId);
        setCustomName(prefs?.customName || '');
        setReaction(prefs?.reaction || '');
      } catch (error) {
        console.error('Error loading customization preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPreferences();
  }, [conversationId, currentUser]);

  const handleSaveCustomName = async () => {
    try {
      await userPreferencesService.upsertPreferences(conversationId, {
        customName: customName.trim() || null
      });
      setIsEditingName(false);
      toast.success(t('conversationDetails.customNameSaved'));
      onPreferencesUpdated?.();
    } catch (error) {
      console.error('Error saving custom name:', error);
      toast.error(t('conversationDetails.customNameError'));
    }
  };

  const handleSaveReaction = async () => {
    try {
      await userPreferencesService.upsertPreferences(conversationId, {
        reaction: reaction.trim() || null
      });
      setIsEditingReaction(false);
      toast.success(t('conversationDetails.reactionSaved'));
      onPreferencesUpdated?.();
    } catch (error) {
      console.error('Error saving reaction:', error);
      toast.error(t('conversationDetails.reactionError'));
    }
  };

  if (isLoading) {
    return <div className="text-xs text-muted-foreground italic">{t('common.loading') || 'Chargement...'}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Custom Name */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <Type className="h-3.5 w-3.5" />
            {t('conversationDetails.customName')}
          </label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  {t('conversationDetails.customNameTooltip')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {isEditingName ? (
          <div className="flex items-center gap-2">
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveCustomName();
                } else if (e.key === 'Escape') {
                  setIsEditingName(false);
                }
              }}
              placeholder={t('conversationDetails.customNamePlaceholder')}
              className="h-8 flex-1"
              autoFocus
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={handleSaveCustomName}
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setIsEditingName(false)}
            >
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => setIsEditingName(true)}
          >
            <Type className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm flex-1">
              {customName || <span className="text-muted-foreground italic">{t('conversationDetails.noCustomName')}</span>}
            </span>
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Reaction Emoji */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <Smile className="h-3.5 w-3.5" />
            {t('conversationDetails.reaction')}
          </label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  {t('conversationDetails.reactionTooltip')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {isEditingReaction ? (
          <div className="flex items-center gap-2">
            <Input
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveReaction();
                } else if (e.key === 'Escape') {
                  setIsEditingReaction(false);
                }
              }}
              placeholder={t('conversationDetails.reactionPlaceholder')}
              className="h-8 flex-1 text-2xl"
              maxLength={2}
              autoFocus
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={handleSaveReaction}
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setIsEditingReaction(false)}
            >
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => setIsEditingReaction(true)}
          >
            <Smile className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl flex-1">
              {reaction || <span className="text-sm text-muted-foreground italic">{t('conversationDetails.noReaction')}</span>}
            </span>
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

// Import des composants de la sidebar de BubbleStreamPage
import {
  FoldableSection,
  LanguageIndicators,
  SidebarLanguageHeader,
  type LanguageStats
} from '@/lib/bubble-stream-modules';

interface ConversationDetailsSidebarProps {
  conversation: Conversation;
  currentUser: User;
  messages: Message[];
  isOpen: boolean;
  onClose: () => void;
  onConversationUpdated?: (updatedConversation: Partial<Conversation>) => void;
}


export function ConversationDetailsSidebar({
  conversation,
  currentUser,
  messages,
  isOpen,
  onClose,
  onConversationUpdated
}: ConversationDetailsSidebarProps) {
  const { t } = useI18n('conversations');
  
  // États pour la gestion des conversations
  const [isEditingName, setIsEditingName] = useState(false);
  const [conversationName, setConversationName] = useState(conversation.title || '');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [conversationDescription, setConversationDescription] = useState(conversation.description || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isImageUploadDialogOpen, setIsImageUploadDialogOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // États pour les statistiques de langues
  const [messageLanguageStats, setMessageLanguageStats] = useState<LanguageStats[]>([]);
  const [activeLanguageStats, setActiveLanguageStats] = useState<LanguageStats[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);

  // Vérifier si l'utilisateur actuel est admin/modérateur de la conversation
  const userMembership = conversation.participants?.find(p => p.userId === currentUser.id);
  const isAdmin = currentUser.role === UserRoleEnum.ADMIN ||
                  currentUser.role === UserRoleEnum.BIGBOSS ||
                  userMembership?.role === UserRoleEnum.ADMIN ||
                  userMembership?.role === UserRoleEnum.MODERATOR;

  // Vérifier si l'utilisateur peut modifier l'image (modérateur+)
  const canModifyImage = conversation.type !== 'direct' && (
    currentUser.role === UserRoleEnum.BIGBOSS ||
    currentUser.role === UserRoleEnum.ADMIN ||
    currentUser.role === UserRoleEnum.MODO ||
    currentUser.role === UserRoleEnum.MODERATOR ||
    currentUser.role === UserRoleEnum.AUDIT ||
    currentUser.role === UserRoleEnum.ANALYST ||
    currentUser.role === UserRoleEnum.CREATOR ||
    userMembership?.role === UserRoleEnum.MODERATOR ||
    userMembership?.role === UserRoleEnum.CREATOR
  );

  // Calculer les statistiques de langues des messages et participants (comme dans BubbleStreamPage)
  useEffect(() => {
    const calculateLanguageStats = () => {
      // Calculer les langues des messages
      const messagesPerLanguage: Record<string, number> = {};
      messages.forEach(message => {
        const lang = message.originalLanguage || 'fr';
        messagesPerLanguage[lang] = (messagesPerLanguage[lang] || 0) + 1;
      });

      const messageStats: LanguageStats[] = Object.entries(messagesPerLanguage)
        .map(([language, count], index) => ({
          language,
          flag: getLanguageFlag(language),
          count,
          color: `hsl(${(index * 137.5) % 360}, 50%, 50%)`
        }))
        .filter(stat => stat.count > 0)
        .sort((a, b) => b.count - a.count);

      setMessageLanguageStats(messageStats);

      // Calculer les langues des participants comme dans BubbleStreamPage
      if (conversation.participants && conversation.participants.length > 0) {
        const userLanguages: { [key: string]: Set<string> } = {};
        
        conversation.participants.forEach(participant => {
          const participantUser = (participant as any).user;
          const lang = participantUser?.systemLanguage || 'fr';
          if (!userLanguages[lang]) {
            userLanguages[lang] = new Set();
          }
          userLanguages[lang].add(participant.userId);
        });
        
        const userStats: LanguageStats[] = Object.entries(userLanguages)
          .map(([code, users], index) => ({
            language: code,
            flag: getLanguageFlag(code),
            count: users.size,
            color: `hsl(${(index * 137.5) % 360}, 50%, 50%)`
          }))
          .filter(stat => stat.count > 0)
          .sort((a, b) => b.count - a.count);
        
        setActiveLanguageStats(userStats);
        
        // Calculer les utilisateurs actifs - toujours inclure l'utilisateur actuel
        const activeParticipants = conversation.participants
          .filter(p => {
            const pUser = (p as any).user;
            return pUser && (pUser.isOnline || p.userId === currentUser.id);
          })
          .map(p => (p as any).user)
          .filter(Boolean) as User[];

        // Vérifier si l'utilisateur actuel est déjà dans la liste, sinon l'ajouter au début
        const hasCurrentUser = activeParticipants.find(u => u.id === currentUser.id);
        const finalActiveUsers = hasCurrentUser
          ? activeParticipants
          : [currentUser, ...activeParticipants];

        setActiveUsers(finalActiveUsers);
      }
    };

    calculateLanguageStats();
  }, [conversation.participants, messages]);

  const getConversationDisplayName = (conv: Conversation) => {
    if (conv.type !== 'direct') {
      return conv.title || t('conversationDetails.groupConversation');
    }

    const otherParticipant = conv.participants?.find(p => p.userId !== currentUser.id);
    const otherUser = (otherParticipant as any)?.user;
    if (otherParticipant && otherUser) {
      // Prioriser le displayName, sinon prénom/nom, sinon username
      return otherUser.displayName ||
             `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() ||
             otherUser.username;
    }

    return conv.title || t('conversationDetails.conversation');
  };

  // Obtenir l'URL de l'avatar selon le type de conversation
  const getConversationAvatarUrl = (conv: Conversation) => {
    if (conv.type === 'direct') {
      // Pour les conversations directes, retourner l'avatar de l'autre participant
      const otherParticipant = conv.participants?.find(p => p.userId !== currentUser.id);
      const participantUser = (otherParticipant as any)?.user;
      const avatarUrl = participantUser?.avatar;
      return avatarUrl;
    }
    // Pour les conversations de groupe/public/global, retourner l'image de la conversation
    const avatarUrl = conv.image || conv.avatar;
    return avatarUrl;
  };

  // Fonctions pour la gestion des conversations
  const handleSaveName = async () => {
    try {
      setIsLoading(true);
      
      // Validation du nom
      if (!conversationName.trim()) {
        toast.error(t('conversationDetails.nameCannotBeEmpty'));
        return;
      }
      
      if (conversationName.trim() === (conversation.title || '')) {
        // Pas de changement, juste fermer l'édition
        setIsEditingName(false);
        return;
      }
      
      const updatedData = { title: conversationName.trim() };
      await conversationsService.updateConversation(conversation.id, updatedData);

      // Mettre à jour la conversation localement
      onConversationUpdated?.(updatedData);

      setIsEditingName(false);
      toast.success(t('conversationDetails.nameUpdated'));
    } catch (error: unknown) {
      console.error('Erreur lors de la mise à jour du nom:', error);

      // Gestion d'erreur améliorée
      let errorMessage = t('conversationDetails.updateError');
      const apiError = error as { status?: number };

      if (apiError.status === 409) {
        errorMessage = t('conversationDetails.conversationExists');
      } else if (apiError.status === 403) {
        errorMessage = t('conversationDetails.noPermissionToModify');
      } else if (apiError.status === 404) {
        errorMessage = t('conversationDetails.conversationNotFound');
      } else if (apiError.status === 400) {
        errorMessage = t('conversationDetails.invalidData');
      }

      toast.error(errorMessage);
      
      // Restaurer le nom original en cas d'erreur
      setConversationName(conversation.title || '');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDescription = async () => {
    try {
      setIsLoading(true);
      
      // Vérifier si la description a changé
      if (conversationDescription.trim() === (conversation.description || '')) {
        // Pas de changement, juste fermer l'édition
        setIsEditingDescription(false);
        return;
      }
      
      const updatedData = { description: conversationDescription.trim() };
      await conversationsService.updateConversation(conversation.id, updatedData);

      // Mettre à jour la conversation localement
      onConversationUpdated?.(updatedData);

      setIsEditingDescription(false);
      toast.success(t('conversationDetails.descriptionUpdated') || 'Description mise à jour avec succès');
    } catch (error: unknown) {
      console.error('Erreur lors de la mise à jour de la description:', error);

      // Gestion d'erreur améliorée
      let errorMessage = t('conversationDetails.updateError');
      const apiError = error as { status?: number };

      if (apiError.status === 403) {
        errorMessage = t('conversationDetails.noPermissionToModify');
      } else if (apiError.status === 404) {
        errorMessage = t('conversationDetails.conversationNotFound');
      } else if (apiError.status === 400) {
        errorMessage = t('conversationDetails.invalidData');
      }

      toast.error(errorMessage);
      
      // Restaurer la description originale en cas d'erreur
      setConversationDescription(conversation.description || '');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!isAdmin) return;
    
    try {
      setIsLoading(true);
      await conversationsService.removeParticipant(conversation.id, userId);
      toast.success(t('conversationDetails.participantRemoved'));
    } catch (error) {
      console.error('Erreur lors de la suppression du participant:', error);
      toast.error(t('conversationDetails.removeParticipantError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Copier le lien de la conversation
  const handleCopyConversationLink = async () => {
    const conversationUrl = `${window.location.origin}/conversations/${conversation.id}`;
    const result = await copyToClipboard(conversationUrl);

    if (result.success) {
      setIsCopied(true);
      toast.success(t('conversationDetails.linkCopied'));
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      toast.error(result.message || t('conversationDetails.copyError'));
    }
  };

  // Fonction pour gérer l'upload de l'image de conversation
  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    try {
      // Upload du fichier via le service d'attachments
      const uploadResult = await AttachmentService.uploadFiles([file]);

      if (uploadResult.success && uploadResult.attachments.length > 0) {
        const imageUrl = uploadResult.attachments[0].fileUrl;

        // Mettre à jour la conversation avec la nouvelle image
        const updatedData = { image: imageUrl, avatar: imageUrl };
        await conversationsService.updateConversation(conversation.id, updatedData);

        // Mettre à jour la conversation localement
        onConversationUpdated?.(updatedData);

        toast.success(t('conversationDetails.imageUpdated') || 'Image de la conversation mise à jour');
        setIsImageUploadDialogOpen(false);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Erreur lors de l\'upload de l\'image:', error);
      toast.error(t('conversationDetails.imageUploadError') || 'Erreur lors de l\'upload de l\'image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Sidebar au niveau de la conversation - Positionnée à GAUCHE */}
      <div className="absolute inset-y-0 left-0 w-80 bg-card dark:bg-card border-r border-border z-[120] shadow-2xl animate-in slide-in-from-left duration-300">
        <div className="flex flex-col h-full">
          {/* Header fixe */}
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border bg-card dark:bg-card">
            <h2 className="text-lg font-semibold">{t('conversationDetails.title')}</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 p-0 rounded-full hover:bg-accent"
              aria-label={t('conversationDetails.close')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Contenu scrollable */}
          <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Info principale */}
            <div className="text-center space-y-3">
              {canModifyImage ? (
                <div className="relative group mx-auto w-fit">
                  <Avatar
                    className="h-16 w-16 ring-2 ring-primary/20 cursor-pointer group-hover:ring-primary/50 transition-all"
                    onClick={() => setIsImageUploadDialogOpen(true)}
                  >
                    <AvatarImage src={getConversationAvatarUrl(conversation)} />
                    <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                      {getConversationDisplayName(conversation).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {/* Overlay avec icône camera au survol */}
                  <div
                    className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    onClick={() => setIsImageUploadDialogOpen(true)}
                  >
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {t('conversationDetails.clickToChangeImage') || 'Cliquez pour changer l\'image'}
                  </p>
                </div>
              ) : (
                <Avatar className="h-16 w-16 mx-auto ring-2 ring-primary/20">
                  <AvatarImage src={getConversationAvatarUrl(conversation)} />
                  <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                    {getConversationDisplayName(conversation).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div>
                {isEditingName ? (
                  <div className="flex items-center gap-2 justify-center">
                    <Input
                      value={conversationName}
                      onChange={(e) => setConversationName(e.target.value)}
                      className="h-8 text-sm"
                      placeholder={t('conversationDetails.conversationName')}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveName();
                        } else if (e.key === 'Escape') {
                          setIsEditingName(false);
                          setConversationName(conversation.title || '');
                        }
                      }}
                      onBlur={handleSaveName}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveName}
                      disabled={isLoading}
                      className="h-8 px-2"
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsEditingName(false);
                        setConversationName(conversation.title || '');
                      }}
                      className="h-8 px-2"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center">
                    <h3 
                      className="font-semibold text-lg cursor-pointer hover:text-primary transition-colors"
                      onClick={() => {
                        setIsEditingName(true);
                        setConversationName(conversation.title || getConversationDisplayName(conversation));
                      }}
                      title={t('conversationDetails.clickToEdit')}
                    >
                      {getConversationDisplayName(conversation)}
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsEditingName(true);
                        setConversationName(conversation.title || getConversationDisplayName(conversation));
                      }}
                      className="h-6 w-6 p-0"
                      title={t('conversationDetails.editName')}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground text-center">
                  {conversation.type !== 'direct' ? t('conversationDetails.conversationGroup') : t('conversationDetails.conversationPrivate')}
                </p>
              </div>
            </div>

            <Separator />

            {/* ID de la conversation avec bouton copier */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
              <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
                {conversation.id}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyConversationLink}
                className="h-8 w-8 p-0 flex-shrink-0"
              >
                {isCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Section description - Seulement pour les conversations de groupe */}
            {conversation.type !== 'direct' && (
              <>
                <div className="space-y-2">
                  {isEditingDescription ? (
                    <div className="space-y-2">
                      <Textarea
                        value={conversationDescription}
                        onChange={(e) => setConversationDescription(e.target.value)}
                        className="min-h-[80px] text-sm resize-none"
                        placeholder={t('conversationDetails.descriptionPlaceholder')}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setIsEditingDescription(false);
                            setConversationDescription(conversation.description || '');
                          }
                          // Ctrl/Cmd + Enter pour sauvegarder
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            handleSaveDescription();
                          }
                        }}
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          onClick={handleSaveDescription}
                          disabled={isLoading}
                          className="h-8 px-3"
                        >
                          <Save className="h-3 w-3 mr-1" />
                          {t('conversationDetails.save')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setIsEditingDescription(false);
                            setConversationDescription(conversation.description || '');
                          }}
                          className="h-8 px-3"
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t('conversationDetails.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="group relative p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        if (isAdmin) {
                          setIsEditingDescription(true);
                          setConversationDescription(conversation.description || '');
                        }
                      }}
                    >
                      {conversation.description ? (
                        <div className="max-h-32 overflow-y-auto">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {conversation.description}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground/50 italic">
                          {isAdmin
                            ? t('conversationDetails.addDescription')
                            : t('conversationDetails.noDescription')
                          }
                        </p>
                      )}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEditingDescription(true);
                            setConversationDescription(conversation.description || '');
                          }}
                          title={t('conversationDetails.editDescription')}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

              </>
            )}

            <Separator />

            {/* User Preferences Section - Available for all conversation types */}
            <div className="space-y-4">
              {/* Tags Section (Personal) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    {t('conversationDetails.personalTags')}
                  </label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs">
                          {t('conversationDetails.tagsTooltip')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <TagsManager conversationId={conversation.id} currentUser={currentUser} />
              </div>

              {/* Category Section (Personal) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    {t('conversationDetails.category')}
                  </label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs">
                          {t('conversationDetails.categoryTooltip')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <CategorySelector conversationId={conversation.id} currentUser={currentUser} />
              </div>

              {/* Customization Section (Personal) */}
              <div className="space-y-2">
                <CustomizationManager conversationId={conversation.id} currentUser={currentUser} />
              </div>
            </div>

            <Separator />

            {/* Header avec langues globales */}
            <SidebarLanguageHeader 
              languageStats={messageLanguageStats} 
              userLanguage={currentUser.systemLanguage}
            />

            {/* Section Langues Actives - Foldable */}
            <FoldableSection
              title={t('conversationDetails.activeLanguages')}
              icon={<Languages className="h-4 w-4 mr-2" />}
              defaultExpanded={true}
            >
              <LanguageIndicators languageStats={activeLanguageStats} />
            </FoldableSection>

            {/* Section Utilisateurs Actifs - Foldable */}
            <FoldableSection
              title={`${t('conversationDetails.activeUsers')} (${activeUsers.length})`}
              icon={<Users className="h-4 w-4 mr-2" />}
              defaultExpanded={true}
            >
              <div className="space-y-3">
                {activeUsers.slice(0, 6).map((user) => (
                  <div key={user.id} className="flex items-center space-x-3 p-2 rounded hover:bg-accent cursor-pointer transition-colors">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar} alt={user.firstName} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                        {(user.firstName || user.username || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {user.firstName && user.lastName
                          ? `${user.firstName} ${user.lastName}`
                          : user.username}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {getLanguageDisplayName(user.systemLanguage)} {getLanguageFlag(user.systemLanguage)}
                      </p>
                    </div>
                    <OnlineIndicator
                      isOnline={getUserStatus(user) === 'online'}
                      status={getUserStatus(user)}
                      size="sm"
                    />
                  </div>
                ))}
                
                {activeUsers.length > 6 && (
                  <div className="text-center pt-2">
                    <p className="text-xs text-gray-500">
                      {t('conversationDetails.otherActiveUsers', { count: activeUsers.length - 6 })}
                    </p>
                  </div>
                )}
                
                {activeUsers.length === 0 && (
                  <div className="text-center py-4">
                    <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-500">{t('conversationDetails.noActiveUsers')}</p>
                  </div>
                )}
              </div>
            </FoldableSection>

            {/* Section Liens de partage */}
            {/* Section des liens de partage - seulement pour les conversations de groupe */}
            {conversation.type !== 'direct' && (
              <FoldableSection
                title={t('conversationDetails.shareLinks')}
                icon={<Link2 className="h-4 w-4 mr-2" />}
                defaultExpanded={false}
              >
                <div className="space-y-4">
                  {/* Bouton pour créer un nouveau lien */}
                  <CreateLinkButton
                    forceModal={true}
                    onLinkCreated={() => {
                      // Recharger la liste des liens
                      window.location.reload();
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    {t('conversationDetails.createLink')}
                  </CreateLinkButton>
                  
                  {/* Liste des liens existants */}
                  <ConversationLinksSection 
                    conversationId={conversation.id}
                  />
                </div>
              </FoldableSection>
            )}
          </div>
        </ScrollArea>

        {/* Dialog pour l'upload d'image de conversation */}
        <ConversationImageUploadDialog
          open={isImageUploadDialogOpen}
          onClose={() => setIsImageUploadDialogOpen(false)}
          onImageUploaded={handleImageUpload}
          isUploading={isUploadingImage}
          conversationTitle={conversation.title || conversation.id}
        />
      </div>
    </div>
    </>
  );
}
