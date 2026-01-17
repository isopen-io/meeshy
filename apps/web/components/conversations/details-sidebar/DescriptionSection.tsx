'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Edit, Save, X } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

interface DescriptionSectionProps {
  description: string | null | undefined;
  isEditing: boolean;
  editValue: string;
  isLoading: boolean;
  isAdmin: boolean;
  onEditChange: (value: string) => void;
  onSave: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}

/**
 * Description editing section for group conversations
 * Only shown for non-direct conversations
 */
export function DescriptionSection({
  description,
  isEditing,
  editValue,
  isLoading,
  isAdmin,
  onEditChange,
  onSave,
  onStartEdit,
  onCancelEdit,
}: DescriptionSectionProps) {
  const { t } = useI18n('conversations');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      onCancelEdit();
    }
    // Ctrl/Cmd + Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      onSave();
    }
  };

  return (
    <div className="space-y-2">
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            className="min-h-[80px] text-sm resize-none"
            placeholder={t('conversationDetails.descriptionPlaceholder')}
            autoFocus
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center gap-2 justify-end">
            <Button
              size="sm"
              onClick={onSave}
              disabled={isLoading}
              className="h-8 px-3"
            >
              <Save className="h-3 w-3 mr-1" />
              {t('conversationDetails.save')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancelEdit}
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
          onClick={() => isAdmin && onStartEdit()}
        >
          {description ? (
            <div className="max-h-32 overflow-y-auto">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {description}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/50 italic">
              {isAdmin
                ? t('conversationDetails.addDescription')
                : t('conversationDetails.noDescription')}
            </p>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit();
              }}
              title={t('conversationDetails.editDescription')}
            >
              <Edit className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
