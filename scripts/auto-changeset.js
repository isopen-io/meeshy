#!/usr/bin/env node
/**
 * Génère automatiquement un changeset à partir des commits conventionnels
 * depuis le dernier tag Git.
 *
 * Usage:
 *   node scripts/auto-changeset.js
 *   node scripts/auto-changeset.js --dry-run
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Mapping des scopes vers les packages
const SCOPE_TO_PACKAGE = {
  'web': '@meeshy/web',
  'frontend': '@meeshy/web',
  'gateway': '@meeshy/gateway',
  'api': '@meeshy/gateway',
  'translator': '@meeshy/translator',
  'ml': '@meeshy/translator',
  'shared': '@meeshy/shared',
  'common': '@meeshy/shared',
};

// Mapping des types de commit vers les types de bump
const COMMIT_TYPE_TO_BUMP = {
  'feat': 'minor',
  'fix': 'patch',
  'perf': 'patch',
  'refactor': 'patch',
  'breaking': 'major',
  'chore': null,
  'docs': null,
  'test': null,
  'ci': null,
  'style': null,
  'build': null,
};

function getLastTag() {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim();
  } catch (e) {
    console.log('⚠️  Aucun tag trouvé, utilisation de tous les commits');
    return null;
  }
}

function getCommitsSinceTag(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  try {
    const output = execSync(`git log ${range} --pretty=format:"%s"`, { encoding: 'utf-8' });
    return output.split('\n').filter(Boolean);
  } catch (e) {
    console.error('❌ Erreur lors de la récupération des commits:', e.message);
    return [];
  }
}

function parseConventionalCommit(message) {
  // Format: type(scope): description
  // ou: type: description
  const regex = /^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/;
  const match = message.match(regex);

  if (!match) return null;

  const [, type, scope, description] = match;

  // Détecter breaking changes
  const isBreaking = message.includes('BREAKING CHANGE') || message.includes('!:');

  return {
    type: isBreaking ? 'breaking' : type,
    scope: scope || null,
    description: description.trim(),
    raw: message
  };
}

function analyzeCommits(commits) {
  const packages = new Map(); // package -> { bump, changes[] }

  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit);
    if (!parsed) continue;

    const bumpType = COMMIT_TYPE_TO_BUMP[parsed.type];
    if (!bumpType) continue; // Ignorer chore, docs, etc.

    // Déterminer les packages affectés
    let affectedPackages = [];

    if (parsed.scope && SCOPE_TO_PACKAGE[parsed.scope]) {
      affectedPackages.push(SCOPE_TO_PACKAGE[parsed.scope]);
    } else {
      // Si pas de scope ou scope inconnu, affecter tous les packages principaux
      affectedPackages = [
        '@meeshy/web',
        '@meeshy/gateway',
        '@meeshy/translator'
      ];
    }

    for (const pkg of affectedPackages) {
      if (!packages.has(pkg)) {
        packages.set(pkg, { bump: bumpType, changes: [] });
      }

      const current = packages.get(pkg);

      // Prendre le bump le plus important (major > minor > patch)
      const bumpPriority = { major: 3, minor: 2, patch: 1 };
      if (bumpPriority[bumpType] > bumpPriority[current.bump]) {
        current.bump = bumpType;
      }

      current.changes.push(parsed.description);
    }
  }

  return packages;
}

function generateChangesetContent(packages) {
  let content = '---\n';

  // En-tête YAML avec les packages et leurs bump types
  for (const [pkg, { bump }] of packages) {
    content += `"${pkg}": ${bump}\n`;
  }

  content += '---\n\n';

  // Description générale
  const allChanges = Array.from(packages.values())
    .flatMap(p => p.changes)
    .filter((v, i, a) => a.indexOf(v) === i); // Dédupliquer

  content += 'Changements automatiques détectés :\n\n';

  for (const change of allChanges) {
    content += `- ${change}\n`;
  }

  return content;
}

function generateChangesetFilename() {
  // Format: auto-YYYYMMDD-HHMMSS.md
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return `auto-${timestamp}.md`;
}

function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('🔍 Analyse des commits pour générer un changeset...\n');

  // Récupérer le dernier tag
  const lastTag = getLastTag();
  if (lastTag) {
    console.log(`📌 Dernier tag: ${lastTag}`);
  }

  // Récupérer les commits
  const commits = getCommitsSinceTag(lastTag);
  console.log(`📝 ${commits.length} commit(s) trouvé(s)\n`);

  if (commits.length === 0) {
    console.log('ℹ️  Aucun commit à analyser');
    process.exit(0);
  }

  // Analyser les commits
  const packages = analyzeCommits(commits);

  if (packages.size === 0) {
    console.log('ℹ️  Aucun changement significatif détecté (seulement chore/docs/test)');
    process.exit(0);
  }

  // Afficher le résumé
  console.log('📦 Packages affectés:\n');
  for (const [pkg, { bump, changes }] of packages) {
    console.log(`  ${pkg}: ${bump}`);
    console.log(`    - ${changes.length} changement(s)`);
  }
  console.log('');

  // Générer le contenu du changeset
  const content = generateChangesetContent(packages);

  if (isDryRun) {
    console.log('🔍 MODE DRY-RUN: Aperçu du changeset qui serait créé:\n');
    console.log('─'.repeat(60));
    console.log(content);
    console.log('─'.repeat(60));
    process.exit(0);
  }

  // Créer le fichier changeset
  const changesetDir = path.join(__dirname, '..', '.changeset');
  const filename = generateChangesetFilename();
  const filepath = path.join(changesetDir, filename);

  fs.writeFileSync(filepath, content, 'utf-8');

  console.log(`✅ Changeset créé: .changeset/${filename}\n`);
  console.log('📋 Prochaines étapes:');
  console.log('  1. Vérifier le changeset: cat .changeset/' + filename);
  console.log('  2. Modifier si nécessaire');
  console.log('  3. git add .changeset/' + filename);
  console.log('  4. git commit -m "chore: add automated changeset"');
  console.log('  5. git push');
}

main();
