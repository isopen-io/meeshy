'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X as XIcon, Plus, Folder, Pencil, Trash2, Check } from 'lucide-react';
import { userPreferencesService } from '@/services/user-preferences.service';
import { toast } from 'sonner';
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

function isAnonymousUser(user: any): user is AnonymousParticipant {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

interface CategorySelectorProps {
  conversationId: string;
  currentUser: User;
  onCategoryUpdated?: () => void;
}

/**
 * Component for managing user-specific conversation categories
 * Allows creating, editing, and deleting categories
 */
export function CategorySelector({ conversationId, currentUser, onCategoryUpdated }: CategorySelectorProps) {
  const { t } = useI18n('conversations');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  useEffect(() => {
    if (isAnonymousUser(currentUser)) {
      setCategories([]);
      setSelectedCategoryId(null);
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        const prefs = await userPreferencesService.getPreferences(conversationId);
        setSelectedCategoryId(prefs?.categoryId || null);

        const cats = await userPreferencesService.getCategories();
        const sortedCats = cats.sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
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
      const newCategory = await userPreferencesService.createCategory({ name });
      const updatedCategories = [...categories, newCategory].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name);
      });
      setCategories(updatedCategories);
      setSelectedCategoryId(newCategory.id);
      setSearchQuery('');
      setIsDropdownOpen(false);

      try {
        await userPreferencesService.upsertPreferences(conversationId, { categoryId: newCategory.id });
        toast.success(t('conversationDetails.categoryCreated'));
        onCategoryUpdated?.();
      } catch (updateError) {
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
    if (!confirm(t('conversationDetails.confirmDeleteCategory', { category: categoryName }))) {
      return;
    }

    try {
      await userPreferencesService.deleteCategory(categoryId);
      const updatedCategories = categories.filter(cat => cat.id !== categoryId);
      setCategories(updatedCategories);

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

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isNewCategory = searchQuery.trim().length > 0 &&
    !categories.some(cat => cat.name.toLowerCase() === searchQuery.toLowerCase());

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  if (isLoading) {
    return <div className="text-xs text-muted-foreground italic">{t('common.loading') || 'Loading...'}</div>;
  }

  return (
    <div className="space-y-3">
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
