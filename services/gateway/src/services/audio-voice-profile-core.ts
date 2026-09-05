/**
 * Le noyau des deux gestes de profil vocal (`AudioTranslateService.getVoiceProfile`
 * / `.saveVoiceProfile`), extrait pour ramener `AudioTranslateService.ts` sous le
 * budget de taille (#5265 — la même forme que #4713 : le geste délègue à un
 * noyau qui ne connaît que Prisma, rien n'est réimplanté, donc rien ne peut
 * diverger). Corps déplacé tel quel, sans changement de comportement.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

export async function getVoiceProfile(prisma: PrismaClient, userId: string): Promise<any | null> {
  return prisma.userVoiceModel.findUnique({
    where: { userId }
  });
}

export async function saveVoiceProfile(
  prisma: PrismaClient,
  userId: string,
  profileData: {
    embedding?: Buffer;
    qualityScore?: number;
    audioCount?: number;
    totalDurationMs?: number;
    fingerprint?: Record<string, any>;
    voiceCharacteristics?: Record<string, any>;
    chatterboxConditionals?: Buffer;
    referenceAudioId?: string;
    referenceAudioUrl?: string;
  }
): Promise<any> {
  return prisma.userVoiceModel.upsert({
    where: { userId },
    create: {
      userId,
      profileId: `vfp_${userId}`,
      embedding: profileData.embedding ? Uint8Array.from(profileData.embedding) as Uint8Array<ArrayBuffer> : undefined,
      qualityScore: profileData.qualityScore || 0,
      audioCount: profileData.audioCount || 1,
      totalDurationMs: profileData.totalDurationMs || 0,
      fingerprint: profileData.fingerprint || null,
      voiceCharacteristics: profileData.voiceCharacteristics || null,
      chatterboxConditionals: profileData.chatterboxConditionals ? Uint8Array.from(profileData.chatterboxConditionals) as Uint8Array<ArrayBuffer> : null,
      referenceAudioId: profileData.referenceAudioId || null,
      referenceAudioUrl: profileData.referenceAudioUrl || null,
      version: 1
    },
    update: {
      embedding: profileData.embedding ? Uint8Array.from(profileData.embedding) as Uint8Array<ArrayBuffer> : undefined,
      qualityScore: profileData.qualityScore,
      audioCount: profileData.audioCount,
      totalDurationMs: profileData.totalDurationMs,
      fingerprint: profileData.fingerprint,
      voiceCharacteristics: profileData.voiceCharacteristics,
      chatterboxConditionals: profileData.chatterboxConditionals ? Uint8Array.from(profileData.chatterboxConditionals) as Uint8Array<ArrayBuffer> : undefined,
      referenceAudioId: profileData.referenceAudioId,
      referenceAudioUrl: profileData.referenceAudioUrl,
      updatedAt: new Date()
    }
  });
}
