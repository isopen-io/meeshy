#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Configuration des alias avec mapping selon la profondeur du fichier
const aliasMappings = {
  '@shared/prisma/client': {
    1: '../shared/prisma/client',    // depuis dist/src/
    2: '../../shared/prisma/client', // depuis dist/src/services/
    3: '../../../shared/prisma/client' // depuis dist/src/services/...
  },
  '@shared/types': {
    1: '../shared/types',    // depuis dist/src/
    2: '../../shared/types', // depuis dist/src/services/
    3: '../../../shared/types' // depuis dist/src/services/...
  },
  '@shared/types/socketio-events': {
    1: '../shared/types/socketio-events',    // depuis dist/src/
    2: '../../shared/types/socketio-events', // depuis dist/src/services/
    3: '../../../shared/types/socketio-events' // depuis dist/src/services/...
  }
};

// Fonction pour remplacer les alias dans un fichier
function replaceAliasesInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Calculer la profondeur du fichier par rapport à dist/
    const distDir = path.join(__dirname, '..', 'dist');
    const relativePath = path.relative(distDir, filePath);
    const depth = relativePath.split(path.sep).length - 1; // -1 car on compte les dossiers, pas les fichiers
    
    // Remplacer chaque alias (dans l'ordre des plus spécifiques aux plus généraux)
    const sortedAliases = Object.entries(aliasMappings).sort((a, b) => b[0].length - a[0].length);
    
    for (const [alias, mappings] of sortedAliases) {
      if (content.includes(alias)) {
        // Trouver le mapping approprié pour cette profondeur
        const replacement = mappings[depth] || mappings[1]; // fallback vers la profondeur 1
        content = content.replace(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Updated aliases in: ${filePath} (depth: ${depth})`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

// Fonction principale
function main() {
  const distDir = path.join(__dirname, '..', 'dist');
  
  if (!fs.existsSync(distDir)) {
    console.error('❌ dist directory not found');
    process.exit(1);
  }
  
  console.log('🔍 Searching for files with aliases...');
  
  // Chercher tous les fichiers .js dans le dossier dist
  const files = glob.sync(path.join(distDir, '**/*.js'));
  
  if (files.length === 0) {
    console.log('⚠️  No .js files found in dist directory');
    return;
  }
  
  console.log(`📁 Found ${files.length} files to process`);
  
  let processedCount = 0;
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Vérifier si le fichier contient des alias
    const hasAliases = Object.keys(aliasMappings).some(alias => content.includes(alias));
    
    if (hasAliases) {
      replaceAliasesInFile(file);
      processedCount++;
    }
  }
  
  console.log(`🎉 Processed ${processedCount} files with aliases`);
  
  // Copier le client Prisma dans dist/shared/
  console.log('📦 Copying Prisma client to dist/shared/...');
  const prismaSourceDir = path.join(__dirname, '..', 'shared', 'prisma');
  const prismaDestDir = path.join(__dirname, '..', 'dist', 'shared', 'prisma');
  
  if (fs.existsSync(prismaSourceDir)) {
    // Créer le dossier de destination s'il n'existe pas
    if (!fs.existsSync(prismaDestDir)) {
      fs.mkdirSync(prismaDestDir, { recursive: true });
    }
    
    // Copier récursivement le dossier prisma
    function copyDir(src, dest) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      
      const items = fs.readdirSync(src);
      for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        
        if (fs.statSync(srcPath).isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
    
    copyDir(prismaSourceDir, prismaDestDir);
    console.log('✅ Prisma client copied to dist/shared/prisma/');
  } else {
    console.error('❌ Prisma client directory not found:', prismaSourceDir);
  }
}

if (require.main === module) {
  main();
}

module.exports = { replaceAliasesInFile, aliasMappings };
