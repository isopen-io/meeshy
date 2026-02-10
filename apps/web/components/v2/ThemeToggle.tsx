'use client';

import { HTMLAttributes, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTheme, ThemeMode } from './ThemeProvider';

export interface ThemeToggleProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Show mode selector dropdown instead of simple toggle */
  showModeSelector?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

// Sun icon for light mode
function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="5" />
      <path strokeLinecap="round" d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

// Moon icon for dark mode
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

// Computer icon for system mode
function SystemIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path strokeLinecap="round" d="M8 21h8m-4-4v4" />
    </svg>
  );
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

const iconSizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

/**
 * Theme toggle button with optional mode selector dropdown
 *
 * Simple toggle: Click to switch between light and dark
 * With selector: Shows dropdown to choose light/dark/system
 */
export function ThemeToggle({
  showModeSelector = false,
  size = 'md',
  className,
  ...props
}: ThemeToggleProps) {
  const { isDark, themeMode, toggleTheme, setThemeMode } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleClick = () => {
    if (showModeSelector) {
      setShowDropdown(!showDropdown);
    } else {
      toggleTheme();
    }
  };

  const handleModeSelect = (mode: ThemeMode) => {
    setThemeMode(mode);
    setShowDropdown(false);
  };

  const modes: { mode: ThemeMode; label: string; icon: typeof SunIcon }[] = [
    { mode: 'light', label: 'Clair', icon: SunIcon },
    { mode: 'dark', label: 'Sombre', icon: MoonIcon },
    { mode: 'system', label: 'Systeme', icon: SystemIcon },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'relative rounded-full flex items-center justify-center',
          'transition-colors duration-300 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gp-terracotta)] focus-visible:ring-offset-2',
          'bg-[var(--gp-surface)] border border-[var(--gp-border)]',
          'hover:bg-[var(--gp-hover)] hover:border-[var(--gp-terracotta)]',
          'text-[var(--gp-text-primary)]',
          sizeClasses[size],
          className
        )}
        aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
        {...props}
      >
        {/* Animated icons */}
        <div className="relative">
          <SunIcon
            className={cn(
              iconSizes[size],
              'absolute inset-0 transition-[opacity,transform] duration-300',
              isDark ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'
            )}
          />
          <MoonIcon
            className={cn(
              iconSizes[size],
              'transition-[opacity,transform] duration-300',
              isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'
            )}
          />
        </div>
      </button>

      {/* Mode selector dropdown */}
      {showModeSelector && showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div
            className={cn(
              'absolute right-0 top-full mt-2 z-50',
              'min-w-[140px] rounded-xl overflow-hidden',
              'bg-[var(--gp-surface-elevated)] border border-[var(--gp-border)]',
              'shadow-lg'
            )}
          >
            {modes.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => handleModeSelect(mode)}
                className={cn(
                  'w-full px-3 py-2.5 flex items-center gap-3',
                  'text-sm font-medium transition-colors',
                  'hover:bg-[var(--gp-hover)]',
                  themeMode === mode
                    ? 'text-[var(--gp-terracotta)] bg-[var(--gp-terracotta)]/10'
                    : 'text-[var(--gp-text-primary)]'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {themeMode === mode && (
                  <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
