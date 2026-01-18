'use client';

/**
 * MediaSettings Component
 * Unified media settings with accordion sections for Audio, Video, and Documents
 *
 * Features:
 * - Type "multiple" accordion (multiple sections open simultaneously)
 * - Reuses existing components: AudioSettings, VideoSettings, DocumentSettings
 * - Icons for each section
 * - i18n support for titles and descriptions
 * - Keyboard navigation and ARIA labels
 * - Responsive design
 * - Optional localStorage for accordion state persistence
 */

import { useState, useEffect, useCallback } from 'react';
import { Mic, Video, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { AudioSettings } from './audio-settings';
import { VideoSettings } from './VideoSettings';
import { DocumentSettings } from './DocumentSettings';
import { useI18n } from '@/hooks/use-i18n';

const STORAGE_KEY = 'meeshy:media-settings:accordion-state';

// Map hash fragments to accordion section values
const HASH_TO_SECTION: Record<string, string> = {
  'media-audio': 'audio',
  'media-video': 'video',
  'media-document': 'document',
};

/**
 * Extract accordion section from URL hash
 * Supports patterns: #media-audio, #media-video, #media-document
 */
function getSectionFromHash(): string | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash.replace('#', '');
  return HASH_TO_SECTION[hash] || null;
}

/**
 * MediaSettings Component
 * Groups Audio, Video, and Document settings in a single tabbed interface with accordion sections
 *
 * Hash Navigation:
 * - #media - Opens media tab
 * - #media-audio - Opens media tab with audio section expanded
 * - #media-video - Opens media tab with video section expanded
 * - #media-document - Opens media tab with document section expanded
 */
export function MediaSettings() {
  const { t } = useI18n('settings');

  // Load accordion state from localStorage or URL hash
  const [openSections, setOpenSections] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];

    // Priority 1: Check URL hash for specific section
    const sectionFromHash = getSectionFromHash();
    if (sectionFromHash) {
      return [sectionFromHash];
    }

    // Priority 2: Load from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('[MediaSettings] Error loading accordion state:', error);
      return [];
    }
  });

  // Save accordion state to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openSections));
    } catch (error) {
      console.error('[MediaSettings] Error saving accordion state:', error);
    }
  }, [openSections]);

  // Listen for hash changes to open specific sections
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHashChange = () => {
      const sectionFromHash = getSectionFromHash();
      if (sectionFromHash && !openSections.includes(sectionFromHash)) {
        // Open the section specified in the hash
        setOpenSections(prev => [...prev, sectionFromHash]);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [openSections]);

  const handleValueChange = useCallback((value: string[]) => {
    setOpenSections(value);
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">
            {t('media.title', 'Media & Files')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('media.description', 'Configure audio, video and document settings')}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Accordion Sections */}
      <Accordion
        type="multiple"
        value={openSections}
        onValueChange={handleValueChange}
        className="space-y-4"
      >
        {/* Audio Section */}
        <AccordionItem
          value="audio"
          className="border rounded-lg bg-card"
        >
          <AccordionTrigger
            className="px-4 sm:px-6 hover:no-underline"
            aria-label={t('media.sections.audio.title', 'Audio & Transcription')}
          >
            <div className="flex items-center gap-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Mic className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base sm:text-lg">
                  {t('media.sections.audio.title', 'Audio & Transcription')}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground font-normal">
                  {t(
                    'media.sections.audio.description',
                    'Voice messages, transcription, TTS and voice cloning'
                  )}
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 sm:px-6 pb-4">
            <AudioSettings />
          </AccordionContent>
        </AccordionItem>

        {/* Video Section */}
        <AccordionItem
          value="video"
          className="border rounded-lg bg-card"
        >
          <AccordionTrigger
            className="px-4 sm:px-6 hover:no-underline"
            aria-label={t('media.sections.video.title', 'Video & Calls')}
          >
            <div className="flex items-center gap-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Video className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base sm:text-lg">
                  {t('media.sections.video.title', 'Video & Calls')}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground font-normal">
                  {t(
                    'media.sections.video.description',
                    'Video quality, effects and call settings'
                  )}
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 sm:px-6 pb-4">
            <VideoSettings />
          </AccordionContent>
        </AccordionItem>

        {/* Document Section */}
        <AccordionItem
          value="document"
          className="border rounded-lg bg-card"
        >
          <AccordionTrigger
            className="px-4 sm:px-6 hover:no-underline"
            aria-label={t('media.sections.document.title', 'Documents & Files')}
          >
            <div className="flex items-center gap-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base sm:text-lg">
                  {t('media.sections.document.title', 'Documents & Files')}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground font-normal">
                  {t(
                    'media.sections.document.description',
                    'Download, preview and storage settings'
                  )}
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 sm:px-6 pb-4">
            <DocumentSettings />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
