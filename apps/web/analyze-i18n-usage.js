#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');


// Trouver tous les fichiers utilisant des hooks de traduction
const files = execSync(
  'grep -r "useTranslations\\|useI18n\\|useTranslation" app/ components/ --include="*.tsx" --include="*.ts" | cut -d: -f1 | sort -u',
  { encoding: 'utf-8' }
)
  .trim()
  .split('\n')
  .filter(Boolean);

const results = [];

files.forEach((filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Détecter les imports
  const importMatches = content.match(/import\s+\{[^}]*use(Translations|I18n|Translation)[^}]*\}\s+from\s+['"]([^'"]+)['"]/g);
  
  // Détecter les usages
  const usageMatches = content.match(/const\s+\{[^}]*\}\s*=\s*use(Translations|I18n|Translation)\s*\([^)]*\)/g);
  
  if (!usageMatches) return;
  
  const imports = [];
  const usages = [];
  
  if (importMatches) {
    importMatches.forEach(match => {
      const hookMatch = match.match(/use(Translations|I18n|Translation)/);
      const sourceMatch = match.match(/from\s+['"]([^'"]+)['"]/);
      if (hookMatch && sourceMatch) {
        imports.push({
          hook: hookMatch[0],
          source: sourceMatch[1]
        });
      }
    });
  }
  
  usageMatches.forEach(match => {
    const hookMatch = match.match(/use(Translations|I18n|Translation)/);
    const namespaceMatch = match.match(/\(['"]([^'"]+)['"]\)/);
    const varsMatch = match.match(/const\s+\{([^}]+)\}/);
    
    if (hookMatch) {
      usages.push({
        hook: hookMatch[0],
        namespace: namespaceMatch ? namespaceMatch[1] : 'none',
        variables: varsMatch ? varsMatch[1].trim() : ''
      });
    }
  });
  
  results.push({
    file: filePath,
    imports,
    usages
  });
});

// Générer le rapport Markdown

// Regrouper par hook
const hookStats = {};
results.forEach(r => {
  r.usages.forEach(u => {
    if (!hookStats[u.hook]) {
      hookStats[u.hook] = { count: 0, namespaces: new Set() };
    }
    hookStats[u.hook].count++;
    hookStats[u.hook].namespaces.add(u.namespace);
  });
});

Object.entries(hookStats).forEach(([hook, stats]) => {
});


results.forEach(result => {
  const fileName = result.file.replace(/^(app|components)\//, '');
  
  result.usages.forEach((usage, idx) => {
    const importInfo = result.imports.find(i => i.hook === usage.hook);
    const source = importInfo ? importInfo.source : 'N/A';
    
  });
});

// Détecter les incohérences

const sources = new Set();
const hooks = new Set();

results.forEach(r => {
  r.imports.forEach(i => sources.add(i.source));
  r.usages.forEach(u => hooks.add(u.hook));
});


if (sources.size > 2) {
}

if (hooks.size > 1) {
}

// Namespaces utilisés
const namespaceStats = {};
results.forEach(r => {
  r.usages.forEach(u => {
    if (!namespaceStats[u.namespace]) {
      namespaceStats[u.namespace] = 0;
    }
    namespaceStats[u.namespace]++;
  });
});

Object.entries(namespaceStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([ns, count]) => {
  });

