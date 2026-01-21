// Test pour vérifier ce que Prisma retourne exactement
const { PrismaClient } = require('@meeshy/shared/prisma/client');

async function testSegments() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'mongodb://localhost:27017/meeshy?replicaSet=rs0'
      }
    }
  });

  try {
    const attachment = await prisma.messageAttachment.findUnique({
      where: { id: '696fa58799c187348614a69c' },
      select: {
        id: true,
        transcription: true
      }
    });

    console.log('=== TRANSCRIPTION RETOURNÉE PAR PRISMA ===');
    console.log('Type:', typeof attachment?.transcription);
    console.log('Transcription:', JSON.stringify(attachment?.transcription, null, 2).substring(0, 1500));

    if (attachment?.transcription && typeof attachment.transcription === 'object') {
      const trans = attachment.transcription;
      console.log('\n=== SEGMENTS ===');
      console.log('Type de segments:', typeof trans.segments);
      console.log('Est un array?', Array.isArray(trans.segments));
      console.log('Nombre de segments:', trans.segments?.length);

      if (trans.segments && trans.segments.length > 0) {
        console.log('\n=== SEGMENT 1 (complet) ===');
        console.log(JSON.stringify(trans.segments[1], null, 2));
        console.log('\n=== CLÉS DU SEGMENT 1 ===');
        console.log(Object.keys(trans.segments[1]));
      }
    }
  } catch (error) {
    console.error('Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testSegments();
