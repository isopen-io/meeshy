#!/usr/bin/env node
/**
 * Le CLIQUET qui tient ensemble les plateformes des images `latest` (#6442).
 *
 * ## Ce qu'il garde, et pourquoi ça n'allait pas de soi
 *
 * Deux workflows publient `isopen/meeshy-<image>:latest` sur `main` :
 * `docker.yml` et `release.yml`. Le manifeste servi est celui du DERNIER arrivé.
 * Ils ne construisaient pas pour les mêmes plateformes — `docker.yml` en
 * `linux/amd64`, `release.yml` en `linux/amd64,linux/arm64` sous émulation QEMU —
 * et deux conséquences ont été mesurées le 2026-09-14 :
 *
 *   1. `meeshy-web:latest` publié amd64 à 01:32 par Docker, puis amd64+arm64 à
 *      01:59 par Release : l'architecture d'un même tag tirée au sort par
 *      l'ordre d'arrivée ;
 *   2. l'étage arm64 émulé de la passerelle a planté deux fois de suite
 *      (`qemu: uncaught target signal 4 (Illegal instruction)` pendant
 *      `prisma generate`) sur une recette identique à celle de la veille — même
 *      verrou, mêmes images de base, même émulateur. Un rouge qu'aucun code ne
 *      cause, sur `main`.
 *
 * > **Deux listes pour une même décision, c'est une décision prise par celle
 * > qui a parlé la dernière.** Le cliquet n'arbitre pas quelle plateforme est
 * > juste : il interdit qu'il y en ait deux.
 *
 * ## Les trois règles
 *
 *   1. tout workflow qui publie `latest` déclare `env.PLATFORMS`, et tous
 *      déclarent le MÊME ensemble ;
 *   2. l'étape `docker/build-push-action` de ces workflows lit ses plateformes
 *      dans `env.PLATFORMS` — directement, ou par la sortie d'une étape dont
 *      chaque `value=` écrite est `env.PLATFORMS` (éventuellement derrière une
 *      entrée manuelle `github.event.inputs.platforms ||`) ou une liste
 *      littérale INCLUSE dans `env.PLATFORMS` ;
 *   3. non-vacuité : au moins deux publieurs lus, chacun avec au moins une
 *      étape de construction — un balayage qui ne voit rien serait vert.
 *
 * Un publieur est reconnu par ce qu'il FAIT — une étiquette
 * `type=raw,value=latest` —, jamais par son nom de fichier : renommer un
 * workflow ne doit pas éteindre le cliquet en silence.
 *
 * Usage :
 *   node scripts/check-release-platforms.mjs             # le cliquet
 *   node scripts/check-release-platforms.mjs --self-test # prouve qu'il tombe
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { envOf, jobsOf, stepsOf } from './lib/lecture-workflow.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(RACINE, '.github/workflows');

const PUBLIE_LATEST = /type=raw,value=latest\b/;
const CONSTRUIT = 'docker/build-push-action';
const PUBLIEURS_MINIMUM = 2;

const LIT_ENV = /^\$\{\{\s*env\.PLATFORMS\s*\}\}$/;
const LIT_ENTREE_OU_ENV = /^\$\{\{\s*github\.event\.inputs\.platforms\s*\|\|\s*env\.PLATFORMS\s*\}\}$/;
const SORTIE_D_ETAPE = /^\$\{\{\s*steps\.([A-Za-z0-9_-]+)\.outputs\.value\s*\}\}$/;
const ECRITURE = /echo\s+"value=([^"]*)"\s*>>\s*"?\$GITHUB_OUTPUT"?/;

const ensembleDe = (liste) =>
  [...new Set(liste.split(',').map((plateforme) => plateforme.trim()).filter((plateforme) => plateforme !== ''))].sort();

const memeEnsemble = (gauche, droite) =>
  gauche.length === droite.length && gauche.every((plateforme, rang) => plateforme === droite[rang]);

const inclus = (partie, tout) => partie.every((plateforme) => tout.includes(plateforme));

const constructionsDe = (texte) =>
  jobsOf(texte).flatMap((job) => {
    const etapes = stepsOf(job);
    return etapes
      .filter((etape) => etape.uses !== null && etape.uses.startsWith(CONSTRUIT))
      .map((etape) => ({ job: job.name, etape, voisines: etapes }));
  });

const fauteDEcriture = (ou, productrice, declarees) => (ligne) => {
  const ecriture = ECRITURE.exec(ligne);
  if (ecriture === null) {
    return [`${ou} : écriture illisible dans « ${productrice.name} » (${ligne.trim()}) — le cliquet refuse de lire ce qu'il ne comprend pas.`];
  }
  const valeur = ecriture[1];
  if (LIT_ENV.test(valeur) || LIT_ENTREE_OU_ENV.test(valeur)) return [];
  if (valeur.includes('${{')) {
    return [`${ou} : « ${productrice.name} » écrit value=${valeur}, qui ne se ramène pas à env.PLATFORMS.`];
  }
  if (inclus(ensembleDe(valeur), declarees)) return [];
  return [`${ou} : « ${productrice.name} » écrit value=${valeur}, hors de env.PLATFORMS (${declarees.join(',')}).`];
};

const fautesDeProvenance = (fichier, declarees) => ({ job, etape, voisines }) => {
  const ou = `${fichier} · job « ${job} » · étape « ${etape.name} » (l.${etape.line})`;
  const source = etape.with.platforms;
  if (source === undefined) {
    return [`${ou} : ne déclare aucune plateforme — buildx prend celle du runner, hors de env.PLATFORMS.`];
  }
  if (LIT_ENV.test(source)) return [];
  const sortie = SORTIE_D_ETAPE.exec(source);
  if (sortie === null) {
    return [`${ou} : platforms « ${source} » ne lit pas env.PLATFORMS.`];
  }
  const productrice = voisines.find((voisine) => voisine.id === sortie[1]);
  if (productrice === undefined || productrice.run === null) {
    return [`${ou} : platforms lit steps.${sortie[1]}, qu'aucune étape \`run\` du job ne produit.`];
  }
  const ecritures = productrice.run
    .split('\n')
    .filter((ligne) => ligne.includes('value=') && ligne.includes('GITHUB_OUTPUT'));
  if (ecritures.length === 0) {
    return [`${ou} : « ${productrice.name} » n'écrit aucune value= lisible dans $GITHUB_OUTPUT.`];
  }
  return ecritures.flatMap(fauteDEcriture(ou, productrice, declarees));
};

export const violations = (monde) => {
  const publieurs = monde
    .filter(({ texte }) => PUBLIE_LATEST.test(texte))
    .map(({ fichier, texte }) => ({ fichier, texte, brut: envOf(texte).PLATFORMS }));

  const vacuite =
    publieurs.length < PUBLIEURS_MINIMUM
      ? [
          `non-vacuité : ${publieurs.length} workflow(s) publient latest, en dessous du plancher ${PUBLIEURS_MINIMUM} — ` +
            'la lecture de .github/workflows/ a cessé de voir ce qu\'elle voyait.',
        ]
      : [];

  const nonDeclares = publieurs
    .filter(({ brut }) => brut === undefined || brut === '')
    .map(({ fichier }) => `${fichier} publie latest mais ne déclare pas env.PLATFORMS.`);

  const declares = publieurs
    .filter(({ brut }) => brut !== undefined && brut !== '')
    .map((publieur) => ({ ...publieur, plateformes: ensembleDe(publieur.brut) }));

  const divergence =
    declares.length > 1 && !declares.every(({ plateformes }) => memeEnsemble(plateformes, declares[0].plateformes))
      ? [
          'les workflows qui publient latest ne déclarent pas les mêmes plateformes : ' +
            declares.map(({ fichier, plateformes }) => `${fichier} = ${plateformes.join(',')}`).join(' ; ') +
            ' — le manifeste de latest dépend de celui qui finit le dernier.',
        ]
      : [];

  const provenances = declares.flatMap(({ fichier, texte, plateformes }) => {
    const constructions = constructionsDe(texte);
    if (constructions.length === 0) {
      return [`non-vacuité : ${fichier} publie latest mais aucune étape ${CONSTRUIT} n'y a été lue.`];
    }
    return constructions.flatMap(fautesDeProvenance(fichier, plateformes));
  });

  return [...vacuite, ...nonDeclares, ...divergence, ...provenances];
};

const dans = (fichier, avant, apres) => (monde) =>
  monde.map((entree) => (entree.fichier === fichier ? { ...entree, texte: entree.texte.replace(avant, apres) } : entree));

/**
 * Les mutations qui doivent faire TOMBER le cliquet, une par règle au moins :
 * sans quoi une seule règle pourrait porter les trois.
 */
