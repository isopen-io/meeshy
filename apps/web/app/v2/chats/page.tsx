'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Button,
  Input,
  LanguageOrb,
  MessageBubble,
  MessageComposer,
  AudioPlayer,
  ReplyPreview,
  MessageTimestamp,
  theme,
  useResizer,
  ConversationItem,
  ConversationItemData,
  CategoryHeader,
  CategoryIcons,
  CommunityCarousel,
  CommunityItem,
  ConversationDrawer,
  TagItem,
  getLanguageColor,
  ImageGallery,
  ImageItem,
} from '@/components/v2';

// ============================================================================
// Types pour les sélecteurs de langue
// ============================================================================

interface LanguageVersion {
  languageCode: string;
  languageName: string;
  content: string;
  transcription?: string;
  isOriginal?: boolean;
}

// ============================================================================
// Flag emoji map
// ============================================================================

const FLAG_MAP: Record<string, string> = {
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  es: '\u{1F1EA}\u{1F1F8}',
  zh: '\u{1F1E8}\u{1F1F3}',
  ja: '\u{1F1EF}\u{1F1F5}',
  ar: '\u{1F1F8}\u{1F1E6}',
  de: '\u{1F1E9}\u{1F1EA}',
  pt: '\u{1F1E7}\u{1F1F7}',
  ko: '\u{1F1F0}\u{1F1F7}',
  it: '\u{1F1EE}\u{1F1F9}',
  ru: '\u{1F1F7}\u{1F1FA}',
};

function getFlag(code: string): string {
  const normalized = code.toLowerCase().slice(0, 2);
  return FLAG_MAP[normalized] || '\u{1F310}';
}

// ============================================================================
// Composant ChevronIcon
// ============================================================================

