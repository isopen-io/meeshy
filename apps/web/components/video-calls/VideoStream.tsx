/**
 * VIDEO STREAM COMPONENT
 * Wrapper for video element with status indicators
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoStreamProps {
  stream: MediaStream | null;
  muted?: boolean;
  isLocal?: boolean;
  className?: string;
  participantName?: string;
  isAudioEnabled?: boolean;
  isVideoEnabled?: boolean;
  isDisconnected?: boolean;
  onRemove?: () => void;
}

export function VideoStream({
  stream,
  muted = false,
  isLocal = false,
  className,
  participantName,
  isAudioEnabled = true,
  isVideoEnabled = true,
  isDisconnected = false,
  onRemove,
}: VideoStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showDisconnected, setShowDisconnected] = React.useState(false);
  const removeTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Handle disconnection: show "Disconnected" for 2 seconds, then trigger removal
  useEffect(() => {
    if (isDisconnected) {
      setShowDisconnected(true);

      // After 2 seconds, trigger removal callback
      removeTimeoutRef.current = setTimeout(() => {
        if (onRemove) {
          onRemove();
        }
      }, 2000);
    }

    return () => {
      if (removeTimeoutRef.current) {
        clearTimeout(removeTimeoutRef.current);
      }
    };
  }, [isDisconnected, onRemove]);

  return (
    <div className={cn(
      "relative w-full h-full bg-gray-900",
      showDisconnected && "opacity-75 transition-opacity duration-500"
    )}>
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn(
          className,
          (!isVideoEnabled || showDisconnected) && 'hidden'
        )}
        aria-label={`${participantName || 'Participant'}'s video`}
      />

      {/* No Video Placeholder */}
      {!isVideoEnabled && !showDisconnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl text-white font-bold">
                {participantName?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
            <VideoOff className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-300">{participantName || 'Unknown'}</p>
          </div>
        </div>
      )}

      {/* Disconnected Overlay */}
      {showDisconnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 animate-pulse">
          <div className="text-center">
            <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <p className="text-lg text-white font-semibold">Disconnected</p>
            <p className="text-sm text-gray-400 mt-1">{participantName || 'Participant'} left the call</p>
          </div>
        </div>
      )}

      {/* Participant Info & Status */}
      {participantName && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded">
            <span className="text-white text-xs font-medium">{participantName}</span>
          </div>

          {/* Audio/Video Status Icons */}
          <div className="flex gap-1">
            {!isAudioEnabled && (
              <div className="bg-red-600 p-1 rounded-full" title="Microphone muted">
                <MicOff className="w-3 h-3 text-white" />
              </div>
            )}
            {!isVideoEnabled && (
              <div className="bg-red-600 p-1 rounded-full" title="Video off">
                <VideoOff className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