const MUTATIONS = [
  {
    nom: 'règle 1 — Release retrouve arm64',
    muter: dans('release.yml', '  PLATFORMS: linux/amd64\n', '  PLATFORMS: linux/amd64,linux/arm64\n'),
    attendu: /ne déclarent pas les mêmes plateformes/,
  },
  {
    nom: 'règle 1 — env.PLATFORMS retiré d\'un publieur',
    muter: dans('release.yml', '  PLATFORMS: linux/amd64\n', ''),
    attendu: /ne déclare pas env\.PLATFORMS/,
  },
  {
    nom: 'règle 2 — la construction contourne env.PLATFORMS',
    muter: dans('release.yml', 'platforms: ${{ env.PLATFORMS }}', 'platforms: linux/amd64,linux/arm64'),
    attendu: /ne lit pas env\.PLATFORMS/,
  },
  {
    nom: 'règle 2 — une sortie d\'étape écrit hors de env.PLATFORMS',
    muter: dans('docker.yml', 'echo "value=linux/amd64" >> $GITHUB_OUTPUT', 'echo "value=linux/arm64" >> $GITHUB_OUTPUT'),
    attendu: /hors de env\.PLATFORMS/,
  },
  {
    nom: 'règle 3 — un publieur de moins',
    muter: dans('release.yml', 'type=raw,value=latest', 'type=raw,value=stable'),
    attendu: /non-vacuité/,
  },
];

