#!/usr/bin/env tsx
/**
 * Script d'analyse avancée des hooks - Vérification de l'usage réel des fonctions
 * Vérifie si les fonctions exportées par chaque hook sont réellement appelées
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface FunctionUsage {
  name: string;
  isExported: boolean;
  callsFound: number;
  usageLocations: string[];
}

interface HookDetailedAnalysis {
  hookFile: string;
  hookName: string;
  exportedFunctions: FunctionUsage[];
  totalExports: number;
  totalUsedExports: number;
  totalUnusedExports: number;
  usagePercentage: number;
  isCompletelyUnused: boolean;
  recommendation: string;
}

interface DetailedReport {
  totalHooks: number;
  completelyUnusedHooks: HookDetailedAnalysis[];
  partiallyUsedHooks: HookDetailedAnalysis[];
  fullyUsedHooks: HookDetailedAnalysis[];
  summary: string[];
}

const HOOKS_DIR = path.join(process.cwd(), 'hooks');
const FRONTEND_DIR = process.cwd();

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
];

/**
 * Extraire les fonctions exportées d'un fichier hook
 */
function extractExportedFunctions(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const functions: string[] = [];
  
  // Pattern pour: export function functionName
  const exportFunctionRegex = /export\s+function\s+(\w+)/g;
  let match;
  while ((match = exportFunctionRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }
  
  // Pattern pour: export const functionName = 
  const exportConstRegex = /export\s+const\s+(\w+)\s*=/g;
  while ((match = exportConstRegex.exec(content)) !== null) {
    functions.push(match[1]);
  }
  
  // Pattern pour: export { functionName }
  const exportBracesRegex = /export\s*\{([^}]+)\}/g;
  while ((match = exportBracesRegex.exec(content)) !== null) {
    const exports = match[1].split(',').map(e => e.trim().split(/\s+as\s+/)[0].trim());
    functions.push(...exports);
  }
  
  return [...new Set(functions)]; // Dédupliquer
}

/**
 * Compter les usages d'une fonction dans le projet
 */
