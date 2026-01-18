/**
 * Helper pour créer des utilisateurs de test avec différents niveaux de consentement
 * Facilite les tests E2E de validation de consentement
 */

import { PrismaClient } from '@prisma/client';

export interface ConsentLevel {
  name: string;
  description: string;
  consents: {
    dataProcessingConsentAt?: Date;
    voiceDataConsentAt?: Date;
    voiceProfileConsentAt?: Date;
    voiceCloningConsentAt?: Date;
    thirdPartyServicesConsentAt?: Date;
    audioTranscriptionEnabledAt?: Date;
    textTranslationEnabledAt?: Date;
    audioTranslationEnabledAt?: Date;
    translatedAudioGenerationEnabledAt?: Date;
    voiceCloningEnabledAt?: Date;
  };
}

/**
 * Niveaux de consentement prédéfinis pour les tests
 */
export const CONSENT_LEVELS: Record<string, ConsentLevel> = {
  NONE: {
    name: 'No Consents',
    description: 'User has given no consents at all',
    consents: {}
  },

  BASIC: {
    name: 'Basic Data Processing',
    description: 'User has only given basic data processing consent',
    consents: {
      dataProcessingConsentAt: new Date()
    }
  },

  VOICE_DATA: {
    name: 'Voice Data Consent',
    description: 'User can use voice features but not transcription yet',
    consents: {
      dataProcessingConsentAt: new Date(),
      voiceDataConsentAt: new Date()
    }
  },

  TRANSCRIPTION: {
    name: 'Audio Transcription',
    description: 'User can transcribe audio messages',
    consents: {
      dataProcessingConsentAt: new Date(),
      voiceDataConsentAt: new Date(),
      audioTranscriptionEnabledAt: new Date()
    }
  },

  TEXT_TRANSLATION: {
    name: 'Text Translation',
    description: 'User can translate text messages',
    consents: {
      dataProcessingConsentAt: new Date(),
      textTranslationEnabledAt: new Date()
    }
  },

  AUDIO_TRANSLATION: {
    name: 'Audio Translation',
    description: 'User can translate audio to text in another language',
    consents: {
      dataProcessingConsentAt: new Date(),
      voiceDataConsentAt: new Date(),
      audioTranscriptionEnabledAt: new Date(),
      textTranslationEnabledAt: new Date(),
      audioTranslationEnabledAt: new Date()
    }
  },

  TTS: {
    name: 'Text-to-Speech',
    description: 'User can generate translated audio',
    consents: {
      dataProcessingConsentAt: new Date(),
      voiceDataConsentAt: new Date(),
      audioTranscriptionEnabledAt: new Date(),
      textTranslationEnabledAt: new Date(),
      audioTranslationEnabledAt: new Date(),
      translatedAudioGenerationEnabledAt: new Date()
    }
  },

  VOICE_PROFILE: {
    name: 'Voice Profile',
    description: 'User can create a voice profile',
    consents: {
      dataProcessingConsentAt: new Date(),
      voiceDataConsentAt: new Date(),
      voiceProfileConsentAt: new Date()
    }
  },

  VOICE_CLONING: {
    name: 'Voice Cloning',
    description: 'User can use voice cloning features',
    consents: {
      dataProcessingConsentAt: new Date(),
      voiceDataConsentAt: new Date(),
      voiceProfileConsentAt: new Date(),
      voiceCloningConsentAt: new Date(),
      voiceCloningEnabledAt: new Date()
    }
  },

  FULL: {
    name: 'All Consents',
    description: 'User has given all possible consents',
    consents: {
      dataProcessingConsentAt: new Date(),
      voiceDataConsentAt: new Date(),
      voiceProfileConsentAt: new Date(),
      voiceCloningConsentAt: new Date(),
      thirdPartyServicesConsentAt: new Date(),
      audioTranscriptionEnabledAt: new Date(),
      textTranslationEnabledAt: new Date(),
      audioTranslationEnabledAt: new Date(),
      translatedAudioGenerationEnabledAt: new Date(),
      voiceCloningEnabledAt: new Date()
    }
  }
};

/**
 * Crée un utilisateur de test avec un niveau de consentement spécifique
 */
