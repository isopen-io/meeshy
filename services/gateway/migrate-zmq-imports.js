#!/usr/bin/env node
/**
 * Migration script pour mettre à jour les imports ZmqTranslationClient
 * Utilise des regex TypeScript-aware pour un remplacement précis
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const OLD_IMPORT_PATTERNS = [
  /from\s+['"]\.\/ZmqTranslationClient['"]/g,
  /from\s+['"]\.\.\/ZmqTranslationClient['"]/g,
  /from\s+['"][^'"]*\/ZmqTranslationClient['"]/g,
];

const REPLACEMENT = "from './zmq-translation'";

function findTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip node_modules and zmq-translation directory
    if (entry.name === 'node_modules' || entry.name === 'zmq-translation') {
      continue;
    }

    if (entry.isDirectory()) {
      findTsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function migrateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = content;
  let changed = false;

  // Calculate relative path to zmq-translation
  const fileDir = path.dirname(filePath);
  const zmqDir = path.join(SRC_DIR, 'services', 'zmq-translation');
  let relativePath = path.relative(fileDir, zmqDir);

  // Normalize path for imports
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  // Convert Windows paths to Unix-style
  relativePath = relativePath.replace(/\\/g, '/');

  const correctImport = `from '${relativePath}'`;

  // Replace all old import patterns
  for (const pattern of OLD_IMPORT_PATTERNS) {
    if (pattern.test(content)) {
      modified = modified.replace(pattern, correctImport);
      changed = true;
    }
    // Reset regex lastIndex
    pattern.lastIndex = 0;
  }

  if (changed) {
    // Create backup
    fs.writeFileSync(filePath + '.bak', content);
    // Write new content
    fs.writeFileSync(filePath, modified);
    return true;
  }

  return false;
}

function main() {
  console.log('🔄 Migration des imports ZmqTranslationClient...\n');

  const files = findTsFiles(SRC_DIR);
  console.log(`📝 Fichiers TypeScript trouvés: ${files.length}\n`);

  let migrated = 0;
  let skipped = 0;

  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);

    if (migrateFile(file)) {
      console.log(`✅ Migré: ${relativePath}`);
      migrated++;
    } else {
      skipped++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Migration terminée`);
  console.log(`   Fichiers migrés: ${migrated}`);
  console.log(`   Fichiers ignorés: ${skipped}`);
  console.log('\n📦 Fichiers de backup créés avec extension .bak');
  console.log('   Pour les supprimer: find src -name "*.bak" -delete\n');
  console.log('🧪 Prochaines étapes:');
  console.log('   1. Vérifier compilation: bun run build');
  console.log('   2. Lancer tests: bun test');
  console.log('   3. Si OK, supprimer ancien fichier: rm src/services/ZmqTranslationClient.ts');
  console.log('   4. Supprimer backups: find src -name "*.bak" -delete');
}

main();
