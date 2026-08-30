/**
 * Mesure les deux grandeurs dont dépendent les plafonds de la loi de succession
 * (`services/gateway/src/services/conversations/creatorSuccession.ts`, #4058) :
 *
 *   1. le nombre d'ADMINISTRATEURS actifs de la plus grosse conversation,
 *      à confronter à `PLAFOND_ADMINS` ;
 *   2. le nombre de lignes de CHANGEMENT DE RANG portées par un même couple
 *      (conversation, ensemble de ses administrateurs), à confronter à
 *      `PLAFOND_TRACES`.
 *
 * Lecture seule — aucune écriture, aucun effet de bord. #4394.
 *
 * Usage :
 *   docker exec -it meeshy-gateway npx tsx /app/scripts/mesure-succession-plafonds.ts
 *   cd services/gateway && npx tsx ../../scripts/mesure-succession-plafonds.ts
 *
 * Options :
 *   --top=10   nombre de conversations rendues dans chaque palmarès (défaut 10)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLAFOND_ADMINS = 500;
const PLAFOND_TRACES = 2000;

const TYPES_DE_CHANGEMENT_DE_RANG = [
  'member_promoted',
  'member_demoted',
  'member_role_changed',
];

const top = Number(
  process.argv.find(a => a.startsWith('--top='))?.slice('--top='.length) ?? 10
);

const verdict = (mesure: number, plafond: number): string => {
  if (mesure === 0) return 'aucune donnée';
  const marge = plafond / mesure;
  if (marge >= 100) return `confortable (×${Math.round(marge)})`;
  if (marge >= 10) return `suffisant (×${Math.round(marge)})`;
  if (marge > 1) return `ÉTROIT (×${marge.toFixed(1)}) — à relever`;
  return 'DÉPASSÉ — le plafond tranche déjà';
};

async function mesurer() {
  // ─── 1. Les administrateurs par conversation ─────────────────────────────
  //
  // `role` est comparé dans les DEUX casses : les lignes écrites par l'ancien
  // `InitService` sont en MAJUSCULES, et un `where` ne replie rien (#4008).
  const parConversation = await prisma.participant.groupBy({
    by: ['conversationId'],
    where: { isActive: true, role: { in: ['admin', 'ADMIN'] } },
    _count: { _all: true },
    orderBy: { _count: { conversationId: 'desc' } },
    take: top,
  });

  console.log('=== Administrateurs actifs par conversation (les %d premières) ===\n', top);
  if (parConversation.length === 0) {
    console.log('  aucune conversation ne porte d’administrateur\n');
  }
  for (const ligne of parConversation) {
    console.log(`  ${ligne.conversationId}  ${ligne._count._all} administrateur(s)`);
  }

  const maxAdmins = parConversation[0]?._count._all ?? 0;
  console.log(
    `\n  MAXIMUM : ${maxAdmins}   PLAFOND_ADMINS = ${PLAFOND_ADMINS}   → ${verdict(maxAdmins, PLAFOND_ADMINS)}\n`
  );

  // ─── 2. Les traces de rang, par conversation ─────────────────────────────
  //
  // Le plafond porte sur ce que la loi LIT : les lignes de changement de rang
  // des administrateurs ACTUELS, sur CETTE conversation. On mesure donc au plus
  // près de la requête réelle, conversation par conversation, sur celles qui
  // portent le plus d'administrateurs — ce sont elles qui en accumulent le plus.
  console.log('=== Lignes de changement de rang lues par la loi, par conversation ===\n');

  let maxTraces = 0;
  for (const ligne of parConversation) {
    const admins = await prisma.participant.findMany({
      where: {
        conversationId: ligne.conversationId,
        isActive: true,
        role: { in: ['admin', 'ADMIN'] },
      },
      select: { userId: true },
    });
    const identifiants = admins
      .map(a => a.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (identifiants.length === 0) continue;

    const traces = await prisma.notification.count({
      where: {
        userId: { in: identifiants },
        type: { in: TYPES_DE_CHANGEMENT_DE_RANG },
        context: { path: ['conversationId'], equals: ligne.conversationId },
      },
    });

    maxTraces = Math.max(maxTraces, traces);
    console.log(`  ${ligne.conversationId}  ${traces} ligne(s) pour ${identifiants.length} administrateur(s)`);
  }

  console.log(
    `\n  MAXIMUM : ${maxTraces}   PLAFOND_TRACES = ${PLAFOND_TRACES}   → ${verdict(maxTraces, PLAFOND_TRACES)}\n`
  );

  // ─── 3. Ce que la mesure ne dit pas ──────────────────────────────────────
  console.log('=== Rappel ===\n');
  console.log('  Le plafond des TRACES est déjà inoffensif par construction : la lecture');
  console.log('  est ordonnée `createdAt asc`, donc tronquer garde les lignes les plus');
  console.log('  ANCIENNES, et la gagnante est la plus ancienne. Cette mesure vérifie');
  console.log('  la marge, elle ne cherche pas un défaut de correction.\n');
  console.log('  Le plafond des ADMINISTRATEURS, lui, tranche s’il est atteint :');
  console.log('  au-delà, concourent les 500 administrateurs les plus anciennement');
  console.log('  ARRIVÉS, et un administrateur promu tôt mais arrivé tard en sortirait.\n');
}

mesurer()
  .catch(erreur => {
    console.error('Mesure interrompue :', erreur);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
