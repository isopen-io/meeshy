'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import styles from './config-modal.module.css';
import { 
  User, 
  Globe, 
  Brain, 
  Database, 
  Palette, 
  Shield,
  Bell,
  BarChart3
} from 'lucide-react';
import { User as UserType } from '@/types';
import { UserSettings } from './user-settings';
import { LanguageSettings } from '@/components/translation/language-settings';
import { ThemeSettings } from './theme-settings';
import { PrivacySettings } from './privacy-settings';
import { NotificationSettings } from './notification-settings';
import { TranslationStats } from '@/components/translation/translation-stats';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType | null;
  onUserUpdate: (user: UserType) => void;
}

interface TabConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  component: React.ReactNode;
}

export function ConfigModal({ isOpen, onClose, currentUser, onUserUpdate }: ConfigModalProps) {
  const [activeTab, setActiveTab] = useState('user');

  const tabs: TabConfig[] = [
    {
      id: 'user',
      label: 'Profil utilisateur',
      icon: <User className="h-4 w-4" />,
      component: <UserSettings user={currentUser} onUserUpdate={onUserUpdate} />
    },
    {
      id: 'language',
      label: 'Langues & Traduction',
      icon: <Globe className="h-4 w-4" />,
      component: <LanguageSettings user={currentUser} onUserUpdate={onUserUpdate} />
    },
    {
      id: 'theme',
      label: 'Apparence',
      icon: <Palette className="h-4 w-4" />,
      component: <ThemeSettings />
    },
    {
      id: 'stats',
      label: 'Statistiques',
      icon: <BarChart3 className="h-4 w-4" />,
      component: <TranslationStats />
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="h-4 w-4" />,
      component: <NotificationSettings />
    },
    {
      id: 'privacy',
      label: 'Confidentialité',
      icon: <Shield className="h-4 w-4" />,
      component: <PrivacySettings />
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={`max-w-[98vw] w-full h-[95vh] p-0 sm:max-w-[95vw] sm:h-[90vh] !grid-template-rows-none !gap-0 ${styles.configModalContent}`}
        showCloseButton={true}
      >
        <DialogHeader className={`px-4 py-3 border-b sm:px-6 sm:py-4 ${styles.configModalHeader}`}>
          <DialogTitle className="text-lg sm:text-xl font-semibold">Paramètres et Configuration</DialogTitle>
        </DialogHeader>
        
        <div className={`flex flex-1 min-h-0 overflow-hidden ${styles.configModalMain}`}>
          {/* Sidebar avec tabs - Desktop */}
          <div className={`hidden lg:flex lg:w-72 xl:w-80 lg:flex-col lg:border-r lg:bg-muted/30 lg:overflow-hidden ${styles.configModalSidebar}`}>
            <div className="flex-1 overflow-y-auto p-4 xl:p-6">
              <div className="space-y-2 xl:space-y-3">
                {tabs.map((tab) => (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-2 xl:gap-3 h-12 xl:h-14 text-left text-sm xl:text-base"
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <div className="flex items-center gap-2 xl:gap-3">
                      {tab.icon}
                      <span className="font-medium">{tab.label}</span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Contenu principal */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Menu déroulant pour mobile et tablette */}
            <div className="lg:hidden p-3 sm:p-4 border-b bg-background flex-shrink-0">
              <select 
                value={activeTab} 
                onChange={(e) => setActiveTab(e.target.value)}
                className="w-full p-2 sm:p-3 border rounded-lg bg-background text-sm sm:text-base"
              >
                {tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Contenu de l'onglet actif */}
            <div className={`flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 xl:p-8 ${styles.configModalContentArea}`}>
              <div className="max-w-none lg:max-w-5xl xl:max-w-6xl mx-auto pb-8">
                {tabs.find(tab => tab.id === activeTab)?.component}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
