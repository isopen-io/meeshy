'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface ResizerProps {
  defaultWidth?: number; // Pourcentage (0-100)
  minWidth?: number; // Pourcentage minimum
  maxWidth?: number; // Pourcentage maximum
  storageKey?: string; // Clé localStorage pour persister
  onWidthChange?: (width: number) => void;
  className?: string;
}

export function Resizer({
  defaultWidth = 30,
  minWidth = 10,
  maxWidth = 50,
  storageKey = 'meeshy-sidebar-width',
  onWidthChange,
  className = '',
}: ResizerProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Charger la largeur depuis localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsedWidth = parseFloat(saved);
        if (!isNaN(parsedWidth) && parsedWidth >= minWidth && parsedWidth <= maxWidth) {
          setWidth(parsedWidth);
        }
      }
    }
  }, [storageKey, minWidth, maxWidth]);

  // Sauvegarder dans localStorage
  const saveWidth = useCallback(
    (newWidth: number) => {
      if (typeof window !== 'undefined' && storageKey) {
        localStorage.setItem(storageKey, newWidth.toString());
      }
    },
    [storageKey]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current.parentElement;
      if (!container) return;

      const containerWidth = container.getBoundingClientRect().width;
      const deltaX = e.clientX - startXRef.current;
      const deltaPercent = (deltaX / containerWidth) * 100;
      let newWidth = startWidthRef.current + deltaPercent;

      // Appliquer les limites
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      setWidth(newWidth);
      onWidthChange?.(newWidth);
    },
    [isDragging, minWidth, maxWidth, onWidthChange]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveWidth(width);
    }
  }, [isDragging, width, saveWidth]);

  // Event listeners globaux
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Double-clic pour reset
  const handleDoubleClick = () => {
    setWidth(defaultWidth);
    saveWidth(defaultWidth);
    onWidthChange?.(defaultWidth);
  };

  return (
    <div
      ref={containerRef}
      className={`
        absolute top-0 bottom-0 w-1 cursor-ew-resize z-20
        flex items-center justify-center
        group
        ${className}
      `}
      style={{
        left: `${width}%`,
        transform: 'translateX(-50%)',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Ligne visible */}
      <div
        className={`
          h-full w-px transition-all duration-300
          ${isDragging ? 'w-1' : 'group-hover:w-1'}
        `}
        style={{
          background: isDragging
            ? 'var(--gp-terracotta)'
            : 'var(--gp-border)',
        }}
      />

      {/* Poignée au centre */}
      <div
        className={`
          absolute top-1/2 -translate-y-1/2
          w-4 h-8 rounded-full
          flex items-center justify-center
          transition-all duration-300 bg-[var(--gp-terracotta)]
          ${isDragging ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100'}
        `}
      >
        <svg
          className="w-3 h-3 text-white"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M8 5h2v14H8V5zm6 0h2v14h-2V5z" />
        </svg>
      </div>
    </div>
  );
}

// Hook pour utiliser le resizer avec état partagé
export function useResizer(
  defaultWidth = 30,
  minWidth = 10,
  maxWidth = 50,
  storageKey = 'meeshy-sidebar-width'
) {
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    if (typeof window !== 'undefined' && storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsedWidth = parseFloat(saved);
        if (!isNaN(parsedWidth) && parsedWidth >= minWidth && parsedWidth <= maxWidth) {
          setWidth(parsedWidth);
        }
      }
    }
  }, [storageKey, minWidth, maxWidth]);

  const handleWidthChange = useCallback(
    (newWidth: number) => {
      setWidth(newWidth);
      if (typeof window !== 'undefined' && storageKey) {
        localStorage.setItem(storageKey, newWidth.toString());
      }
    },
    [storageKey]
  );

  return {
    width,
    setWidth: handleWidthChange,
    sidebarStyle: { width: `${width}%` },
    mainStyle: { width: `${100 - width}%` },
  };
}
