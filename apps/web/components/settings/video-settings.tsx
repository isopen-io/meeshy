'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types';
import { Video, Camera, Monitor, Wifi, Settings } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

interface VideoSettingsProps {
  user?: User | null;
  onUserUpdate?: (updatedUser: Partial<User>) => void;
}

export default function VideoSettings({ user, onUserUpdate }: VideoSettingsProps) {
  const { t } = useI18n('settings');
  const [settings, setSettings] = useState({
    enableVideo: true,
    autoStartVideo: false,
    mirrorMyVideo: true,
    enableVirtualBackground: false,
    videoQuality: 'auto',
    frameRate: '30',
    noiseSupression: true,
    echoCancellation: true,
    preferredCamera: 'default',
    preferredMicrophone: 'default',
    preferredSpeaker: 'default',
    screenShareQuality: 'high',
    shareSystemAudio: true
  });

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Video Call Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-blue-600" />
            <CardTitle>Video Call Settings</CardTitle>
          </div>
          <CardDescription>
            Configure your video call preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable video calls</Label>
              <p className="text-sm text-muted-foreground">
                Allow video calls in conversations
              </p>
            </div>
            <Switch
              checked={settings.enableVideo}
              onCheckedChange={(checked) => updateSetting('enableVideo', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-start video</Label>
              <p className="text-sm text-muted-foreground">
                Automatically turn on camera when joining calls
              </p>
            </div>
            <Switch
              checked={settings.autoStartVideo}
              onCheckedChange={(checked) => updateSetting('autoStartVideo', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Mirror my video</Label>
              <p className="text-sm text-muted-foreground">
                Flip your video horizontally
              </p>
            </div>
            <Switch
              checked={settings.mirrorMyVideo}
              onCheckedChange={(checked) => updateSetting('mirrorMyVideo', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Virtual background</Label>
              <p className="text-sm text-muted-foreground">
                Enable virtual background effects
              </p>
            </div>
            <Switch
              checked={settings.enableVirtualBackground}
              onCheckedChange={(checked) => updateSetting('enableVirtualBackground', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Video Quality */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-green-600" />
            <CardTitle>Video Quality</CardTitle>
          </div>
          <CardDescription>
            Adjust video quality and bandwidth usage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Video quality</Label>
            <Select
              value={settings.videoQuality}
              onValueChange={(value) => updateSetting('videoQuality', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (Recommended)</SelectItem>
                <SelectItem value="low">Low (240p) - Save bandwidth</SelectItem>
                <SelectItem value="medium">Medium (480p)</SelectItem>
                <SelectItem value="high">High (720p)</SelectItem>
                <SelectItem value="hd">HD (1080p) - High bandwidth</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Frame rate</Label>
            <Select
              value={settings.frameRate}
              onValueChange={(value) => updateSetting('frameRate', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 FPS - Save bandwidth</SelectItem>
                <SelectItem value="24">24 FPS</SelectItem>
                <SelectItem value="30">30 FPS (Recommended)</SelectItem>
                <SelectItem value="60">60 FPS - Smooth motion</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audio Processing */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-purple-600" />
            <CardTitle>Audio Processing</CardTitle>
          </div>
          <CardDescription>
            Configure audio enhancement features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Noise suppression</Label>
              <p className="text-sm text-muted-foreground">
                Reduce background noise during calls
              </p>
            </div>
            <Switch
              checked={settings.noiseSupression}
              onCheckedChange={(checked) => updateSetting('noiseSupression', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Echo cancellation</Label>
              <p className="text-sm text-muted-foreground">
                Prevent audio feedback and echo
              </p>
            </div>
            <Switch
              checked={settings.echoCancellation}
              onCheckedChange={(checked) => updateSetting('echoCancellation', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Screen Sharing */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-orange-600" />
            <CardTitle>Screen Sharing</CardTitle>
          </div>
          <CardDescription>
            Configure screen sharing preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Screen share quality</Label>
            <Select
              value={settings.screenShareQuality}
              onValueChange={(value) => updateSetting('screenShareQuality', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low - Better performance</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High (Recommended)</SelectItem>
                <SelectItem value="ultra">Ultra - Best quality</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Share system audio</Label>
              <p className="text-sm text-muted-foreground">
                Include system audio when sharing screen
              </p>
            </div>
            <Switch
              checked={settings.shareSystemAudio}
              onCheckedChange={(checked) => updateSetting('shareSystemAudio', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Device Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-red-600" />
            <CardTitle>Device Selection</CardTitle>
          </div>
          <CardDescription>
            Choose your preferred camera and audio devices
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Camera</Label>
            <Select
              value={settings.preferredCamera}
              onValueChange={(value) => updateSetting('preferredCamera', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Camera</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Microphone</Label>
            <Select
              value={settings.preferredMicrophone}
              onValueChange={(value) => updateSetting('preferredMicrophone', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Microphone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Speaker</Label>
            <Select
              value={settings.preferredSpeaker}
              onValueChange={(value) => updateSetting('preferredSpeaker', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Speaker</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