export async function createTestUserWithConsents(
  prisma: PrismaClient,
  consentLevel: ConsentLevel,
  overrides?: Partial<{
    username: string;
    email: string;
    displayName: string;
  }>
) {
  const timestamp = Date.now();
  const user = await prisma.user.create({
    data: {
      username: overrides?.username || `test_${consentLevel.name.toLowerCase()}_${timestamp}`,
      email: overrides?.email || `test_${timestamp}@example.com`,
      passwordHash: 'test_hash',
      displayName: overrides?.displayName || `Test ${consentLevel.name}`,
      ...consentLevel.consents
    }
  });

  return user;
}

/**
 * Met à jour les consentements d'un utilisateur existant
 */
export async function updateUserConsents(
  prisma: PrismaClient,
  userId: string,
  consentLevel: ConsentLevel
) {
  return prisma.user.update({
    where: { id: userId },
    data: consentLevel.consents
  });
}

/**
 * Retire tous les consentements d'un utilisateur
 */
export async function revokeAllConsents(prisma: PrismaClient, userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      dataProcessingConsentAt: null,
      voiceDataConsentAt: null,
      voiceProfileConsentAt: null,
      voiceCloningConsentAt: null,
      thirdPartyServicesConsentAt: null,
      audioTranscriptionEnabledAt: null,
      textTranslationEnabledAt: null,
      audioTranslationEnabledAt: null,
      translatedAudioGenerationEnabledAt: null,
      voiceCloningEnabledAt: null
    }
  });
}

/**
 * Vérifie si un utilisateur a un consentement spécifique
 */
export async function hasConsent(
  prisma: PrismaClient,
  userId: string,
  consentField: keyof ConsentLevel['consents']
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { [consentField]: true }
  });

  return user?.[consentField] !== null && user?.[consentField] !== undefined;
}

/**
 * Obtient l'état de consentement d'un utilisateur (utile pour debug)
 */
export async function getUserConsentStatus(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      dataProcessingConsentAt: true,
      voiceDataConsentAt: true,
      voiceProfileConsentAt: true,
      voiceCloningConsentAt: true,
      thirdPartyServicesConsentAt: true,
      audioTranscriptionEnabledAt: true,
      textTranslationEnabledAt: true,
      audioTranslationEnabledAt: true,
      translatedAudioGenerationEnabledAt: true,
      voiceCloningEnabledAt: true
    }
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  return {
    hasDataProcessingConsent: !!user.dataProcessingConsentAt,
    hasVoiceDataConsent: !!user.voiceDataConsentAt,
    hasVoiceProfileConsent: !!user.voiceProfileConsentAt,
    hasVoiceCloningConsent: !!user.voiceCloningConsentAt,
    hasThirdPartyServicesConsent: !!user.thirdPartyServicesConsentAt,
    canTranscribeAudio: !!user.audioTranscriptionEnabledAt,
    canTranslateText: !!user.textTranslationEnabledAt,
    canTranslateAudio: !!user.audioTranslationEnabledAt,
    canGenerateTranslatedAudio: !!user.translatedAudioGenerationEnabledAt,
    canUseVoiceCloning: !!user.voiceCloningEnabledAt,
    consents: user
  };
}

/**
 * Crée un scénario de test avec plusieurs utilisateurs à différents niveaux
 */
export async function createConsentTestScenario(prisma: PrismaClient) {
  const users = await Promise.all([
    createTestUserWithConsents(prisma, CONSENT_LEVELS.NONE),
    createTestUserWithConsents(prisma, CONSENT_LEVELS.BASIC),
    createTestUserWithConsents(prisma, CONSENT_LEVELS.TRANSCRIPTION),
    createTestUserWithConsents(prisma, CONSENT_LEVELS.AUDIO_TRANSLATION),
    createTestUserWithConsents(prisma, CONSENT_LEVELS.TTS),
    createTestUserWithConsents(prisma, CONSENT_LEVELS.VOICE_CLONING),
    createTestUserWithConsents(prisma, CONSENT_LEVELS.FULL)
  ]);

  return {
    noConsent: users[0],
    basicConsent: users[1],
    transcription: users[2],
    audioTranslation: users[3],
    tts: users[4],
    voiceCloning: users[5],
    fullConsent: users[6]
  };
}

/**
 * Nettoie tous les utilisateurs de test créés
 */
export async function cleanupTestUsers(prisma: PrismaClient, userIds: string[]) {
  // Supprimer d'abord les préférences
  await prisma.userPreferences.deleteMany({
    where: { userId: { in: userIds } }
  });

  // Puis supprimer les utilisateurs
  await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });
}
