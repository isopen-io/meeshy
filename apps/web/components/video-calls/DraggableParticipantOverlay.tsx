/**
 * DRAGGABLE PARTICIPANT OVERLAY
 * A draggable video stream overlay for additional participants
 * Supports double-click to make fullscreen
 */

'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { VideoStream } from './VideoStream';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DraggableParticipantOverlayProps {
  participantId: string;
  stream: MediaStream;
  participantName?: string;
  isAudioEnabled?: boolean;
  isVideoEnabled?: boolean;
  isDisconnected?: boolean;
  initialPosition?: { x: number; y: number };
  onDoubleClick?: () => void;
  onRemove?: () => void;
}

export function DraggableParticipantOverlay({
  participantId,
  stream,
  participantName,
  isAudioEnabled = true,
  isVideoEnabled = true,
  isDisconnected = false,
  initialPosition = { x: 20, y: 20 },
  onDoubleClick,
  onRemove,
}: DraggableParticipantOverlayProps) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - position.x, y: clientY - position.y });
  };

  const handleDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const newX = clientX - dragStart.x;
      const newY = clientY - dragStart.y;

      // Constrain to viewport (considering overlay size)
      const maxX = window.innerWidth - 200;
      const maxY = window.innerHeight - 280;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    },
    [isDragging, dragStart]
  );

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, handleDragMove]);

  return (
    <div
      className={cn(
        'absolute rounded-xl overflow-hidden shadow-2xl',
        'w-48 h-64 md:w-56 md:h-72',
        'transition-shadow hover:shadow-3xl border-2 border-white/20',
        isDragging ? 'cursor-grabbing scale-105' : 'cursor-move',
        'group'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 30,
      }}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <VideoStream
        stream={stream}
        muted={false}
        isLocal={false}
        className="w-full h-full object-cover"
        participantName={participantName}
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isDisconnected={isDisconnected}
        onRemove={onRemove}
      />

      {/* Fullscreen button (on hover) */}
      {isHovered && !isDisconnected && (
        <div
          className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm p-2 rounded-full cursor-pointer hover:bg-black/80 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDoubleClick?.();
          }}
          title="Make fullscreen"
        >
          <Maximize2 className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Drag indicator */}
      <div className="absolute top-2 left-2 bg-black/40 backdrop-blur-sm px-2 py-1 rounded text-xs text-white/60 opacity-0 group-hover:opacity-100 transition-opacity">
        Drag to move
      </div>
    </div>
  );
}
