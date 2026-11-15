/**
 * LA MESURE DE L'IMMORTALISATION EN LIGNE DE COMMANDE (D15, #10185 — lot L20 #10176) — REQUÊTE D'ADMINISTRATION EN
 * LECTURE SEULE.
 *
 * Rend, en JSON sur la sortie standard, les agrégats ANONYMES d'une semaine ISO close (`photoMomentsMeasure.ts`) — un
 * seul niveau : par famille d'étape, les comptes annoncés et ceux qui ont gardé (`families`) ; le push de la semaine
 * (`push`) ; et le nombre de lignes retenues (`suppressed`). Aucun jour, aucune clé, aucune surface, aucune ligne qui
 * relie deux semaines : le grain par clé attend la décision du porteur (#13094). Le compte rendu se remet EN PRIVÉ au
 * porteur, jamais sur une issue ni une page : le dépôt est public (fiche de décision, « Limites connues »).
 * Sous `src/` pour être COMPILÉ dans l'image : le conteneur de la passerelle ne porte que `dist/` et les dépendances
 * de production. Rien n'est écrit : rejouer la requête ne change rien en base.
 *
 *   docker exec meeshy-gateway-staging node dist/src/services/game/photoMomentsMeasureCli.js                    # dernière semaine close
 *   docker exec meeshy-gateway-staging node dist/src/services/game/photoMomentsMeasureCli.js --week 2026-W43
 *   docker exec meeshy-gateway         node dist/src/services/game/photoMomentsMeasureCli.js --week 2026-W43
 *   node dist/src/services/game/photoMomentsMeasureCli.js verify-image                                         # témoin du Dockerfile
 *
 * Code de sortie : 0 = rapport rendu ; 1 = arguments refusés ou erreur.
 */
import { photoMeasureKeyOf } from '@meeshy/shared/utils/game/photo-measure';
import { PrismaClient } from '@meeshy/shared/prisma/client';

import { measurePhotoMoments, parsePhotoMeasureArgs, type PhotoMeasureReader } from './photoMomentsMeasure';

export type PhotoMeasureCliDeps = {
  readonly now: () => Date;
  readonly open: () => { readonly reader: PhotoMeasureReader; readonly close: () => Promise<void> };
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
};

function verifyImage(deps: PhotoMeasureCliDeps): number {
  const measure = photoMeasureKeyOf('rank:echo:5');
  if (measure?.family !== 'rank') throw new Error('loi partagée photoMeasureKeyOf illisible');
  const prismaClient = require.resolve('@meeshy/shared/prisma/client');
  deps.out(`mesure photo embarquée : famille ${measure.family}, client Prisma ${prismaClient}`);
  return 0;
}

export async function runPhotoMeasureCli(argv: readonly string[], deps: PhotoMeasureCliDeps): Promise<number> {
  if (argv[0] === 'verify-image') return verifyImage(deps);
  const now = deps.now();
  const args = parsePhotoMeasureArgs(argv, now);
  if ('reason' in args) {
    deps.err(`✗ Arguments (${args.reason}) : [--week AAAA-Www], une semaine ISO close, au plus 25 mois en arrière.`);
    return 1;
  }
  const { reader, close } = deps.open();
  try {
    const report = await measurePhotoMoments(reader, { week: args.week, now });
    deps.out(JSON.stringify(report, null, 2));
    return 0;
  } finally {
    await close();
  }
}

const productionDeps = (): PhotoMeasureCliDeps => ({
  now: () => new Date(),
  open: () => {
    const prisma = new PrismaClient();
    return {
      reader: { gamePhotoMoment: prisma.gamePhotoMoment, notification: prisma.notification, user: prisma.user },
      close: () => prisma.$disconnect(),
    };
  },
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});

if (require.main === module) {
  runPhotoMeasureCli(process.argv.slice(2), productionDeps())
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error('Échec de la mesure photo :', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
