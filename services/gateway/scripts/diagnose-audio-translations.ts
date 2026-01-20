#!/usr/bin/env tsx

/**
 * Script de diagnostic pour comprendre pourquoi les traductions audio ne sont pas créées
 * Usage: tsx scripts/diagnose-audio-translations.ts [conversationId] [messageId]
 */

import { config } from 'dotenv';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import path from 'path';
import fs from 'fs/promises';

// Charger les variables d'environnement depuis le fichier .env du gateway
const envPath = path.resolve(__dirname, '../.env');
config({ path: envPath });

const prisma = new PrismaClient({
  log: ['error', 'warn']
});

interface DiagnosticResult {
  conversationId: string;
  messageId?: string;
  members: any[];
  targetLanguages: string[];
  issues: string[];
  recommendations: string[];
  audioMessages: any[];
  translatedAudios: any[];
}

async function diagnoseConversation(conversationId: string, messageId?: string): Promise<DiagnosticResult> {
  const result: DiagnosticResult = {
    conversationId,
    messageId,
    members: [],
    targetLanguages: [],
    issues: [],
    recommendations: [],
    audioMessages: [],
    translatedAudios: []
  };

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 DIAGNOSTIC : Traductions Audio - Conversation ${conversationId}`);
  console.log(`${'='.repeat(80)}\n`);

  // 1. VÉRIFIER LES MEMBRES DE LA CONVERSATION
  console.log(`📋 1. MEMBRES DE LA CONVERSATION`);
  console.log(`${'─'.repeat(80)}`);

  const members = await prisma.conversationMember.findMany({
    where: {
      conversationId: conversationId,
      isActive: true
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
          userFeature: {
            select: {
              autoTranslateEnabled: true,
              translateToSystemLanguage: true,
              translateToRegionalLanguage: true,
              useCustomDestination: true
            }
          }
        }
      }
    }
  });

  result.members = members;

  if (members.length === 0) {
    result.issues.push('❌ Aucun membre actif dans cette conversation');
    result.recommendations.push('Ajouter des membres à la conversation');
  } else {
    console.log(`✅ ${members.length} membre(s) actif(s) trouvé(s)\n`);

    // Extraire les langues (reproduire la logique de _extractConversationLanguages)
    const languages = new Set<string>();

    for (const member of members) {
      console.log(`👤 ${member.user.username || member.user.email}`);
      console.log(`   User ID: ${member.user.id}`);
      console.log(`   System Language: ${member.user.systemLanguage || '❌ NON DÉFINIE'}`);
      console.log(`   Regional Language: ${member.user.regionalLanguage || 'non définie'}`);
      console.log(`   Custom Language: ${member.user.customDestinationLanguage || 'non définie'}`);

      if (member.user.userFeature) {
        console.log(`   Auto-translate: ${member.user.userFeature.autoTranslateEnabled ? '✅' : '❌'}`);
        console.log(`   Translate to System: ${member.user.userFeature.translateToSystemLanguage ? '✅' : '❌'}`);
        console.log(`   Translate to Regional: ${member.user.userFeature.translateToRegionalLanguage ? '✅' : '❌'}`);
        console.log(`   Use Custom Destination: ${member.user.userFeature.useCustomDestination ? '✅' : '❌'}`);
      } else {
        console.log(`   ⚠️  UserFeature non trouvée`);
      }

      // Reproduire la logique d'extraction des langues
      if (member.user.systemLanguage) {
        languages.add(member.user.systemLanguage);
      } else {
        result.issues.push(`❌ ${member.user.username || member.user.email} n'a pas de systemLanguage`);
        result.recommendations.push(`Définir systemLanguage pour l'utilisateur ${member.user.id}`);
      }

      const userPrefs = member.user.userFeature;
      if (userPrefs?.autoTranslateEnabled) {
        if (userPrefs.translateToRegionalLanguage && member.user.regionalLanguage) {
          languages.add(member.user.regionalLanguage);
        }
        if (userPrefs.useCustomDestination && member.user.customDestinationLanguage) {
          languages.add(member.user.customDestinationLanguage);
        }
      }

      console.log('');
    }

    result.targetLanguages = Array.from(languages);

    console.log(`🌍 LANGUES CIBLES EXTRAITES: ${result.targetLanguages.length > 0 ? `[${result.targetLanguages.join(', ')}]` : '❌ AUCUNE'}\n`);

    if (result.targetLanguages.length === 0) {
      result.issues.push('❌ Aucune langue cible extraite de la conversation');
      result.recommendations.push('Le fallback sera utilisé: [en, fr]');
      result.recommendations.push('Conseil: Définir systemLanguage pour au moins un membre');
    } else if (result.targetLanguages.length === 1) {
      result.issues.push(`⚠️  Une seule langue cible: ${result.targetLanguages[0]}`);
      result.recommendations.push('Si les audios sont dans cette même langue, aucune traduction ne sera créée (filtrée)');
      result.recommendations.push('Conseil: Ajouter des membres avec des langues différentes');
    }
  }

  // 2. VÉRIFIER LES PARTICIPANTS ANONYMES
  console.log(`\n📋 2. PARTICIPANTS ANONYMES`);
  console.log(`${'─'.repeat(80)}`);

  const anonymousParticipants = await prisma.anonymousParticipant.findMany({
    where: {
      conversationId: conversationId,
      isActive: true
    },
    select: {
      id: true,
      language: true,
      deviceFingerprint: true
    }
  });

  if (anonymousParticipants.length > 0) {
    console.log(`✅ ${anonymousParticipants.length} participant(s) anonyme(s)\n`);
    for (const anon of anonymousParticipants) {
      console.log(`🕵️  Anonyme ${anon.id}`);
      console.log(`   Language: ${anon.language || '❌ NON DÉFINIE'}`);
      if (anon.language) {
        result.targetLanguages.push(anon.language);
      }
    }
  } else {
    console.log(`ℹ️  Aucun participant anonyme\n`);
  }

  // 3. VÉRIFIER LES MESSAGES AUDIO
  console.log(`\n📋 3. MESSAGES AUDIO DANS LA CONVERSATION`);
  console.log(`${'─'.repeat(80)}`);

  const whereClause: any = {
    conversationId: conversationId,
    attachments: {
      some: {
        mimeType: { startsWith: 'audio/' }
      }
    }
  };

  if (messageId) {
    whereClause.id = messageId;
  }

  const audioMessages = await prisma.message.findMany({
    where: whereClause,
    include: {
      attachments: {
        where: { mimeType: { startsWith: 'audio/' } },
        include: {
          transcription: true,
          translatedAudios: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  result.audioMessages = audioMessages;

  if (audioMessages.length === 0) {
    console.log(`ℹ️  Aucun message audio trouvé\n`);
    if (!messageId) {
      result.recommendations.push('Uploader un audio pour tester le système');
    }
  } else {
    console.log(`✅ ${audioMessages.length} message(s) audio trouvé(s)\n`);

    for (const msg of audioMessages) {
      console.log(`📨 Message ${msg.id}`);
      console.log(`   Date: ${msg.createdAt.toISOString()}`);
      console.log(`   Sender: ${msg.senderId}`);
      console.log(`   Original Language: ${msg.originalLanguage || 'non détecté'}`);

      for (const att of msg.attachments) {
        console.log(`\n   🎤 Attachment ${att.id}`);
        console.log(`      File: ${att.fileUrl}`);
        console.log(`      Duration: ${att.duration}ms`);

        // Transcription
        if (att.transcription) {
          console.log(`      ✅ TRANSCRIPTION PRÉSENTE:`);
          console.log(`         Text: "${att.transcription.text?.substring(0, 60)}..."`);
          console.log(`         Language: ${att.transcription.detectedLanguage}`);
          console.log(`         Confidence: ${att.transcription.confidence}`);
          console.log(`         Segments: ${(att.transcription.segments as any)?.length || 0}`);
        } else {
          console.log(`      ❌ TRANSCRIPTION MANQUANTE`);
          result.issues.push(`Message ${msg.id}: Transcription manquante`);
        }

        // Traductions audio
        if (att.translatedAudios && att.translatedAudios.length > 0) {
          console.log(`      ✅ TRADUCTIONS AUDIO PRÉSENTES: ${att.translatedAudios.length}`);
          for (const ta of att.translatedAudios) {
            console.log(`         - ${ta.targetLanguage}: ${ta.audioUrl}`);
            console.log(`           Text: "${ta.translatedText?.substring(0, 40)}..."`);
            console.log(`           Voice Cloned: ${ta.voiceCloned ? '✅' : '❌'}`);

            // Vérifier si le fichier existe
            if (ta.audioPath) {
              try {
                await fs.access(ta.audioPath);
                console.log(`           File exists: ✅`);
              } catch {
                console.log(`           File exists: ❌ (path: ${ta.audioPath})`);
                result.issues.push(`Fichier audio manquant: ${ta.audioPath}`);
              }
            }
          }
          result.translatedAudios.push(...att.translatedAudios);
        } else {
          console.log(`      ❌ TRADUCTIONS AUDIO MANQUANTES`);
          result.issues.push(`Message ${msg.id}: Aucune traduction audio créée`);
          result.recommendations.push(`Vérifier les logs Gateway lors de l'upload de ce message`);

          // Diagnostic détaillé
          if (result.targetLanguages.length === 0) {
            result.recommendations.push(`→ Cause probable: Aucune langue cible dans la conversation`);
          } else if (result.targetLanguages.length === 1 && att.transcription) {
            const targetLang = result.targetLanguages[0];
            const sourceLang = att.transcription.detectedLanguage;
            if (targetLang === sourceLang) {
              result.recommendations.push(`→ Cause probable: Langue source (${sourceLang}) = langue cible (${targetLang}), filtrée`);
            }
          }
        }
      }
      console.log('');
    }
  }

  // 4. RÉSUMÉ
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RÉSUMÉ DU DIAGNOSTIC`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`Membres actifs: ${members.length}`);
  console.log(`Langues cibles: ${result.targetLanguages.length > 0 ? result.targetLanguages.join(', ') : 'AUCUNE'}`);
  console.log(`Messages audio: ${audioMessages.length}`);
  console.log(`Traductions audio créées: ${result.translatedAudios.length}`);

  console.log(`\n${'─'.repeat(80)}`);

  if (result.issues.length > 0) {
    console.log(`\n⚠️  PROBLÈMES DÉTECTÉS (${result.issues.length}):\n`);
    result.issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  } else {
    console.log(`\n✅ Aucun problème détecté dans la configuration\n`);
  }

  if (result.recommendations.length > 0) {
    console.log(`\n💡 RECOMMANDATIONS (${result.recommendations.length}):\n`);
    result.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }

  console.log(`\n${'='.repeat(80)}\n`);

  return result;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`Usage: tsx scripts/diagnose-audio-translations.ts <conversationId> [messageId]`);
    console.log(`\nExemple:`);
    console.log(`  tsx scripts/diagnose-audio-translations.ts conv_123456789`);
    console.log(`  tsx scripts/diagnose-audio-translations.ts conv_123456789 msg_987654321`);
    process.exit(1);
  }

  const conversationId = args[0];
  const messageId = args[1];

  try {
    const result = await diagnoseConversation(conversationId, messageId);

    // Sauvegarder le rapport
    const reportPath = path.resolve(process.cwd(), `diagnostic_${conversationId}_${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(result, null, 2));
    console.log(`📄 Rapport détaillé sauvegardé: ${reportPath}\n`);

  } catch (error) {
    console.error(`❌ Erreur lors du diagnostic:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
