#!/usr/bin/env node

/**
 * Script pour supprimer complètement tous les console.log de débogue du projet
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const PATTERNS_TO_EXCLUDE = [
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  'scripts',
];

const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

console.log('🧹 Suppression complète des logs de débogue');
console.log('═'.repeat(50));
console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (aucune modification)' : '✍️  MODIFICATION'}`);
console.log('═'.repeat(50));
console.log('');

/**
 * Parcourir récursivement les dossiers
 */
function* walkDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);

    try {
      const stat = fs.statSync(filePath);

      // Vérifier si le dossier est exclu
      const shouldExclude = PATTERNS_TO_EXCLUDE.some(pattern =>
        filePath.includes(path.sep + pattern + path.sep) ||
        filePath.endsWith(path.sep + pattern)
      );

      if (shouldExclude) {
        continue;
      }

      if (stat.isDirectory()) {
        yield* walkDirectory(filePath);
      } else if (stat.isFile()) {
        const ext = path.extname(filePath);
        if (FILE_EXTENSIONS.includes(ext)) {
          yield filePath;
        }
      }
    } catch (err) {
      // Ignore permission errors
      continue;
    }
  }
}

/**
 * Supprime les lignes console.log, console.debug, console.info
 */
function removeDebugLogs(content) {
  const lines = content.split('\n');
  const newLines = [];
  let modified = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Détecter console.log, console.info, console.debug (mais pas console.error/warn)
    if (/^\s*console\.(log|info|debug)\s*\(/.test(line)) {
      // Compter les parenthèses pour gérer les console.log multilignes
      let openParens = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
      let j = i + 1;

      // Si multiligne, sauter les lignes suivantes jusqu'à la fermeture
      while (openParens > 0 && j < lines.length) {
        const nextLine = lines[j];
        openParens += (nextLine.match(/\(/g) || []).length;
        openParens -= (nextLine.match(/\)/g) || []).length;
        j++;
      }

      // Sauter toutes ces lignes (suppression)
      modified = true;
      i = j;
      continue;
    }

    // Détecter les commentaires contenant seulement console.log
    if (/^\s*\/\/\s*console\.(log|info|debug)/.test(line)) {
      modified = true;
      i++;
      continue;
    }

    newLines.push(line);
    i++;
  }

  // Nettoyer les lignes vides consécutives (max 2)
  const cleanedLines = [];
  let emptyLineCount = 0;
  for (const line of newLines) {
    if (line.trim() === '') {
      emptyLineCount++;
      if (emptyLineCount <= 2) {
        cleanedLines.push(line);
      }
    } else {
      emptyLineCount = 0;
      cleanedLines.push(line);
    }
  }

  return { content: cleanedLines.join('\n'), modified };
}

/**
 * Traite un fichier
 */
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { content: newContent, modified } = removeDebugLogs(content);

    if (modified) {
      if (!DRY_RUN) {
        fs.writeFileSync(filePath, newContent, 'utf8');
      }
      return { modified: true, path: filePath };
    }

    return { modified: false, path: filePath };

  } catch (error) {
    return { modified: false, path: filePath, error: error.message };
  }
}

/**
 * Fonction principale
 */
function main() {
  try {
    const projectRoot = path.join(__dirname, '..');

    // Collecter tous les fichiers
    const files = Array.from(walkDirectory(projectRoot));

    console.log(`📁 ${files.length} fichiers trouvés\n`);

    let processedCount = 0;
    let modifiedCount = 0;
    let errorCount = 0;

    const modifiedFiles = [];

    for (const file of files) {
      const result = processFile(file);
      processedCount++;

      if (result.error) {
        errorCount++;
        if (VERBOSE) {
          console.error(`❌ ${path.relative(projectRoot, file)}: ${result.error}`);
        }
      } else if (result.modified) {
        modifiedCount++;
        modifiedFiles.push(path.relative(projectRoot, file));

        if (VERBOSE) {
          console.log(`✅ ${path.relative(projectRoot, file)}`);
        }
      }

      // Progress
      if (processedCount % 50 === 0) {
        process.stdout.write(`\r⏳ Progression: ${processedCount}/${files.length} fichiers...`);
      }
    }

    console.log('\n');
    console.log('═'.repeat(50));
    console.log('📊 Résumé');
    console.log('═'.repeat(50));
    console.log(`✅ Fichiers traités: ${processedCount}`);
    console.log(`✏️  Fichiers modifiés: ${modifiedCount}`);
    console.log(`❌ Erreurs: ${errorCount}`);
    console.log('');

    if (modifiedFiles.length > 0) {
      console.log('📝 Fichiers modifiés:');
      modifiedFiles.slice(0, 30).forEach(file => {
        console.log(`  - ${file}`);
      });
      if (modifiedFiles.length > 30) {
        console.log(`  ... et ${modifiedFiles.length - 30} autres fichiers`);
      }
      console.log('');
    }

    if (DRY_RUN) {
      console.log('💡 Mode DRY RUN actif - aucune modification effectuée');
      console.log('   Exécutez sans --dry-run pour appliquer les changements');
    } else {
      console.log('✅ Modifications appliquées avec succès!');
    }

  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  }
}

// Exécuter
main();
