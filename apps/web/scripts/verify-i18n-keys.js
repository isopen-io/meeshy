#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

// Fonction pour lister récursivement les fichiers
function findFiles(dir, pattern, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      findFiles(filePath, pattern, fileList);
    } else if (file.endsWith(pattern)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Fonction pour extraire les appels useI18n d'un fichier
function extractI18nCalls(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const results = {
    filePath: filePath.replace(process.cwd() + '/', ''),
    namespaces: [],
    keys: [],
    issues: []
  };

  // Chercher les déclarations useI18n
  const useI18nRegex = /const\s+{\s*t(?:\s*:\s*(\w+))?\s*(?:,\s*tArray)?\s*}\s*=\s*useI18n\(['"](\w+)['"]\)/g;
  let match;

  while ((match = useI18nRegex.exec(content)) !== null) {
    const aliasName = match[1] || 't';
    const namespace = match[2];
    results.namespaces.push({ namespace, alias: aliasName });
  }

  // Pour chaque namespace trouvé, extraire les clés utilisées
  results.namespaces.forEach(({ namespace, alias }) => {
    // Chercher tous les appels t('key') ou tAlias('key')
    const tCallRegex = new RegExp(`${alias}\\(['"\`]([^'"\`]+)['"\`]\\)`, 'g');
    let keyMatch;

    while ((keyMatch = tCallRegex.exec(content)) !== null) {
      const key = keyMatch[1];
      results.keys.push({ namespace, key, alias });
    }

    // Chercher les appels tArray
    const tArrayRegex = new RegExp(`tArray\\(['"\`]([^'"\`]+)['"\`]\\)`, 'g');
    while ((keyMatch = tArrayRegex.exec(content)) !== null) {
      const key = keyMatch[1];
      results.keys.push({ namespace, key, alias: 'tArray' });
    }
  });

  return results;
}

// Fonction pour charger un fichier de traduction
function loadTranslationFile(namespace) {
  const translationPath = path.join(process.cwd(), 'locales', 'en', `${namespace}.json`);
  
  if (!fs.existsSync(translationPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(translationPath, 'utf-8');
    const json = JSON.parse(content);
    
    // Extraire le namespace racine (ex: {"auth": {...}} -> {...})
    if (json[namespace]) {
      return json[namespace];
    }
    return json;
  } catch (error) {
    console.error(`${colors.red}Erreur lors du chargement de ${translationPath}:${colors.reset}`, error.message);
    return null;
  }
}

// Fonction pour vérifier si une clé existe dans les traductions
function keyExists(translations, keyPath) {
  const keys = keyPath.split('.');
  let current = translations;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return false;
    }
  }

  return true;
}

// Fonction principale
function main() {
  console.log(`\n${colors.blue}🔍 Vérification des clés de traduction i18n...${colors.reset}\n`);

  // Trouver tous les fichiers page.tsx et components
  const appFiles = findFiles(path.join(process.cwd(), 'app'), 'page.tsx');
  const componentFiles = findFiles(path.join(process.cwd(), 'components'), '.tsx');
  const files = [...appFiles, ...componentFiles];

  let totalFiles = 0;
  let totalIssues = 0;
  let totalKeys = 0;

  files.forEach(filePath => {
    const analysis = extractI18nCalls(filePath);

    if (analysis.namespaces.length === 0) {
      return; // Pas de i18n dans ce fichier
    }

    totalFiles++;
    let fileHasIssues = false;

    console.log(`${colors.magenta}📄 ${analysis.filePath}${colors.reset}`);

    // Charger les traductions pour chaque namespace
    const translationsByNamespace = {};
    analysis.namespaces.forEach(({ namespace }) => {
      if (!translationsByNamespace[namespace]) {
        translationsByNamespace[namespace] = loadTranslationFile(namespace);
        
        if (!translationsByNamespace[namespace]) {
          console.log(`  ${colors.red}❌ Fichier de traduction manquant: locales/en/${namespace}.json${colors.reset}`);
          totalIssues++;
          fileHasIssues = true;
        }
      }
    });

    // Vérifier chaque clé
    analysis.keys.forEach(({ namespace, key }) => {
      totalKeys++;
      const translations = translationsByNamespace[namespace];

      if (!translations) {
        return; // Déjà signalé ci-dessus
      }

      if (!keyExists(translations, key)) {
        console.log(`  ${colors.red}❌ Clé manquante: ${namespace}.${key}${colors.reset}`);
        totalIssues++;
        fileHasIssues = true;
      }
    });

    if (!fileHasIssues && analysis.keys.length > 0) {
      console.log(`  ${colors.green}✅ ${analysis.keys.length} clés vérifiées - Tout est OK${colors.reset}`);
    }

    console.log('');
  });

  console.log(`\n${colors.blue}📊 Résumé:${colors.reset}`);
  console.log(`  Fichiers analysés: ${totalFiles}`);
  console.log(`  Clés vérifiées: ${totalKeys}`);
  
  if (totalIssues === 0) {
    console.log(`  ${colors.green}✅ Aucun problème détecté!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`  ${colors.red}❌ ${totalIssues} problème(s) détecté(s)${colors.reset}\n`);
    process.exit(1);
  }
}

main();