function countFunctionUsage(functionName: string, hookFile: string): { count: number; locations: string[] } {
  const locations: string[] = [];
  
  try {
    // Chercher les appels de fonction: functionName(
    const grepCommand = `grep -rn "${functionName}(" ${FRONTEND_DIR} --include="*.ts" --include="*.tsx" --exclude-dir=node_modules 2>/dev/null || true`;
    const result = execSync(grepCommand, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    
    if (result) {
      const lines = result.trim().split('\n').filter(line => line.trim());
      
      // Filtrer pour exclure:
      // 1. Le fichier du hook lui-même
      // 2. Les définitions de fonction
      // 3. Les commentaires
      const usages = lines.filter(line => {
        const [filePath, ...rest] = line.split(':');
        const lineContent = rest.join(':');
        
        // Exclure le fichier du hook
        if (filePath.includes(hookFile)) return false;
        
        // Exclure les définitions
        if (lineContent.includes(`function ${functionName}(`)) return false;
        if (lineContent.includes(`const ${functionName} =`)) return false;
        if (lineContent.includes(`export function ${functionName}`)) return false;
        if (lineContent.includes(`export const ${functionName}`)) return false;
        
        // Exclure les commentaires
        if (lineContent.trim().startsWith('//')) return false;
        if (lineContent.trim().startsWith('*')) return false;
        
        return true;
      });
      
      usages.forEach(usage => {
        const [filePath, lineNum] = usage.split(':');
        const relativePath = path.relative(FRONTEND_DIR, filePath);
        locations.push(`${relativePath}:${lineNum}`);
      });
      
      return { count: usages.length, locations };
    }
  } catch (error) {
    // Ignorer les erreurs
  }
  
  return { count: 0, locations: [] };
}

/**
 * Analyser un hook en détail
 */
function analyzeHookInDetail(hookFile: string): HookDetailedAnalysis {
  const hookName = hookFile.replace('.ts', '');
  const filePath = path.join(HOOKS_DIR, hookFile);
  
  console.log(`\n🔍 Analyse de ${hookFile}...`);
  
  const exportedFunctions = extractExportedFunctions(filePath);
  const functionUsages: FunctionUsage[] = [];
  
  for (const funcName of exportedFunctions) {
    console.log(`   Vérification de ${funcName}()...`);
    const { count, locations } = countFunctionUsage(funcName, hookFile);
    
    functionUsages.push({
      name: funcName,
      isExported: true,
      callsFound: count,
      usageLocations: locations.slice(0, 5), // Limiter à 5 exemples
    });
    
    console.log(`   ${count > 0 ? '✅' : '❌'} ${funcName}(): ${count} appel(s)`);
  }
  
  const totalExports = exportedFunctions.length;
  const totalUsedExports = functionUsages.filter(f => f.callsFound > 0).length;
  const totalUnusedExports = totalExports - totalUsedExports;
  const usagePercentage = totalExports > 0 ? (totalUsedExports / totalExports) * 100 : 0;
  const isCompletelyUnused = totalUsedExports === 0 && totalExports > 0;
  
  let recommendation = '';
  if (isCompletelyUnused) {
    recommendation = '🗑️ SUPPRIMER - Aucune fonction n\'est utilisée';
  } else if (usagePercentage < 50) {
    recommendation = '⚠️ NETTOYER - Moins de 50% des exports sont utilisés';
  } else if (usagePercentage < 100) {
    recommendation = '🔧 OPTIMISER - Certaines fonctions ne sont pas utilisées';
  } else {
    recommendation = '✅ CONSERVER - Toutes les fonctions sont utilisées';
  }
  
  return {
    hookFile,
    hookName,
    exportedFunctions: functionUsages,
    totalExports,
    totalUsedExports,
    totalUnusedExports,
    usagePercentage,
    isCompletelyUnused,
    recommendation,
  };
}

/**
 * Générer le rapport détaillé
 */
async function generateDetailedReport(): Promise<DetailedReport> {
  const report: DetailedReport = {
    totalHooks: hookFiles.length,
    completelyUnusedHooks: [],
    partiallyUsedHooks: [],
    fullyUsedHooks: [],
    summary: [],
  };
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   🔬 ANALYSE DÉTAILLÉE DES HOOKS - USAGE DES FONCTIONS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  for (const hookFile of hookFiles) {
    const filePath = path.join(HOOKS_DIR, hookFile);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Fichier introuvable: ${hookFile}\n`);
      continue;
    }
    
    const analysis = analyzeHookInDetail(hookFile);
    
    // Catégoriser
    if (analysis.isCompletelyUnused) {
      report.completelyUnusedHooks.push(analysis);
    } else if (analysis.usagePercentage < 100) {
      report.partiallyUsedHooks.push(analysis);
    } else {
      report.fullyUsedHooks.push(analysis);
    }
  }
  
  // Générer le résumé
  report.summary = [
    `Total de hooks analysés: ${report.totalHooks}`,
    ``,
    `🗑️  Hooks complètement inutilisés: ${report.completelyUnusedHooks.length}`,
    `⚠️  Hooks partiellement utilisés: ${report.partiallyUsedHooks.length}`,
    `✅ Hooks complètement utilisés: ${report.fullyUsedHooks.length}`,
    ``,
    `Actions recommandées:`,
    `- Supprimer: ${report.completelyUnusedHooks.length} hook(s)`,
    `- Nettoyer: ${report.partiallyUsedHooks.length} hook(s)`,
  ];
  
  return report;
}

/**
 * Générer le rapport Markdown
 */
function generateMarkdownReport(report: DetailedReport): string {
  let md = `# 🔬 Analyse Détaillée des Hooks - Usage Réel des Fonctions\n\n`;
  md += `**Date**: ${new Date().toLocaleDateString('fr-FR')}\n\n`;
  md += `---\n\n`;
  
  // Résumé
  md += `## 📊 Résumé Exécutif\n\n`;
  report.summary.forEach(line => {
    md += `${line}\n`;
  });
  md += `\n---\n\n`;
  
  // Hooks complètement inutilisés
  md += `## 🗑️ Hooks Complètement Inutilisés (${report.completelyUnusedHooks.length})\n\n`;
  md += `**🚨 ACTION REQUISE: Ces hooks doivent être supprimés immédiatement**\n\n`;
  
  if (report.completelyUnusedHooks.length > 0) {
    report.completelyUnusedHooks.forEach(hook => {
      md += `### ${hook.hookFile}\n\n`;
      md += `- **Exports**: ${hook.totalExports} fonction(s)\n`;
      md += `- **Utilisées**: ${hook.totalUsedExports} (${hook.usagePercentage.toFixed(0)}%)\n`;
      md += `- **Recommandation**: ${hook.recommendation}\n\n`;
      
      if (hook.exportedFunctions.length > 0) {
        md += `**Fonctions exportées (toutes inutilisées)**:\n`;
        hook.exportedFunctions.forEach(func => {
          md += `- \`${func.name}()\` - ${func.callsFound} appel(s)\n`;
        });
        md += `\n`;
      }
      
      md += `**Action**:\n`;
      md += `\`\`\`bash\n`;
      md += `rm hooks/${hook.hookFile}\n`;
      md += `\`\`\`\n\n`;
    });
  } else {
    md += `✅ Aucun hook complètement inutilisé détecté.\n\n`;
  }
  
  md += `---\n\n`;
  
  // Hooks partiellement utilisés
  md += `## ⚠️ Hooks Partiellement Utilisés (${report.partiallyUsedHooks.length})\n\n`;
  md += `**Ces hooks ont des fonctions non utilisées qui pourraient être nettoyées**\n\n`;
  
  if (report.partiallyUsedHooks.length > 0) {
    report.partiallyUsedHooks.forEach(hook => {
      md += `### ${hook.hookFile}\n\n`;
      md += `- **Exports**: ${hook.totalExports} fonction(s)\n`;
      md += `- **Utilisées**: ${hook.totalUsedExports} (${hook.usagePercentage.toFixed(0)}%)\n`;
      md += `- **Non utilisées**: ${hook.totalUnusedExports}\n`;
      md += `- **Recommandation**: ${hook.recommendation}\n\n`;
      
      md += `| Fonction | Appels | Statut |\n`;
      md += `|----------|--------|--------|\n`;
      hook.exportedFunctions.forEach(func => {
        const status = func.callsFound > 0 ? '✅ Utilisée' : '❌ Non utilisée';
        md += `| \`${func.name}()\` | ${func.callsFound} | ${status} |\n`;
      });
      md += `\n`;
      
      // Afficher les fonctions non utilisées
      const unusedFunctions = hook.exportedFunctions.filter(f => f.callsFound === 0);
      if (unusedFunctions.length > 0) {
        md += `**Fonctions à nettoyer**:\n`;
        unusedFunctions.forEach(func => {
          md += `- \`${func.name}()\`\n`;
        });
        md += `\n`;
      }
      
      // Afficher quelques exemples d'utilisation des fonctions utilisées
      const usedFunctions = hook.exportedFunctions.filter(f => f.callsFound > 0);
      if (usedFunctions.length > 0) {
        md += `**Exemples d'utilisation**:\n`;
        usedFunctions.slice(0, 2).forEach(func => {
          if (func.usageLocations.length > 0) {
            md += `- \`${func.name}()\`:\n`;
            func.usageLocations.slice(0, 2).forEach(loc => {
              md += `  - ${loc}\n`;
            });
          }
        });
        md += `\n`;
      }
    });
  } else {
    md += `✅ Aucun hook partiellement utilisé.\n\n`;
  }
  
  md += `---\n\n`;
  
  // Hooks complètement utilisés
  md += `## ✅ Hooks Complètement Utilisés (${report.fullyUsedHooks.length})\n\n`;
  md += `**Ces hooks sont correctement utilisés et doivent être conservés**\n\n`;
  
  if (report.fullyUsedHooks.length > 0) {
    md += `| Hook | Exports | Utilisées | Usage |\n`;
    md += `|------|---------|-----------|-------|\n`;
    report.fullyUsedHooks.forEach(hook => {
      md += `| ${hook.hookFile} | ${hook.totalExports} | ${hook.totalUsedExports} | ${hook.usagePercentage.toFixed(0)}% |\n`;
    });
    md += `\n`;
    
    // Détail de quelques hooks
    md += `### Détails\n\n`;
    report.fullyUsedHooks.slice(0, 5).forEach(hook => {
      md += `**${hook.hookFile}**:\n`;
      hook.exportedFunctions.forEach(func => {
        md += `- \`${func.name}()\`: ${func.callsFound} appel(s)\n`;
      });
      md += `\n`;
    });
  }
  
  md += `---\n\n`;
  
  // Plan d'action
  md += `## 🎯 Plan d'Action Recommandé\n\n`;
  
  if (report.completelyUnusedHooks.length > 0) {
    md += `### 1. Supprimer les hooks inutilisés (IMMÉDIAT)\n\n`;
    md += `\`\`\`bash\n`;
    md += `cd hooks\n\n`;
    report.completelyUnusedHooks.forEach(hook => {
      md += `# ${hook.hookFile} - Aucune fonction utilisée\n`;
      md += `rm ${hook.hookFile}\n\n`;
    });
    md += `\`\`\`\n\n`;
  }
  
  if (report.partiallyUsedHooks.length > 0) {
    md += `### 2. Nettoyer les hooks partiellement utilisés\n\n`;
    md += `Pour chaque hook partiellement utilisé, supprimer les fonctions non utilisées.\n\n`;
    report.partiallyUsedHooks.forEach(hook => {
      const unusedFunctions = hook.exportedFunctions.filter(f => f.callsFound === 0);
      if (unusedFunctions.length > 0) {
        md += `**${hook.hookFile}**:\n`;
        unusedFunctions.forEach(func => {
          md += `- Supprimer \`${func.name}()\`\n`;
        });
        md += `\n`;
      }
    });
  }
  
  md += `### 3. Vérification finale\n\n`;
  md += `\`\`\`bash\n`;
  md += `# Vérifier la compilation\n`;
  md += `pnpm build\n\n`;
  md += `# Vérifier les types\n`;
  md += `pnpm tsc --noEmit\n\n`;
  md += `# Relancer l'analyse\n`;
  md += `npx tsx scripts/analyze-hooks-detailed.ts\n`;
  md += `\`\`\`\n\n`;
  
  return md;
}

// Exécution principale
(async () => {
  try {
    const report = await generateDetailedReport();
    
    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log('📄 Génération du rapport Markdown...\n');
    
    const markdownReport = generateMarkdownReport(report);
    const reportPath = path.join(process.cwd(), 'docs', 'HOOKS_DETAILED_ANALYSIS.md');
    
    fs.writeFileSync(reportPath, markdownReport, 'utf-8');
    
    console.log(`✅ Rapport sauvegardé: ${reportPath}\n`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Afficher le résumé
    console.log('\n📊 RÉSUMÉ:\n');
    report.summary.forEach(line => console.log(`   ${line}`));
    console.log('\n');
    
    // Afficher les hooks à supprimer
    if (report.completelyUnusedHooks.length > 0) {
      console.log('🗑️  HOOKS À SUPPRIMER:\n');
      report.completelyUnusedHooks.forEach(hook => {
        console.log(`   - ${hook.hookFile} (${hook.totalExports} fonction(s) non utilisée(s))`);
      });
      console.log('\n');
    }
    
    // Afficher les hooks à nettoyer
    if (report.partiallyUsedHooks.length > 0) {
      console.log('⚠️  HOOKS À NETTOYER:\n');
      report.partiallyUsedHooks.forEach(hook => {
        console.log(`   - ${hook.hookFile} (${hook.totalUnusedExports}/${hook.totalExports} fonction(s) non utilisée(s))`);
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