const selfTest = (monde) => {
  const base = violations(monde);
  if (base.length !== 0) {
    console.error("self-test : l'état de départ n'est pas vert, les mutations ne prouvent rien");
    base.forEach((faute) => console.error(`  - ${faute}`));
    return 1;
  }
  const echecs = MUTATIONS.filter((mutation) => {
    const mute = mutation.muter(monde);
    if (mute.every((entree, rang) => entree.texte === monde[rang].texte)) {
      console.error(`✗ ${mutation.nom} : la mutation n'a RIEN changé — elle ne prouve rien`);
      return true;
    }
    const trouvees = violations(mute);
    if (trouvees.some((faute) => mutation.attendu.test(faute))) {
      console.log(`✓ ${mutation.nom}`);
      return false;
    }
    console.error(`✗ ${mutation.nom} : le cliquet N'A PAS rougi`);
    trouvees.forEach((faute) => console.error(`    ${faute}`));
    return true;
  });
  return echecs.length === 0 ? 0 : 1;
};

const monde = readdirSync(WORKFLOWS)
  .filter((nom) => /\.ya?ml$/.test(nom))
  .sort()
  .map((fichier) => ({ fichier, texte: readFileSync(join(WORKFLOWS, fichier), 'utf8') }));

if (process.argv.includes('--self-test')) {
  process.exit(selfTest(monde));
}

const faits = violations(monde);
if (faits.length === 0) {
  console.log('Plateformes des images : un seul env.PLATFORMS pour latest, lu par chaque construction.');
  process.exit(0);
}

console.error('Les images latest ne sont pas publiées pour une seule liste de plateformes :');
faits.forEach((faute) => console.error(`  - ${faute}`));
process.exit(1);
