#!/usr/bin/env node

/**
 * Script automatique pour nettoyer tous les console.log du projet
 * et les conditionner pour le développement uniquement
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const PATTERNS_TO_EXCLUDE = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/scripts/**',
  '**/*.md',
  '**/logger.ts', // Notre logger centralisé
];

console.log('🧹 Auto-Fix Console Logs');
console.log('═'.repeat(50));
console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (aucune modification)' : '✍️  MODIFICATION'}`);
console.log('═'.repeat(50));
console.log('');

/**
 * Vérifie si un console.log est déjà conditionné
 */
function isAlreadyConditional(lines, lineIndex) {
  // Chercher les 3 lignes précédentes
  for (let i = Math.max(0, lineIndex - 3); i < lineIndex; i++) {
    const line = lines[i];
    if (line.includes('process.env.NODE_ENV') || line.includes('NODE_ENV')) {
      return true;
    }
  }
  return false;
}

/**
 * Obtient l'indentation d'une ligne
 */
function getIndentation(line) {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : '';
}

/**
 * Traite un fichier pour conditionner les console.log
 */
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const newLines = [];
    
    let modified = false;
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      
      // Détecter console.log, console.info, console.debug
      if (/console\.(log|info|debug)\s*\(/.test(line)) {
        // Vérifier si déjà conditionné
        if (!isAlreadyConditional(newLines, i)) {
          const indent = getIndentation(line);
          
          // Compter le nombre de lignes du console.log (peut être multiligne)
          let endLine = i;
          let openParens = 0;
          let j = i;
          
          while (j < lines.length) {
            const currentLine = lines[j];
            openParens += (currentLine.match(/\(/g) || []).length;
            openParens -= (currentLine.match(/\)/g) || []).length;
            
            if (openParens === 0 && j >= i) {
              endLine = j;
              break;
            }
            j++;
          }
          
          // Ajouter la condition
          newLines.push(`${indent}if (process.env.NODE_ENV === 'development') {`);
          
          // Ajouter les lignes du console.log avec indentation supplémentaire
          for (let k = i; k <= endLine; k++) {
            newLines.push(`  ${lines[k]}`);
          }
          
          newLines.push(`${indent}}`);
          
          modified = true;
          i = endLine + 1;
          continue;
        }
      }
      
      newLines.push(line);
      i++;
    }
    
    if (modified) {
      if (!DRY_RUN) {
        fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
      }
      return { modified: true, path: filePath };
    }
    
    return { modified: false, path: filePath };
    
  } catch (error) {
    console.error(`❌ Erreur lors du traitement de ${filePath}:`, error.message);
    return { modified: false, path: filePath, error: error.message };
  }
}

/**
 * Fonction principale
 */
async function main() {
  try {
    // Chercher tous les fichiers TypeScript/TSX
    const files = await glob('../**/*.{ts,tsx}', {
      ignore: PATTERNS_TO_EXCLUDE,
      absolute: true,
    });
    
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
        console.error(`❌ ${path.relative(process.cwd(), file)}: ${result.error}`);
      } else if (result.modified) {
        modifiedCount++;
        modifiedFiles.push(path.relative(process.cwd(), file));
        
        if (VERBOSE || DRY_RUN) {
          console.log(`✅ ${path.relative(process.cwd(), file)}`);
        }
      }
      
      // Progress
      if (processedCount % 10 === 0) {
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
      modifiedFiles.forEach(file => {
        console.log(`  - ${file}`);
      });
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
main().catch(console.error);

