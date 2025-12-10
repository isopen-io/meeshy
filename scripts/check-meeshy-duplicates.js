#!/usr/bin/env node
/**
 * Script pour vérifier les doublons de participants "meeshy" dans la base de données
 */

const { PrismaClient } = require('../gateway/shared/prisma/client');
const prisma = new PrismaClient();

async function checkMeeshyDuplicates() {
  try {
    console.log('🔍 Vérification des doublons de participants pour la conversation "meeshy"...\n');
    
    // 1. Trouver la conversation meeshy
    const meeshyConversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { identifier: 'meeshy' },
          { title: 'Meeshy' }
        ]
      },
      select: {
        id: true,
        identifier: true,
        title: true,
        type: true
      }
    });
    
    if (!meeshyConversation) {
      console.log('❌ Conversation "meeshy" non trouvée');
      return;
    }
    
    console.log('✅ Conversation trouvée:', meeshyConversation);
    console.log('');
    
    // 2. Récupérer tous les membres authentifiés
    const authenticatedMembers = await prisma.conversationMember.findMany({
      where: {
        conversationId: meeshyConversation.id,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            role: true
          }
        }
      }
    });
    
    console.log(`📊 Membres authentifiés (${authenticatedMembers.length}):`);
    authenticatedMembers.forEach((member, index) => {
      console.log(`  ${index + 1}. ${member.user.username} (${member.user.displayName || 'Pas de nom'})`);
      console.log(`     - ID: ${member.user.id}`);
      console.log(`     - Email: ${member.user.email}`);
      console.log(`     - Rôle: ${member.role}`);
    });
    console.log('');
    
    // 3. Récupérer tous les participants anonymes
    const anonymousParticipants = await prisma.anonymousParticipant.findMany({
      where: {
        conversationId: meeshyConversation.id,
        isActive: true
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        language: true,
        isOnline: true,
        joinedAt: true
      }
    });
    
    console.log(`📊 Participants anonymes (${anonymousParticipants.length}):`);
    anonymousParticipants.forEach((participant, index) => {
      console.log(`  ${index + 1}. ${participant.username} (${participant.firstName || ''} ${participant.lastName || ''})`);
      console.log(`     - ID: ${participant.id}`);
      console.log(`     - Langue: ${participant.language}`);
    });
    console.log('');
    
    // 4. Vérifier les doublons de username
    const allUsernames = [
      ...authenticatedMembers.map(m => ({ username: m.user.username, type: 'authenticated', id: m.user.id })),
      ...anonymousParticipants.map(p => ({ username: p.username, type: 'anonymous', id: p.id }))
    ];
    
    const usernameCount = new Map();
    allUsernames.forEach(({ username }) => {
      usernameCount.set(username, (usernameCount.get(username) || 0) + 1);
    });
    
    console.log('🔎 Vérification des doublons de username:');
    let foundDuplicates = false;
    
    usernameCount.forEach((count, username) => {
      if (count > 1) {
        foundDuplicates = true;
        console.log(`  ⚠️  "${username}" apparaît ${count} fois:`);
        allUsernames
          .filter(u => u.username === username)
          .forEach(u => {
            console.log(`     - ${u.type} (ID: ${u.id})`);
          });
      }
    });
    
    if (!foundDuplicates) {
      console.log('  ✅ Aucun doublon de username trouvé');
    }
    console.log('');
    
    // 5. Vérifier si le même ID apparaît plusieurs fois
    console.log('🔎 Vérification des doublons d\'ID:');
    const idCount = new Map();
    
    authenticatedMembers.forEach(m => {
      idCount.set(m.user.id, (idCount.get(m.user.id) || 0) + 1);
    });
    
    let foundIdDuplicates = false;
    idCount.forEach((count, id) => {
      if (count > 1) {
        foundIdDuplicates = true;
        const member = authenticatedMembers.find(m => m.user.id === id);
        console.log(`  ⚠️  ID "${id}" (${member?.user.username}) apparaît ${count} fois dans conversationMember`);
      }
    });
    
    if (!foundIdDuplicates) {
      console.log('  ✅ Aucun doublon d\'ID trouvé dans conversationMember');
    }
    console.log('');
    
    // 6. Résumé
    console.log('📋 RÉSUMÉ:');
    console.log(`  - Total participants: ${allUsernames.length}`);
    console.log(`  - Membres authentifiés: ${authenticatedMembers.length}`);
    console.log(`  - Participants anonymes: ${anonymousParticipants.length}`);
    console.log(`  - Doublons de username: ${foundDuplicates ? 'OUI ⚠️' : 'NON ✅'}`);
    console.log(`  - Doublons d'ID: ${foundIdDuplicates ? 'OUI ⚠️' : 'NON ✅'}`);
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMeeshyDuplicates();

