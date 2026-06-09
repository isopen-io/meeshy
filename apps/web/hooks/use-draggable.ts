'use client';

import React, { useCallback, useEffect, useState } from 'react';

export interface UseDraggableOptions {
  initial: { x: number; y: number };
  /** Tile size used to constrain the position within the viewport. */
  tileWidth?: number;
  tileHeight?: number;
}

export interface DraggableState {
  position: { x: number; y: number };
  isDragging: boolean;
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
}

function pointFromEvent(e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) {
  if ('touches' in e) {
    const touch = e.touches[0];
    return { x: touch.clientX, y: touch.clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

/**
 * Pointer/touch drag for a free-floating tile (e.g. the local self-view),
 * constrained to the viewport. Extracted from the call UI so the dragging
 * mechanics are reusable and testable in isolation.
 */
export function useDraggable({
  initial,
  tileWidth = 160,
  tileHeight = 240,
}: UseDraggableOptions): DraggableState {
  const [position, setPosition] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const onDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      setIsDragging(true);
      const { x, y } = pointFromEvent(e);
      setDragStart({ x: x - position.x, y: y - position.y });
    },
    [position.x, position.y]
  );

  const onDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const { x, y } = pointFromEvent(e);
      const maxX = window.innerWidth - tileWidth;
      const maxY = window.innerHeight - tileHeight;
      setPosition({
        x: Math.max(0, Math.min(x - dragStart.x, maxX)),
        y: Math.max(0, Math.min(y - dragStart.y, maxY)),
      });
    },
    [isDragging, dragStart.x, dragStart.y, tileWidth, tileHeight]
  );

  const onDragEnd = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onDragMove);
    window.addEventListener('touchend', onDragEnd);
    return () => {
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchmove', onDragMove);
      window.removeEventListener('touchend', onDragEnd);
    };
  }, [isDragging, onDragMove, onDragEnd]);

  return { position, isDragging, onDragStart };
}
