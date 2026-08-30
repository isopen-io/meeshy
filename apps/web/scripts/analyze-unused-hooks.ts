#!/usr/bin/env tsx
/**
 * Script d'analyse des hooks non utilisés dans le projet Meeshy
 * Génère un rapport détaillé avec recommandations
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface HookAnalysis {
  name: string;
  filePath: string;
  imports: number;
  usages: number;
  isExported: boolean;
  isInIndex: boolean;
  status: 'USED' | 'UNUSED' | 'INTERNAL_ONLY' | 'DEPRECATED';
  recommendation: string;
  dependencies: string[];
}

interface AnalysisReport {
  totalHooks: number;
  usedHooks: number;
  unusedHooks: number;
  internalOnlyHooks: number;
  deprecatedHooks: number;
  hooks: HookAnalysis[];
  summary: string[];
  actionsRequired: string[];
}

const HOOKS_DIR = path.join(process.cwd(), 'hooks');
const FRONTEND_DIR = process.cwd();

// Liste des hooks à analyser
const hookFiles = [
  'compatibility-hooks.ts',
  'use-advanced-message-loader.ts',
  'use-auth-guard.ts',
  'use-auth.ts',
  'use-conversation-messages.ts',
  'use-fix-z-index.ts',
  'use-font-preference.ts',
  'use-language.ts',
  'use-message-loader.ts',
  'use-messaging.ts',
  'use-notifications.ts',
  'use-socketio-messaging.ts',
  'use-translation-performance.ts',
  'use-translation.ts',
  'useTranslations.ts',
];

function extractHookName(fileName: string): string {
  return fileName.replace('.ts', '').replace('.tsx', '');
}

function countImports(hookName: string): number {
  try {
    // Rechercher les imports du hook dans tout le projet
    const grepCommand = `grep -r "from '@/hooks/${hookName}" ${FRONTEND_DIR} --include="*.ts" --include="*.tsx" | wc -l`;
    const result = execSync(grepCommand, { encoding: 'utf-8' }).trim();
    return parseInt(result, 10) || 0;
  } catch (error) {
    return 0;
  }
}

function countUsages(hookName: string): number {
  try {
    // Extraire le nom de la fonction du hook (ex: useAuth, useTranslations)
    const functionNames = extractFunctionNames(hookName);
    let totalUsages = 0;
    
    for (const funcName of functionNames) {
      const grepCommand = `grep -r "${funcName}(" ${FRONTEND_DIR} --include="*.ts" --include="*.tsx" | wc -l`;
      const result = execSync(grepCommand, { encoding: 'utf-8' }).trim();
      totalUsages += parseInt(result, 10) || 0;
    }
    
    return totalUsages;
  } catch (error) {
    return 0;
  }
}

function extractFunctionNames(fileName: string): string[] {
  const filePath = path.join(HOOKS_DIR, fileName);
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const functionNames: string[] = [];
  
  // Rechercher les exports de fonction
  const exportRegex = /export\s+(?:function|const)\s+(\w+)/g;
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    functionNames.push(match[1]);
  }
  
  return functionNames;
}

function isExportedInIndex(hookName: string): boolean {
  const indexPath = path.join(HOOKS_DIR, 'index.ts');
  if (!fs.existsSync(indexPath)) return false;
  
  const content = fs.readFileSync(indexPath, 'utf-8');
  return content.includes(`'${hookName}'`) || content.includes(`"${hookName}"`);
}

function extractDependencies(fileName: string): string[] {
  const filePath = path.join(HOOKS_DIR, fileName);
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const dependencies: string[] = [];
  
  // Rechercher les imports d'autres hooks
  const importRegex = /from\s+['"]@\/hooks\/([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    dependencies.push(match[1]);
  }
  
  return dependencies;
}

function determineStatus(analysis: HookAnalysis): 'USED' | 'UNUSED' | 'INTERNAL_ONLY' | 'DEPRECATED' {
  // Hook utilisé activement
  if (analysis.imports > 0 || analysis.usages > 3) {
    return 'USED';
  }
  
  // Hook interne (utilisé seulement par d'autres hooks)
  if (analysis.dependencies.length > 0 && analysis.imports === 0 && analysis.usages > 0) {
    return 'INTERNAL_ONLY';
  }
  
  // Hook complètement inutilisé
  if (analysis.imports === 0 && analysis.usages === 0) {
    return 'UNUSED';
  }
  
  return 'DEPRECATED';
}

function generateRecommendation(analysis: HookAnalysis): string {
  switch (analysis.status) {
    case 'USED':
      return '✅ Hook actif - Conserver';
    case 'INTERNAL_ONLY':
      return '🔧 Hook interne - Vérifier si nécessaire';
    case 'UNUSED':
      return '🗑️ Hook non utilisé - SUPPRIMER';
    case 'DEPRECATED':
      return '⚠️ Hook déprécié - Vérifier et supprimer si possible';
    default:
      return '❓ Statut inconnu';
  }
}

async function analyzeHooks(): Promise<AnalysisReport> {
  const report: AnalysisReport = {
    totalHooks: hookFiles.length,
    usedHooks: 0,
    unusedHooks: 0,
    internalOnlyHooks: 0,
    deprecatedHooks: 0,
    hooks: [],
    summary: [],
    actionsRequired: [],
  };

  console.log('🔍 Analyse des hooks en cours...\n');

  for (const fileName of hookFiles) {
    const hookName = extractHookName(fileName);
    const filePath = path.join(HOOKS_DIR, fileName);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Fichier introuvable: ${fileName}`);
      continue;
    }

    const analysis: HookAnalysis = {
      name: hookName,
      filePath,
      imports: countImports(hookName),
      usages: countUsages(hookName),
      isExported: isExportedInIndex(hookName),
      isInIndex: isExportedInIndex(hookName),
      dependencies: extractDependencies(fileName),
      status: 'USED',
      recommendation: '',
    };

    analysis.status = determineStatus(analysis);
    analysis.recommendation = generateRecommendation(analysis);

    // Mise à jour des compteurs
    switch (analysis.status) {
      case 'USED':
        report.usedHooks++;
        break;
      case 'UNUSED':
        report.unusedHooks++;
        report.actionsRequired.push(`Supprimer: ${fileName}`);
        break;
      case 'INTERNAL_ONLY':
        report.internalOnlyHooks++;
        break;
      case 'DEPRECATED':
        report.deprecatedHooks++;
        report.actionsRequired.push(`Vérifier: ${fileName}`);
        break;
    }

    report.hooks.push(analysis);
    
    console.log(`${analysis.recommendation} - ${fileName}`);
    console.log(`   Imports: ${analysis.imports} | Usages: ${analysis.usages} | Exporté: ${analysis.isInIndex ? 'Oui' : 'Non'}`);
    if (analysis.dependencies.length > 0) {
      console.log(`   Dépendances: ${analysis.dependencies.join(', ')}`);
    }
    console.log('');
  }

  // Générer le résumé
  report.summary = [
    `Total de hooks analysés: ${report.totalHooks}`,
    `✅ Hooks utilisés: ${report.usedHooks}`,
    `🗑️  Hooks non utilisés: ${report.unusedHooks}`,
    `🔧 Hooks internes: ${report.internalOnlyHooks}`,
    `⚠️  Hooks dépréciés: ${report.deprecatedHooks}`,
    ``,
    `Gain potentiel: Suppression de ${report.unusedHooks + report.deprecatedHooks} fichiers`,
  ];

  return report;
}

function generateMarkdownReport(report: AnalysisReport): string {
  let markdown = `# 📊 Rapport d'Analyse des Hooks - Meeshy Frontend\n\n`;
  markdown += `**Date:** ${new Date().toLocaleDateString('fr-FR')}\n\n`;
  markdown += `---\n\n`;

  // Résumé
  markdown += `## 📈 Résumé Exécutif\n\n`;
  report.summary.forEach(line => {
    markdown += `${line}\n`;
  });
  markdown += `\n---\n\n`;

  // Détails par statut
  markdown += `## 📋 Détails par Statut\n\n`;

  // Hooks utilisés
  markdown += `### ✅ Hooks Utilisés (${report.usedHooks})\n\n`;
  markdown += `| Nom | Imports | Usages | Exporté | Dépendances |\n`;
  markdown += `|-----|---------|--------|---------|-------------|\n`;
  report.hooks.filter(h => h.status === 'USED').forEach(hook => {
    markdown += `| ${hook.name} | ${hook.imports} | ${hook.usages} | ${hook.isInIndex ? '✓' : '✗'} | ${hook.dependencies.join(', ') || '-'} |\n`;
  });
  markdown += `\n`;

  // Hooks non utilisés
  markdown += `### 🗑️ Hooks Non Utilisés (${report.unusedHooks})\n\n`;
  if (report.unusedHooks > 0) {
    markdown += `**🚨 ACTION REQUISE: Ces hooks peuvent être supprimés en toute sécurité**\n\n`;
    markdown += `| Nom | Fichier | Raison |\n`;
    markdown += `|-----|---------|--------|\n`;
    report.hooks.filter(h => h.status === 'UNUSED').forEach(hook => {
      markdown += `| ${hook.name} | ${path.basename(hook.filePath)} | Aucun import ni usage détecté |\n`;
    });
  } else {
    markdown += `Aucun hook non utilisé détecté. ✨\n`;
  }
  markdown += `\n`;

  // Hooks internes
  markdown += `### 🔧 Hooks Internes (${report.internalOnlyHooks})\n\n`;
  if (report.internalOnlyHooks > 0) {
    markdown += `Ces hooks sont utilisés uniquement par d'autres hooks.\n\n`;
    markdown += `| Nom | Usages | Dépendances |\n`;
    markdown += `|-----|--------|-------------|\n`;
    report.hooks.filter(h => h.status === 'INTERNAL_ONLY').forEach(hook => {
      markdown += `| ${hook.name} | ${hook.usages} | ${hook.dependencies.join(', ') || '-'} |\n`;
    });
  } else {
    markdown += `Aucun hook interne détecté.\n`;
  }
  markdown += `\n`;

  // Hooks dépréciés
  markdown += `### ⚠️ Hooks Dépréciés (${report.deprecatedHooks})\n\n`;
  if (report.deprecatedHooks > 0) {
    markdown += `Ces hooks ont peu d'utilisations et devraient être vérifiés.\n\n`;
    markdown += `| Nom | Imports | Usages | Action |\n`;
    markdown += `|-----|---------|--------|--------|\n`;
    report.hooks.filter(h => h.status === 'DEPRECATED').forEach(hook => {
      markdown += `| ${hook.name} | ${hook.imports} | ${hook.usages} | Vérifier et migrer |\n`;
    });
  } else {
    markdown += `Aucun hook déprécié détecté.\n`;
  }
  markdown += `\n---\n\n`;

  // Actions requises
  markdown += `## 🎯 Actions Requises\n\n`;
  if (report.actionsRequired.length > 0) {
    report.actionsRequired.forEach((action, index) => {
      markdown += `${index + 1}. ${action}\n`;
    });
  } else {
    markdown += `Aucune action requise. Le code est propre! ✨\n`;
  }
  markdown += `\n---\n\n`;

  // Recommandations
  markdown += `## 💡 Recommandations\n\n`;
  markdown += `1. **Supprimer les hooks non utilisés** pour réduire la complexité du code\n`;
  markdown += `2. **Documenter les hooks internes** pour faciliter la maintenance\n`;
  markdown += `3. **Migrer les hooks dépréciés** vers les nouvelles implémentations\n`;
  markdown += `4. **Maintenir le fichier index.ts** à jour avec les exports\n`;
  markdown += `5. **Ajouter des tests unitaires** pour les hooks critiques\n\n`;

  // Plan de nettoyage
  markdown += `---\n\n`;
  markdown += `## 🧹 Plan de Nettoyage Automatisé\n\n`;
  markdown += `\`\`\`bash\n`;
  markdown += `# Script de nettoyage des hooks non utilisés\n`;
  markdown += `cd frontend/hooks\n\n`;
  
  const unusedHooks = report.hooks.filter(h => h.status === 'UNUSED');
  if (unusedHooks.length > 0) {
    markdown += `# Supprimer les hooks non utilisés\n`;
    unusedHooks.forEach(hook => {
      markdown += `rm ${path.basename(hook.filePath)}\n`;
    });
    markdown += `\n# Mettre à jour index.ts\n`;
    markdown += `# (Retirer les exports correspondants)\n\n`;
  }
  
  markdown += `# Vérifier que tout fonctionne\n`;
  markdown += `cd ..\n`;
  markdown += `pnpm build\n`;
  markdown += `pnpm test\n`;
  markdown += `\`\`\`\n\n`;

  return markdown;
}

// Exécution principale
(async () => {
  try {
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('   📊 ANALYSE DES HOOKS NON UTILISÉS - MEESHY FRONTEND\n');
    console.log('═══════════════════════════════════════════════════════════\n\n');

    const report = await analyzeHooks();

    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log('📄 Génération du rapport Markdown...\n');

    const markdownReport = generateMarkdownReport(report);
    const reportPath = path.join(process.cwd(), 'docs', 'HOOKS_ANALYSIS_REPORT.md');

    // Créer le dossier docs s'il n'existe pas
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, markdownReport, 'utf-8');

    console.log(`✅ Rapport sauvegardé: ${reportPath}\n`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Afficher le résumé dans la console
    console.log('\n📊 RÉSUMÉ:\n');
    report.summary.forEach(line => console.log(`   ${line}`));
    console.log('\n');

    if (report.actionsRequired.length > 0) {
      console.log('🎯 ACTIONS REQUISES:\n');
      report.actionsRequired.forEach((action, index) => {
        console.log(`   ${index + 1}. ${action}`);
      });
      console.log('\n');
    }

    console.log('═══════════════════════════════════════════════════════════\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse:', error);
    process.exit(1);
  }
})();
