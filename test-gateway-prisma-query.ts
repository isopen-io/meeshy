/**
 * Test de la query Prisma EXACTEMENT comme dans la route Gateway
 * pour voir ce qu'elle retourne
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

async function testGatewayPrismaQuery() {
  try {
    console.log('🔍 Test de la query Prisma exactement comme dans la route Gateway\n');

    const conversationId = '696e4fb1acd8e6ae9461ad73';

    // Copie EXACTE du messageSelect de la route Gateway
    const messageSelect = {
      id: true,
      conversationId: true,
      senderId: true,
      anonymousSenderId: true,
      content: true,
      originalLanguage: true,
      messageType: true,
      messageSource: true,
      isEdited: true,
      editedAt: true,
      isDeleted: true,
      deletedAt: true,
      replyToId: true,
      forwardedFromId: true,
      forwardedFromConversationId: true,
      isViewOnce: true,
      maxViewOnceCount: true,
      viewOnceCount: true,
      isBlurred: true,
      expiresAt: true,
      pinnedAt: true,
      pinnedBy: true,
      deliveredToAllAt: true,
      receivedByAllAt: true,
      readByAllAt: true,
      deliveredCount: true,
      readCount: true,
      reactionSummary: true,
      reactionCount: true,
      isEncrypted: true,
      encryptionMode: true,
      createdAt: true,
      updatedAt: true,
      validatedMentions: true,
      sender: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true
        }
      },
      anonymousSender: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true
        }
      },
      attachments: {
        select: {
          id: true,
          fileName: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          fileUrl: true,
          thumbnailUrl: true,
          width: true,
          height: true,
          duration: true,
          bitrate: true,
          sampleRate: true,
          codec: true,
          channels: true,
          fps: true,
          videoCodec: true,
          pageCount: true,
          lineCount: true,
          metadata: true,
          transcription: true,  // ✅ Champ JSON scalaire
          translations: true,   // ✅ Champ JSON scalaire
          uploadedBy: true,
          isAnonymous: true,
          createdAt: true,
          isForwarded: true,
          isViewOnce: true,
          viewOnceCount: true,
          isBlurred: true,
          viewedCount: true,
          downloadedCount: true,
          consumedCount: true,
          isEncrypted: true
        },
        take: 4
      },
      _count: {
        select: {
          reactions: true
        }
      }
    };

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversationId,
        isDeleted: false
      },
      select: messageSelect as any,
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    console.log(`✅ Query réussie: ${messages.length} messages trouvés\n`);

    // Chercher le message avec transcription
    const targetMessageId = '696e4ff3acd8e6ae9461ad7d';
    const targetMessage = messages.find((m: any) => m.id === targetMessageId);

    if (targetMessage) {
      console.log(`📄 Message ${targetMessageId} trouvé:\n`);
      console.log(JSON.stringify(targetMessage, null, 2).substring(0, 3000));

      const message = targetMessage as any;
      if (message.attachments && message.attachments.length > 0) {
        console.log('\n\n📎 Détails des attachments:');
        message.attachments.forEach((att: any, i: number) => {
          console.log(`\n  Attachment ${i + 1}:`);
          console.log(`    - ID: ${att.id}`);
          console.log(`    - Fichier: ${att.fileName}`);
          console.log(`    - Type: ${att.mimeType}`);
          console.log(`    - Transcription présente: ${att.transcription ? 'OUI ✅' : 'NON ❌'}`);
          console.log(`    - Transcription type: ${typeof att.transcription}`);
          if (att.transcription) {
            console.log(`    - Transcription.text: ${(att.transcription as any).text?.substring(0, 100)}`);
            console.log(`    - Transcription.language: ${(att.transcription as any).language}`);
            console.log(`    - Transcription.confidence: ${(att.transcription as any).confidence}`);
          } else {
            console.log(`    - Transcription value: ${att.transcription}`);
          }
        });
      }
    } else {
      console.log(`❌ Message ${targetMessageId} non trouvé\n`);
      console.log('Messages trouvés:');
      messages.forEach((msg: any, i: number) => {
        console.log(`  ${i + 1}. ${msg.id}`);
      });
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n✅ Déconnecté de Prisma');
  }
}

testGatewayPrismaQuery();
