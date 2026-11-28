#!/usr/bin/env node
// Inventaire du dépôt, DÉCOUVERT depuis les manifestes — aucun nom de projet
// n'est écrit ici. Lit ce que chaque outil natif lit : `workspaces` du
// package.json racine (pnpm/bun/turbo), settings.gradle(.kts), Package.swift,
// project.yml (xcodegen), Cargo.toml, pyproject.toml, Dockerfile*, workflows.
//
//   node .amsf/scripts/inventaire.mjs                 inventaire en Markdown
//   node .amsf/scripts/inventaire.mjs --json          le même, en JSON
//   node .amsf/scripts/inventaire.mjs --affected origin/dev  projets touchés depuis <base>
//                                                     et leurs consommateurs transitifs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const IGNORES = new Set(['node_modules', '.git', 'dist', 'build', '.build', '.venv', 'Pods', 'DerivedData', '.turbo', '.gradle', 'SourcePackages', 'coverage']);

const lire = (chemin) => readFileSync(join(racine, chemin), 'utf8');
const json = (chemin) => JSON.parse(lire(chemin));

const parcourir = (dossier, profondeur, garde) => {
  if (profondeur < 0) return [];
  const absolu = join(racine, dossier);
  if (!existsSync(absolu)) return [];
  return readdirSync(absolu, { withFileTypes: true }).flatMap((entree) => {
    if (IGNORES.has(entree.name) || entree.isSymbolicLink()) return [];
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return parcourir(chemin, profondeur - 1, garde);
    return garde(entree.name) ? [chemin] : [];
  });
};

const workspacesJs = () => {
  const globs = json('package.json').workspaces ?? [];
  const dossiers = globs.flatMap((glob) => {
    const base = glob.replace(/\/\*$/, '');
    if (base === glob) return existsSync(join(racine, glob, 'package.json')) ? [glob] : [];
    if (!existsSync(join(racine, base))) return [];
    return readdirSync(join(racine, base))
      .map((nom) => join(base, nom))
      .filter((chemin) => existsSync(join(racine, chemin, 'package.json')));
  });
  const manifestes = dossiers.map((chemin) => ({ chemin, manifeste: json(join(chemin, 'package.json')) }));
  const noms = new Set(manifestes.map(({ manifeste }) => manifeste.name));
  return manifestes.map(({ chemin, manifeste }) => {
    const deps = { ...manifeste.dependencies, ...manifeste.devDependencies, ...manifeste.peerDependencies };
    return {
      nom: manifeste.name,
      chemin,
      version: manifeste.version,
      dependances: Object.keys(deps).filter((dep) => noms.has(dep)).sort(),
      scripts: Object.keys(manifeste.scripts ?? {}).filter((script) => /^(build|test|type-check|lint|dev|start)$/.test(script)),
    };
  });
};

const dossiersSansWorkspace = (workspaces) => {
  const connus = new Set(workspaces.map((w) => w.chemin));
  const globs = (json('package.json').workspaces ?? []).map((glob) => glob.replace(/\/\*$/, ''));
  return globs.flatMap((base) =>
    existsSync(join(racine, base))
      ? readdirSync(join(racine, base), { withFileTypes: true })
          .filter((entree) => entree.isDirectory())
          .map((entree) => join(base, entree.name))
          .filter((chemin) => !connus.has(chemin))
      : [],
  );
};

const modulesGradle = () =>
  parcourir('.', 3, (nom) => /^settings\.gradle(\.kts)?$/.test(nom)).map((chemin) => ({
    chemin: dirname(chemin),
    modules: [...lire(chemin).matchAll(/include\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]),
  }));

const paquetsSwift = () =>
  parcourir('.', 3, (nom) => nom === 'Package.swift').map((chemin) => {
    const source = lire(chemin);
    return {
      chemin: dirname(chemin),
      produits: [...source.matchAll(/\.library\(\s*name:\s*"([^"]+)"/g)].map((m) => m[1]),
      dependancesLocales: [...source.matchAll(/\.package\(\s*path:\s*"([^"]+)"/g)].map((m) =>
        relative(racine, resolve(racine, dirname(chemin), m[1])),
      ),
    };
  });

const projetsXcodegen = () =>
  parcourir('.', 3, (nom) => nom === 'project.yml').map((chemin) => {
    const lignes = lire(chemin).split('\n');
    const debut = lignes.findIndex((ligne) => /^targets:\s*$/.test(ligne));
    const fin = lignes.findIndex((ligne, index) => index > debut && /^\S/.test(ligne));
    const bloc = debut < 0 ? [] : lignes.slice(debut + 1, fin < 0 ? undefined : fin);
    return {
      chemin: dirname(chemin),
      cibles: bloc.map((ligne) => ligne.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)?.[1]).filter(Boolean),
      paquetsLocaux: [...lire(chemin).matchAll(/^\s+path:\s*(\.\.\/\S+)/gm)].map((m) => relative(racine, resolve(racine, dirname(chemin), m[1]))),
    };
  });

const manifestes = (nom, champ) =>
  parcourir('.', 3, (fichier) => fichier === nom).map((chemin) => ({
    chemin: dirname(chemin),
    nom: lire(chemin).match(champ)?.[1] ?? '(sans nom)',
  }));

