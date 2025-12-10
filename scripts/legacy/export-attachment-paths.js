/**
 * Script d'export des chemins d'attachements référencés dans la base de données
 *
 * Ce script génère un fichier JSON contenant tous les chemins de fichiers (fileUrl et thumbnailUrl)
 * des attachements actuellement référencés dans la base de données.
 *
 * Fichiers générés:
 * - attachment-paths.json : Liste de tous les chemins de fichiers référencés
 * - attachment-stats.json : Statistiques détaillées
 *
 * Utilisation:
 * mongosh mongodb://localhost:27017/meeshy --file export-attachment-paths.js
 */

print('\n📊 Export des chemins d\'attachements...\n');

// Récupérer tous les attachments
const attachments = db.MessageAttachment.find({
  fileUrl: { $exists: true, $ne: null }
}).toArray();

print(`Total attachments dans la DB: ${attachments.length}\n`);

// Structures pour l'export
const filePaths = new Set();
const thumbnailPaths = new Set();
const attachmentDetails = [];
const orphanAttachments = [];
const stats = {
  totalAttachments: attachments.length,
  withFileUrl: 0,
  withThumbnailUrl: 0,
  orphanAttachments: 0,
  validAttachments: 0,
  relativeUrls: 0,
  absoluteUrls: 0,
  messageIds: new Set()
};

print('🔍 Analyse des attachements et vérification des messages...\n');

attachments.forEach((attachment, index) => {
  const fileUrl = attachment.fileUrl;
  const thumbnailUrl = attachment.thumbnailUrl;

  // Vérifier si le message existe encore
  const messageExists = db.Message.findOne({ _id: attachment.messageId }) !== null;

  if (!messageExists) {
    orphanAttachments.push({
      id: attachment._id.toString(),
      fileName: attachment.fileName || attachment.originalName,
      messageId: attachment.messageId?.toString(),
      fileUrl: fileUrl,
      thumbnailUrl: thumbnailUrl,
      fileSize: attachment.fileSize,
      uploadedBy: attachment.uploadedBy,
      createdAt: attachment.createdAt
    });
    stats.orphanAttachments++;
  } else {
    stats.validAttachments++;
    stats.messageIds.add(attachment.messageId.toString());
  }

  // Extraire le chemin du fichier (enlever /api/attachments/file/)
  if (fileUrl) {
    stats.withFileUrl++;

    // Déterminer si l'URL est relative ou absolue
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      stats.absoluteUrls++;
      // Extraire juste le path
      try {
        const urlObj = new URL(fileUrl);
        filePaths.add(urlObj.pathname);
      } catch (e) {
        filePaths.add(fileUrl);
      }
    } else {
      stats.relativeUrls++;
      filePaths.add(fileUrl);
    }
  }

  if (thumbnailUrl) {
    stats.withThumbnailUrl++;

    if (thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://')) {
      // Extraire juste le path
      try {
        const urlObj = new URL(thumbnailUrl);
        thumbnailPaths.add(urlObj.pathname);
      } catch (e) {
        thumbnailPaths.add(thumbnailUrl);
      }
    } else {
      thumbnailPaths.add(thumbnailUrl);
    }
  }

  // Ajouter les détails de l'attachment
  attachmentDetails.push({
    id: attachment._id.toString(),
    fileName: attachment.fileName || attachment.originalName,
    messageId: attachment.messageId?.toString(),
    fileUrl: fileUrl,
    thumbnailUrl: thumbnailUrl,
    fileSize: attachment.fileSize,
    mimeType: attachment.mimeType,
    uploadedBy: attachment.uploadedBy,
    isOrphan: !messageExists,
    createdAt: attachment.createdAt
  });

  if ((index + 1) % 100 === 0) {
    print(`  Traité: ${index + 1}/${attachments.length} attachements...`);
  }
});

stats.totalMessages = stats.messageIds.size;
stats.uniqueFilePaths = filePaths.size;
stats.uniqueThumbnailPaths = thumbnailPaths.size;

print(`\n✅ Analyse terminée!\n`);

