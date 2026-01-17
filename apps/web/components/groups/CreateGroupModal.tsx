/**
 * Modal de création de groupe avec validation temps réel
 * Suit les Vercel React Best Practices: rerender-memo
 */

import { memo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreateGroupModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  formState: {
    newGroupName: string;
    setNewGroupName: (value: string) => void;
    newGroupDescription: string;
    setNewGroupDescription: (value: string) => void;
    newGroupIdentifier: string;
    setNewGroupIdentifier: (value: string) => void;
    newGroupIsPrivate: boolean;
    setNewGroupIsPrivate: (value: boolean) => void;
    isCheckingIdentifier: boolean;
    identifierAvailable: boolean | null;
    isValid: boolean;
  };
  onSubmit: () => void;
  tGroups: (key: string) => string;
}

export const CreateGroupModal = memo(function CreateGroupModal({
  isOpen,
  onOpenChange,
  formState,
  onSubmit,
  tGroups
}: CreateGroupModalProps) {
  const {
    newGroupName,
    setNewGroupName,
    newGroupDescription,
    setNewGroupDescription,
    newGroupIdentifier,
    setNewGroupIdentifier,
    newGroupIsPrivate,
    setNewGroupIsPrivate,
    isCheckingIdentifier,
    identifierAvailable,
    isValid
  } = formState;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] sm:max-w-md sm:w-[90vw]">
        <DialogHeader>
          <DialogTitle>{tGroups('createModal.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">{tGroups('createModal.nameLabel')}</label>
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder={tGroups('createModal.namePlaceholder')}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">{tGroups('createModal.descriptionLabel')}</label>
            <Input
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              placeholder={tGroups('createModal.descriptionPlaceholder')}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">{tGroups('createModal.identifierLabel')}</label>
            <div className="relative mt-1">
              <Input
                value={newGroupIdentifier}
                onChange={(e) => setNewGroupIdentifier(e.target.value)}
                placeholder={tGroups('createModal.identifierPlaceholder')}
                className={cn(
                  "pr-10",
                  identifierAvailable === true && "border-green-500 focus:border-green-500",
                  identifierAvailable === false && "border-red-500 focus:border-red-500"
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isCheckingIdentifier ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                ) : identifierAvailable === true ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : identifierAvailable === false ? (
                  <X className="h-4 w-4 text-red-500" />
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {identifierAvailable === false ? (
                <span className="text-red-500">{tGroups('createModal.identifierTaken')}</span>
              ) : identifierAvailable === true ? (
                <span className="text-green-500">{tGroups('createModal.identifierAvailable')}</span>
              ) : (
                tGroups('createModal.identifierHelp')
              )}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">{tGroups('createModal.privateLabel')}</label>
              <p className="text-xs text-muted-foreground">{tGroups('createModal.privateHelp')}</p>
            </div>
            <Switch checked={newGroupIsPrivate} onCheckedChange={setNewGroupIsPrivate} />
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              {tGroups('createModal.cancel')}
            </Button>
            <Button onClick={onSubmit} disabled={!isValid} className="flex-1">
              {tGroups('createModal.create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