function ChevronIcon({ className, direction = 'down' }: { className?: string; direction?: 'down' | 'up' }) {
  return (
    <svg
      className={`${className || ''} ${direction === 'up' ? 'rotate-180' : ''} transition-transform`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ============================================================================
// Composant TranscriptIcon
// ============================================================================

function TranscriptIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10M4 18h6" />
    </svg>
  );
}

// ============================================================================
// Composant SpeedMenuDropdown - Menu de vitesse avec positionnement intelligent
// ============================================================================

interface SpeedMenuDropdownProps {
  currentSpeed: number;
  onSpeedChange: (speed: number) => void;
  speeds?: number[];
  variant?: 'light' | 'dark';
}

function SpeedMenuDropdown({
  currentSpeed,
  onSpeedChange,
  speeds = [1, 1.5, 2],
  variant = 'dark',
}: SpeedMenuDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<'up' | 'down'>('up');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculer la direction d'ouverture selon l'espace disponible
  const calculateDirection = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = speeds.length * 36 + 8; // ~36px par item + padding

    // Ouvrir vers le haut si plus d'espace en haut, sinon vers le bas
    setOpenDirection(spaceAbove > spaceBelow && spaceAbove >= menuHeight ? 'up' : 'down');
  }, [speeds.length]);

  const handleToggle = useCallback(() => {
    if (!isOpen) {
      calculateDirection();
    }
    setIsOpen(!isOpen);
  }, [isOpen, calculateDirection]);

  const handleSelect = useCallback((speed: number) => {
    onSpeedChange(speed);
    setIsOpen(false);
  }, [onSpeedChange]);

  // Fermer le menu au clic extérieur
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isDark = variant === 'dark';

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`
          flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
          ${isDark
            ? 'bg-black/50 backdrop-blur-sm text-white hover:bg-black/60'
            : 'bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white border border-gray-200'
          }
        `}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>{currentSpeed}x</span>
        <ChevronIcon className="w-3 h-3" direction={isOpen ? (openDirection === 'up' ? 'down' : 'up') : 'down'} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            ref={menuRef}
            className={`
              absolute z-50 min-w-[80px] rounded-lg overflow-hidden
              ${isDark
                ? 'bg-black/80 backdrop-blur-md border border-white/10'
                : 'bg-white border border-gray-200 shadow-lg'
              }
              ${openDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}
              right-0
            `}
          >
            {speeds.map((speed) => (
              <button
                key={speed}
                onClick={() => handleSelect(speed)}
                className={`
                  w-full px-3 py-2 text-xs font-medium text-left transition-colors
                  ${currentSpeed === speed
                    ? isDark ? 'bg-white/20 text-white' : 'bg-terracotta/10 text-terracotta'
                    : isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                {speed}x
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Hook useLanguageSelector
// ============================================================================

function useLanguageSelector(
  originalLanguageCode: string,
  originalLanguageName: string,
  originalContent: string,
  translations: Array<{ languageCode: string; languageName: string; content: string; transcription?: string }>,
  originalTranscription?: string
) {
  const [displayedVersion, setDisplayedVersion] = useState<LanguageVersion>({
    languageCode: originalLanguageCode,
    languageName: originalLanguageName,
    content: originalContent,
    transcription: originalTranscription,
    isOriginal: true,
  });
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const otherVersions = useMemo(() => {
    const versions: LanguageVersion[] = [];
    // Si on affiche une traduction, ajouter l'original
    if (!displayedVersion.isOriginal) {
      versions.push({
        languageCode: originalLanguageCode,
        languageName: originalLanguageName,
        content: originalContent,
        transcription: originalTranscription,
        isOriginal: true,
      });
    }
    // Ajouter les traductions (sauf celle affichée)
    translations.forEach((t) => {
      if (t.languageCode !== displayedVersion.languageCode) {
        versions.push({ ...t, isOriginal: false });
      }
    });
    return versions;
  }, [displayedVersion, originalLanguageCode, originalLanguageName, originalContent, originalTranscription, translations]);

  const handleSelectVersion = useCallback((version: LanguageVersion) => {
    setDisplayedVersion(version);
    setShowLanguageMenu(false);
  }, []);

  return {
    displayedVersion,
    showLanguageMenu,
    setShowLanguageMenu,
    otherVersions,
    handleSelectVersion,
  };
}

// ============================================================================
// Composant LanguageSelectorButton - pour les messages avec attachements
// ============================================================================

interface LanguageSelectorButtonProps {
  displayedVersion: LanguageVersion;
  otherVersions: LanguageVersion[];
  showLanguageMenu: boolean;
  setShowLanguageMenu: (show: boolean) => void;
  handleSelectVersion: (version: LanguageVersion) => void;
  isSent?: boolean;
}

function LanguageSelectorButton({
  displayedVersion,
  otherVersions,
  showLanguageMenu,
  setShowLanguageMenu,
  handleSelectVersion,
  isSent = false,
}: LanguageSelectorButtonProps) {
  const langColor = getLanguageColor(displayedVersion.languageCode);

  return (
    <div className="relative">
      <button
        onClick={() => otherVersions.length > 0 && setShowLanguageMenu(!showLanguageMenu)}
        className={`
          inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-all
          ${otherVersions.length > 0 ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}
        `}
        style={{
          backgroundColor: isSent ? 'rgba(255,255,255,0.2)' : `${langColor}15`,
          color: isSent ? 'white' : langColor,
        }}
      >
        <span>{getFlag(displayedVersion.languageCode)}</span>
        <span>{displayedVersion.languageName}</span>
        {displayedVersion.isOriginal && (
          <span
            className="text-[10px] px-1 py-0.5 rounded-full"
            style={{
              background: isSent ? 'rgba(255,255,255,0.15)' : theme.colors.parchment,
            }}
          >
            Original
          </span>
        )}
        {otherVersions.length > 0 && (
          <ChevronIcon
            className="w-3 h-3"
            direction={showLanguageMenu ? 'up' : 'down'}
          />
        )}
      </button>

      {/* Dropdown Menu */}
      {showLanguageMenu && otherVersions.length > 0 && (
        <div
          className="absolute top-full mt-1 z-50 min-w-[180px] max-h-[200px] overflow-y-auto rounded-xl bg-white border border-[#E5E5E5]"
          style={{
            boxShadow: theme.shadows.lg,
            right: 0,
          }}
        >
          {otherVersions.slice(0, 4).map((version, idx) => (
            <button
              key={`${version.languageCode}-${idx}`}
              onClick={() => handleSelectVersion(version)}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 transition-colors"
            >
              <span className="text-base">{getFlag(version.languageCode)}</span>
              <span className="text-sm font-medium flex-1" style={{ color: theme.colors.charcoal }}>
                {version.languageName}
              </span>
              {version.isOriginal && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: theme.colors.parchment, color: theme.colors.textMuted }}
                >
                  Original
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {/* Backdrop invisible pour fermer le menu */}
      {showLanguageMenu && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'transparent' }}
          onClick={() => setShowLanguageMenu(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Composant TranscriptionPreview
// ============================================================================

interface TranscriptionPreviewProps {
  transcription: string;
  maxLength?: number;
  isSent?: boolean;
}

function TranscriptionPreview({ transcription, maxLength = 100, isSent = false }: TranscriptionPreviewProps) {
  const isTruncated = transcription.length > maxLength;
  const truncatedText = isTruncated ? transcription.slice(0, maxLength).trim() + '...' : transcription;

  return (
    <div
      className="mt-3 p-2.5 rounded-xl cursor-pointer transition-all hover:opacity-90"
      style={{
        background: isSent ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.6)',
        border: isSent ? '1px solid rgba(255,255,255,0.2)' : `1px solid ${theme.colors.parchment}`,
      }}
    >
      <div className="flex items-start gap-2">
        <TranscriptIcon
          className="w-4 h-4 flex-shrink-0 mt-0.5"
          style={{ color: isSent ? 'rgba(255,255,255,0.7)' : theme.colors.textMuted }}
        />
        <div className="flex-1 min-w-0">
          <p
            className="text-sm leading-relaxed"
            style={{ color: isSent ? 'rgba(255,255,255,0.9)' : theme.colors.textSecondary }}
          >
            {truncatedText}
          </p>
          {isTruncated && (
            <button
              className="text-xs font-medium mt-1 hover:underline"
              style={{ color: isSent ? 'rgba(255,255,255,0.8)' : theme.colors.terracotta }}
            >
              voir plus...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Composant StandaloneVideoMessage - Lecteur vidéo standalone hors bulle
// ============================================================================

interface StandaloneVideoMessageProps {
  senderName: string;
  senderInitial: string;
  senderColor: string;
  videoSrc: string;
  poster?: string;
  displayedVersion: LanguageVersion;
  otherVersions: LanguageVersion[];
  showLanguageMenu: boolean;
  setShowLanguageMenu: (show: boolean) => void;
  handleSelectVersion: (version: LanguageVersion) => void;
  timestamp: string;
}

const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

function formatVideoDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function StandaloneVideoMessage({
  senderName,
  senderInitial,
  senderColor,
  videoSrc,
  poster,
  displayedVersion,
  otherVersions,
  showLanguageMenu,
  setShowLanguageMenu,
  handleSelectVersion,
  timestamp,
}: StandaloneVideoMessageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showTranscription, setShowTranscription] = useState(true);
  const [isTranscriptionExpanded, setIsTranscriptionExpanded] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const langColor = getLanguageColor(displayedVersion.languageCode);

  // Video event handlers
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && !isSeeking) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [isSeeking]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setShowControls(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  const startPlayback = useCallback(() => {
    if (videoRef.current) {
      setShowControls(true);
      videoRef.current.play();
    }
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (videoRef.current) {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = percent * duration;
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [duration]
  );

  const handleSpeedChange = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const hasTranscription = !!displayedVersion.transcription;
  const transcriptionText = displayedVersion.transcription || '';
  const isTruncated = transcriptionText.length > 150;
  const displayedTranscription = isTranscriptionExpanded
    ? transcriptionText
    : transcriptionText.slice(0, 150) + (isTruncated ? '...' : '');

  return (
    <div className="flex gap-2 max-w-[85%]">
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
          style={{ background: senderColor }}
        >
          {senderInitial}
        </div>
      </div>

      {/* Video Card Standalone */}
      <div className="flex-1 min-w-0" ref={containerRef}>
        {/* Header avec nom et sélecteur de langue */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: theme.colors.charcoal }}>
              {senderName}
            </span>
            <span className="text-xs" style={{ color: theme.colors.textMuted }}>
              {timestamp}
            </span>
          </div>
          {/* Icône de langue en haut à droite */}
          <div className="relative">
            <button
              onClick={() => otherVersions.length > 0 && setShowLanguageMenu(!showLanguageMenu)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all
                ${otherVersions.length > 0 ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'}
                bg-white/80 backdrop-blur-sm border border-[#E5E5E5]
              `}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: langColor }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="text-sm">{getFlag(displayedVersion.languageCode)}</span>
              {otherVersions.length > 0 && (
                <ChevronIcon className="w-3 h-3" direction={showLanguageMenu ? 'up' : 'down'} />
              )}
            </button>

            {/* Dropdown */}
            {showLanguageMenu && otherVersions.length > 0 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLanguageMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-1 z-50 min-w-[180px] max-h-[200px] overflow-y-auto rounded-xl bg-white border border-[#E5E5E5]"
                  style={{ boxShadow: theme.shadows.lg }}
                >
                  {otherVersions.slice(0, 4).map((version, idx) => (
                    <button
                      key={`${version.languageCode}-${idx}`}
                      onClick={() => handleSelectVersion(version)}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-base">{getFlag(version.languageCode)}</span>
                      <span className="text-sm font-medium flex-1" style={{ color: theme.colors.charcoal }}>
                        {version.languageName}
                      </span>
                      {version.isOriginal && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: theme.colors.parchment, color: theme.colors.textMuted }}
                        >
                          Original
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Lecteur Vidéo */}
        <div
          className={`
            relative overflow-hidden bg-[#16161A]
            ${isFullscreen ? 'w-full h-full rounded-none' : 'aspect-video rounded-2xl'}
          `}
        >
          <video
            ref={videoRef}
            src={videoSrc}
            poster={poster}
            className="w-full h-full object-cover"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            playsInline
          />

          {/* Overlay thumbnail (avant lecture) */}
          {!showControls && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer group"
              onClick={startPlayback}
            >
              {poster && (
                <img src={poster} alt="Video thumbnail" className="absolute inset-0 w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

              {/* Bouton Play central */}
              <div
                className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-sm shadow-lg transition-all duration-300 ease-out group-hover:scale-110 group-hover:bg-white"
                style={{ boxShadow: '0 8px 30px rgba(231,111,81,0.4)' }}
              >
                <svg className="w-7 h-7 text-[#E76F51] ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>

              {/* Badge durée */}
              {duration > 0 && (
                <div className="absolute bottom-3 left-3 z-10 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm text-white text-sm font-medium">
                  {formatVideoDuration(duration)}
                </div>
              )}

              {/* Speed control en haut à droite */}
              <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                <SpeedMenuDropdown
                  currentSpeed={playbackSpeed}
                  onSpeedChange={handleSpeedChange}
                  speeds={PLAYBACK_SPEEDS}
                  variant="dark"
                />
              </div>
            </div>
          )}

          {/* Contrôles vidéo (pendant lecture) */}
          {showControls && (
            <div
              className={`
                absolute inset-0 flex flex-col justify-between
                bg-gradient-to-t from-black/70 via-transparent to-black/30
                transition-opacity duration-300
                ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}
              `}
            >
              {/* Top Controls */}
              <div className="p-3 flex items-center justify-end">
                <SpeedMenuDropdown
                  currentSpeed={playbackSpeed}
                  onSpeedChange={handleSpeedChange}
                  speeds={PLAYBACK_SPEEDS}
                  variant="dark"
                />
              </div>

              {/* Center Play/Pause */}
              <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={togglePlay}>
                {!isPlaying && (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-sm shadow-lg transition-all duration-300 ease-out hover:scale-110 hover:bg-white">
                    <svg className="w-7 h-7 text-[#E76F51] ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Bottom Controls */}
              <div className="relative z-10 p-3 space-y-2">
                {/* Barre de progression */}
                <div
                  className="relative h-1.5 bg-white/30 rounded-full cursor-pointer group/progress"
                  onClick={handleProgressClick}
                  onMouseDown={() => setIsSeeking(true)}
                  onMouseUp={() => setIsSeeking(false)}
                  onMouseLeave={() => setIsSeeking(false)}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all"
                    style={{ width: `${progress}%`, background: theme.colors.terracotta }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md transition-transform duration-150 opacity-0 group-hover/progress:opacity-100 scale-0 group-hover/progress:scale-100"
                    style={{ left: `calc(${progress}% - 7px)` }}
                  />
                </div>

                {/* Boutons de contrôle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors duration-200"
                    >
                      {isPlaying ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <span className="text-white text-sm font-medium tabular-nums">
                      {formatVideoDuration(currentTime)} / {formatVideoDuration(duration)}
                    </span>
                  </div>

                  <button
                    onClick={toggleFullscreen}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors duration-200"
                  >
                    {isFullscreen ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v5m0-5h5m6 0l5-5m0 0v5m0-5h-5m-6 16l-5 5m0 0v-5m0 5h5m6 0l5 5m0 0v-5m0 5h-5" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Texte du message */}
        <p className="mt-3 text-[0.95rem] leading-relaxed" style={{ color: theme.colors.charcoal }}>
          {displayedVersion.content}
        </p>

        {/* Transcription intégrée (sans bordure) */}
        {hasTranscription && (
          <div className="mt-3">
            {/* Header transcription avec toggle */}
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setShowTranscription(!showTranscription)}
                className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
                style={{ color: langColor }}
              >
                <TranscriptIcon className="w-4 h-4" style={{ color: langColor }} />
                <span>Transcription</span>
                <ChevronIcon className="w-3 h-3" direction={showTranscription ? 'up' : 'down'} />
              </button>
              <span className="text-xs" style={{ color: theme.colors.textMuted }}>
                ({displayedVersion.languageName})
              </span>
            </div>

            {/* Contenu transcription */}
            {showTranscription && (
              <div className="pl-6">
                <p className="text-sm leading-relaxed" style={{ color: theme.colors.textSecondary }}>
                  {displayedTranscription}
                </p>
                {isTruncated && (
                  <button
                    onClick={() => setIsTranscriptionExpanded(!isTranscriptionExpanded)}
                    className="text-xs font-medium mt-1 hover:underline transition-all"
                    style={{ color: theme.colors.terracotta }}
                  >
                    {isTranscriptionExpanded ? 'voir moins' : 'voir plus...'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bouton demander transcription si pas disponible */}
        {!hasTranscription && (
          <button
            className="mt-3 flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: theme.colors.terracotta }}
          >
            <TranscriptIcon className="w-4 h-4" />
            <span>Demander une transcription</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Composant StandaloneAudioMessage - Lecteur audio standalone hors bulle
// ============================================================================

interface StandaloneAudioMessageProps {
  senderName?: string;
  senderInitial?: string;
  senderColor: string;
  audioSrc: string;
  audioDuration?: number;
  displayedVersion: LanguageVersion;
  otherVersions: LanguageVersion[];
  showLanguageMenu: boolean;
  setShowLanguageMenu: (show: boolean) => void;
  handleSelectVersion: (version: LanguageVersion) => void;
  timestamp: string;
  isSent?: boolean;
}

const AUDIO_PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
type AudioPlaybackSpeed = (typeof AUDIO_PLAYBACK_SPEEDS)[number];

function formatAudioTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function generateAudioWaveform(src: string, barCount: number): number[] {
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    const char = src.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const seed = Math.abs(Math.sin(hash + i * 1.5) * 10000);
    const height = 0.3 + (seed % 1) * 0.7;
    bars.push(height);
  }
  return bars;
}

function StandaloneAudioMessage({
  senderName,
  senderInitial,
  senderColor,
  audioSrc,
  audioDuration: propDuration,
  displayedVersion,
  otherVersions,
  showLanguageMenu,
  setShowLanguageMenu,
  handleSelectVersion,
  timestamp,
  isSent = false,
}: StandaloneAudioMessageProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(propDuration || 0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<AudioPlaybackSpeed>(1);
  const [showTranscription, setShowTranscription] = useState(true);
  const [isTranscriptionExpanded, setIsTranscriptionExpanded] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const langColor = getLanguageColor(displayedVersion.languageCode);
  const waveformBars = useMemo(() => generateAudioWaveform(audioSrc, 40), [audioSrc]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (!propDuration && audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setIsLoading(false);
    };

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [propDuration]);

  useEffect(() => {
    if (propDuration && propDuration > 0) {
      setDuration(propDuration);
    }
  }, [propDuration]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  }, [isPlaying]);

  const seekTo = useCallback((clientX: number) => {
    const audio = audioRef.current;
    const progressBar = progressRef.current;
    if (!audio || !progressBar || duration <= 0) return;

    const rect = progressBar.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    seekTo(e.clientX);
  }, [seekTo]);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    seekTo(e.clientX);
  }, [seekTo]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => seekTo(e.clientX);
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, seekTo]);

  const handleSpeedChange = useCallback((speed: AudioPlaybackSpeed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, []);

  const hasTranscription = !!displayedVersion.transcription;
  const transcriptionText = displayedVersion.transcription || '';
  const isTruncated = transcriptionText.length > 150;
  const displayedTranscription = isTranscriptionExpanded
    ? transcriptionText
    : transcriptionText.slice(0, 150) + (isTruncated ? '...' : '');

  return (
    <div className={`flex gap-2 max-w-[85%] ${isSent ? 'flex-row-reverse ml-auto' : ''}`}>
      {/* Avatar (seulement pour les messages reçus ou si senderName fourni) */}
      {!isSent && senderInitial && (
        <div className="flex-shrink-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
            style={{ background: senderColor }}
          >
            {senderInitial}
          </div>
        </div>
      )}

      {/* Audio Card Standalone */}
      <div className="flex-1 min-w-0">
        {/* Header avec nom et sélecteur de langue */}
        <div className={`flex items-center justify-between mb-2 ${isSent ? 'flex-row-reverse' : ''}`}>
          <div className={`flex items-center gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
            {senderName && (
              <span className="text-xs font-semibold" style={{ color: isSent ? theme.colors.terracotta : theme.colors.charcoal }}>
                {senderName}
              </span>
            )}
            <span className="text-xs" style={{ color: theme.colors.textMuted }}>
              {timestamp}
            </span>
          </div>
          {/* Icône de langue */}
          <div className="relative">
            <button
              onClick={() => otherVersions.length > 0 && setShowLanguageMenu(!showLanguageMenu)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all
                ${otherVersions.length > 0 ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'}
                ${isSent ? 'bg-[#E76F51]/10' : 'bg-white/80 backdrop-blur-sm border border-[#E5E5E5]'}
              `}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: langColor }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="text-sm">{getFlag(displayedVersion.languageCode)}</span>
              {otherVersions.length > 0 && (
                <ChevronIcon className="w-3 h-3" direction={showLanguageMenu ? 'up' : 'down'} />
              )}
            </button>

            {/* Dropdown */}
            {showLanguageMenu && otherVersions.length > 0 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLanguageMenu(false)} />
                <div
                  className="absolute top-full mt-1 z-50 min-w-[180px] max-h-[200px] overflow-y-auto rounded-xl bg-white border border-[#E5E5E5]"
                  style={{ boxShadow: theme.shadows.lg, right: isSent ? 'auto' : 0, left: isSent ? 0 : 'auto' }}
                >
                  {otherVersions.slice(0, 4).map((version, idx) => (
                    <button
                      key={`${version.languageCode}-${idx}`}
                      onClick={() => handleSelectVersion(version)}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-base">{getFlag(version.languageCode)}</span>
                      <span className="text-sm font-medium flex-1" style={{ color: theme.colors.charcoal }}>
                        {version.languageName}
                      </span>
                      {version.isOriginal && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: theme.colors.parchment, color: theme.colors.textMuted }}>
                          Original
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Lecteur Audio */}
        <div
          className={`
            rounded-2xl p-4
            ${isSent
              ? 'bg-gradient-to-r from-[#E76F51] to-[#D9594A]'
              : 'bg-gradient-to-r from-[#F5EDE3] to-[#FFF8F3] border border-[#E5E5E5]'
            }
          `}
          style={{ boxShadow: isSent ? theme.shadows.terracotta : theme.shadows.sm }}
        >
          <audio ref={audioRef} src={audioSrc} preload="metadata" />

          <div className="flex items-center gap-3">
            {/* Bouton Play/Pause */}
            <button
              onClick={togglePlayPause}
              disabled={isLoading}
              className={`
                flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center
                transition-all duration-200 hover:scale-105 active:scale-95
                ${isLoading ? 'opacity-50 cursor-wait' : ''}
              `}
              style={{
                background: isSent ? 'rgba(255,255,255,0.2)' : theme.colors.terracotta,
                boxShadow: isSent ? 'none' : theme.shadows.terracotta,
              }}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Waveform et temps */}
            <div className="flex-1 flex flex-col gap-2">
              {/* Waveform */}
              <div
                ref={progressRef}
                className="relative h-8 cursor-pointer select-none"
                onClick={handleProgressClick}
                onMouseDown={handleDragStart}
              >
                <div className="absolute inset-0 flex items-center justify-between gap-[2px]">
                  {waveformBars.map((height, index) => {
                    const barProgress = (index / waveformBars.length) * 100;
                    const isPlayed = barProgress < progress;
                    return (
                      <div
                        key={index}
                        className="flex-1 transition-colors duration-150"
                        style={{
                          height: `${height * 100}%`,
                          minWidth: '2px',
                          maxWidth: '3px',
                          borderRadius: '2px',
                          backgroundColor: isSent
                            ? isPlayed ? 'white' : 'rgba(255,255,255,0.4)'
                            : isPlayed ? theme.colors.terracotta : theme.colors.textMuted,
                          opacity: isPlayed ? 1 : 0.4,
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Temps et vitesse */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: isSent ? 'rgba(255,255,255,0.8)' : theme.colors.textSecondary }}>
                  {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
                </span>

                {/* Speed control */}
                <SpeedMenuDropdown
                  currentSpeed={playbackSpeed}
                  onSpeedChange={handleSpeedChange}
                  speeds={AUDIO_PLAYBACK_SPEEDS}
                  variant={isSent ? 'dark' : 'light'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Texte du message (si présent) */}
        {displayedVersion.content && (
          <p
            className={`mt-3 text-[0.95rem] leading-relaxed ${isSent ? 'text-right' : ''}`}
            style={{ color: theme.colors.charcoal }}
          >
            {displayedVersion.content}
          </p>
        )}

        {/* Transcription intégrée (sans bordure) */}
        {hasTranscription && (
          <div className={`mt-3 ${isSent ? 'text-right' : ''}`}>
            {/* Header transcription avec toggle */}
            <div className={`flex items-center gap-2 mb-2 ${isSent ? 'justify-end' : ''}`}>
              <button
                onClick={() => setShowTranscription(!showTranscription)}
                className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
                style={{ color: langColor }}
              >
                <TranscriptIcon className="w-4 h-4" style={{ color: langColor }} />
                <span>Transcription</span>
                <ChevronIcon className="w-3 h-3" direction={showTranscription ? 'up' : 'down'} />
              </button>
              <span className="text-xs" style={{ color: theme.colors.textMuted }}>
                ({displayedVersion.languageName})
              </span>
            </div>

            {/* Contenu transcription */}
            {showTranscription && (
              <div className={isSent ? 'pr-6' : 'pl-6'}>
                <p className={`text-sm leading-relaxed ${isSent ? 'text-right' : ''}`} style={{ color: theme.colors.textSecondary }}>
                  {displayedTranscription}
                </p>
                {isTruncated && (
                  <button
                    onClick={() => setIsTranscriptionExpanded(!isTranscriptionExpanded)}
                    className={`text-xs font-medium mt-1 hover:underline transition-all ${isSent ? 'block ml-auto' : ''}`}
                    style={{ color: theme.colors.terracotta }}
                  >
                    {isTranscriptionExpanded ? 'voir moins' : 'voir plus...'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bouton demander transcription si pas disponible */}
        {!hasTranscription && (
          <button
            className={`mt-3 flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80 ${isSent ? 'ml-auto' : ''}`}
            style={{ color: theme.colors.terracotta }}
          >
            <TranscriptIcon className="w-4 h-4" />
            <span>Demander une transcription</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Données de démonstration
const mockCategories: TagItem[] = [
  { id: 'work', name: 'Travail', color: theme.colors.deepTeal },
  { id: 'personal', name: 'Personnel', color: theme.colors.royalIndigo },
  { id: 'clients', name: 'Clients', color: theme.colors.terracotta },
];

const mockTags: TagItem[] = [
  { id: 'urgent', name: 'Urgent', color: '#EF4444' },
  { id: 'important', name: 'Important', color: theme.colors.goldAccent },
  { id: 'follow', name: 'À suivre', color: theme.colors.jadeGreen },
];

const mockCommunities: CommunityItem[] = [
  {
    id: '1',
    name: 'Tech Polyglots',
    banner: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&h=200&fit=crop',
    memberCount: 1243,
    conversationCount: 89,
    color: theme.colors.deepTeal,
  },
  {
    id: '2',
    name: 'Language Learners',
    banner: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=300&h=200&fit=crop',
    memberCount: 892,
    conversationCount: 156,
    color: theme.colors.royalIndigo,
  },
  {
    id: '3',
    name: 'Global Travelers',
    banner: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=300&h=200&fit=crop',
    memberCount: 2156,
    conversationCount: 234,
    color: theme.colors.terracotta,
  },
  {
    id: '4',
    name: 'Manga & Anime',
    banner: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&h=200&fit=crop',
    memberCount: 3421,
    conversationCount: 412,
    color: theme.colors.sakuraPink,
  },
];

const mockConversations: ConversationItemData[] = [
  // Conversations directes (pas d'anonymes possible)
  {
    id: '1',
    name: 'Yuki Tanaka',
    languageCode: 'ja',
    isOnline: true,
    isPinned: true,
    isImportant: false,
    isMuted: false,
    tags: [{ id: 'urgent', name: 'Urgent', color: '#EF4444' }],
    unreadCount: 2,
    lastMessage: { content: 'À demain pour la réunion !', type: 'text', timestamp: '10:34' },
    isTyping: false,
  },
  {
    id: '2',
    name: 'Emma Wilson',
    languageCode: 'en',
    isOnline: true,
    isPinned: false,
    isImportant: false,
    isMuted: false,
    tags: [],
    unreadCount: 0,
    lastMessage: { content: '', type: 'photo', attachmentCount: 3, timestamp: 'Hier' },
    draft: 'Je voulais te dire que...',
    isTyping: false,
    categoryId: 'work',
  },
  {
    id: '3',
    name: 'Ahmed Hassan',
    languageCode: 'ar',
    isOnline: false,
    isPinned: false,
    isImportant: false,
    isMuted: true,
    tags: [{ id: 'follow', name: 'À suivre', color: theme.colors.jadeGreen }],
    unreadCount: 5,
    lastMessage: { content: 'مرحبا، كيف حالك؟', type: 'text', timestamp: 'Hier' },
    isTyping: false,
    categoryId: 'work',
  },
  {
    id: '4',
    name: 'Li Wei',
    languageCode: 'zh',
    isOnline: true,
    isPinned: false,
    isImportant: false,
    isMuted: false,
    tags: [],
    unreadCount: 0,
    lastMessage: { content: '项目进展如何？', type: 'text', timestamp: 'Lun' },
    isTyping: false,
  },
  {
    id: '5',
    name: 'Carlos García',
    languageCode: 'es',
    isOnline: true,
    isPinned: false,
    isImportant: false,
    isMuted: false,
    tags: [{ id: 'follow', name: 'À suivre', color: theme.colors.jadeGreen }],
    unreadCount: 1,
    lastMessage: { content: '¿Podemos hablar mañana?', type: 'text', timestamp: '10:45' },
    isTyping: false,
  },
  // Conversations de GROUPE (peuvent avoir des anonymes)
  {
    id: '6',
    name: 'Projet Meeshy',
    languageCode: 'multi',
    isOnline: false,
    isPinned: true,
    isImportant: true,
    isMuted: false,
    isGroup: true,
    participantCount: 8,
    hasAnonymousParticipants: true,
    tags: [{ id: 'important', name: 'Important', color: theme.colors.goldAccent }],
    unreadCount: 4,
    lastMessage: { content: '¡Gracias por tu ayuda!', type: 'text', timestamp: '09:15', senderName: 'Invité' },
    isTyping: true,
  },
  {
    id: '7',
    name: 'Tech Polyglots',
    languageCode: 'multi',
    isOnline: false,
    isPinned: false,
    isImportant: false,
    isMuted: false,
    isGroup: true,
    participantCount: 24,
    hasAnonymousParticipants: false,
    tags: [],
    unreadCount: 12,
    lastMessage: { content: 'Anyone knows React Native?', type: 'text', timestamp: '11:20', senderName: 'Sarah' },
    isTyping: false,
  },
  {
    id: '8',
    name: 'Meetup Paris 🇫🇷',
    languageCode: 'fr',
    isOnline: false,
    isPinned: false,
    isImportant: false,
    isMuted: false,
    isGroup: true,
    participantCount: 156,
    hasAnonymousParticipants: true,
    tags: [],
    unreadCount: 0,
    lastMessage: { content: '', type: 'voice', timestamp: 'Lun', senderName: 'Anonyme' },
    isTyping: false,
  },
];

export default function V2ChatsPage() {
  const [selectedChat, setSelectedChat] = useState<string | null>('1');
  const [message, setMessage] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [conversations, setConversations] = useState(mockConversations);
  const [categories] = useState(mockCategories);
  const [tags] = useState(mockTags);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);

  // =========================================================================
  // États des sélecteurs de langue pour les messages avec attachements
  // =========================================================================

  // Message images de Yuki
  const yukiImagesSelector = useLanguageSelector(
    'ja',
    'Japonais',
    'プレゼンのスライドを送ります！',
    [
      { languageCode: 'fr', languageName: 'Français', content: "Je t'envoie les slides de la présentation !" },
      { languageCode: 'en', languageName: 'English', content: "I'm sending you the presentation slides!" },
    ]
  );

  // Message audio de Carlos
  const carlosAudioSelector = useLanguageSelector(
    'es',
    'Español',
    'Hola a todos, aquí les comparto mis pensamientos sobre el proyecto.',
    [
      { languageCode: 'fr', languageName: 'Français', content: 'Bonjour à tous, voici mes réflexions sur le projet.', transcription: 'Bonjour à tous, je voulais partager avec vous mes réflexions sur le projet. Je pense que nous devrions nous concentrer sur l\'expérience utilisateur et améliorer la navigation...' },
      { languageCode: 'en', languageName: 'English', content: "Hello everyone, here are my thoughts on the project.", transcription: "Hello everyone, I wanted to share my thoughts on the project. I think we should focus on user experience and improve navigation..." },
    ],
    'Hola a todos, quería compartir con ustedes mis pensamientos sobre el proyecto. Creo que deberíamos enfocarnos en la experiencia del usuario y mejorar la navegación...'
  );

  // Message vidéo de Emma
  const emmaVideoSelector = useLanguageSelector(
    'en',
    'English',
    'Check out this demo video of our new feature!',
    [
      { languageCode: 'fr', languageName: 'Français', content: 'Regardez cette vidéo démo de notre nouvelle fonctionnalité !', transcription: 'Voici une démonstration de notre nouvelle fonctionnalité de traduction en temps réel. Comme vous pouvez le voir, les messages sont traduits instantanément...' },
      { languageCode: 'es', languageName: 'Español', content: '¡Miren este video demo de nuestra nueva función!', transcription: 'Aquí está una demostración de nuestra nueva función de traducción en tiempo real. Como pueden ver, los mensajes se traducen al instante...' },
    ],
    'Here is a demonstration of our new real-time translation feature. As you can see, messages are translated instantly...'
  );

  // Message audio envoyé (moi)
  const myAudioSelector = useLanguageSelector(
    'fr',
    'Français',
    '',
    [
      { languageCode: 'es', languageName: 'Español', content: '', transcription: 'Gracias por la actualización. Creo que vamos en la dirección correcta con este proyecto...' },
      { languageCode: 'en', languageName: 'English', content: '', transcription: "Thanks for the update. I think we're heading in the right direction with this project..." },
    ],
    "Merci pour la mise à jour. Je pense qu'on avance dans la bonne direction avec ce projet..."
  );

  // Message images de Ahmed
  const ahmedImagesSelector = useLanguageSelector(
    'ar',
    'العربية',
    'صور من الاجتماع الأخير 📸',
    [
      { languageCode: 'fr', languageName: 'Français', content: 'Photos de la dernière réunion 📸' },
      { languageCode: 'en', languageName: 'English', content: 'Photos from the last meeting 📸' },
    ]
  );

  // Réponse aux slides de Yuki
  const replyToYukiSelector = useLanguageSelector(
    'fr',
    'Français',
    "Super ! Les slides sont magnifiques, j'adore le design 😍",
    [
      { languageCode: 'ja', languageName: '日本語', content: 'すごい！スライドが素晴らしい、デザインが大好きです 😍' },
      { languageCode: 'en', languageName: 'English', content: "Awesome! The slides are gorgeous, I love the design 😍" },
    ]
  );

  // Réponse à l'audio de Carlos
  const replyToCarlosSelector = useLanguageSelector(
    'fr',
    'Français',
    'Merci Carlos, ton message vocal était très clair ! 👍',
    [
      { languageCode: 'es', languageName: 'Español', content: 'Gracias Carlos, tu mensaje de voz fue muy claro! 👍' },
      { languageCode: 'en', languageName: 'English', content: 'Thanks Carlos, your voice message was very clear! 👍' },
    ]
  );

  // Resizer pour desktop
  const { width: sidebarWidth, setWidth: setSidebarWidth } = useResizer(30, 10, 50);

  // Grouper les conversations par catégorie
  const pinnedConversations = conversations.filter((c) => c.isPinned);
  const categorizedConversations = conversations.filter((c) => !c.isPinned && c.categoryId);
  const uncategorizedConversations = conversations.filter((c) => !c.isPinned && !c.categoryId);

  // Catégories avec conversations
  const categoriesWithConversations = categories.filter((cat) =>
    conversations.some((c) => c.categoryId === cat.id && !c.isPinned)
  );

  // Conversation sélectionnée
  const selectedConversation = conversations.find((c) => c.id === selectedChat);

  // Handlers
  const handleConversationAction = useCallback((id: string, action: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        switch (action) {
          case 'pin':
            return { ...c, isPinned: !c.isPinned };
          case 'mute':
            return { ...c, isMuted: !c.isMuted };
          case 'important':
            return { ...c, isImportant: !c.isImportant };
          case 'read':
            return { ...c, unreadCount: 0 };
          default:
            return c;
        }
      })
    );
  }, []);

  const handleCategoryDrop = useCallback((conversationId: string, categoryId: string | null) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, categoryId: categoryId || undefined } : c
      )
    );
  }, []);

  // Drawer state
  const [drawerNotifications, setDrawerNotifications] = useState<'all' | 'mentions' | 'none'>('all');
  const [drawerTheme, setDrawerTheme] = useState(theme.colors.terracotta);
  const [drawerCategoryId, setDrawerCategoryId] = useState<string | undefined>();
  const [drawerTagIds, setDrawerTagIds] = useState<string[]>([]);

  const availableThemeColors = [
    theme.colors.terracotta,
    theme.colors.deepTeal,
    theme.colors.jadeGreen,
    theme.colors.royalIndigo,
    theme.colors.goldAccent,
  ];

  // Sur mobile, on affiche soit la liste soit la conversation
  const showMobileChat = selectedChat !== null;

  return (
    <div className="h-screen flex relative" style={{ background: theme.colors.warmCanvas }}>
      {/* Sidebar - caché sur mobile quand une conversation est sélectionnée */}
      <div
        className={`
          sidebar-container border-r flex-col relative
          ${showMobileChat ? 'hidden md:flex' : 'flex'}
          w-full
        `}
        style={{
          '--sidebar-width': `${sidebarWidth}%`,
          borderColor: theme.colors.parchment,
          background: 'white',
        } as React.CSSProperties}
      >
        <style>{`
          @media (min-width: 768px) {
            .sidebar-container {
              min-width: 280px;
              max-width: 50%;
              width: var(--sidebar-width);
            }
          }
        `}</style>
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: theme.colors.parchment }}>
          <div className="flex items-center justify-between mb-4">
            <Link href="/v2/landing" className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})` }}
              >
                M
              </div>
              <span className="font-semibold" style={{ color: theme.colors.charcoal }}>
                Messages
              </span>
            </Link>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </Button>
              <Link href="/v2/settings">
                <Button variant="ghost" size="sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </Button>
              </Link>
            </div>
          </div>
          <Input
            placeholder="Rechercher..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>

        {/* Carrousel communautés */}
        <CommunityCarousel
          communities={mockCommunities}
          isVisible={searchFocused}
          onCommunityClick={(id) => {
            setSelectedCommunityId(id === '__all__' ? null : id);
            console.log('Community clicked:', id);
          }}
          totalConversations={conversations.length}
          archivedConversations={2}
          selectedId={selectedCommunityId}
        />

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {/* Épinglées */}
          {pinnedConversations.length > 0 && (
            <div>
              <CategoryHeader
                id="pinned"
                name="Épinglées"
                icon={CategoryIcons.pinned}
                count={pinnedConversations.length}
                onDrop={(convId) => handleConversationAction(convId, 'pin')}
              />
              {pinnedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isSelected={selectedChat === conv.id}
                  onClick={() => setSelectedChat(conv.id)}
                  onArchive={() => console.log('archive', conv.id)}
                  onDelete={() => console.log('delete', conv.id)}
                  onMarkRead={() => handleConversationAction(conv.id, 'read')}
                  onMute={() => handleConversationAction(conv.id, 'mute')}
                  onPin={() => handleConversationAction(conv.id, 'pin')}
                  onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                  onAddTag={() => console.log('add tag', conv.id)}
                  onCall={() => console.log('call', conv.id)}
                  onOptionsClick={() => setDrawerOpen(true)}
                  onDragStart={() => console.log('drag start', conv.id)}
                />
              ))}
            </div>
          )}

          {/* Catégories personnalisées */}
          {categoriesWithConversations.map((category) => {
            const catConversations = conversations.filter(
              (c) => c.categoryId === category.id && !c.isPinned
            );
            return (
              <div key={category.id}>
                <CategoryHeader
                  id={category.id}
                  name={category.name}
                  count={catConversations.length}
                  color={category.color}
                  onDrop={(convId) => handleCategoryDrop(convId, category.id)}
                />
                {catConversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isSelected={selectedChat === conv.id}
                    onClick={() => setSelectedChat(conv.id)}
                    onArchive={() => console.log('archive', conv.id)}
                    onDelete={() => console.log('delete', conv.id)}
                    onMarkRead={() => handleConversationAction(conv.id, 'read')}
                    onMute={() => handleConversationAction(conv.id, 'mute')}
                    onPin={() => handleConversationAction(conv.id, 'pin')}
                    onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                    onAddTag={() => console.log('add tag', conv.id)}
                    onCall={() => console.log('call', conv.id)}
                    onOptionsClick={() => setDrawerOpen(true)}
                    onDragStart={() => console.log('drag start', conv.id)}
                  />
                ))}
              </div>
            );
          })}

          {/* Non catégorisées */}
          {uncategorizedConversations.length > 0 && (pinnedConversations.length > 0 || categorizedConversations.length > 0) && (
            <div>
              <CategoryHeader
                id="uncategorized"
                name="Non catégorisées"
                icon={CategoryIcons.uncategorized}
                count={uncategorizedConversations.length}
                onDrop={(convId) => handleCategoryDrop(convId, null)}
              />
              {uncategorizedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isSelected={selectedChat === conv.id}
                  onClick={() => setSelectedChat(conv.id)}
                  onArchive={() => console.log('archive', conv.id)}
                  onDelete={() => console.log('delete', conv.id)}
                  onMarkRead={() => handleConversationAction(conv.id, 'read')}
                  onMute={() => handleConversationAction(conv.id, 'mute')}
                  onPin={() => handleConversationAction(conv.id, 'pin')}
                  onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                  onAddTag={() => console.log('add tag', conv.id)}
                  onCall={() => console.log('call', conv.id)}
                  onOptionsClick={() => setDrawerOpen(true)}
                  onDragStart={() => console.log('drag start', conv.id)}
                />
              ))}
            </div>
          )}

          {/* Si pas de catégories, afficher toutes les conversations */}
          {pinnedConversations.length === 0 && categorizedConversations.length === 0 && (
            <>
              {uncategorizedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isSelected={selectedChat === conv.id}
                  onClick={() => setSelectedChat(conv.id)}
                  onArchive={() => console.log('archive', conv.id)}
                  onDelete={() => console.log('delete', conv.id)}
                  onMarkRead={() => handleConversationAction(conv.id, 'read')}
                  onMute={() => handleConversationAction(conv.id, 'mute')}
                  onPin={() => handleConversationAction(conv.id, 'pin')}
                  onMarkImportant={() => handleConversationAction(conv.id, 'important')}
                  onAddTag={() => console.log('add tag', conv.id)}
                  onCall={() => console.log('call', conv.id)}
                  onOptionsClick={() => setDrawerOpen(true)}
                  onDragStart={() => console.log('drag start', conv.id)}
                />
              ))}
            </>
          )}
        </div>

        {/* Nav */}
        <div className="p-2 border-t flex justify-around" style={{ borderColor: theme.colors.parchment }}>
          <Link href="/v2/chats">
            <Button variant="ghost" size="sm" style={{ color: theme.colors.terracotta }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/feeds">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/communities">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </Button>
          </Link>
          <Link href="/v2/u">
            <Button variant="ghost" size="sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Button>
          </Link>
        </div>
      </div>

      {/* Resizer (desktop uniquement) */}
      <div
        className="hidden md:block w-1 cursor-ew-resize hover:bg-terracotta/50 active:bg-terracotta transition-colors relative group"
        style={{ background: theme.colors.parchment }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = sidebarWidth;

          const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - startX;
            const containerWidth = window.innerWidth;
            const deltaPercent = (deltaX / containerWidth) * 100;
            const newWidth = Math.max(10, Math.min(50, startWidth + deltaPercent));
            setSidebarWidth(newWidth);
          };

          const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
          };

          document.body.style.cursor = 'ew-resize';
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
        }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-1 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: theme.colors.terracotta }}
        />
      </div>

      {/* Chat Area - plein écran sur mobile, caché si pas de conversation sélectionnée */}
      <div
        className={`
          flex-1 flex-col
          ${showMobileChat ? 'flex' : 'hidden md:flex'}
          w-full md:flex-1
        `}
      >
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div
              className="p-4 border-b flex items-center justify-between"
              style={{ borderColor: theme.colors.parchment, background: 'white' }}
            >
              <div className="flex items-center gap-3">
                {/* Bouton retour (mobile uniquement) */}
                <button
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors"
                  style={{ color: theme.colors.charcoal }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {selectedConversation.isGroup ? (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${theme.colors.deepTeal}, ${theme.colors.royalIndigo})` }}
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                ) : (
                  <LanguageOrb code={selectedConversation.languageCode} size="md" pulse={false} />
                )}
                <div>
                  <h2 className="font-semibold" style={{ color: theme.colors.charcoal }}>
                    {selectedConversation.customName || selectedConversation.name}
                  </h2>
                  <span
                    className="text-sm"
                    style={{ color: selectedConversation.isGroup ? theme.colors.textMuted : (selectedConversation.isOnline ? theme.colors.jadeGreen : theme.colors.textMuted) }}
                  >
                    {selectedConversation.isGroup
                      ? `${selectedConversation.participantCount} participants${selectedConversation.hasAnonymousParticipants ? ' · Invités' : ''}`
                      : (selectedConversation.isOnline ? 'En ligne' : 'Hors ligne')
                    }
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" title="Créer un lien">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" title="Appel audio">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" title="Appel vidéo">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" title="Options" onClick={() => setDrawerOpen(true)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4" style={{ background: '#FAFAFA' }}>
              {/* Timestamp séparateur de date */}
              <MessageTimestamp timestamp="2025-01-30T10:30:00" format="datetime" showSeparators />

              {/* Message texte simple */}
              <MessageBubble
                languageCode="ja"
                languageName="Japonais"
                content="こんにちは！今日の会議の準備はできていますか？"
                translations={[
                  { languageCode: 'fr', languageName: 'Français', content: "Bonjour ! Es-tu prête pour la réunion d'aujourd'hui ?" },
                  { languageCode: 'en', languageName: 'English', content: "Hello! Are you ready for today's meeting?" },
                ]}
                sender="Yuki"
                timestamp="10:32"
              />

              {/* Message envoyé avec texte */}
              <MessageBubble
                isSent
                languageCode="fr"
                languageName="Français"
                content="Oui, tout est prêt ! J'ai terminé la présentation hier soir."
                translations={[
                  { languageCode: 'ja', languageName: '日本語', content: 'はい、準備万端です！昨夜プレゼンを完成させました。' },
                  { languageCode: 'en', languageName: 'English', content: "Yes, everything is ready! I finished the presentation last night." },
                ]}
                timestamp="10:33"
              />

              {/* Message avec images dans une bulle */}
              <div className="flex gap-2">
                <div className="flex-shrink-0 relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
                    style={{ background: theme.colors.deepTeal }}
                  >
                    Y
                  </div>
                </div>
                <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-white border border-[#E5E5E5]">
                  {/* Images avec ImageGallery */}
                  <div className="overflow-hidden" style={{ borderRadius: '1rem 1rem 0 0' }}>
                    <ImageGallery
                      images={[
                        { url: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800&h=600&fit=crop', alt: 'Slide 1' },
                        { url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop', alt: 'Slide 2' },
                        { url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop', alt: 'Slide 3' },
                      ]}
                      maxVisible={3}
                    />
                  </div>
                  {/* Texte du message en dessous */}
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-[#2B2D42]">Yuki</span>
                      <LanguageSelectorButton
                        displayedVersion={yukiImagesSelector.displayedVersion}
                        otherVersions={yukiImagesSelector.otherVersions}
                        showLanguageMenu={yukiImagesSelector.showLanguageMenu}
                        setShowLanguageMenu={yukiImagesSelector.setShowLanguageMenu}
                        handleSelectVersion={yukiImagesSelector.handleSelectVersion}
                      />
                    </div>
                    <p className="text-[0.95rem] leading-relaxed" style={{ color: theme.colors.charcoal }}>
                      {yukiImagesSelector.displayedVersion.content}
                    </p>
                    <div className="text-xs mt-2" style={{ color: theme.colors.textMuted }}>10:34</div>
                  </div>
                </div>
              </div>

              {/* Message en réponse avec ReplyPreview */}
              <div className="flex gap-2 flex-row-reverse">
                <div className="max-w-[75%] rounded-2xl rounded-br-md bg-[#E76F51] text-white p-4">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-row-reverse">
                    <LanguageSelectorButton
                      displayedVersion={replyToYukiSelector.displayedVersion}
                      otherVersions={replyToYukiSelector.otherVersions}
                      showLanguageMenu={replyToYukiSelector.showLanguageMenu}
                      setShowLanguageMenu={replyToYukiSelector.setShowLanguageMenu}
                      handleSelectVersion={replyToYukiSelector.handleSelectVersion}
                      isSent
                    />
                  </div>
                  <ReplyPreview
                    authorName="Yuki"
                    content="プレゼンのスライドを送ります！"
                    contentType="image"
                    languageCode="ja"
                    className="mb-3 bg-white/10 border-white/30"
                  />
                  <p className="text-[0.95rem] leading-relaxed">{replyToYukiSelector.displayedVersion.content}</p>
                  <div className="text-xs mt-2 text-white/60">10:35</div>
                </div>
              </div>

              {/* Message audio standalone de Carlos */}
              <StandaloneAudioMessage
                senderName="Carlos"
                senderInitial="C"
                senderColor={theme.colors.terracotta}
                audioSrc="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
                audioDuration={45}
                displayedVersion={carlosAudioSelector.displayedVersion}
                otherVersions={carlosAudioSelector.otherVersions}
                showLanguageMenu={carlosAudioSelector.showLanguageMenu}
                setShowLanguageMenu={carlosAudioSelector.setShowLanguageMenu}
                handleSelectVersion={carlosAudioSelector.handleSelectVersion}
                timestamp="10:36"
              />

              {/* Message texte avec emoji */}
              <MessageBubble
                languageCode="ja"
                languageName="Japonais"
                content="素晴らしい！楽しみにしています 🎉"
                translations={[
                  { languageCode: 'fr', languageName: 'Français', content: "Super ! J'ai hâte d'y être 🎉" },
                  { languageCode: 'es', languageName: 'Español', content: "¡Genial! ¡Estoy deseando que llegue! 🎉" },
                ]}
                sender="Yuki"
                timestamp="10:37"
              />

              {/* Message vidéo standalone (hors bulle) */}
              <StandaloneVideoMessage
                senderName="Emma"
                senderInitial="E"
                senderColor={theme.colors.royalIndigo}
                videoSrc="https://www.w3schools.com/html/mov_bbb.mp4"
                poster="https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=225&fit=crop"
                displayedVersion={emmaVideoSelector.displayedVersion}
                otherVersions={emmaVideoSelector.otherVersions}
                showLanguageMenu={emmaVideoSelector.showLanguageMenu}
                setShowLanguageMenu={emmaVideoSelector.setShowLanguageMenu}
                handleSelectVersion={emmaVideoSelector.handleSelectVersion}
                timestamp="10:38"
              />

              {/* Message audio standalone envoyé */}
              <StandaloneAudioMessage
                senderColor={theme.colors.terracotta}
                audioSrc="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
                audioDuration={32}
                displayedVersion={myAudioSelector.displayedVersion}
                otherVersions={myAudioSelector.otherVersions}
                showLanguageMenu={myAudioSelector.showLanguageMenu}
                setShowLanguageMenu={myAudioSelector.setShowLanguageMenu}
                handleSelectVersion={myAudioSelector.handleSelectVersion}
                timestamp="10:39"
                isSent
              />

              {/* Message anonyme */}
              <MessageBubble
                languageCode="es"
                languageName="Espagnol"
                content="¡Hola! ¿Puedo unirme a la reunión también?"
                translations={[
                  { languageCode: 'fr', languageName: 'Français', content: "Salut ! Est-ce que je peux me joindre à la réunion aussi ?" },
                  { languageCode: 'ja', languageName: '日本語', content: 'こんにちは！私も会議に参加してもいいですか？' },
                  { languageCode: 'en', languageName: 'English', content: 'Hi! Can I join the meeting too?' },
                ]}
                sender="Invité"
                isAnonymous={true}
                timestamp="10:40"
              />

              {/* Message en réponse à un audio */}
              <div className="flex gap-2 flex-row-reverse">
                <div className="max-w-[75%] rounded-2xl rounded-br-md bg-[#E76F51] text-white p-4">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-row-reverse">
                    <LanguageSelectorButton
                      displayedVersion={replyToCarlosSelector.displayedVersion}
                      otherVersions={replyToCarlosSelector.otherVersions}
                      showLanguageMenu={replyToCarlosSelector.showLanguageMenu}
                      setShowLanguageMenu={replyToCarlosSelector.setShowLanguageMenu}
                      handleSelectVersion={replyToCarlosSelector.handleSelectVersion}
                      isSent
                    />
                  </div>
                  <ReplyPreview
                    authorName="Carlos"
                    content=""
                    contentType="audio"
                    languageCode="es"
                    className="mb-3 bg-white/10 border-white/30"
                  />
                  <p className="text-[0.95rem] leading-relaxed">{replyToCarlosSelector.displayedVersion.content}</p>
                  <div className="text-xs mt-2 text-white/60">10:41</div>
                </div>
              </div>

              {/* Message avec plusieurs images */}
              <div className="flex gap-2">
                <div className="flex-shrink-0 relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
                    style={{ background: theme.colors.jadeGreen }}
                  >
                    A
                  </div>
                </div>
                <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-white border border-[#E5E5E5]">
                  {/* Images avec ImageGallery */}
                  <div className="overflow-hidden" style={{ borderRadius: '1rem 1rem 0 0' }}>
                    <ImageGallery
                      images={[
                        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=600&fit=crop', alt: 'Meeting 1' },
                        { url: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&h=600&fit=crop', alt: 'Meeting 2' },
                        { url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&h=600&fit=crop', alt: 'Meeting 3' },
                        { url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=600&fit=crop', alt: 'Meeting 4' },
                        { url: 'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=800&h=600&fit=crop', alt: 'Meeting 5' },
                      ]}
                      maxVisible={4}
                    />
                  </div>
                  {/* Texte du message */}
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold text-[#2B2D42]">Ahmed</span>
                      <LanguageSelectorButton
                        displayedVersion={ahmedImagesSelector.displayedVersion}
                        otherVersions={ahmedImagesSelector.otherVersions}
                        showLanguageMenu={ahmedImagesSelector.showLanguageMenu}
                        setShowLanguageMenu={ahmedImagesSelector.setShowLanguageMenu}
                        handleSelectVersion={ahmedImagesSelector.handleSelectVersion}
                      />
                    </div>
                    <p className="text-[0.95rem] leading-relaxed" style={{ color: theme.colors.charcoal }}>
                      {ahmedImagesSelector.displayedVersion.content}
                    </p>
                    <div className="text-xs mt-2" style={{ color: theme.colors.textMuted }}>10:42</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Zone de composition de message */}
            <MessageComposer
              value={message}
              onChange={setMessage}
              onSend={(msg, attachments) => {
                console.log('Message envoyé:', msg, attachments);
                setMessage('');
              }}
              placeholder="Écrivez votre message..."
              userLanguage="FR"
              showVoice={true}
              showLocation={true}
              showAttachment={true}
              onAttachmentClick={() => console.log('Ajouter pièce jointe')}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ background: '#FAFAFA' }}>
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: theme.colors.parchment }}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: theme.colors.textMuted }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p style={{ color: theme.colors.textMuted }}>Sélectionnez une conversation</p>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      <ConversationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversationName={selectedConversation?.customName || selectedConversation?.name || ''}
        onNameChange={(name) => console.log('Name changed:', name)}
        notificationLevel={drawerNotifications}
        onNotificationChange={setDrawerNotifications}
        themeColor={drawerTheme}
        availableColors={availableThemeColors}
        onThemeChange={setDrawerTheme}
        categories={categories}
        selectedCategoryId={drawerCategoryId}
        onCategorySelect={setDrawerCategoryId}
        onCategoryCreate={(name) => console.log('Create category:', name)}
        onCategoryDelete={(id) => console.log('Delete category:', id)}
        tags={tags}
        selectedTagIds={drawerTagIds}
        onTagSelect={(id) => setDrawerTagIds((prev) => [...prev, id])}
        onTagDeselect={(id) => setDrawerTagIds((prev) => prev.filter((t) => t !== id))}
        onTagCreate={(name) => console.log('Create tag:', name)}
        onTagDelete={(id) => console.log('Delete tag:', id)}
        onSettingsClick={() => console.log('Settings clicked')}
        onProfileClick={() => console.log('Profile clicked')}
        onSearchClick={() => console.log('Search clicked')}
        onBlockClick={() => console.log('Block clicked')}
        onReportClick={() => console.log('Report clicked')}
      />

      {/* Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}
