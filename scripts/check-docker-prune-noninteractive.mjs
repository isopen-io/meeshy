#!/usr/bin/env node
// Garde de la RELEASE des images sur le serveur final [#6556]
//
// LE DÉFAUT QU'IL FERME
//
// L'hôte de staging accumule une image par service ET PAR VERSION à chaque
// poussée sur `dev` ; rien ne les retire. Le 2026-09-14, `docker pull` a rendu
// `no space left on device` : le déploiement s'est arrêté là et staging a
// continué de servir la version précédente sans que rien ne le dise. Le remède
// est une purge dans le code de release — mais une purge qui MARCHE :
//
//   1. `docker image prune` demande `y/N`. Au bout d'un `ssh` ou dans un job
//      de CI il n'y a pas de terminal : l'entrée vide se lit « N », rien n'est
//      retiré, et on croit avoir purgé. D'où l'exigence d'un drapeau NON
//      INTERACTIF (`-f`, `-af`, `--force`) sur CHAQUE purge du dépôt.
//   2. La purge doit PRÉCÉDER le `pull`. Après, elle arrive trop tard : ce qui
//      manque de place, c'est l'écriture des couches téléchargées.
//
// ET LA SECONDE MOITIÉ DE LA RÈGLE (directive porteur 2026-09-15)
//
// **Le déploiement automatique ne se fait qu'en DEV, jamais sur `main` en
// production.** Un job de workflow qui tient une clé SSH de déploiement est
// donc épinglé à `refs/heads/dev` et ne peut mentionner ni `refs/heads/main`
// ni `refs/tags/`. C'est aujourd'hui vrai de `deploy-staging` — ce garde
// empêche qu'un futur job « deploy-prod » branche la production sur une
// poussée, sans qu'aucun humain n'ait tranché.
//
// CE QU'IL NE FAIT PAS
//
// Il ne lit pas l'hôte. `infrastructure/scripts/meeshy-deploy-staging.sh` est
// la SOURCE de ce qui s'exécute sur le serveur final, pas une preuve que le
// serveur l'exécute : l'installation reste un geste manuel, documenté en tête
// de ce script. Le garde tient le dépôt cohérent ; il ne tient pas la machine.

import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SHELL_DIRS = ['scripts', 'scripts/deployment', 'scripts/production', 'scripts/maintenance', 'infrastructure/scripts', 'apps/web/scripts'];
const WORKFLOW_DIR = join('.github', 'workflows');

