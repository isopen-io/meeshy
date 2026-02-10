/**
 * CALL CONTROLS COMPONENT
 * Mobile-optimized controls with camera switch and speaker toggle
 */

'use client';

import React, { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, SwitchCamera, Volume2, VolumeX, Sparkles, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';

interface CallControlsProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera?: () => void;
  onToggleAudioEffects?: () => void;
  onToggleStats?: () => void;
  onHangUp: () => void;
  audioEffectsActive?: boolean;
  showStats?: boolean;
}

export function CallControls({
  audioEnabled,
  videoEnabled,
  onToggleAudio,
  onToggleVideo,
  onSwitchCamera,
  onToggleAudioEffects,
  onToggleStats,
  onHangUp,
  audioEffectsActive = false,
  showStats = false,
}: CallControlsProps) {
  const [speakerEnabled, setSpeakerEnabled] = useState(true);

  // Check if device supports camera switching (mobile)
  const [supportsCameraSwitch, setSupportsCameraSwitch] = useState(false);

  React.useEffect(() => {
    // Check for mobile device with multiple cameras
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setSupportsCameraSwitch(videoDevices.length > 1);
      });
    }
  }, []);

  const handleSpeakerToggle = async () => {
    try {
      // Toggle speaker/earpiece mode (mainly for mobile)
      const newEnabled = !speakerEnabled;
      setSpeakerEnabled(newEnabled);

      // Note: Actual speaker routing is browser-dependent
      // On mobile browsers, audio routing is typically automatic
      logger.debug('[CallControls]', 'Speaker toggled', { enabled: newEnabled });
    } catch (error) {
      logger.error('[CallControls]', 'Failed to toggle speaker', { error });
    }
  };

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
      aria-label="Call controls"
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
        aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        title={audioEnabled ? 'Mute' : 'Unmute'}
      >
        {audioEnabled ? (
          <Mic className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <MicOff className="w-5 h-5 md:w-6 md:h-6" />
        )}
      </Button>

      {/* Toggle Video */}
      <Button
        size="icon"
        variant={videoEnabled ? 'default' : 'destructive'}
        onClick={onToggleVideo}
        className={cn(
          'w-12 h-12 md:w-14 md:h-14 rounded-full transition-colors touch-manipulation',
          videoEnabled
            ? 'bg-gray-700 hover:bg-gray-600 text-white'
            : 'bg-red-600 hover:bg-red-700 text-white'
        )}
        aria-label={videoEnabled ? 'Turn off video' : 'Turn on video'}
        title={videoEnabled ? 'Turn off video' : 'Turn on video'}
      >
        {videoEnabled ? (
          <Video className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <VideoOff className="w-5 h-5 md:w-6 md:h-6" />
        )}
      </Button>

      {/* Switch Camera (Mobile Only) */}
      {supportsCameraSwitch && onSwitchCamera && (
        <Button
          size="icon"
          variant="default"
          onClick={onSwitchCamera}
          className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors touch-manipulation"
          aria-label="Switch camera"
          title="Switch camera"
        >
          <SwitchCamera className="w-5 h-5 md:w-6 md:h-6" />
        </Button>
      )}

      {/* Speaker Toggle */}
      <Button
        size="icon"
        variant="default"
        onClick={handleSpeakerToggle}
        className={cn(
          'w-12 h-12 md:w-14 md:h-14 rounded-full transition-colors touch-manipulation',
          speakerEnabled
            ? 'bg-gray-700 hover:bg-gray-600 text-white'
            : 'bg-gray-800 hover:bg-gray-700 text-white'
        )}
        aria-label={speakerEnabled ? 'Turn off speaker' : 'Turn on speaker'}
        title={speakerEnabled ? 'Speaker on' : 'Speaker off'}
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
          aria-label="Toggle audio effects"
          title="Audio Effects"
        >
          <Sparkles className="w-5 h-5 md:w-6 md:h-6" />
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
          aria-label="Toggle connection stats"
          title="Connection Stats"
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
        aria-label="End call"
        title="End call"
      >
        <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
      </Button>
    </div>
  );
}
