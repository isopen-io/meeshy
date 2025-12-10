/**
 * Script de nettoyage des attachements orphelins
 *
 * Ce script supprime de la base de données tous les attachements dont le message
 * parent a été supprimé.
 *
 * ATTENTION: Cette opération est IRRÉVERSIBLE!
 *
 * Mode dry-run par défaut (ne supprime rien, affiche seulement)
 * Pour supprimer réellement: SET CONFIRM_DELETE=true
 *
 * Utilisation:
 * # Mode dry-run (affichage seulement)
 * mongosh mongodb://localhost:27017/meeshy --file cleanup-orphan-attachments.js
 *
 * # Mode suppression réelle
 * mongosh mongodb://localhost:27017/meeshy --eval "var CONFIRM_DELETE=true" --file cleanup-orphan-attachments.js
 */

// Configuration
const DRY_RUN = typeof CONFIRM_DELETE === 'undefined' || !CONFIRM_DELETE;

print('\n🧹 Nettoyage des attachements orphelins...\n');

if (DRY_RUN) {
  print('⚠️  MODE DRY-RUN: Aucune suppression ne sera effectuée.\n');
  print('   Pour supprimer réellement, exécutez avec: --eval "var CONFIRM_DELETE=true"\n');
} else {
  print('🔴 MODE SUPPRESSION ACTIVÉ: Les attachements orphelins seront SUPPRIMÉS!\n');
}

// Récupérer tous les attachments
const allAttachments = db.MessageAttachment.find({}).toArray();

print(`Total attachements dans la DB: ${allAttachments.length}\n`);
print('🔍 Recherche des attachements orphelins...\n');

const orphanAttachments = [];
const validAttachments = [];
let totalFileSize = 0;
let orphanFileSize = 0;

allAttachments.forEach((attachment, index) => {
  // Vérifier si le message existe encore
  const messageExists = db.Message.findOne({ _id: attachment.messageId }) !== null;

  if (!messageExists) {
    orphanAttachments.push(attachment);
    orphanFileSize += attachment.fileSize || 0;
  } else {
    validAttachments.push(attachment);
  }

  totalFileSize += attachment.fileSize || 0;

  if ((index + 1) % 100 === 0) {
    print(`  Analysé: ${index + 1}/${allAttachments.length} attachements...`);
  }
});

print(`\n✅ Analyse terminée!\n`);

// Fonction pour formater la taille de fichier
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

print(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
print(`📊 Résultats:\n`);
print(`  📎 Total attachements: ${allAttachments.length}`);
print(`  ✅ Attachements valides: ${validAttachments.length}`);
print(`  ⚠️  Attachements orphelins: ${orphanAttachments.length}`);
print(`  💾 Espace total: ${formatFileSize(totalFileSize)}`);
print(`  🗑️  Espace orphelin: ${formatFileSize(orphanFileSize)}`);
print(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

if (orphanAttachments.length === 0) {
  print(`\n✅ Aucun attachement orphelin trouvé! La base de données est propre.\n`);
} else {
  print(`\n⚠️  ${orphanAttachments.length} attachements orphelins détectés!\n`);

  // Grouper par type MIME
  const byMimeType = {};
  orphanAttachments.forEach(att => {
    const mimeType = att.mimeType || 'unknown';
    if (!byMimeType[mimeType]) {
      byMimeType[mimeType] = { count: 0, size: 0 };
    }
    byMimeType[mimeType].count++;
    byMimeType[mimeType].size += att.fileSize || 0;
  });

  print(`📋 Répartition par type MIME:\n`);
  Object.entries(byMimeType)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([mimeType, info]) => {
      print(`  ${mimeType}: ${info.count} fichiers (${formatFileSize(info.size)})`);
    });
  print('');

  // Afficher les 10 premiers orphelins
  print(`📋 Exemples d'attachements orphelins (10 premiers):\n`);
  orphanAttachments.slice(0, 10).forEach((att, i) => {
    print(`  ${i + 1}. ${att.fileName || att.originalName} (${formatFileSize(att.fileSize || 0)})`);
    print(`     Message ID: ${att.messageId}`);
    print(`     Fichier: ${att.fileUrl}`);
    print(`     Uploadé le: ${att.createdAt}`);
    print('');
  });

  // Suppression si confirmé
  if (!DRY_RUN) {
    print(`\n🔴 Début de la suppression...\n`);

    let deletedCount = 0;
    let errorCount = 0;
    const orphanIds = orphanAttachments.map(att => att._id);

    try {
      // Suppression en batch
      const result = db.MessageAttachment.deleteMany({
        _id: { $in: orphanIds }
      });

      deletedCount = result.deletedCount;

      print(`\n✅ Suppression terminée!\n`);
      print(`  🗑️  Attachements supprimés: ${deletedCount}`);
      print(`  💾 Espace libéré dans la DB: ${formatFileSize(orphanFileSize)}\n`);

      if (deletedCount !== orphanAttachments.length) {
        print(`⚠️  Attention: ${orphanAttachments.length - deletedCount} attachements n'ont pas pu être supprimés.\n`);
      }

    } catch (e) {
      print(`\n❌ Erreur lors de la suppression: ${e.message}\n`);
      errorCount++;
    }

    print(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    print(`📊 Résumé final:\n`);
    print(`  ✅ Supprimés: ${deletedCount}`);
    print(`  ❌ Erreurs: ${errorCount}`);
    print(`  🗑️  Espace libéré: ${formatFileSize(orphanFileSize)}\n`);

    print(`⚠️  IMPORTANT: Les fichiers physiques sur le disque n'ont PAS été supprimés!\n`);
    print(`   Pour nettoyer les fichiers physiques orphelins, utilisez:\n`);
    print(`   bash scripts/cleanup-orphan-files.sh\n`);

  } else {
    print(`\n💡 Mode dry-run: Aucune suppression effectuée.\n`);
    print(`   Ces ${orphanAttachments.length} attachements orphelins libéreraient ${formatFileSize(orphanFileSize)}.\n`);
    print(`\n   Pour supprimer réellement, exécutez:\n`);
    print(`   mongosh mongodb://localhost:27017/meeshy --eval "var CONFIRM_DELETE=true" --file scripts/cleanup-orphan-attachments.js\n`);
  }
}

print(`\n✨ Script terminé!\n`);
