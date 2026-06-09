'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types';
import { Download, Upload, FolderOpen, HardDrive } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

interface DocumentSettingsProps {
  user?: User | null;
  onUserUpdate?: (updatedUser: Partial<User>) => void;
}

export default function DocumentSettings({ _user }: DocumentSettingsProps) {
  const { t } = useI18n('settings');
  const [settings, setSettings] = useState({
    autoDownloadDocs: false,
    maxFileSize: 50,
    allowedFileTypes: 'all',
    previewDocuments: true,
    autoOrganize: true,
    defaultSaveLocation: 'downloads',
    compressUploads: true,
    keepOriginals: true,
    deleteAfterDays: 30,
    scanForViruses: true,
    blockExecutables: true,
    warnLargeFiles: true
  });

  const updateSetting = (key: string, value: unknown) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Download Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-600" />
            <CardTitle>{t('document.download.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('document.download.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('document.download.autoDownload.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('document.download.autoDownload.description')}
              </p>
            </div>
            <Switch
              checked={settings.autoDownloadDocs}
              onCheckedChange={(checked) => updateSetting('autoDownloadDocs', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('document.download.preview.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('document.download.preview.description')}
              </p>
            </div>
            <Switch
              checked={settings.previewDocuments}
              onCheckedChange={(checked) => updateSetting('previewDocuments', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('document.download.maxSize.label')}</Label>
            <Select
              value={settings.maxFileSize.toString()}
              onValueChange={(value) => updateSetting('maxFileSize', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">{t('document.download.maxSize.mb10')}</SelectItem>
                <SelectItem value="25">{t('document.download.maxSize.mb25')}</SelectItem>
                <SelectItem value="50">{t('document.download.maxSize.mb50')}</SelectItem>
                <SelectItem value="100">{t('document.download.maxSize.mb100')}</SelectItem>
                <SelectItem value="500">{t('document.download.maxSize.mb500')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('document.download.saveLocation.label')}</Label>
            <Select
              value={settings.defaultSaveLocation}
              onValueChange={(value) => updateSetting('defaultSaveLocation', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="downloads">{t('document.download.saveLocation.downloads')}</SelectItem>
                <SelectItem value="documents">{t('document.download.saveLocation.documents')}</SelectItem>
                <SelectItem value="desktop">{t('document.download.saveLocation.desktop')}</SelectItem>
                <SelectItem value="custom">{t('document.download.saveLocation.custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Upload Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-green-600" />
            <CardTitle>{t('document.upload.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('document.upload.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('document.upload.compress.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('document.upload.compress.description')}
              </p>
            </div>
            <Switch
              checked={settings.compressUploads}
              onCheckedChange={(checked) => updateSetting('compressUploads', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('document.upload.keepOriginals.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('document.upload.keepOriginals.description')}
              </p>
            </div>
            <Switch
              checked={settings.keepOriginals}
              onCheckedChange={(checked) => updateSetting('keepOriginals', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('document.upload.warnLarge.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('document.upload.warnLarge.description')}
              </p>
            </div>
            <Switch
              checked={settings.warnLargeFiles}
              onCheckedChange={(checked) => updateSetting('warnLargeFiles', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('document.upload.fileTypes.label')}</Label>
            <Select
              value={settings.allowedFileTypes}
              onValueChange={(value) => updateSetting('allowedFileTypes', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('document.upload.fileTypes.all')}</SelectItem>
                <SelectItem value="documents">{t('document.upload.fileTypes.documents')}</SelectItem>
                <SelectItem value="images">{t('document.upload.fileTypes.images')}</SelectItem>
                <SelectItem value="media">{t('document.upload.fileTypes.media')}</SelectItem>
                <SelectItem value="archives">{t('document.upload.fileTypes.archives')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Organization */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-purple-600" />
            <CardTitle>{t('document.organization.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('document.organization.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('document.organization.autoOrganize.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('document.organization.autoOrganize.description')}
              </p>
            </div>
            <Switch
              checked={settings.autoOrganize}
              onCheckedChange={(checked) => updateSetting('autoOrganize', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('document.organization.autoDelete.label')}</Label>
            <Select
              value={settings.deleteAfterDays.toString()}
              onValueChange={(value) => updateSetting('deleteAfterDays', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('document.organization.autoDelete.never')}</SelectItem>
                <SelectItem value="7">{t('document.organization.autoDelete.after7')}</SelectItem>
                <SelectItem value="30">{t('document.organization.autoDelete.after30')}</SelectItem>
                <SelectItem value="90">{t('document.organization.autoDelete.after90')}</SelectItem>
                <SelectItem value="180">{t('document.organization.autoDelete.after6m')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('document.organization.autoDelete.description')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-red-600" />
            <CardTitle>{t('document.security.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('document.security.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('document.security.scanViruses.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('document.security.scanViruses.description')}
              </p>
            </div>
            <Switch
              checked={settings.scanForViruses}
              onCheckedChange={(checked) => updateSetting('scanForViruses', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('document.security.blockExecutables.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('document.security.blockExecutables.description')}
              </p>
            </div>
            <Switch
              checked={settings.blockExecutables}
              onCheckedChange={(checked) => updateSetting('blockExecutables', checked)}
            />
          </div>

          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {t('document.security.note')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
