#!/usr/bin/env node
// Garde des cibles docker-compose déclarées par scripts/dev.sh [#4547]
//
// LE DÉFAUT QU'IL FERME
//
// `scripts/dev.sh --https` invoquait `docker compose -f
// "$COMPOSE_DIR/docker-compose.local-https.yml"` — un fichier qui n'a JAMAIS
// existé sous `infrastructure/docker/compose/` (mesuré : aucun commit ne l'y a
// écrit). Le drapeau échouait donc systématiquement, silencieusement remplacé
// par un message d'erreur Docker opaque plutôt que par le vrai défaut : « ce
// fichier n'existe pas ». #4547 a tranché que `--https` devient un ALIAS de
// `docker-compose.local.yml` (qui porte déjà mkcert + Traefik), documenté
// comme déprécié, jamais une redirection vers un fichier absent.
//
// Ce garde lit `scripts/dev.sh`, extrait chaque référence
// `$COMPOSE_DIR/docker-compose.*.yml` et vérifie qu'elle résout dans
// `infrastructure/docker/compose/`. Sans lui, une régression future (une
// référence retapée à la main vers un nom qui n'existe pas) redeviendrait
// silencieuse jusqu'à ce qu'un développeur lance la commande.
//
// CE QU'IL NE FAIT PAS
//
// Il ne juge pas si `--https` DOIT exister ni ce qu'il doit faire — c'est la
// décision produit de #4547, déjà écrite dans l'issue. Il vérifie uniquement
// que ce que le script DÉCLARE se résout réellement, quel que soit l'état
// futur de la décision.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV_SH = join('scripts', 'dev.sh');
const COMPOSE_DIR = join('infrastructure', 'docker', 'compose');

const COMPOSE_REFERENCE = /\$COMPOSE_DIR\/(docker-compose[.\w-]*\.ya?ml)/g;

export const composeReferencesOf = (source) =>
  source
    .split('\n')
    .flatMap((line, index) =>
      [...line.matchAll(COMPOSE_REFERENCE)].map((match) => ({ line: index + 1, file: match[1] })),
    );

export const readWorld = (root) => ({
  references: composeReferencesOf(readFileSync(join(root, DEV_SH), 'utf8')),
  exists: (file) => existsSync(join(root, COMPOSE_DIR, file)),
});

const uneReferenceResoutSaCible = (world) =>
  world.references
    .filter((reference) => !world.exists(reference.file))
    .map(
      (reference) =>
        `${DEV_SH}:${reference.line} : référence "$COMPOSE_DIR/${reference.file}", introuvable sous ${COMPOSE_DIR}/.\n` +
        `  Un drapeau ou un chemin de ${DEV_SH} désigne une composition qui n'existe pas — voir #4547.`,
    );

const leBalayageNEstPasVide = (world) =>
  world.references.length === 0
    ? [`aucune référence "$COMPOSE_DIR/docker-compose*.yml" lue dans ${DEV_SH}. Le script a changé de forme, ou la lecture est cassée.`]
    : [];

const CHECKS = Object.freeze([leBalayageNEstPasVide, uneReferenceResoutSaCible]);

const inspect = (world) => CHECKS.flatMap((check) => check(world));

const TEMOIN = `docker-compose.temoin-${process.pid}.yml`;

const selfTest = (world) => {
  const mutated = {
    ...world,
    references: [...world.references, { line: 999, file: TEMOIN }],
  };
  const failures = inspect(mutated);
  if (!failures.some((failure) => failure.includes(TEMOIN))) {
    console.error(`AVEUGLE : une référence vers "${TEMOIN}" (absente) n'a produit aucun échec.`);
    return 1;
  }
  const empty = { ...world, references: [] };
  const emptyFailures = inspect(empty);
  if (!emptyFailures.some((failure) => failure.includes('aucune référence'))) {
    console.error('AVEUGLE : un balayage vide ne produit aucun échec.');
    return 1;
  }
  console.log('self-test : 2/2 mutations détectées.');
  return 0;
};

const main = () => {
  const world = readWorld(REPO_ROOT);
  if (process.argv.includes('--self-test')) return selfTest(world);
  const failures = inspect(world);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(`\n${failures.length} défaut(s) dans les cibles docker-compose de ${DEV_SH}.`);
    return 1;
  }
  console.log(
    `${DEV_SH} : ${world.references.length} référence(s) docker-compose, toutes résolues sous ${COMPOSE_DIR}/.`,
  );
  return 0;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
