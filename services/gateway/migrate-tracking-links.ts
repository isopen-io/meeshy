/**
 * Script de migration pour mettre à jour les shortUrl des liens de tracking existants
 * Convertit de "meeshy.me/l/<token>" vers "/l/<token>" pour flexibilité du domaine
 */

import { PrismaClient } from '../shared/prisma/client';

const prisma = new PrismaClient();

async function migrateTrackingLinks() {

  try {
    // 1. Compter tous les liens
    const totalCount = await prisma.trackingLink.count();

    // 2. Trouver les liens avec l'ancien format
    const linksToUpdate = await prisma.trackingLink.findMany({
      where: {
        shortUrl: {
          contains: 'meeshy.me/l/'
        }
      }
    });


    if (linksToUpdate.length === 0) {
      return;
    }

    // 3. Mettre à jour chaque lien
    let updatedCount = 0;
    for (const link of linksToUpdate) {
      try {
        // Extraire le token et créer le nouveau format
        const newShortUrl = `/l/${link.token}`;
        
        await prisma.trackingLink.update({
          where: { id: link.id },
          data: { shortUrl: newShortUrl }
        });

        updatedCount++;
      } catch (error) {
        console.error(`❌ Erreur lors de la mise à jour du lien ${link.id}:`, error);
      }
    }


  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateTrackingLinks();
