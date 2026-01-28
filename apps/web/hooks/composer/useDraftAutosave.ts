import { useState, useEffect, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';

interface UseDraftAutosaveProps {
  conversationId?: string;
  enabled?: boolean;
}

interface DraftData {
  content: string;
  timestamp: number;
}

const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const useDraftAutosave = ({
  conversationId,
  enabled = true
}: UseDraftAutosaveProps) => {
  const [draft, setDraft] = useState<string>('');
  const storageKey = conversationId ? `draft-${conversationId}` : null;

  // Restore draft on mount
  useEffect(() => {
    if (!storageKey || !enabled) return;

    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;

      const parsed: DraftData = JSON.parse(saved);
      const age = Date.now() - parsed.timestamp;

      if (age > DRAFT_EXPIRY_MS) {
        localStorage.removeItem(storageKey);
        return;
      }

      setDraft(parsed.content);
    } catch (error) {
      console.error('Failed to restore draft:', error);
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
    }
  }, [storageKey, enabled]);

  // Save draft with debounce
  const saveDraftDebounced = useDebouncedCallback((content: string) => {
    if (!storageKey || !enabled) return;

    try {
      if (!content.trim()) {
        localStorage.removeItem(storageKey);
        return;
      }

      const data: DraftData = {
        content,
        timestamp: Date.now()
      };

      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, 2000); // 2 seconds debounce

  const saveDraft = useCallback((content: string) => {
    setDraft(content);
    saveDraftDebounced(content);
  }, [saveDraftDebounced]);

  const clearDraft = useCallback(() => {
    setDraft('');
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return {
    draft,
    saveDraft,
    clearDraft,
  };
};
