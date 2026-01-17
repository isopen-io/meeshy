'use client';

import React, { useRef } from 'react';
import { Play, AlertTriangle } from 'lucide-react';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import { useVideoPlayback } from '@/hooks/use-video-playback';
import { useFullscreen } from '@/hooks/use-fullscreen';
import { useVolume } from '@/hooks/use-volume';
import { VideoControls } from './VideoControls';
import { CompactVideoPlayer } from './CompactVideoPlayer';

interface VideoPlayerProps {
  attachment: UploadedAttachmentResponse;
  className?: string;
  onOpenLightbox?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  attachment,
  className = '',
  onOpenLightbox
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const attachmentDuration = attachment.duration ? attachment.duration / 1000 : undefined;

  const {
    videoRef,
    isPlaying,
    currentTime,
    duration,
    isLoading,
    hasError,
    errorMessage,
    togglePlay,
    handleSeek,
    handleLoadedMetadata,
    handleEnded,
    handleVideoError
  } = useVideoPlayback({
    fileUrl: attachment.fileUrl,
    duration: attachmentDuration,
    mimeType: attachment.mimeType,
    attachmentId: attachment.id
  });

  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);
  const { volume, isMuted, toggleMute, handleVolumeChange } = useVolume(videoRef);

  const handleFullscreenClick = onOpenLightbox || toggleFullscreen;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-2 p-3 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border ${
        hasError
          ? 'border-red-300 dark:border-red-700'
          : 'border-purple-200 dark:border-gray-700'
      } shadow-md hover:shadow-lg transition-all duration-200 w-full sm:max-w-2xl min-w-0 overflow-hidden ${className}`}
    >
      <div
        className="relative w-full max-w-[90vw] sm:max-w-2xl min-w-0 bg-black rounded-lg overflow-hidden"
        style={{
          aspectRatio: attachment.width && attachment.height
            ? `${attachment.width}/${attachment.height}`
            : '16/9'
        }}
      >
        <video
          ref={videoRef}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onError={handleVideoError}
          preload="metadata"
          className="w-full h-full object-contain cursor-pointer"
          onClick={togglePlay}
          playsInline
        >
          Votre navigateur ne supporte pas la lecture vidéo.
        </video>

        {(isLoading || hasError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            {isLoading ? (
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
            ) : hasError ? (
              <div className="flex flex-col items-center gap-2 text-white">
                <AlertTriangle className="w-12 h-12" />
                <span className="text-sm">{errorMessage}</span>
              </div>
            ) : null}
          </div>
        )}

        {!isPlaying && !isLoading && !hasError && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-all duration-200 group"
          >
            <div className="w-16 h-16 rounded-full bg-purple-600 hover:bg-purple-700 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 text-white ml-1 fill-current" />
            </div>
          </button>
        )}
      </div>

      <VideoControls
        isPlaying={isPlaying}
        isLoading={isLoading}
        hasError={hasError}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        isMuted={isMuted}
        isFullscreen={isFullscreen}
        downloadUrl={attachment.fileUrl}
        downloadName={attachment.originalName}
        onTogglePlay={togglePlay}
        onSeek={handleSeek}
        onVolumeChange={handleVolumeChange}
        onToggleMute={toggleMute}
        onToggleFullscreen={handleFullscreenClick}
      />
    </div>
  );
};

export { CompactVideoPlayer };
