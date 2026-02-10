'use client';

import { useEffect } from 'react';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';

/**
 * Syncs the <html lang="..."> attribute with the user's interface language.
 * Mounted in root layout to keep the document lang always up-to-date.
 */
export function HtmlLangSync() {
  const lang = useCurrentInterfaceLanguage();

  useEffect(() => {
    if (lang && document.documentElement.lang !== lang) {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  return null;
}
