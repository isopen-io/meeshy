/**
 * ZMQ Translation Client - Public API
 * Exports sélectifs pour une API propre et maintenable
 *
 * IMPORTANT: Pas de barrel exports (*) pour éviter les problèmes de dépendances circulaires
 */

// Export principal client
export { ZmqTranslationClient } from './ZmqTranslationClient';

// Export types publics (PAS le client lui-même en type)
export type {
  // Translation types
  TranslationRequest,
  TranslationResult,
  TranslationCompletedEvent,
  TranslationErrorEvent,
  TranslationEvent,

  // Audio types
  AudioProcessRequest,
  TranscriptionData,
  TranslatedAudioData,
  AudioProcessCompletedEvent,
  AudioProcessErrorEvent,
  AudioEvent,

  // Transcription types
  TranscriptionOnlyRequest,
  TranscriptionCompletedEvent,
  TranscriptionErrorEvent,
  TranscriptionEvent,

  // Voice API types
  VoiceAPIRequest,
  VoiceAPISuccessEvent,
  VoiceAPIErrorEvent,
  VoiceJobProgressEvent,

  // Voice Profile types
  VoiceProfileRequest,
  VoiceProfileAnalyzeRequest,
  VoiceProfileVerifyRequest,
  VoiceProfileCompareRequest,
  VoiceProfileAnalyzeResult,
  VoiceProfileVerifyResult,
  VoiceProfileCompareResult,
  VoiceProfileErrorEvent,
  VoiceProfileEvent,
  VoiceProfileTranscription,
  VoicePreviewSampleZMQ,

  // Unified types
  VoiceEvent,
  ZMQEvent,

  // Binary frame types
  BinaryFrameInfo,
  PongEvent
} from './types';

// Export constants
export { AUDIO_BASE64_SIZE_THRESHOLD } from './types';

// Export stats type from client
export type { ZMQClientStats } from './ZmqTranslationClient';

// Note: Les modules internes (ZmqConnectionManager, ZmqMessageHandler, ZmqRequestSender)
// ne sont PAS exportés car ce sont des détails d'implémentation
