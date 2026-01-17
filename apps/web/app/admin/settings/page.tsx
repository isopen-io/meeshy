'use client';

import React, { useState, lazy, Suspense } from 'react';
import dynamic from 'next/dynamic';
import AdminLayout from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { SettingsHeader } from '@/components/admin/settings/SettingsHeader';
import { SettingsAlerts } from '@/components/admin/settings/SettingsAlerts';
import { SettingsStats } from '@/components/admin/settings/SettingsStats';
import { useAdminSettings } from '@/hooks/admin/use-admin-settings';
import { useSettingsValidation } from '@/hooks/admin/use-settings-validation';
import { useSettingsSave } from '@/hooks/admin/use-settings-save';
import { configSections } from '@/config/admin-settings-config';
import { Loader2 } from 'lucide-react';

/**
 * Dynamic imports for settings sections
 * Each section is code-split and loaded on demand
 */
const GeneralSettingsSection = dynamic(
  () =>
    import('@/components/admin/settings/GeneralSettingsSection').then(
      mod => mod.GeneralSettingsSection
    ),
  {
    loading: () => <SectionLoader />,
  }
);

const DatabaseSettingsSection = dynamic(
  () =>
    import('@/components/admin/settings/DatabaseSettingsSection').then(
      mod => mod.DatabaseSettingsSection
    ),
  {
    loading: () => <SectionLoader />,
  }
);

const SecuritySettingsSection = dynamic(
  () =>
    import('@/components/admin/settings/SecuritySettingsSection').then(
      mod => mod.SecuritySettingsSection
    ),
  {
    loading: () => <SectionLoader />,
  }
);

const RateLimitingSettingsSection = dynamic(
  () =>
    import('@/components/admin/settings/RateLimitingSettingsSection').then(
      mod => mod.RateLimitingSettingsSection
    ),
  {
    loading: () => <SectionLoader />,
  }
);

const MessagesSettingsSection = dynamic(
  () =>
    import('@/components/admin/settings/MessagesSettingsSection').then(
      mod => mod.MessagesSettingsSection
    ),
  {
    loading: () => <SectionLoader />,
  }
);

const UploadsSettingsSection = dynamic(
  () =>
    import('@/components/admin/settings/UploadsSettingsSection').then(
      mod => mod.UploadsSettingsSection
    ),
  {
    loading: () => <SectionLoader />,
  }
);

const ServerSettingsSection = dynamic(
  () =>
    import('@/components/admin/settings/ServerSettingsSection').then(
      mod => mod.ServerSettingsSection
    ),
  {
    loading: () => <SectionLoader />,
  }
);

const FeaturesSettingsSection = dynamic(
  () =>
    import('@/components/admin/settings/FeaturesSettingsSection').then(
      mod => mod.FeaturesSettingsSection
    ),
  {
    loading: () => <SectionLoader />,
  }
);

function SectionLoader() {
  return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  );
}

/**
 * Admin Settings Page
 * Refactored with modular architecture, hooks, and dynamic imports
 * Reduced from 975 lines to ~200 lines
 */
export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState('general');

  const {
    settings,
    updateSetting,
    resetAll,
    hasChanges,
    getSettingsBySection,
  } = useAdminSettings(configSections);

  const { isValid } = useSettingsValidation(settings);
  const { isSaving, saveSettings } = useSettingsSave();

  const handleSave = async () => {
    if (!isValid) {
      console.error('Validation errors detected');
      return;
    }

    try {
      await saveSettings(settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleReset = () => {
    if (confirm('Réinitialiser tous les paramètres à leurs valeurs par défaut?')) {
      resetAll();
    }
  };

  const getSectionComponent = (sectionId: string) => {
    const sectionSettings = getSettingsBySection(sectionId);
    const props = { settings: sectionSettings, onUpdate: updateSetting };

    switch (sectionId) {
      case 'general':
        return <GeneralSettingsSection {...props} />;
      case 'database':
        return <DatabaseSettingsSection {...props} />;
      case 'security':
        return <SecuritySettingsSection {...props} />;
      case 'rate-limiting':
        return <RateLimitingSettingsSection {...props} />;
      case 'messages':
        return <MessagesSettingsSection {...props} />;
      case 'uploads':
        return <UploadsSettingsSection {...props} />;
      case 'server':
        return <ServerSettingsSection {...props} />;
      case 'features':
        return <FeaturesSettingsSection {...props} />;
      default:
        return null;
    }
  };

  return (
    <AdminLayout currentPage="/admin/settings">
      <div className="space-y-6">
        <SettingsHeader
          hasChanges={hasChanges}
          isSaving={isSaving}
          onSave={handleSave}
          onReset={handleReset}
        />

        <SettingsAlerts />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 gap-2">
            {configSections.map(section => {
              const Icon = section.icon;
              const notImplementedCount = section.settings.filter(
                s => !s.implemented
              ).length;

              return (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className="relative"
                >
                  <Icon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">
                    {section.title.split(' ')[0]}
                  </span>
                  {notImplementedCount > 0 && (
                    <Badge
                      variant="outline"
                      className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600"
                    >
                      {notImplementedCount}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {configSections.map(section => (
            <TabsContent key={section.id} value={section.id} className="mt-6">
              <Suspense fallback={<SectionLoader />}>
                {getSectionComponent(section.id)}
              </Suspense>
            </TabsContent>
          ))}
        </Tabs>

        <SettingsStats configSections={configSections} />
      </div>
    </AdminLayout>
  );
}
