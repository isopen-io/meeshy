/**
 * ZMQ Translation Client - Public API
 * Exports sélectifs pour une API propre et maintenable
 */

// Export principal client
export { ZmqTranslationClient } from './ZmqTranslationClient';
export type { ZMQClientConfig, ZMQClientStats } from './ZmqTranslationClient';

// Export types publics
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

// Export configuration types (useful for advanced users)
export type { ConnectionPoolConfig, ConnectionPoolStats } from './ZmqConnectionPool';
export type { RetryConfig, RetryStats } from './ZmqRetryHandler';

// Note: ZmqConnectionPool et ZmqRetryHandler ne sont PAS exportés
// car ils sont des détails d'implémentation internes
