'use client';

import { memo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useUpdateCommunityMutation,
  useDeleteCommunityMutation,
  useCheckIdentifierQuery,
} from '@/hooks/queries';
import type { Community, UpdateCommunityData } from '@meeshy/shared/types';
import { toast } from 'sonner';

interface CommunitySettingsPanelProps {
  community: Community;
  onClose: () => void;
  onDeleted: () => void;
  t: (key: string) => string;
}

export const CommunitySettingsPanel = memo(function CommunitySettingsPanel({
  community,
  onClose,
  onDeleted,
  t,
}: CommunitySettingsPanelProps) {
  const updateMutation = useUpdateCommunityMutation();
  const deleteMutation = useDeleteCommunityMutation();

  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? '');
  const [isPrivate, setIsPrivate] = useState(community.isPrivate);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const hasChanges =
    name !== community.name ||
    description !== (community.description ?? '') ||
    isPrivate !== community.isPrivate;

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;

    const data: UpdateCommunityData = {};
    if (name !== community.name) (data as Record<string, unknown>).name = name;
    if (description !== (community.description ?? ''))
      (data as Record<string, unknown>).description = description || undefined;
    if (isPrivate !== community.isPrivate)
      (data as Record<string, unknown>).isPrivate = isPrivate;

    try {
      await updateMutation.mutateAsync({ id: community.id, data });
      toast.success(t('settings.saved'));
      onClose();
    } catch {
      toast.error(t('settings.saveError'));
    }
  }, [
    hasChanges, name, description, isPrivate, community, updateMutation, t, onClose,
  ]);

  const handleDelete = useCallback(async () => {
    if (deleteConfirmation !== community.name) return;
    try {
      await deleteMutation.mutateAsync(community.id);
      toast.success(t('settings.deleted'));
      onDeleted();
    } catch {
      toast.error(t('settings.deleteError'));
    }
  }, [deleteConfirmation, community, deleteMutation, t, onDeleted]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="settings-name" className="text-sm font-medium">
            {t('settings.nameLabel')}
          </label>
          <Input
            id="settings-name"
            aria-label={t('settings.nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label htmlFor="settings-description" className="text-sm font-medium">
            {t('settings.descriptionLabel')}
          </label>
          <Input
            id="settings-description"
            aria-label={t('settings.descriptionLabel')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">{t('settings.privateLabel')}</label>
            <p className="text-xs text-muted-foreground">{t('settings.privateHelp')}</p>
          </div>
          <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="flex-1">
          {t('settings.cancel')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className="flex-1"
        >
          <Save className="h-4 w-4 mr-1" />
          {t('settings.save')}
        </Button>
      </div>

      <div className="border-t border-destructive/20 pt-6 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <h4 className="font-semibold text-destructive">{t('settings.dangerZone')}</h4>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{t('settings.deleteCommunity')}</p>
        <p className="text-xs text-muted-foreground mb-2">
          {t('settings.deleteConfirmPrompt')} <strong>{community.name}</strong>
        </p>
        <Input
          value={deleteConfirmation}
          onChange={(e) => setDeleteConfirmation(e.target.value)}
          placeholder={community.name}
          className="mb-3"
        />
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={deleteConfirmation !== community.name || deleteMutation.isPending}
          className="w-full"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {t('settings.confirmDelete')}
        </Button>
      </div>
    </div>
  );
});
