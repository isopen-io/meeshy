#!/usr/bin/env node
/**
 * Synchronise les versions depuis package.json vers les fichiers VERSION
 * Utilisé après `changeset version` pour garantir que Docker utilise les bonnes versions
 */

const fs = require('fs');
const path = require('path');

// Mapping des packages vers leurs fichiers VERSION
const VERSION_FILES = [
  {
    packagePath: 'apps/web/package.json',
    versionPath: 'apps/web/VERSION',
    name: 'web'
  },
  {
    packagePath: 'services/gateway/package.json',
    versionPath: 'services/gateway/VERSION',
    name: 'gateway'
  },
  {
    packagePath: 'services/translator/package.json',
    versionPath: 'services/translator/VERSION',
    name: 'translator'
  }
];

function syncVersions() {
  console.log('🔄 Synchronisation des versions package.json → VERSION files...\n');

  let hasChanges = false;
  const results = [];

  for (const config of VERSION_FILES) {
    const packageJsonPath = path.join(process.cwd(), config.packagePath);
    const versionFilePath = path.join(process.cwd(), config.versionPath);

    try {
      // Vérifier si le package.json existe
      if (!fs.existsSync(packageJsonPath)) {
        console.warn(`⚠️  ${config.name}: package.json non trouvé à ${config.packagePath}`);
        continue;
      }

      // Lire la version depuis package.json
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const newVersion = packageJson.version;

      if (!newVersion) {
        console.warn(`⚠️  ${config.name}: pas de version dans package.json`);
        continue;
      }

      // Lire la version actuelle du fichier VERSION (si existe)
      let currentVersion = null;
      if (fs.existsSync(versionFilePath)) {
        currentVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
      }

      // Écrire la nouvelle version
      fs.writeFileSync(versionFilePath, newVersion + '\n', 'utf8');

      const status = currentVersion !== newVersion ? '✨ UPDATED' : '✓ OK';
      results.push({
        name: config.name,
        old: currentVersion || 'N/A',
        new: newVersion,
        changed: currentVersion !== newVersion
      });

      if (currentVersion !== newVersion) {
        hasChanges = true;
      }

      console.log(`${status} ${config.name}: ${currentVersion || 'N/A'} → ${newVersion}`);
    } catch (error) {
      console.error(`❌ Erreur lors du traitement de ${config.name}:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n' + '='.repeat(60));
  if (hasChanges) {
    console.log('✅ Synchronisation terminée avec succès (modifications détectées)');
  } else {
    console.log('✅ Synchronisation terminée (aucune modification nécessaire)');
  }
  console.log('='.repeat(60));

  return hasChanges;
}

// Exécuter si appelé directement
if (require.main === module) {
  const hasChanges = syncVersions();
  process.exit(0);
}

module.exports = { syncVersions };
