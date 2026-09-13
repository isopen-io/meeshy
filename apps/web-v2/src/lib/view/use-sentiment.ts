import { useCallback, useEffect, useRef, useState } from 'react';

import { sentimentOf, type SentimentLevel } from '@/lib/send/sentiment';

/** `TextAnalyzer.debounceInterval` (`TextAnalyzer.swift:82`, 0,3 s). */
export const SENTIMENT_DEBOUNCE_MS = 300;

/**
 * LA TONALITÉ, DÉBOUNCÉE (#6175) — miroir `TextAnalyzer.analyze(text:)` :
 * texte vidé ⇒ `neutral` IMMÉDIAT (`:104-119`) ; sinon un calcul 300 ms après
 * la dernière frappe (`:139-148`). Indicateur PASSIF : ce hook ne fait que
 * dire ce que la rangée haute RENDRA en lecture seule.
 */
export function useSentiment(text: string): SentimentLevel {
  const [level, setLevel] = useState<SentimentLevel>('neutral');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clear();
    if (text.trim() === '') {
      setLevel('neutral');
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setLevel(sentimentOf(text));
    }, SENTIMENT_DEBOUNCE_MS);
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clear` est stable (useCallback sans dépendance).
  }, [text]);

  useEffect(() => clear, [clear]);

  return level;
}