const dockerfiles = () => parcourir('.', 3, (nom) => /^Dockerfile(\..+)?$/.test(nom)).sort();
const workflows = () =>
  parcourir('.github/workflows', 0, (nom) => /\.ya?ml$/.test(nom))
    .sort()
    .map((chemin) => ({ chemin, nom: lire(chemin).match(/^name:\s*['"]?(.+?)['"]?\s*$/m)?.[1] ?? '' }));
const composes = () =>
  parcourir('.', 3, (nom) => /^docker-compose.*\.ya?ml$/.test(nom)).sort();

const inventaire = () => {
  const workspaces = workspacesJs();
  return {
    workspaces,
    horsWorkspace: dossiersSansWorkspace(workspaces),
    gradle: modulesGradle(),
    swift: paquetsSwift(),
    xcodegen: projetsXcodegen(),
    cargo: manifestes('Cargo.toml', /^name\s*=\s*"([^"]+)"/m),
    python: manifestes('pyproject.toml', /^name\s*=\s*"([^"]+)"/m),
    dockerfiles: dockerfiles(),
    workflows: workflows(),
    composes: composes(),
  };
};

const consommateursTransitifs = (workspaces, departs) => {
  const atteints = new Set(departs);
  const etendre = () => {
    const nouveaux = workspaces.filter((w) => !atteints.has(w.nom) && w.dependances.some((dep) => atteints.has(dep)));
    nouveaux.forEach((w) => atteints.add(w.nom));
    return nouveaux.length > 0 && etendre();
  };
  etendre();
  return [...atteints].sort();
};

const touches = (base) => {
  const sortie = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: racine, encoding: 'utf8' });
  const fichiers = sortie.split('\n').filter(Boolean);
  const inv = inventaire();
  const directs = inv.workspaces.filter((w) => fichiers.some((f) => f.startsWith(`${w.chemin}/`))).map((w) => w.nom);
  const natifs = [...inv.gradle, ...inv.swift, ...inv.xcodegen, ...inv.cargo, ...inv.python]
    .map((p) => p.chemin)
    .filter((chemin, index, tous) => tous.indexOf(chemin) === index)
    .filter((chemin) => chemin !== '.' && fichiers.some((f) => f.startsWith(`${chemin}/`)));
  const consommateursNatifs = [
    ...inv.swift.map((s) => ({ chemin: s.chemin, lit: s.dependancesLocales })),
    ...inv.xcodegen.map((x) => ({ chemin: x.chemin, lit: x.paquetsLocaux })),
  ];
  const etendreNatifs = (atteints) => {
    const nouveaux = consommateursNatifs
      .filter((c) => !atteints.includes(c.chemin) && c.lit.some((dep) => atteints.includes(dep)))
      .map((c) => c.chemin);
    return nouveaux.length === 0 ? atteints : etendreNatifs([...atteints, ...new Set(nouveaux)]);
  };
  const natifsTransitifs = etendreNatifs(natifs).sort();
  const horsProjet = fichiers.filter(
    (f) => !inv.workspaces.some((w) => f.startsWith(`${w.chemin}/`)) && !natifs.some((chemin) => f.startsWith(`${chemin}/`)),
  );
  return { base, fichiers: fichiers.length, directs, transitifs: consommateursTransitifs(inv.workspaces, directs), natifs, natifsTransitifs, horsProjet };
};

const tableau = (entetes, lignes) =>
  [`| ${entetes.join(' | ')} |`, `|${entetes.map(() => '---').join('|')}|`, ...lignes.map((ligne) => `| ${ligne.join(' | ')} |`)].join('\n');

const markdown = (inv) =>
  [
    '## Workspaces JavaScript (package.json racine → `workspaces`)',
    tableau(['paquet', 'chemin', 'version', 'dépend de', 'scripts'], inv.workspaces.map((w) => [w.nom, w.chemin, w.version, w.dependances.join(', ') || '—', w.scripts.join(', ') || '—'])),
    '',
    '## Dossiers des globs de workspace SANS package.json (projets natifs)',
    inv.horsWorkspace.map((chemin) => `- ${chemin}`).join('\n') || '—',
    '',
    '## Gradle',
    inv.gradle.map((g) => `- ${g.chemin} : ${g.modules.length} modules — ${g.modules.join(' ')}`).join('\n') || '—',
    '',
    '## Swift Package Manager',
    tableau(['paquet', 'produits', 'paquets locaux'], inv.swift.map((s) => [s.chemin, s.produits.join(', ') || '—', s.dependancesLocales.join(', ') || '—'])),
    '',
    '## Projets xcodegen',
    inv.xcodegen.map((x) => `- ${x.chemin} : cibles ${x.cibles.join(', ')} ; paquets locaux ${x.paquetsLocaux.join(', ') || '—'}`).join('\n') || '—',
    '',
    '## Rust / Python',
    [...inv.cargo.map((c) => `- Cargo : ${c.nom} (${c.chemin})`), ...inv.python.map((p) => `- Python : ${p.nom} (${p.chemin})`)].join('\n') || '—',
    '',
    `## Dockerfiles (${inv.dockerfiles.length})`,
    inv.dockerfiles.map((d) => `- ${d}`).join('\n'),
    '',
    `## Workflows GitHub Actions (${inv.workflows.length})`,
    inv.workflows.map((w) => `- ${w.chemin} — ${w.nom}`).join('\n'),
    '',
    `## Fichiers compose (${inv.composes.length})`,
    inv.composes.map((c) => `- ${c}`).join('\n'),
  ].join('\n');

const [mode, argument] = process.argv.slice(2);
if (mode === '--affected') {
  console.log(JSON.stringify(touches(argument ?? 'origin/dev'), null, 2));
} else if (mode === '--json') {
  console.log(JSON.stringify(inventaire(), null, 2));
} else {
  console.log(markdown(inventaire()));
}
