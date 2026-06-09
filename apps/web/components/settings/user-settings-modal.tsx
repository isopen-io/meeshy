'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { User } from '@/types';
import { Settings } from 'lucide-react';
import { UserSettingsContent } from './user-settings-content';
import { useI18n } from '@/hooks/use-i18n';

interface UserSettingsModalProps {
  user: User | null;
  onUserUpdate: (updatedUser: Partial<User>) => void;
  onClose?: () => void;
  children?: React.ReactNode;
}

export function UserSettingsModal({ user, onUserUpdate, onClose, children }: UserSettingsModalProps) {
  const { t } = useI18n('admin');
  const [open, setOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<User>>({});

  useEffect(() => {
    if (user && open) {
      setLocalSettings({
        systemLanguage: user.systemLanguage,
        regionalLanguage: user.regionalLanguage,
        customDestinationLanguage: user.customDestinationLanguage,
        autoTranslateEnabled: user.autoTranslateEnabled,
      });
    }
  }, [user, open]);

  const handleSave = () => {
    onUserUpdate(localSettings);
    setOpen(false);
    onClose?.();
  };

  const updateSetting = (key: keyof User, value: string | boolean) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            {t('settingsModal.triggerButton')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto sm:max-w-4xl sm:w-[90vw] sm:max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('settingsModal.title', { username: user.username })}
          </DialogTitle>
          <DialogDescription>
            {t('settingsModal.description')}
          </DialogDescription>
        </DialogHeader>

        <UserSettingsContent
          user={user}
          localSettings={localSettings}
          onSettingUpdate={updateSetting}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('settingsModal.cancelButton')}
          </Button>
          <Button onClick={handleSave}>
            {t('settingsModal.saveButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
