'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { User } from '@/types';
import { Settings } from 'lucide-react';
import { UserSettingsContent } from './user-settings-content';

interface UserSettingsModalProps {
  user: User | null;
  onUserUpdate: (updatedUser: Partial<User>) => void;
  onClose?: () => void;
  children?: React.ReactNode;
}

export function UserSettingsModal({ user, onUserUpdate, onClose, children }: UserSettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<User>>({});

  useEffect(() => {
    if (user && open) {
      setLocalSettings({
        systemLanguage: user.systemLanguage,
        regionalLanguage: user.regionalLanguage,
        customDestinationLanguage: user.customDestinationLanguage,
        autoTranslateEnabled: user.autoTranslateEnabled,
        translateToSystemLanguage: user.translateToSystemLanguage,
        translateToRegionalLanguage: user.translateToRegionalLanguage,
        useCustomDestination: user.useCustomDestination,
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
            Paramètres
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto sm:max-w-4xl sm:w-[90vw] sm:max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Paramètres de {user.username}
          </DialogTitle>
          <DialogDescription>
            Configurez vos préférences de langue et de traduction automatique
          </DialogDescription>
        </DialogHeader>

        <UserSettingsContent 
          user={user}
          localSettings={localSettings}
          onSettingUpdate={updateSetting}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave}>
            Sauvegarder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
