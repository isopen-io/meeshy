#!/usr/bin/env node
/**
 * VÉRIFIE QUE `.dockerignore` LAISSE ENTRER CE QUE LA CONSTRUCTION DE L'IMAGE
 * A BESOIN DE LIRE.
 *
 * POURQUOI CE TÉMOIN EXISTE. La racine du dépôt exclut `**&#47;scripts/` — une
 * règle générique et justifiée : aucune image n'a besoin de l'outillage du
 * monorepo. Mais la construction de CETTE application en dépend :
 * `vite.config.ts` importe `scripts/lib/institutional-routes.mjs` (la
 * source unique des cinq adresses) et son greffon lance
 * `scripts/prerender-institutional.tsx`.
 *
 * Le dépôt a DÉJÀ payé ce défaut une fois, sur l'autre application (#4627), et
 * le commentaire de `.dockerignore` en dit le plus mauvais côté : l'erreur
 * désigne un chemin JUSTE, vers un fichier qui EXISTE dans le dépôt. Rien dans
 * le message ne dit qu'il a été filtré à l'ENTRÉE du contexte. On cherche le
 * bogue dans l'import, jamais dans le filtre.
 *
 * Et il ne se voit qu'en intégration continue : tous les gates locaux
 * travaillent sur l'arbre COMPLET. C'est exactement le profil d'un défaut qui
 * mérite un témoin plutôt qu'une relecture.
 *
 * Ce qu'il ne fait PAS : construire l'image. Il applique les règles de
 * `.dockerignore` — dernier motif qui correspond, celui qui tranche — à la
 * liste des fichiers que le Dockerfile a besoin de lire.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;

/** Traduit un motif Docker (`**`, `*`, `?`) en expression régulière. */
const toRegex = (pattern) => {
  const output = ['^'];
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith('**/', i)) {
      output.push('(?:.*/)?');
      i += 3;
    } else if (pattern.startsWith('**', i)) {
      output.push('.*');
      i += 2;
    } else if (pattern[i] === '*') {
      output.push('[^/]*');
      i += 1;
    } else if (pattern[i] === '?') {
      output.push('[^/]');
      i += 1;
    } else {
      output.push(pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      i += 1;
    }
  }
  // Un motif de RÉPERTOIRE emporte ce qu'il contient.
  output.push('(?:/.*)?$');
  return new RegExp(output.join(''));
};

const rules = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'))
  .map((l) => {
    const denies = l.startsWith('!');
    return { rx: toRegex((denies ? l.slice(1) : l).replace(/\/$/, '')), denies };
  });

/**
 * DERNIER MOTIF QUI CORRESPOND, et c'est la sémantique de Docker — pas
 * « exclu dès qu'un motif correspond ». C'est ce qui permet à une négation
 * placée APRÈS une règle générique de la reprendre.
 */
const excluded = (path) =>
  rules.reduce((verdict, { rx, denies }) => (rx.test(path) ? !denies : verdict), false);

/**
 * Ce que le Dockerfile LIT. La liste est écrite à la main plutôt que déduite,
 * et c'est voulu : un balayage automatique de l'arbre ne saurait pas distinguer
 * un fichier dont l'absence casse la construction d'un fichier dont l'absence
 * ne change rien — or c'est précisément la question posée.
 */
const REQUIRED = [
  'apps/web-v3/package.json',
  'apps/web-v3/vite.config.ts',
  'apps/web-v3/tsconfig.json',
  'apps/web-v3/index.html',
  'apps/web-v3/nginx.conf',
  'apps/web-v3/public/sw-institutional.js',
  'apps/web-v3/scripts/prerender-institutional.tsx',
  'apps/web-v3/scripts/lib/institutional-routes.mjs',
  'apps/web-v3/scripts/lib/institutional-routes.d.mts',
  'apps/web-v3/src/main.tsx',
  'apps/web-v3/src/styles/app.css',
  'apps/web-v3/src/styles/institutional.css',
  'apps/web-v3/src/styles/ios.css',
  'apps/web-v3/src/institutional/page.tsx',
  'apps/web-v3/src/lib/react-shim.js',
  'packages/design-tokens/package.json',
  'packages/design-tokens/tokens.css',
  'packages/design-tokens/ios.css',
  'packages/design-tokens/dark.css',
  'packages/design-tokens/light.css',
  // `@meeshy/shared` : le Dockerfile le COPIE puis le CONSTRUIT (`tsc`), donc
  // son manifeste, son tsconfig et les entrées de son `include` doivent entrer.
  // Les quatre modules cités sont ceux que l'application importe vraiment —
  // les nommer un par un est ce qui fait qu'un `.dockerignore` trop large se
  // voit ici plutôt qu'au bout de six minutes de construction en CI.
  'packages/shared/package.json',
  'packages/shared/tsconfig.json',
  'packages/shared/types/conversation.ts',
  'packages/shared/types/participant.ts',
  'packages/shared/types/attachment.ts',
  'packages/shared/types/message-types.ts',
  'packages/shared/utils/conversation-helpers.ts',
  'packages/shared/utils/conversation-colors.ts',
  'packages/shared/utils/user-presence.ts',
  'packages/shared/utils/attachment-message-type.ts',
];

const filters = REQUIRED.filter(excluded);

if (filters.length > 0) {
  console.error(
    `\n  ${filters.length} fichier(s) que la construction de l'image LIT sont filtrés par` +
      ' `.dockerignore` :\n',
  );
  for (const f of filters) console.error(`    · ${f}`);
  console.error(
    "\n  Ils existent dans le dépôt : l'erreur de construction désignera un chemin JUSTE," +
      "\n  sans dire qu'il a été retiré du contexte. Ajouter une négation (`!chemin`," +
      '\n  `!chemin/**`) APRÈS la règle générique qui les emporte.\n',
  );
  process.exit(1);
}

console.log(
  `  .dockerignore laisse entrer les ${REQUIRED.length} fichiers que la construction de l'image lit.`,
);
