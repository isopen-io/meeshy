'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import MediaManager from '@/utils/media-manager';

interface CompactVideoPlayerProps {
  attachment: UploadedAttachmentResponse;
  className?: string;
}

class VideoManager {
  private static instance: VideoManager;
  private mediaManager = MediaManager.getInstance();

  static getInstance(): VideoManager {
    if (!VideoManager.instance) {
      VideoManager.instance = new VideoManager();
    }
    return VideoManager.instance;
  }

  play(video: HTMLVideoElement) {
    this.mediaManager.play(video, 'video');
  }

  stop(video: HTMLVideoElement) {
    this.mediaManager.stop(video);
  }
}

export const CompactVideoPlayer: React.FC<CompactVideoPlayerProps> = ({
  attachment,
  className = ''
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const attachmentDuration = attachment.duration ? attachment.duration / 1000 : undefined;
  const attachmentFileUrl = attachment.fileUrl;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !attachmentFileUrl) return;

    const isValidUrl =
      attachmentFileUrl.startsWith('http://') ||
      attachmentFileUrl.startsWith('https://');

    if (isValidUrl) {
      video.src = attachmentFileUrl;
      video.load();
    }
  }, [attachmentFileUrl]);

  useEffect(() => {
    if (attachmentDuration && attachmentDuration > 0) {
      setDuration(attachmentDuration);
    }
  }, [attachmentDuration]);

  const togglePlay = async () => {
    if (!videoRef.current) return;

    try {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
        VideoManager.getInstance().stop(videoRef.current);
      } else {
        VideoManager.getInstance().play(videoRef.current);
        await videoRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('CompactVideoPlayer: Play error', error);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePause = () => setIsPlaying(false);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('pause', handlePause);
      video.pause();
      VideoManager.getInstance().stop(video);
    };
  }, []);

  const formatDuration = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`inline-flex items-center gap-2 rounded-lg overflow-hidden bg-purple-100 dark:bg-purple-900/30 ${className}`}>
      <div className="relative w-24 h-16 bg-black flex-shrink-0">
        <video
          ref={videoRef}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          preload="metadata"
          className="w-full h-full object-cover"
          playsInline
        />

        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-all duration-200"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 text-white fill-current" />
          ) : (
            <Play className="w-6 h-6 text-white ml-0.5 fill-current" />
          )}
        </button>
      </div>

      <span className="text-sm font-mono text-purple-700 dark:text-purple-300 pr-2">
        {formatDuration(duration)}
      </span>
    </div>
  );
};
