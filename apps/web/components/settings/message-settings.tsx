'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { User } from '@/types';
import { MessageSquare, Clock, Image, Smile, FileText } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

interface MessageSettingsProps {
  user?: User | null;
  onUserUpdate?: (updatedUser: Partial<User>) => void;
}

export default function MessageSettings({ user, onUserUpdate }: MessageSettingsProps) {
  const { t } = useI18n('settings');
  const [settings, setSettings] = useState({
    enterToSend: true,
    showTypingIndicator: true,
    showReadReceipts: true,
    autoDownloadImages: true,
    autoDownloadVideos: false,
    autoDownloadDocuments: false,
    messagePreview: true,
    emojiSize: 32,
    maxMessageLength: 5000,
    showTimestamps: true,
    groupByDate: true,
    compactMode: false
  });

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Message Behavior */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            <CardTitle>Message Behavior</CardTitle>
          </div>
          <CardDescription>
            Configure how messages are sent and displayed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enter to send</Label>
              <p className="text-sm text-muted-foreground">
                Press Enter to send message, Shift+Enter for new line
              </p>
            </div>
            <Switch
              checked={settings.enterToSend}
              onCheckedChange={(checked) => updateSetting('enterToSend', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show typing indicator</Label>
              <p className="text-sm text-muted-foreground">
                Let others know when you are typing
              </p>
            </div>
            <Switch
              checked={settings.showTypingIndicator}
              onCheckedChange={(checked) => updateSetting('showTypingIndicator', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Read receipts</Label>
              <p className="text-sm text-muted-foreground">
                Send read receipts when you view messages
              </p>
            </div>
            <Switch
              checked={settings.showReadReceipts}
              onCheckedChange={(checked) => updateSetting('showReadReceipts', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Message preview</Label>
              <p className="text-sm text-muted-foreground">
                Show message preview in notifications
              </p>
            </div>
            <Switch
              checked={settings.messagePreview}
              onCheckedChange={(checked) => updateSetting('messagePreview', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Display Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-600" />
            <CardTitle>Display Settings</CardTitle>
          </div>
          <CardDescription>
            Customize how messages are displayed in conversations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Show timestamps</Label>
              <p className="text-sm text-muted-foreground">
                Display message timestamps
              </p>
            </div>
            <Switch
              checked={settings.showTimestamps}
              onCheckedChange={(checked) => updateSetting('showTimestamps', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Group by date</Label>
              <p className="text-sm text-muted-foreground">
                Show date separators in conversations
              </p>
            </div>
            <Switch
              checked={settings.groupByDate}
              onCheckedChange={(checked) => updateSetting('groupByDate', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Compact mode</Label>
              <p className="text-sm text-muted-foreground">
                Reduce spacing between messages
              </p>
            </div>
            <Switch
              checked={settings.compactMode}
              onCheckedChange={(checked) => updateSetting('compactMode', checked)}
            />
          </div>

          <div className="space-y-3">
            <Label>Emoji size: {settings.emojiSize}px</Label>
            <Slider
              value={[settings.emojiSize]}
              onValueChange={([value]) => updateSetting('emojiSize', value)}
              min={16}
              max={64}
              step={8}
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto Download */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5 text-green-600" />
            <CardTitle>Auto Download</CardTitle>
          </div>
          <CardDescription>
            Control automatic download of media files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Images</Label>
              <p className="text-sm text-muted-foreground">
                Automatically download images
              </p>
            </div>
            <Switch
              checked={settings.autoDownloadImages}
              onCheckedChange={(checked) => updateSetting('autoDownloadImages', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Videos</Label>
              <p className="text-sm text-muted-foreground">
                Automatically download videos
              </p>
            </div>
            <Switch
              checked={settings.autoDownloadVideos}
              onCheckedChange={(checked) => updateSetting('autoDownloadVideos', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Documents</Label>
              <p className="text-sm text-muted-foreground">
                Automatically download documents
              </p>
            </div>
            <Switch
              checked={settings.autoDownloadDocuments}
              onCheckedChange={(checked) => updateSetting('autoDownloadDocuments', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Message Limits */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-600" />
            <CardTitle>Message Limits</CardTitle>
          </div>
          <CardDescription>
            Configure message length and storage limits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Maximum message length</Label>
            <Select
              value={settings.maxMessageLength.toString()}
              onValueChange={(value) => updateSetting('maxMessageLength', parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1000">1,000 characters</SelectItem>
                <SelectItem value="5000">5,000 characters</SelectItem>
                <SelectItem value="10000">10,000 characters</SelectItem>
                <SelectItem value="20000">20,000 characters</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Maximum length for a single message
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
