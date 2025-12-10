// Vérifier directement dans la DB l'ordre des messages
const { PrismaClient } = require('./shared/prisma/client');

const prisma = new PrismaClient();

async function verifyDBOrder() {
  try {
    
    const messagesDesc = await prisma.message.findMany({
      where: { conversationId: '68bc64071c7181d556cefce5' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, content: true, createdAt: true }
    });
    
    messagesDesc.forEach((msg, i) => {
    });
    
    
    const messagesAsc = await prisma.message.findMany({
      where: { conversationId: '68bc64071c7181d556cefce5' },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: { id: true, content: true, createdAt: true }
    });
    
    messagesAsc.forEach((msg, i) => {
    });
    
    
    if (messagesDesc[0].createdAt > messagesAsc[0].createdAt) {
    } else {
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDBOrder();

