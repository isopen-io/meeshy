#!/usr/bin/env node
/**
 * Synchronise les versions depuis package.json/pyproject.toml vers les fichiers VERSION
 * Utilisé après `changeset version` pour garantir que Docker utilise les bonnes versions
 */

const fs = require('fs');
const path = require('path');

// Mapping des packages vers leurs fichiers VERSION
const VERSION_FILES = [
  {
    packagePath: 'apps/web/package.json',
    versionPath: 'apps/web/VERSION',
    name: 'web',
    type: 'package.json'
  },
  {
    // Zone v3 (`apps/web-v3`). Sans cette entrée, `apps/web-v3/VERSION`
    // n'existait jamais : `release.yml` retombait sur son fallback et l'image
    // v3 n'avait aucun numéro à elle, donc aucun retour arrière possible vers
    // une image antérieure.
    packagePath: 'apps/web-v3/package.json',
    versionPath: 'apps/web-v3/VERSION',
    name: 'web-v3',
    type: 'package.json'
  },
  {
    packagePath: 'services/gateway/package.json',
    versionPath: 'services/gateway/VERSION',
    name: 'gateway',
    type: 'package.json'
  },
  {
    packagePath: 'services/translator/package.json',
    versionPath: 'services/translator/VERSION',
    pyprojectPath: 'services/translator/pyproject.toml',
    name: 'translator',
    type: 'package.json',
    syncPyproject: true  // Synchroniser aussi vers pyproject.toml
  }
];

/**
 * Lire la version depuis un fichier pyproject.toml
 */
function readVersionFromPyprojectToml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const versionMatch = content.match(/^version\s*=\s*["']([^"']+)["']/m);
  if (!versionMatch) {
    throw new Error('Version non trouvée dans pyproject.toml');
  }
  return versionMatch[1];
}

/**
 * Lire la version depuis un fichier package.json
 */
function readVersionFromPackageJson(filePath) {
  const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!packageJson.version) {
    throw new Error('Version non trouvée dans package.json');
  }
  return packageJson.version;
}

/**
 * Mettre à jour la version dans pyproject.toml
 */
function updatePyprojectTomlVersion(filePath, newVersion) {
  const content = fs.readFileSync(filePath, 'utf8');
  const updatedContent = content.replace(
    /^version\s*=\s*["']([^"']+)["']/m,
    `version = "${newVersion}"`
  );
  fs.writeFileSync(filePath, updatedContent, 'utf8');
}

function syncVersions() {
  console.log('🔄 Synchronisation des versions package.json/pyproject.toml → VERSION files...\n');

  let hasChanges = false;
  const results = [];

  for (const config of VERSION_FILES) {
    const sourceFilePath = path.join(process.cwd(), config.packagePath);
    const versionFilePath = path.join(process.cwd(), config.versionPath);

    try {
      // Vérifier si le fichier source existe
      if (!fs.existsSync(sourceFilePath)) {
        console.warn(`⚠️  ${config.name}: ${config.type} non trouvé à ${config.packagePath}`);
        continue;
      }

      // Lire la version selon le type de fichier
      let newVersion;
      if (config.type === 'pyproject.toml') {
        newVersion = readVersionFromPyprojectToml(sourceFilePath);
      } else {
        newVersion = readVersionFromPackageJson(sourceFilePath);
      }

      // Synchroniser vers pyproject.toml si nécessaire (pour services Python)
      if (config.syncPyproject && config.pyprojectPath) {
        const pyprojectFullPath = path.join(process.cwd(), config.pyprojectPath);
        if (fs.existsSync(pyprojectFullPath)) {
          const currentPyprojectVersion = readVersionFromPyprojectToml(pyprojectFullPath);
          if (currentPyprojectVersion !== newVersion) {
            updatePyprojectTomlVersion(pyprojectFullPath, newVersion);
            console.log(`  📝 pyproject.toml: ${currentPyprojectVersion} → ${newVersion}`);
            hasChanges = true;
          }
        }
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