// Convertir les Sets en Arrays pour l'export
const allPaths = Array.from(new Set([...filePaths, ...thumbnailPaths])).sort();
const exportData = {
  generatedAt: new Date().toISOString(),
  stats: {
    totalAttachments: stats.totalAttachments,
    validAttachments: stats.validAttachments,
    orphanAttachments: stats.orphanAttachments,
    uniqueMessages: stats.totalMessages,
    withFileUrl: stats.withFileUrl,
    withThumbnailUrl: stats.withThumbnailUrl,
    uniqueFilePaths: stats.uniqueFilePaths,
    uniqueThumbnailPaths: stats.uniqueThumbnailPaths,
    totalUniquePaths: allPaths.length,
    relativeUrls: stats.relativeUrls,
    absoluteUrls: stats.absoluteUrls
  },
  paths: {
    all: allPaths,
    files: Array.from(filePaths).sort(),
    thumbnails: Array.from(thumbnailPaths).sort()
  },
  orphanAttachments: orphanAttachments,
  attachmentDetails: attachmentDetails
};

// Générer le contenu JSON
const jsonOutput = JSON.stringify(exportData, null, 2);

print(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
print(`📈 Statistiques:\n`);
print(`  📎 Total attachements: ${stats.totalAttachments}`);
print(`  ✅ Attachements valides: ${stats.validAttachments} (attachés à un message)`);
print(`  ⚠️  Attachements orphelins: ${stats.orphanAttachments} (message supprimé)`);
print(`  📨 Messages uniques: ${stats.totalMessages}`);
print(`  📄 Attachements avec fileUrl: ${stats.withFileUrl}`);
print(`  🖼️  Attachements avec thumbnailUrl: ${stats.withThumbnailUrl}`);
print(`  📁 Chemins uniques de fichiers: ${stats.uniqueFilePaths}`);
print(`  📁 Chemins uniques de thumbnails: ${stats.uniqueThumbnailPaths}`);
print(`  📁 Total chemins uniques: ${allPaths.length}`);
print(`  📍 URLs relatives: ${stats.relativeUrls}`);
print(`  🌐 URLs absolues: ${stats.absoluteUrls}`);
print(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

if (stats.orphanAttachments > 0) {
  print(`\n⚠️  ATTENTION: ${stats.orphanAttachments} attachements orphelins détectés!\n`);
  print(`   Ces attachements ne sont plus attachés à aucun message.\n`);
  print(`   Utilisez cleanup-orphan-attachments.js pour les supprimer.\n`);

  print(`   Exemples d'attachements orphelins (max 5):\n`);
  orphanAttachments.slice(0, 5).forEach((att, i) => {
    print(`   ${i + 1}. ${att.fileName} (${(att.fileSize / 1024).toFixed(2)} KB)`);
    print(`      Message ID: ${att.messageId}`);
    print(`      Fichier: ${att.fileUrl}`);
  });
  print('');
}

// Afficher des exemples de chemins
print(`📋 Exemples de chemins (10 premiers):\n`);
allPaths.slice(0, 10).forEach((path, i) => {
  print(`  ${i + 1}. ${path}`);
});
print('');

// Instructions pour sauvegarder les données
print(`💾 Pour exporter les données, copiez le JSON ci-dessous vers un fichier:\n`);
print(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
print(jsonOutput);
print(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

print(`\n✅ Export terminé!\n`);
print(`📝 Pour sauvegarder dans un fichier:\n`);
print(`   mongosh mongodb://localhost:27017/meeshy --quiet --file scripts/export-attachment-paths.js > attachment-export.json\n`);
print(`\n🧹 Pour nettoyer les fichiers orphelins:\n`);
print(`   1. Extrayez les chemins: cat attachment-export.json | jq -r '.paths.all[]' > valid-paths.txt\n`);
print(`   2. Exécutez: bash scripts/cleanup-orphan-files.sh valid-paths.txt\n`);
print(`\n🗑️  Pour supprimer les attachements orphelins de la DB:\n`);
print(`   mongosh mongodb://localhost:27017/meeshy --file scripts/cleanup-orphan-attachments.js\n`);