const PRUNE = /^[^#]*\bdocker\s+(system|image|images|volume|network|container|builder)\s+prune\b(?<flags>[^\n]*)/;
const NON_INTERACTIF = /(^|[\s"'])(-[a-z]*f[a-z]*|--force)([\s"';]|$)/;
const PULL = /^[^#]*\bdocker[-\s]compose\s+pull\b/;
const DISTANT = /(^|\s)(ssh|scp)\s/;

const listFiles = (root) => {
  const shell = SHELL_DIRS.filter((dir) => existsSync(join(root, dir))).flatMap((dir) =>
    readdirSync(join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sh'))
      .map((entry) => join(dir, entry.name)),
  );
  const workflows = existsSync(join(root, WORKFLOW_DIR))
    ? readdirSync(join(root, WORKFLOW_DIR))
        .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
        .map((name) => join(WORKFLOW_DIR, name))
    : [];
  return [...shell, ...workflows];
};

export const readWorld = (root) => ({
  files: listFiles(root).map((path) => ({ path, source: readFileSync(join(root, path), 'utf8') })),
});

const lignes = (source) => source.split('\n');

const prunesDe = (file) =>
  lignes(file.source)
    .map((line, index) => ({ line: index + 1, text: line, match: PRUNE.exec(line) }))
    .filter((entry) => entry.match !== null);

const premierPull = (file) => {
  const index = lignes(file.source).findIndex((line) => PULL.test(line));
  return index === -1 ? null : index + 1;
};

const tireDesImages = (file) => premierPull(file) !== null;

const parleAUnHoteDistant = (file) => lignes(file.source).some((line) => DISTANT.test(line));

const premierePurge = (file) => {
  const purges = prunesDe(file).filter((purge) => /\b(image|images|system)\s+prune/.test(purge.text));
  return purges.length === 0 ? null : purges[0].line;
};

// RÈGLE A — aucune purge ne peut attendre un `y`.
const chaquePurgeEstNonInteractive = (world) =>
  world.files.flatMap((file) =>
    prunesDe(file)
      .filter((purge) => !NON_INTERACTIF.test(purge.match.groups.flags))
      .map(
        (purge) =>
          `${file.path}:${purge.line} : purge Docker sans drapeau non interactif — « ${purge.text.trim()} ».\n` +
          `  \`docker … prune\` demande y/N : hors terminal, la réponse vide vaut « N » et rien n'est retiré. Ajouter \`-f\` (#6556).`,
      ),
  );

// RÈGLE B — un code de release distant purge AVANT de tirer.
const uneReleaseDistantePurgeAvantDeTirer = (world) =>
  world.files
    .filter((file) => file.path.endsWith('.sh'))
    .filter((file) => parleAUnHoteDistant(file) && tireDesImages(file))
    .flatMap((file) => {
      const pull = premierPull(file);
      const purge = premierePurge(file);
      if (purge === null) {
        return [
          `${file.path} : tire des images sur un hôte distant (ligne ${pull}) sans jamais purger.\n` +
            `  L'hôte accumule une image par service et par version jusqu'au « no space left on device » (#6556).`,
        ];
      }
      return purge < pull
        ? []
        : [
            `${file.path} : la purge (ligne ${purge}) suit le pull (ligne ${pull}).\n` +
              `  Après le pull, elle arrive trop tard — c'est l'écriture des couches qui manque de place (#6556).`,
          ];
    });

// RÈGLE C — le déploiement automatique reste DEV, jamais `main`/production.
const JOB = /^ {2}([A-Za-z0-9_-]+):$/;

export const jobsDe = (source) => {
  const rows = lignes(source);
  const starts = rows
    .map((line, index) => ({ index, name: JOB.exec(line)?.[1] }))
    .filter((entry) => entry.name !== undefined);
  return starts.map((start, rank) => ({
    name: start.name,
    line: start.index + 1,
    body: rows.slice(start.index, starts[rank + 1]?.index ?? rows.length).join('\n'),
  }));
};

const leDeploiementAutomatiqueResteEnDev = (world) =>
  world.files
    .filter((file) => file.path.startsWith(WORKFLOW_DIR))
    .flatMap((file) => jobsDe(file.source).map((job) => ({ file, job })))
    .filter(({ job }) => /secrets\.[A-Z_]*SSH_KEY/.test(job.body))
    .flatMap(({ file, job }) => {
      const garde = lignes(job.body)
        .filter((line) => /^\s{4}if:/.test(line) || /^\s{6}[^-\s].*github\.ref/.test(line))
        .join(' ');
      const failures = [];
      if (!garde.includes("refs/heads/dev")) {
        failures.push(
          `${file.path}:${job.line} : le job « ${job.name} » tient une clé SSH de déploiement sans être épinglé à \`refs/heads/dev\`.\n` +
            `  Le déploiement automatique ne se fait qu'en DEV — jamais depuis \`main\` vers la production (directive porteur 2026-09-15).`,
        );
      }
      if (/refs\/heads\/main|refs\/tags\//.test(garde)) {
        failures.push(
          `${file.path}:${job.line} : le job « ${job.name} » déploie depuis \`main\` ou un tag.\n` +
            `  La production ne se déploie JAMAIS automatiquement (directive porteur 2026-09-15).`,
        );
      }
      return failures;
    });

const leBalayageNEstPasVide = (world) => {
  const failures = [];
  if (world.files.length === 0) failures.push('aucun fichier balayé : la liste des répertoires a changé, ou la lecture est cassée.');
  if (world.files.flatMap(prunesDe).length === 0) failures.push('aucune purge Docker lue dans le dépôt : le motif de lecture est cassé.');
  if (!world.files.some((file) => file.path.startsWith(WORKFLOW_DIR) && /secrets\.[A-Z_]*SSH_KEY/.test(file.source)))
    failures.push('aucun job de déploiement SSH lu dans les workflows : le motif de lecture est cassé.');
  return failures;
};

const CHECKS = Object.freeze([
  leBalayageNEstPasVide,
  chaquePurgeEstNonInteractive,
  uneReleaseDistantePurgeAvantDeTirer,
  leDeploiementAutomatiqueResteEnDev,
]);

const inspect = (world) => CHECKS.flatMap((check) => check(world));

const TEMOIN = `temoin-${process.pid}`;

const MUTATIONS = Object.freeze([
  {
    nom: 'une purge sans -f',
    attendu: 'sans drapeau non interactif',
    muter: (world) => ({
      files: [...world.files, { path: `scripts/${TEMOIN}.sh`, source: '#!/bin/bash\ndocker image prune\n' }],
    }),
  },
  {
    nom: 'une release distante qui ne purge pas',
    attendu: 'sans jamais purger',
    muter: (world) => ({
      files: [
        ...world.files,
        { path: `scripts/${TEMOIN}-pull.sh`, source: '#!/bin/bash\nssh root@host "docker compose pull"\n' },
      ],
    }),
  },
  {
    nom: 'une purge posée APRÈS le pull',
    attendu: 'arrive trop tard',
    muter: (world) => ({
      files: [
        ...world.files,
        {
          path: `scripts/${TEMOIN}-ordre.sh`,
          source: '#!/bin/bash\nssh root@host "docker compose pull"\nssh root@host "docker image prune -af"\n',
        },
      ],
    }),
  },
  {
    nom: 'un déploiement automatique depuis main',
    attendu: 'déploie depuis `main`',
    muter: (world) => ({
      files: [
        ...world.files,
        {
          path: `${WORKFLOW_DIR}/${TEMOIN}.yml`,
          source: `jobs:\n  deploy-prod:\n    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev'\n    steps:\n      - env:\n          SSH_KEY: \${{ secrets.PROD_SSH_KEY }}\n`,
        },
      ],
    }),
  },
  {
    nom: 'un déploiement automatique non épinglé à dev',
    attendu: 'sans être épinglé',
    muter: (world) => ({
      files: [
        ...world.files,
        {
          path: `${WORKFLOW_DIR}/${TEMOIN}-nu.yml`,
          source: `jobs:\n  deploy-nu:\n    steps:\n      - env:\n          SSH_KEY: \${{ secrets.PROD_SSH_KEY }}\n`,
        },
      ],
    }),
  },
  {
    nom: 'un balayage vide',
    attendu: 'aucun fichier balayé',
    muter: () => ({ files: [] }),
  },
]);

const selfTest = (world) => {
  const aveugles = MUTATIONS.filter(
    (mutation) => !inspect(mutation.muter(world)).some((failure) => failure.includes(mutation.attendu)),
  );
  if (aveugles.length > 0) {
    aveugles.forEach((mutation) => console.error(`AVEUGLE : « ${mutation.nom} » n'a produit aucun échec.`));
    return 1;
  }
  console.log(`self-test : ${MUTATIONS.length}/${MUTATIONS.length} mutations détectées.`);
  return 0;
};

const main = () => {
  const world = readWorld(REPO_ROOT);
  if (process.argv.includes('--self-test')) return selfTest(world);
  const failures = inspect(world);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(`\n${failures.length} défaut(s) dans la release des images sur le serveur final.`);
    return 1;
  }
  const purges = world.files.flatMap(prunesDe).length;
  console.log(
    `release des images : ${purges} purge(s) Docker, toutes non interactives ; ` +
      `les releases distantes purgent avant de tirer ; le déploiement automatique reste sur \`dev\`.`,
  );
  return 0;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
