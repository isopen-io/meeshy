'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types';
import { FileText, Download, Upload, FolderOpen, HardDrive } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

interface DocumentSettingsProps {
  user?: User | null;
  onUserUpdate?: (updatedUser: Partial<User>) => void;
}

export default function DocumentSettings({ user, onUserUpdate }: DocumentSettingsProps) {
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

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Download Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-600" />
            <CardTitle>Download Settings</CardTitle>
          </div>
          <CardDescription>
            Configure how documents are downloaded
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-download documents</Label>
              <p className="text-sm text-muted-foreground">
                Automatically download documents sent in chats
              </p>
            </div>
            <Switch
              checked={settings.autoDownloadDocs}
              onCheckedChange={(checked) => updateSetting('autoDownloadDocs', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Preview documents</Label>
              <p className="text-sm text-muted-foreground">
                Show document previews before downloading
              </p>
            </div>
            <Switch
              checked={settings.previewDocuments}
              onCheckedChange={(checked) => updateSetting('previewDocuments', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>Maximum file size for auto-download</Label>
            <Select
              value={settings.maxFileSize.toString()}
              onValueChange={(value) => updateSetting('maxFileSize', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 MB</SelectItem>
                <SelectItem value="25">25 MB</SelectItem>
                <SelectItem value="50">50 MB (Recommended)</SelectItem>
                <SelectItem value="100">100 MB</SelectItem>
                <SelectItem value="500">500 MB</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default save location</Label>
            <Select
              value={settings.defaultSaveLocation}
              onValueChange={(value) => updateSetting('defaultSaveLocation', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="downloads">Downloads folder</SelectItem>
                <SelectItem value="documents">Documents folder</SelectItem>
                <SelectItem value="desktop">Desktop</SelectItem>
                <SelectItem value="custom">Custom location</SelectItem>
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
            <CardTitle>Upload Settings</CardTitle>
          </div>
          <CardDescription>
            Configure document upload preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Compress uploads</Label>
              <p className="text-sm text-muted-foreground">
                Compress documents before uploading to save bandwidth
              </p>
            </div>
            <Switch
              checked={settings.compressUploads}
              onCheckedChange={(checked) => updateSetting('compressUploads', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Keep originals</Label>
              <p className="text-sm text-muted-foreground">
                Keep original files after uploading compressed versions
              </p>
            </div>
            <Switch
              checked={settings.keepOriginals}
              onCheckedChange={(checked) => updateSetting('keepOriginals', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Warn for large files</Label>
              <p className="text-sm text-muted-foreground">
                Show warning before uploading files over 50MB
              </p>
            </div>
            <Switch
              checked={settings.warnLargeFiles}
              onCheckedChange={(checked) => updateSetting('warnLargeFiles', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>Allowed file types</Label>
            <Select
              value={settings.allowedFileTypes}
              onValueChange={(value) => updateSetting('allowedFileTypes', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All file types</SelectItem>
                <SelectItem value="documents">Documents only (PDF, DOC, TXT)</SelectItem>
                <SelectItem value="images">Images only (PNG, JPG, GIF)</SelectItem>
                <SelectItem value="media">Media files (Images, Video, Audio)</SelectItem>
                <SelectItem value="archives">Archives (ZIP, RAR, 7Z)</SelectItem>
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
            <CardTitle>Organization</CardTitle>
          </div>
          <CardDescription>
            Keep your documents organized automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-organize by type</Label>
              <p className="text-sm text-muted-foreground">
                Automatically organize files into folders by type
              </p>
            </div>
            <Switch
              checked={settings.autoOrganize}
              onCheckedChange={(checked) => updateSetting('autoOrganize', checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>Auto-delete old downloads</Label>
            <Select
              value={settings.deleteAfterDays.toString()}
              onValueChange={(value) => updateSetting('deleteAfterDays', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Never</SelectItem>
                <SelectItem value="7">After 7 days</SelectItem>
                <SelectItem value="30">After 30 days</SelectItem>
                <SelectItem value="90">After 90 days</SelectItem>
                <SelectItem value="180">After 6 months</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Automatically delete downloaded files after specified period
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-red-600" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>
            Protect yourself from malicious files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Scan for viruses</Label>
              <p className="text-sm text-muted-foreground">
                Automatically scan downloaded files for malware
              </p>
            </div>
            <Switch
              checked={settings.scanForViruses}
              onCheckedChange={(checked) => updateSetting('scanForViruses', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Block executable files</Label>
              <p className="text-sm text-muted-foreground">
                Prevent downloading .exe, .bat, .sh and other executable files
              </p>
            </div>
            <Switch
              checked={settings.blockExecutables}
              onCheckedChange={(checked) => updateSetting('blockExecutables', checked)}
            />
          </div>

          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Security Note:</strong> Always be cautious when downloading files from unknown sources.
              Enable virus scanning and block executable files for maximum protection.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
