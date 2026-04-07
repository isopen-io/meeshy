import type { ToneProfile } from '../graph/state';

type GlobalProfile = {
  personaSummary: string | null;
  tone: string | null;
  vocabularyLevel: string | null;
  typicalLength: string | null;
  emojiUsage: string | null;
  catchphrases: string[];
  topicsOfExpertise: string[];
  topicsAvoided: string[];
  responsePatterns: string[];
  responseTriggers?: string[];
  commonEmojis: string[];
  reactionPatterns: string[];
  messagesAnalyzed: number;
  confidence: number;
  locked: boolean;
};

type ConversationOverride = {
  overrideTone: string | null;
  overrideVocabularyLevel: string | null;
  overrideTypicalLength: string | null;
  overrideEmojiUsage: string | null;
  confidence?: number;
};

export type MergedProfile = {
  personaSummary: string;
  tone: string;
  vocabularyLevel: string;
  typicalLength: string;
  emojiUsage: string;
  catchphrases: string[];
  topicsOfExpertise: string[];
  topicsAvoided: string[];
  commonEmojis: string[];
  reactionPatterns: string[];
  confidence: number;
};

export function mergeProfile(global: GlobalProfile | null, override: ConversationOverride | null): MergedProfile {
  const defaultProfile: MergedProfile = {
    personaSummary: '',
    tone: 'neutre',
    vocabularyLevel: 'courant',
    typicalLength: 'court',
    emojiUsage: 'occasionnel',
    catchphrases: [],
    topicsOfExpertise: [],
    topicsAvoided: [],
    commonEmojis: [],
    reactionPatterns: [],
    confidence: 0,
  };

  if (!global) return defaultProfile;

  return {
    personaSummary: global.personaSummary ?? defaultProfile.personaSummary,
    tone: override?.overrideTone ?? global.tone ?? defaultProfile.tone,
    vocabularyLevel: override?.overrideVocabularyLevel ?? global.vocabularyLevel ?? defaultProfile.vocabularyLevel,
    typicalLength: override?.overrideTypicalLength ?? global.typicalLength ?? defaultProfile.typicalLength,
    emojiUsage: override?.overrideEmojiUsage ?? global.emojiUsage ?? defaultProfile.emojiUsage,
    catchphrases: global.catchphrases,
    topicsOfExpertise: global.topicsOfExpertise,
    topicsAvoided: global.topicsAvoided,
    commonEmojis: global.commonEmojis,
    reactionPatterns: global.reactionPatterns,
    confidence: Math.max(global.confidence, override?.confidence ?? 0),
  };
}

export function toneProfileToGlobalFields(profile: ToneProfile) {
  return {
    personaSummary: profile.personaSummary || null,
    tone: profile.tone || null,
    vocabularyLevel: profile.vocabularyLevel || null,
    typicalLength: profile.typicalLength || null,
    emojiUsage: profile.emojiUsage || null,
    catchphrases: profile.catchphrases,
    topicsOfExpertise: profile.topicsOfExpertise,
    topicsAvoided: profile.topicsAvoided,
    responsePatterns: profile.responseTriggers,
    commonEmojis: profile.commonEmojis,
    reactionPatterns: profile.reactionPatterns,
    messagesAnalyzed: profile.messagesAnalyzed,
    confidence: profile.confidence,
    locked: profile.locked,
  };
}
