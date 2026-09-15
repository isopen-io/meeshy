#!/usr/bin/env node
// Choix de la base de comparaison du job « Detect Changes » (.github/workflows/docker.yml) — #6551
//
// LE DÉFAUT
// `docker.yml` diffait jusqu'ici depuis `github.event.before` — la poussée
// PRÉCÉDENTE, pas le dernier commit réellement construit/déployé. Avec
// `concurrency: cancel-in-progress: true`, une poussée annulée par la
// suivante emporte son diff avec elle : le run suivant ne compare que contre
// LUI, jamais contre ce qui a vraiment été traité en dernier. Mesuré le
// 2026-09-14 : cinq commits, quatre runs consécutifs annulés,
// `frontend-staging` jamais reconstruit alors qu'un changement web-v2 était
// dedans — sans qu'aucun run ne rougisse (staging a servi une version
// périmée plus de quatre heures, sauvée seulement par une recréation SSH
// manuelle, non tracée).
//
// LE CHOIX
// La base de diff devient le dernier commit dont le run `docker.yml` sur
// CETTE branche a RÉUSSI — plutôt que la poussée immédiatement précédente.
// Une poussée annulée par la suivante ne fait donc plus disparaître son
// diff : le prochain run réussi reprend depuis le dernier point connu bon,
// et couvre tout ce qui s'est accumulé entre les deux, cancels compris.
//
// Repli, dans l'ordre : le run réussi le plus récent (fourni par l'appelant,
// via `gh run list --status success`) → `github.event.before` (comportement
// historique) → aucune base (construire tout). Chaque candidat est vérifié
// contre l'historique git avant d'être retenu : un `force-push` peut faire
// disparaître un commit que GitHub a pourtant enregistré comme SHA d'un run
// réussi passé.
//
// Ce module n'appelle jamais l'API GitHub lui-même — la liste des runs est
// un effet de bord que le CLI (`main()`, ou l'étape qui l'appelle) fournit en
// entrée. La décision, elle, est une fonction pure et se prouve par
// `--self-test`, sans réseau ni dépôt réel.

import { execFileSync } from 'node:child_process';

const ZERO_SHA = /^0{40}$/;

/**
 * @param {{ lastSuccessfulSha: string | null, eventBefore: string | null, commitExists: (sha: string) => boolean }} args
 * @returns {{ base: string | null, source: 'last-successful-run' | 'event-before' | 'none' }}
 */
export function pickDetectBase({ lastSuccessfulSha, eventBefore, commitExists }) {
  const candidates = [
    { sha: lastSuccessfulSha, source: /** @type {const} */ ('last-successful-run') },
    { sha: eventBefore, source: /** @type {const} */ ('event-before') },
  ];
  for (const { sha, source } of candidates) {
    if (!sha || ZERO_SHA.test(sha)) continue;
    if (commitExists(sha)) return { base: sha, source };
  }
  return { base: null, source: 'none' };
}

// --- CLI -----------------------------------------------------------------

const commitExistsInRepo = (sha) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const selfTest = () => {
  const failures = [];
  const check = (name, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${name} : attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
    }
  };

  check(
    'préfère le dernier run réussi quand il existe encore dans l’historique',
    pickDetectBase({ lastSuccessfulSha: 'aaa', eventBefore: 'bbb', commitExists: () => true }),
    { base: 'aaa', source: 'last-successful-run' },
  );
  check(
    'retombe sur event.before quand aucun run réussi n’est connu (première exécution)',
    pickDetectBase({ lastSuccessfulSha: null, eventBefore: 'bbb', commitExists: () => true }),
    { base: 'bbb', source: 'event-before' },
  );
  check(
    'retombe sur event.before si le SHA du dernier run réussi a disparu de l’historique (force-push)',
    pickDetectBase({
      lastSuccessfulSha: 'aaa',
      eventBefore: 'bbb',
      commitExists: (sha) => sha !== 'aaa',
    }),
    { base: 'bbb', source: 'event-before' },
  );
  check(
    'ignore un event.before à quarante zéros (branche neuve) au lieu de le prendre pour un SHA',
    pickDetectBase({ lastSuccessfulSha: null, eventBefore: '0'.repeat(40), commitExists: () => true }),
    { base: null, source: 'none' },
  );
  check(
    'ne retient aucun candidat introuvable dans l’historique : construire TOUT plutôt que deviner',
    pickDetectBase({ lastSuccessfulSha: 'aaa', eventBefore: 'bbb', commitExists: () => false }),
    { base: null, source: 'none' },
  );
  check(
    'une chaîne vide (aucun run réussi trouvé par gh run list) n’est pas un SHA candidat',
    pickDetectBase({ lastSuccessfulSha: '', eventBefore: 'bbb', commitExists: () => true }),
    { base: 'bbb', source: 'event-before' },
  );
  check(
    'le scénario du run cancelled repris : trois pushes, le second annulé, aucun avant lui — '
      + 'le troisième diffe depuis le PREMIER (dernier réussi), pas depuis le second',
    pickDetectBase({ lastSuccessfulSha: 'push-1', eventBefore: 'push-2-cancelled', commitExists: () => true }),
    { base: 'push-1', source: 'last-successful-run' },
  );

  if (failures.length > 0) {
    failures.forEach((failure) => console.error(`ÉCHEC : ${failure}`));
    console.error(`\n${failures.length}/7 assertion(s) en échec.`);
    return 1;
  }
  console.log('self-test : 7/7 assertions vertes.');
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const lastSuccessfulSha = process.env.LAST_SUCCESSFUL_SHA?.trim() || null;
  const eventBefore = process.env.EVENT_BEFORE?.trim() || null;
  const { base, source } = pickDetectBase({
    lastSuccessfulSha,
    eventBefore,
    commitExists: commitExistsInRepo,
  });
  console.log(`base=${base ?? ''}`);
  console.log(`source=${source}`);
  return 0;
};

process.exit(main());
