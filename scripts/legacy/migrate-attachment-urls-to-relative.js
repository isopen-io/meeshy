/**
 * Script de migration des URLs d'attachments vers des chemins relatifs
 * Ce script transforme toutes les URLs complètes en chemins relatifs
 * pour permettre au frontend de construire l'URL dynamiquement selon le domaine
 *
 * Exemples de transformation:
 * - http://localhost:3000/api/attachments/file/2024/11/userId/file.jpg → /api/attachments/file/2024/11/userId/file.jpg
 * - https://smpdev02.local:3000/api/attachments/file/... → /api/attachments/file/...
 * - https://gate.meeshy.me/api/attachments/file/... → /api/attachments/file/...
 *
 * Utilisation:
 * mongosh mongodb://localhost:27017/meeshy --file migrate-attachment-urls-to-relative.js
 */

print('\n🚀 Démarrage de la migration des URLs d\'attachments...\n');

/**
 * Transforme une URL complète en chemin relatif
 */
function transformToRelativePath(url) {
  if (!url) return url;

  // Si c'est déjà un chemin relatif (commence par /), ne rien faire
  if (url.startsWith('/')) {
    return url;
  }

  // Si c'est une URL complète (http:// ou https://)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      // Retourner juste le pathname (chemin après le domaine)
      return urlObj.pathname;
    } catch (e) {
      print(`⚠️  URL invalide, conservation: ${url}`);
      return url;
    }
  }

  // Si ce n'est ni une URL complète ni un chemin relatif, le retourner tel quel
  return url;
}

// Récupérer tous les attachments qui ont des URLs
const attachments = db.MessageAttachment.find({
  $or: [
    { fileUrl: { $exists: true, $ne: null } },
    { thumbnailUrl: { $exists: true, $ne: null } }
  ]
}).toArray();

print(`📊 Analyse des attachments:`);
print(`Total attachments: ${attachments.length}\n`);

let updatedCount = 0;
let skippedCount = 0;
let errorCount = 0;

// Statistiques détaillées
const stats = {
  fileUrlUpdated: 0,
  thumbnailUrlUpdated: 0,
  bothUpdated: 0,
  alreadyRelative: 0
};

attachments.forEach((attachment, index) => {
  const oldFileUrl = attachment.fileUrl;
  const oldThumbnailUrl = attachment.thumbnailUrl;

  const newFileUrl = transformToRelativePath(oldFileUrl);
  const newThumbnailUrl = transformToRelativePath(oldThumbnailUrl);

  const fileUrlChanged = oldFileUrl !== newFileUrl;
  const thumbnailUrlChanged = oldThumbnailUrl !== newThumbnailUrl;

  // Si au moins une URL a changé, mettre à jour
  if (fileUrlChanged || thumbnailUrlChanged) {
    try {
      const updateData = {};

      if (fileUrlChanged) {
        updateData.fileUrl = newFileUrl;
        stats.fileUrlUpdated++;
      }

      if (thumbnailUrlChanged) {
        updateData.thumbnailUrl = newThumbnailUrl;
        stats.thumbnailUrlUpdated++;
      }

      if (fileUrlChanged && thumbnailUrlChanged) {
        stats.bothUpdated++;
      }

      db.MessageAttachment.updateOne(
        { _id: attachment._id },
        { $set: updateData }
      );

      print(`✅ [${index + 1}/${attachments.length}] ${attachment.fileName || attachment.originalName}`);
      if (fileUrlChanged) {
        print(`   fileUrl: ${oldFileUrl} → ${newFileUrl}`);
      }
      if (thumbnailUrlChanged) {
        print(`   thumbnailUrl: ${oldThumbnailUrl} → ${newThumbnailUrl}`);
      }

      updatedCount++;
    } catch (e) {
      print(`❌ [${index + 1}/${attachments.length}] Erreur: ${e.message}`);
      errorCount++;
    }
  } else {
    // Vérifier si c'est déjà relatif
    if (oldFileUrl && oldFileUrl.startsWith('/')) {
      stats.alreadyRelative++;
    }

    if ((index + 1) % 100 === 0) {
      print(`⏭️  [${index + 1}/${attachments.length}] Déjà à jour (relatif)`);
    }
    skippedCount++;
  }
});

print(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
print(`📈 Résumé de la migration:\n`);
print(`  ✅ Attachments mis à jour: ${updatedCount}`);
print(`     - fileUrl modifiées: ${stats.fileUrlUpdated}`);
print(`     - thumbnailUrl modifiées: ${stats.thumbnailUrlUpdated}`);
print(`     - Les deux modifiées: ${stats.bothUpdated}`);
print(`  ⏭️  Attachments déjà relatifs: ${stats.alreadyRelative}`);
print(`  ⏭️  Total ignorés: ${skippedCount}`);
print(`  ❌ Erreurs: ${errorCount}`);
print(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

// Vérification finale - afficher quelques exemples
print(`📋 Exemples d'URLs après migration (5 premiers):\n`);
db.MessageAttachment.find({
  fileUrl: { $exists: true, $ne: null }
}).limit(5).forEach(att => {
  print(`  📎 ${att.fileName || att.originalName}`);
  print(`     fileUrl: ${att.fileUrl}`);
  if (att.thumbnailUrl) {
    print(`     thumbnailUrl: ${att.thumbnailUrl}`);
  }
  print('');
});

// Vérification - compter combien d'URLs sont encore absolues
const remainingAbsoluteUrls = db.MessageAttachment.countDocuments({
  $or: [
    { fileUrl: { $regex: /^https?:\/\// } },
    { thumbnailUrl: { $regex: /^https?:\/\// } }
  ]
});

if (remainingAbsoluteUrls > 0) {
  print(`⚠️  ATTENTION: ${remainingAbsoluteUrls} attachments ont encore des URLs absolues!\n`);
  print(`   Exemples:\n`);
  db.MessageAttachment.find({
    $or: [
      { fileUrl: { $regex: /^https?:\/\// } },
      { thumbnailUrl: { $regex: /^https?:\/\// } }
    ]
  }).limit(3).forEach(att => {
    print(`     - ${att.fileName}: ${att.fileUrl}`);
  });
  print('');
} else {
  print(`✅ Parfait! Toutes les URLs sont maintenant relatives.\n`);
}

print(`✨ Migration terminée avec succès!\n`);
