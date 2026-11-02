import type { EventEmitter } from 'events';
import type { TranslationRequest, TranslationResult } from '../zmq-translation';
import { UntranslatableRequestError } from '../zmq-translation/ZmqRequestSender';
import { translationTargetId } from '../zmq-translation/utils/zmq-helpers';
import type { TranslationStats } from './TranslationStats';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { guardedTimeout } from '../../utils/guarded-timer';

const logger = enhancedLogger.child({ module: 'MessageTranslationService' });

const RESPONSE_TIMEOUT_MS = 10_000;

type DirectTranslationClient = Pick<EventEmitter, 'on' | 'removeListener'> & {
  sendTranslationRequest(request: TranslationRequest): Promise<string>;
};

export type DirectTextTranslationDeps = {
  readonly zmqClient: DirectTranslationClient;
  readonly stats: TranslationStats;
  readonly normalizeSourceLanguage: (language: string) => string;
};

export type DirectTextTranslationInput = {
  readonly text: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly modelType: string;
};

class UnsupportedPairRefusal extends Error {}

/**
 * Une paire que NLLB-200 ne sert pas (#3659) rend l'ORIGINAL dans sa langue
 * (règle 1 du Prisme), sous la forme du « rien à traduire » que
 * `POST /translate-blocking` sert déjà pour `source = cible` : jamais un
 * `"[BYV] <texte>"` présenté comme une traduction.
 */
export const untranslatedResult = (text: string, sourceLanguage: string): TranslationResult => ({
  messageId: `untranslatable_${Date.now()}`,
  translatedText: text,
  sourceLanguage,
  targetLanguage: sourceLanguage,
  confidenceScore: 1,
  processingTime: 0,
  modelType: 'none',
});

/**
 * `zmqClient` est un singleton partagé : les TROIS listeners se détachent sur
 * CHAQUE issue (succès, erreur, refus terminal, ET timeout) par un unique
 * `cleanup()` — un listener fui par requête expirée finissait en
 * MaxListenersExceededWarning et en closures périmées.
 */
const awaitResponse = (zmqClient: DirectTranslationClient, taskId: string): Promise<TranslationResult> =>
  new Promise<TranslationResult>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      zmqClient.removeListener('translationCompleted', handleResponse);
      zmqClient.removeListener('translationError', handleError);
      zmqClient.removeListener('translationUnsupported', handleUnsupported);
    };

    const timeout = guardedTimeout({ name: 'translation-response-timeout', afterMs: RESPONSE_TIMEOUT_MS, logger, run: () => {
      cleanup();
      reject(new Error('Timeout waiting for translation response'));
    } });

    const handleResponse = (data: { taskId?: string; result: TranslationResult }) => {
      if (data.taskId !== taskId) return;
      cleanup();
      resolve(data.result);
    };

    const handleError = (data: { taskId?: string; error?: string }) => {
      if (data.taskId !== taskId) return;
      cleanup();
      reject(new Error(`Translation error: ${data.error}`));
    };

    const handleUnsupported = (data: { taskId?: string }) => {
      if (data.taskId !== taskId) return;
      cleanup();
      reject(new UnsupportedPairRefusal());
    };

    zmqClient.on('translationCompleted', handleResponse);
    zmqClient.on('translationError', handleError);
    zmqClient.on('translationUnsupported', handleUnsupported);
  });

const isUnsupportedPair = (error: unknown): boolean =>
  error instanceof UntranslatableRequestError || error instanceof UnsupportedPairRefusal;

export async function translateTextDirectly(
  deps: DirectTextTranslationDeps,
  input: DirectTextTranslationInput
): Promise<TranslationResult> {
  const { text, sourceLanguage, targetLanguage, modelType } = input;
  try {
    const request: TranslationRequest = {
      messageId: translationTargetId('direct-text', `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`),
      text,
      sourceLanguage: deps.normalizeSourceLanguage(sourceLanguage),
      targetLanguages: [targetLanguage],
      conversationId: 'rest-request',
      modelType
    };

    const taskId = await deps.zmqClient.sendTranslationRequest(request);
    deps.stats.incrementRequestsSent();
    return await awaitResponse(deps.zmqClient, taskId);
  } catch (error) {
    if (isUnsupportedPair(error)) return untranslatedResult(text, sourceLanguage);

    logger.error(`❌ [REST] Erreur traduction directe: ${error}`);
    deps.stats.incrementErrors();
    return {
      messageId: `fallback_${Date.now()}`,
      translatedText: `[${targetLanguage.toUpperCase()}] ${text}`,
      sourceLanguage,
      targetLanguage,
      confidenceScore: 0.1,
      processingTime: 0.001,
      modelType: 'fallback'
    };
  }
}
