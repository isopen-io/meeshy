'use client';

import { useState, useRef, ReactNode } from 'react';
import { theme } from './theme';

export interface SwipeAction {
  id: string;
  icon: ReactNode;
  label: string;
  color: string;
  bgColor: string;
  onClick: () => void;
}

export interface SwipeableRowProps {
  children: ReactNode;
  leftActions: SwipeAction[];
  rightActions: SwipeAction[];
  onLongPress?: () => void;
  className?: string;
}

export function SwipeableRow({
  children,
  leftActions,
  rightActions,
  onLongPress,
  className = '',
}: SwipeableRowProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const leftWidth = leftActions.length * 70;
  const rightWidth = rightActions.length * 70;

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startOffsetRef.current = offsetX;
    setIsDragging(true);

    if (onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        onLongPress();
        setIsDragging(false);
      }, 500);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    startXRef.current = e.clientX;
    startOffsetRef.current = offsetX;
    setIsDragging(true);

    if (onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        onLongPress();
        setIsDragging(false);
      }, 500);
    }
  };

  const handleMove = (clientX: number) => {
    if (!isDragging) return;

    const diff = clientX - startXRef.current;
    if (Math.abs(diff) > 10 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    let newOffset = startOffsetRef.current + diff;

    // Limite du swipe
    newOffset = Math.max(-rightWidth, Math.min(leftWidth, newOffset));

    setOffsetX(newOffset);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX);
  };

  const handleEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    setIsDragging(false);

    // Snap to position
    if (offsetX > leftWidth / 2) {
      setOffsetX(leftWidth);
    } else if (offsetX < -rightWidth / 2) {
      setOffsetX(-rightWidth);
    } else {
      setOffsetX(0);
    }
  };

  const handleActionClick = (action: SwipeAction) => {
    action.onClick();
    setOffsetX(0);
  };

  const reset = () => setOffsetX(0);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      onMouseLeave={() => isDragging && handleEnd()}
    >
      {/* Left actions (revealed when swiping right) */}
      <div
        className="absolute left-0 top-0 bottom-0 flex"
        style={{ width: leftWidth }}
      >
        {leftActions.map((action, index) => (
          <button
            key={action.id}
            onClick={() => handleActionClick(action)}
            className="flex flex-col items-center justify-center gap-1 transition-transform"
            style={{
              width: 70,
              background: action.bgColor,
              color: action.color,
              transform: `translateX(${Math.min(0, offsetX - leftWidth)}px)`,
            }}
          >
            {action.icon}
            <span className="text-xs font-medium">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Right actions (revealed when swiping left) */}
      <div
        className="absolute right-0 top-0 bottom-0 flex"
        style={{ width: rightWidth }}
      >
        {rightActions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleActionClick(action)}
            className="flex flex-col items-center justify-center gap-1 transition-transform"
            style={{
              width: 70,
              background: action.bgColor,
              color: action.color,
              transform: `translateX(${Math.max(0, offsetX + rightWidth)}px)`,
            }}
          >
            {action.icon}
            <span className="text-xs font-medium">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div
        className="relative bg-white"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 200ms ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={isDragging ? handleMouseMove : undefined}
        onMouseUp={handleEnd}
      >
        {children}
      </div>

      {/* Tap outside to close */}
      {offsetX !== 0 && (
        <div
          className="absolute inset-0 z-10"
          onClick={reset}
          style={{ background: 'transparent' }}
        />
      )}
    </div>
  );
}

// Icônes prédéfinies pour les actions
export const SwipeIcons = {
  archive: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
  delete: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  read: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  mute: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  ),
  pin: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  ),
  important: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  tag: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  call: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ),
};

// Couleurs prédéfinies
export const SwipeColors = {
  archive: { color: 'white', bgColor: theme.colors.deepTeal },
  delete: { color: 'white', bgColor: '#EF4444' },
  read: { color: 'white', bgColor: theme.colors.jadeGreen },
  mute: { color: 'white', bgColor: '#6B7280' },
  pin: { color: 'white', bgColor: theme.colors.terracotta },
  important: { color: 'white', bgColor: theme.colors.goldAccent },
  tag: { color: 'white', bgColor: theme.colors.royalIndigo },
  call: { color: 'white', bgColor: theme.colors.jadeGreen },
};
