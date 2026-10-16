/**
 * @jest-environment node
 *
 * Garde O5 étendue à `PostEngagement` (#10774, analyse de conformité #10770).
 *
 * La télémétrie de lecture (`PostEngagement` : sessions de lecture, temps
 * passé, trace des sessions consenties) est une MESURE D'AUDIENCE : elle
 * alimente les compteurs de portée du post, l'export et l'effacement des
 * données du compte, et rien d'autre. Aucun classement, aucune recommandation,
 * aucune personnalisation ne la lit — l'exemption de mesure d'audience en
 * dépend (« aucun recoupement »).
 *
 * La liste des fichiers qui touchent la collection est FERMÉE. Tout nouveau
 * lecteur — délégué Prisma (`prisma.postEngagement`), relation
 * (`postEngagements`, `engagements` d'un post), commande brute sur
 * `'PostEngagement'` — fait rougir ce témoin : l'ajouter ici est une décision
 * de conformité, à motiver dans le même lot.
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', '..');

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(path);
  return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
});

/**
 * Retire les lignes de COMMENTAIRE seules (doc-comments, `//` en tête de
 * ligne) — jamais un fragment de ligne : une chaîne `'**\/*.ts'` ou une URL
 * `a//b` ne doit pas effacer l'accès qui la suit.
 */
const withoutComments = (text: string): string =>
  text.split('\n').filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line)).join('\n');

/** Les trois portes vers la collection : le délégué, la relation, la commande brute. */
const TOUCHES_POST_ENGAGEMENT = /\bpostEngagements?\b|['"`]PostEngagement['"`]|\bengagements\s*:\s*(true|\{)/;

const touches = (text: string): boolean => TOUCHES_POST_ENGAGEMENT.test(withoutComments(text));

describe('garde O5 — la liste des fichiers qui touchent PostEngagement est fermée (#10774)', () => {
  it('le détecteur voit chacune des trois portes, et ignore un commentaire', () => {
    expect(touches('await prisma.postEngagement.groupBy({ by: ["postId"], where: { userId } });')).toBe(true);
    expect(touches("const rows = await tx['postEngagement'].findMany({});")).toBe(true);
    expect(touches('prisma.user.findMany({ include: { postEngagements: true } });')).toBe(true);
    expect(touches('prisma.post.findMany({ select: { _count: { select: { engagements: true } } } });')).toBe(true);
    expect(touches("prisma.$runCommandRaw({ aggregate: 'PostEngagement', pipeline: [] });")).toBe(true);
    expect(touches('/** Les sessions `PostEngagement` vivent 90 j. */\n// prisma.postEngagement')).toBe(false);
    expect(touches("import { creditPostEngagement } from './postEngagementCredits';")).toBe(false);
    expect(touches("const glob = '**/*.ts'; await prisma.postEngagement.count();")).toBe(true);
    expect(touches("const url = 'https://a//b'; await prisma.postEngagement.count();")).toBe(true);
  });

  it('seuls le comptage, l’export, l’effacement, le retrait du consentement, la rétention et les index la touchent', () => {
    const files = sources(SRC)
      .filter((path) => touches(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SRC.length + 1))
      .sort();

    expect(files).toEqual([
      // Export art. 15/20 : les lignes du demandeur (nominatives ou par empreinte).
      'routes/me/export-reading.ts',
      // Écriture des sessions et calcul des compteurs de portée (fusion, déduplication à 10 s).
      'services/posts/postReach.ts',
      // Retrait de l'analyse (art. 7(3)) : vide la trace des sessions du compte.
      'services/social/consentWithdrawal.ts',
      // Effacement art. 17.
      'services/social/readingTelemetryErasure.ts',
      // Index (TTL, empreinte) : déclaration, aucune lecture de contenu.
      'services/social/socialEventIndexes.ts',
      // Migration de rétention : pose `expiresAt` sur les lignes antérieures.
      'services/social/socialEventsRetentionMigration.ts',
    ]);
  });
});

describe('garde O5 — l’empreinte d’un compte ne se recalcule que là où le comptage et les droits l’exigent (#10774)', () => {
  it('seuls la déduplication, l’export et l’effacement appellent accountReaderKeyOf — plus aucune écriture depuis #10785', () => {
    const callers = sources(SRC)
      .filter((path) => /\baccountReaderKeyOf\s*\(/.test(withoutComments(readFileSync(path, 'utf8'))))
      .map((path) => path.slice(SRC.length + 1))
      .sort();

    // L'empreinte ne s'écrit plus (#10785) : elle ne sert qu'à relire les
    // lignes réduites antérieures jusqu'à leur expiration (8 jours). Un
    // classement, une recommandation ou une analyse qui la recalculerait
    // relierait ces lignes à leur compte.
    expect(callers).toEqual([
      'routes/me/export-reading.ts',
      'services/posts/postReach.ts',
      'services/social/readingTelemetryErasure.ts',
      'services/social/viewImpressions.ts',
    ]);
  });
});
