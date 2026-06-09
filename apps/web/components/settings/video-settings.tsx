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

export default function VideoSettings({ _user }: VideoSettingsProps) {
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

  const updateSetting = (key: string, value: unknown) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Video Call Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-blue-600" />
            <CardTitle>{t('video.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('video.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('video.enableVideo.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('video.enableVideo.description')}
              </p>
            </div>
            <Switch
              checked={settings.enableVideo}
              onCheckedChange={(checked) => updateSetting('enableVideo', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('video.autoStartVideo.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('video.autoStartVideo.description')}
              </p>
            </div>
            <Switch
              checked={settings.autoStartVideo}
              onCheckedChange={(checked) => updateSetting('autoStartVideo', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('video.mirrorVideo.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('video.mirrorVideo.description')}
              </p>
            </div>
            <Switch
              checked={settings.mirrorMyVideo}
              onCheckedChange={(checked) => updateSetting('mirrorMyVideo', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('video.virtualBackground.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('video.virtualBackground.description')}
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
            <CardTitle>{t('video.quality.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('video.quality.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('video.quality.label')}</Label>
            <Select
              value={settings.videoQuality}
              onValueChange={(value) => updateSetting('videoQuality', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('video.quality.auto')}</SelectItem>
                <SelectItem value="low">{t('video.quality.low')}</SelectItem>
                <SelectItem value="medium">{t('video.quality.medium')}</SelectItem>
                <SelectItem value="high">{t('video.quality.high')}</SelectItem>
                <SelectItem value="hd">{t('video.quality.hd')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('video.frameRate.label')}</Label>
            <Select
              value={settings.frameRate}
              onValueChange={(value) => updateSetting('frameRate', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">{t('video.frameRate.fps15')}</SelectItem>
                <SelectItem value="24">{t('video.frameRate.fps24')}</SelectItem>
                <SelectItem value="30">{t('video.frameRate.fps30')}</SelectItem>
                <SelectItem value="60">{t('video.frameRate.fps60')}</SelectItem>
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
            <CardTitle>{t('video.audioProcessing.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('video.audioProcessing.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('video.audioProcessing.noiseSupression.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('video.audioProcessing.noiseSupression.description')}
              </p>
            </div>
            <Switch
              checked={settings.noiseSupression}
              onCheckedChange={(checked) => updateSetting('noiseSupression', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('video.audioProcessing.echoCancellation.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('video.audioProcessing.echoCancellation.description')}
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
            <CardTitle>{t('video.screenSharing.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('video.screenSharing.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('video.screenSharing.qualityLabel')}</Label>
            <Select
              value={settings.screenShareQuality}
              onValueChange={(value) => updateSetting('screenShareQuality', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t('video.screenSharing.qualityLow')}</SelectItem>
                <SelectItem value="medium">{t('video.screenSharing.qualityMedium')}</SelectItem>
                <SelectItem value="high">{t('video.screenSharing.qualityHigh')}</SelectItem>
                <SelectItem value="ultra">{t('video.screenSharing.qualityUltra')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('video.screenSharing.systemAudio.label')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('video.screenSharing.systemAudio.description')}
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
            <CardTitle>{t('video.devices.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('video.devices.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('video.devices.camera')}</Label>
            <Select
              value={settings.preferredCamera}
              onValueChange={(value) => updateSetting('preferredCamera', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t('video.devices.cameraDefault')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('video.devices.microphone')}</Label>
            <Select
              value={settings.preferredMicrophone}
              onValueChange={(value) => updateSetting('preferredMicrophone', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t('video.devices.microphoneDefault')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('video.devices.speaker')}</Label>
            <Select
              value={settings.preferredSpeaker}
              onValueChange={(value) => updateSetting('preferredSpeaker', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t('video.devices.speakerDefault')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
