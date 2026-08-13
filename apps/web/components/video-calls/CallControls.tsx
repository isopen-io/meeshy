/**
 * CALL CONTROLS COMPONENT
 * Mobile-optimized controls with camera switch and speaker toggle
 */

'use client';

import React, { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, SwitchCamera, Volume2, VolumeX, Sparkles, BarChart3, Captions } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface CallControlsProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  /**
   * Whether remote audio is currently audible. Controlled by the parent —
   * it owns the `<video>`/`<audio>` elements playing remote streams and is
   * the only thing that can actually mute/unmute them. This component only
   * renders the button and reports intent via `onToggleSpeaker`.
   */
  speakerEnabled: boolean;
  /** Outbound video auto-suspended by the adaptive controller (weak link). */
  videoSuspended?: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onSwitchCamera?: () => void;
  onToggleAudioEffects?: () => void;
  onToggleStats?: () => void;
  onToggleTranscript?: () => void;
  onHangUp: () => void;
  audioEffectsActive?: boolean;
  showStats?: boolean;
  showTranscript?: boolean;
}

export function CallControls({
  audioEnabled,
  videoEnabled,
  speakerEnabled,
  videoSuspended = false,
  onToggleAudio,
  onToggleVideo,
  onToggleSpeaker,
  onSwitchCamera,
  onToggleAudioEffects,
  onToggleStats,
  onToggleTranscript,
  onHangUp,
  audioEffectsActive = false,
  showStats = false,
  showTranscript = false,
}: CallControlsProps) {
  const { t } = useI18n('calls');
  const [supportsCameraSwitch, setSupportsCameraSwitch] = useState(false);
  const videoAutoPaused = videoEnabled && videoSuspended;

  React.useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setSupportsCameraSwitch(videoDevices.length > 1);
      });
    }
  }, []);

  return (
    <div
      className={cn(
        'absolute bottom-6 left-1/2 transform -translate-x-1/2',
        'flex gap-3 md:gap-4',
        'bg-black/70 backdrop-blur-md',
        'px-4 md:px-6 py-3 md:py-4',
        'rounded-full shadow-2xl',
        'border border-white/10'
      )}
      role="toolbar"
      aria-label={t('controls.controls')}
    >
      {/* Mute/Unmute Audio */}
      <Button
        size="icon"
        variant={audioEnabled ? 'default' : 'destructive'}
        onClick={onToggleAudio}
        className={cn(
          'w-12 h-12 md:w-14 md:h-14 rounded-full transition-colors touch-manipulation',
          audioEnabled
            ? 'bg-gray-700 hover:bg-gray-600 text-white'
            : 'bg-red-600 hover:bg-red-700 text-white'
        )}
        aria-label={audioEnabled ? t('controls.mute') : t('controls.unmute')}
        title={audioEnabled ? t('controls.mute') : t('controls.unmute')}
      >
        {audioEnabled ? (
          <Mic className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <MicOff className="w-5 h-5 md:w-6 md:h-6" />
        )}
      </Button>

      {/* Toggle Video — amber "auto-paused" state when the controller suspended
          outbound video while the user still wants it (weak link). */}
      <Button
        size="icon"
        data-testid="toggle-video"
        variant={videoEnabled ? 'default' : 'destructive'}
        onClick={onToggleVideo}
        className={cn(
          'relative w-12 h-12 md:w-14 md:h-14 rounded-full transition-colors touch-manipulation',
          videoAutoPaused
            ? 'bg-amber-600 hover:bg-amber-700 text-white'
            : videoEnabled
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
        )}
        aria-label={
          videoAutoPaused
            ? t('controls.videoPausedWeak')
            : videoEnabled
              ? t('controls.videoOff')
              : t('controls.videoOn')
        }
        title={
          videoAutoPaused
            ? t('controls.videoPausedWeak')
            : videoEnabled
              ? t('controls.videoOff')
              : t('controls.videoOn')
        }
      >
        {videoEnabled && !videoAutoPaused ? (
          <Video className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <VideoOff className="w-5 h-5 md:w-6 md:h-6" />
        )}
        {videoAutoPaused && (
          <span
            data-testid="video-autopaused-dot"
            className="absolute -right-0.5 -top-0.5 w-3 h-3 rounded-full bg-amber-300 ring-2 ring-black/60 animate-pulse"
            aria-hidden="true"
          />
        )}
      </Button>

      {/* Switch Camera (Mobile Only) */}
      {supportsCameraSwitch && onSwitchCamera && (
        <Button
          size="icon"
          variant="default"
          onClick={onSwitchCamera}
          className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors touch-manipulation"
          aria-label={t('controls.switchCamera')}
          title={t('controls.switchCamera')}
        >
          <SwitchCamera className="w-5 h-5 md:w-6 md:h-6" />
        </Button>
      )}

      {/* Speaker Toggle */}
      <Button
        size="icon"
        variant="default"
        onClick={onToggleSpeaker}
        className={cn(
          'w-12 h-12 md:w-14 md:h-14 rounded-full transition-colors touch-manipulation',
          speakerEnabled
            ? 'bg-gray-700 hover:bg-gray-600 text-white'
            : 'bg-gray-800 hover:bg-gray-700 text-white'
        )}
        aria-label={speakerEnabled ? t('controls.speakerOff') : t('controls.speakerOn')}
        title={speakerEnabled ? t('controls.speakerOnLabel') : t('controls.speakerOffLabel')}
      >
        {speakerEnabled ? (
          <Volume2 className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <VolumeX className="w-5 h-5 md:w-6 md:h-6" />
        )}
      </Button>

      {/* Audio Effects Toggle */}
      {onToggleAudioEffects && (
        <Button
          size="icon"
          variant="default"
          onClick={onToggleAudioEffects}
          className={cn(
            'w-12 h-12 md:w-14 md:h-14 rounded-full transition-colors touch-manipulation',
            audioEffectsActive
              ? 'bg-purple-600 hover:bg-purple-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          )}
          aria-label={t('controls.audioEffects')}
          title={t('controls.audioEffectsTitle')}
        >
          <Sparkles className="w-5 h-5 md:w-6 md:h-6" />
        </Button>
      )}

      {/* Transcript Journal Toggle */}
      {onToggleTranscript && (
        <Button
          size="icon"
          variant="default"
          data-testid="toggle-transcript"
          onClick={onToggleTranscript}
          className={cn(
            'w-12 h-12 md:w-14 md:h-14 rounded-full transition-colors touch-manipulation',
            showTranscript
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          )}
          aria-label={showTranscript ? t('transcript.hide') : t('transcript.show')}
          title={showTranscript ? t('transcript.hide') : t('transcript.show')}
        >
          <Captions className="w-5 h-5 md:w-6 md:h-6" />
        </Button>
      )}

      {/* Stats Toggle */}
      {onToggleStats && (
        <Button
          size="icon"
          variant="default"
          onClick={onToggleStats}
          className={cn(
            'w-12 h-12 md:w-14 md:h-14 rounded-full transition-colors touch-manipulation',
            showStats
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          )}
          aria-label={t('controls.connectionStats')}
          title={t('controls.connectionStatsTitle')}
        >
          <BarChart3 className="w-5 h-5 md:w-6 md:h-6" />
        </Button>
      )}

      {/* Hang Up */}
      <Button
        size="icon"
        variant="destructive"
        onClick={onHangUp}
        className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors touch-manipulation"
        aria-label={t('controls.endCall')}
        title={t('controls.endCall')}
      >
        <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
      </Button>
    </div>
  );
}
