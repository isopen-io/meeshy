import type { SpeechSource } from './call-captions-controller';

/**
 * **LA RECONNAISSANCE VOCALE DU NAVIGATEUR** (#8048) — l'API Web Speech
 * (`SpeechRecognition`, préfixée `webkitSpeechRecognition` dans Chrome, Edge et
 * Safari) derrière la forme `SpeechSource` du contrôleur. DÉTECTÉE, jamais
 * supposée : Firefox et la WebView de la coque Android ne l'ont pas — on y
 * reçoit les sous-titres des autres, on n'y émet pas les siens.
 *
 * La reconnaissance continue s'arrête d'elle-même après un silence : elle est
 * relancée tant que la capture est voulue, et abandonnée après cinq relances
 * de suite sans un seul résultat (service injoignable — une boucle serrée ne
 * doit pas tourner tout l'appel).
 */

type Alternative = { readonly transcript: string; readonly confidence: number };
type Result = { readonly isFinal: boolean; readonly length: number; readonly [index: number]: Alternative };
type ResultEvent = { readonly resultIndex: number; readonly results: { readonly length: number; readonly [index: number]: Result } };

export type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: ResultEvent) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};

export type RecognitionConstructor = new () => Recognition;

export const SPEECH_RESTARTS_WITHOUT_RESULT = 5;

const DENIED = new Set(['not-allowed', 'service-not-allowed']);
const FATAL = new Set(['language-not-supported', 'audio-capture']);

export function recognitionOf(scope: object | null): RecognitionConstructor | null {
  if (scope === null) return null;
  const found = (scope as { readonly SpeechRecognition?: unknown; readonly webkitSpeechRecognition?: unknown }).SpeechRecognition ?? (scope as { readonly webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  return typeof found === 'function' ? (found as RecognitionConstructor) : null;
}

export function browserSpeech(Constructor: RecognitionConstructor | null): SpeechSource | null {
  if (Constructor === null) return null;
  return ({ language, onResult, onFailure }) => {
    let wanted = true;
    let idleRestarts = 0;
    let current: Recognition | null = null;
    const fail = (reason: 'denied' | 'unavailable'): void => {
      wanted = false;
      onFailure(reason);
    };
    const begin = (): void => {
      const recognition = new Constructor();
      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        idleRestarts = 0;
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const best = result?.[0];
          if (result !== undefined && best !== undefined) onResult({ text: best.transcript, isFinal: result.isFinal, confidence: best.confidence });
        }
      };
      recognition.onerror = (event) => {
        if (DENIED.has(event.error)) fail('denied');
        else if (FATAL.has(event.error)) fail('unavailable');
      };
      recognition.onend = () => {
        if (!wanted || current !== recognition) return;
        idleRestarts += 1;
        if (idleRestarts > SPEECH_RESTARTS_WITHOUT_RESULT) fail('unavailable');
        else begin();
      };
      current = recognition;
      try {
        recognition.start();
      } catch {
        fail('unavailable');
      }
    };
    begin();
    return {
      stop: () => {
        wanted = false;
        const recognition = current;
        current = null;
        if (recognition === null) return;
        recognition.onresult = null;
        recognition.onend = null;
        recognition.abort();
      },
    };
  };
}
