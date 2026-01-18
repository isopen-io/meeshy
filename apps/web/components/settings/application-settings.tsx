'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { User } from '@/types';
import { Settings, Zap, Database, Globe, Lock, Trash2, RefreshCw } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { toast } from 'sonner';

interface ApplicationSettingsProps {
  user?: User | null;
  onUserUpdate?: (updatedUser: Partial<User>) => void;
}

export default function ApplicationSettings({ user, onUserUpdate }: ApplicationSettingsProps) {
  const { t } = useI18n('settings');
  const [settings, setSettings] = useState({
    autoUpdate: true,
    betaUpdates: false,
    hardwareAcceleration: true,
    launchOnStartup: false,
    minimizeToTray: true,
    closeToTray: false,
    persistentConnection: true,
    dataUsageWarning: true,
    cacheSize: 500,
    offlineMode: false,
    syncAcrossDevices: true,
    lowDataMode: false
  });

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleClearCache = () => {
    toast.success('Cache cleared successfully');
  };

  const handleResetSettings = () => {
    toast.success('Settings reset to default');
  };

  return (
    <div className="space-y-6">
      {/* General Application */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-600" />
            <CardTitle>General Application</CardTitle>
          </div>
          <CardDescription>
            Configure general application behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Launch on startup</Label>
              <p className="text-sm text-muted-foreground">
                Automatically start Meeshy when you log in
              </p>
            </div>
            <Switch
              checked={settings.launchOnStartup}
              onCheckedChange={(checked) => updateSetting('launchOnStartup', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Minimize to tray</Label>
              <p className="text-sm text-muted-foreground">
                Keep app running in system tray when minimized
              </p>
            </div>
            <Switch
              checked={settings.minimizeToTray}
              onCheckedChange={(checked) => updateSetting('minimizeToTray', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Close to tray</Label>
              <p className="text-sm text-muted-foreground">
                Minimize to tray instead of closing when clicking X
              </p>
            </div>
            <Switch
              checked={settings.closeToTray}
              onCheckedChange={(checked) => updateSetting('closeToTray', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Performance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-600" />
            <CardTitle>Performance</CardTitle>
          </div>
          <CardDescription>
            Optimize application performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Hardware acceleration</Label>
              <p className="text-sm text-muted-foreground">
                Use GPU for better performance (requires restart)
              </p>
            </div>
            <Switch
              checked={settings.hardwareAcceleration}
              onCheckedChange={(checked) => updateSetting('hardwareAcceleration', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Persistent connection</Label>
              <p className="text-sm text-muted-foreground">
                Maintain connection for instant messaging
              </p>
            </div>
            <Switch
              checked={settings.persistentConnection}
              onCheckedChange={(checked) => updateSetting('persistentConnection', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Low data mode</Label>
              <p className="text-sm text-muted-foreground">
                Reduce data usage by disabling auto-downloads
              </p>
            </div>
            <Switch
              checked={settings.lowDataMode}
              onCheckedChange={(checked) => updateSetting('lowDataMode', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Updates */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-green-600" />
            <CardTitle>Updates</CardTitle>
          </div>
          <CardDescription>
            Manage application updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-update</Label>
              <p className="text-sm text-muted-foreground">
                Automatically download and install updates
              </p>
            </div>
            <Switch
              checked={settings.autoUpdate}
              onCheckedChange={(checked) => updateSetting('autoUpdate', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Beta updates</Label>
              <p className="text-sm text-muted-foreground">
                Receive early access to beta features
              </p>
            </div>
            <Switch
              checked={settings.betaUpdates}
              onCheckedChange={(checked) => updateSetting('betaUpdates', checked)}
            />
          </div>

          <Button variant="outline" className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Check for Updates
          </Button>
        </CardContent>
      </Card>

      {/* Data & Storage */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-purple-600" />
            <CardTitle>Data & Storage</CardTitle>
          </div>
          <CardDescription>
            Manage application data and storage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Sync across devices</Label>
              <p className="text-sm text-muted-foreground">
                Synchronize settings and data across all devices
              </p>
            </div>
            <Switch
              checked={settings.syncAcrossDevices}
              onCheckedChange={(checked) => updateSetting('syncAcrossDevices', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Offline mode</Label>
              <p className="text-sm text-muted-foreground">
                Cache messages for offline access
              </p>
            </div>
            <Switch
              checked={settings.offlineMode}
              onCheckedChange={(checked) => updateSetting('offlineMode', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Data usage warning</Label>
              <p className="text-sm text-muted-foreground">
                Warn when app uses excessive data
              </p>
            </div>
            <Switch
              checked={settings.dataUsageWarning}
              onCheckedChange={(checked) => updateSetting('dataUsageWarning', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>Maximum cache size</Label>
            <Select
              value={settings.cacheSize.toString()}
              onValueChange={(value) => updateSetting('cacheSize', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 MB</SelectItem>
                <SelectItem value="250">250 MB</SelectItem>
                <SelectItem value="500">500 MB (Recommended)</SelectItem>
                <SelectItem value="1000">1 GB</SelectItem>
                <SelectItem value="2000">2 GB</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleClearCache}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Cache
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Current cache usage: 245 MB / {settings.cacheSize} MB
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Advanced */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-600" />
            <CardTitle>Advanced</CardTitle>
          </div>
          <CardDescription>
            Advanced application settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleResetSettings}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset All Settings
          </Button>

          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">
              <strong>Warning:</strong> Resetting settings will restore all preferences to their default values.
              This action cannot be undone.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
