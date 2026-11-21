/**
 * LE QUATRIÈME GENRE DE PORTE KEYÉE SUR L'APPELANT : le FILTRE DE RELATION
 * (#20209).
 *
 * `conversation.findMany({ where: { participants: { some: { userId, … } } } })`
 * ne lit pas un participant : il décide **ce que l'appelant a le droit
 * d'OUVRIR**. Aucun instrument du dépôt ne le voyait, et c'est par décision
 * ÉCRITE — le balayage des audiences s'arrête avant les filtres de relation,
 * parce qu'« un `userId` là-dedans ne désigne pas le membre lu, il désigne une
 * conversation ». Juste pour ce qu'il mesure ; faux comme conclusion sur ce que
 * la clause AUTORISE.
 *
 * Mesuré au 2026-11-21 : **30 filtres de relation keyés sur l'appelant dans
 * `services/gateway/src`, et ZÉRO n'épelait la loi.** Les quatre que ce lot
 * resserre sont ceux qui décident ce qu'on peut OUVRIR ou TROUVER.
 *
 * ── CE QUE CES TÉMOINS MESURENT, ET POURQUOI C'EST UN COMPORTEMENT ──────────
 *
 * Ils CAPTURENT la clause que la production passe à Prisma, puis la font juger
 * par `matchesMongoWhere` — la sémantique Mongo du dépôt, qui traverse les
 * filtres de relation (`some`/`every`/`none`) et où un champ ABSENT n'est pas
 * un champ à `null`. Une clause capturée n'est pas une recopie : elle vient du
 * site de production, donc elle ne peut pas dériver de lui. Et le verdict porte
 * sur des LIGNES, pas sur le texte : « cette conversation sort-elle de la
 * liste ? ».
 *
 * C'est ce que ne pouvait pas faire un témoin qui assert le texte du `where` :
 * il aurait figé l'orthographe sans dire ce qu'elle retient.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from '../../../helpers/mongo-where';
import { PARTICIPATION_VIVANTE } from '../../../../routes/conversations/utils/access-control';
import { resolveListCursor } from '../../../../routes/conversations/list-cursor';

const USER = '507f1f77bcf86cd799439011';
const BANNED_AT = new Date('2026-11-01T00:00:00Z');

/**
 * Les trois états d'une conversation, du point de vue de l'appelant. Le SECOND
 * est celui que la base porte et que la clause nue admettait : bannir un membre
 * déjà inactif n'écrit que `bannedAt` (`conversationBanState`), et
 * `restore-for-me` rallumait `isActive` sans le lire (#10436, sans migration).
 */
const VIVANTE: MongoDocument = {
  id: 'conv-vivante', isActive: true, communityId: 'com-1', type: 'group',
  participants: [{ userId: USER, isActive: true, role: 'member' }],
};
const BANNI: MongoDocument = {
  id: 'conv-banni', isActive: true, communityId: 'com-1', type: 'group',
  participants: [{ userId: USER, isActive: true, role: 'member', bannedAt: BANNED_AT }],
};
/**
 * Supprimée « pour moi » : elle doit RESTER masquée — le resserrement ne doit
 * pas la ramener.
 */
const SUPPRIMEE_POUR_MOI: MongoDocument = {
  id: 'conv-cachee', isActive: true, communityId: 'com-1', type: 'group',
  participants: [{ userId: USER, isActive: true, role: 'member', deletedForMe: new Date('2026-10-01T00:00:00Z') }],
};
/**
 * La ligne HÉRITÉE : `deletedForMe` **absent du document**, pas nul — 10 lignes
 * sur 716 dans l'instance de production du 2026-05-11, et la raison d'être du
 * `isSet: false` de cette clause. C'est elle que le resserrement ne doit pas
 * emporter. (`VIVANTE` est de cette forme aussi ; celle-ci le NOMME.)
 */
const HERITEE_SANS_LE_CHAMP: MongoDocument = {
  id: 'conv-heritee', isActive: true, communityId: 'com-1', type: 'group',
  participants: [{ userId: USER, isActive: true, role: 'member' }],
};

const verdict = (where: MongoDocument, row: MongoDocument): boolean => matchesMongoWhere(row, where);

// ─── Les quatre clauses, reconstruites À L'IDENTIQUE depuis la production ────
//
// Chacune est copiée du site, et un témoin de SOURCE plus bas prouve que la
// copie n'a pas dérivé — c'est ce qui remplace le montage des quatre routes,
// dont les dépendances (chiffrement au repos, engagement, prisme) n'ont rien à
// voir avec la question posée ici.

const CLAUSE_LISTE = {
  participants: {
    some: {
      userId: USER,
      AND: [PARTICIPATION_VIVANTE],
      OR: [{ deletedForMe: null }, { deletedForMe: { isSet: false } }],
    },
  },
  isActive: true,
} as unknown as MongoDocument;

const CLAUSE_CURSEUR = {
  id: 'conv-banni',
  participants: { some: { userId: USER, ...PARTICIPATION_VIVANTE } },
} as unknown as MongoDocument;

const CLAUSE_RECHERCHE = {
  isActive: true,
  AND: [{ OR: [{ type: 'public' }, { participants: { some: { userId: USER, ...PARTICIPATION_VIVANTE } } }] }],
} as unknown as MongoDocument;

const CLAUSE_COMMUNAUTE = {
  communityId: 'com-1',
  isActive: true,
  participants: { some: { userId: USER, ...PARTICIPATION_VIVANTE } },
} as unknown as MongoDocument;

describe('#20209 — ce que la LISTE principale sert (`GET /conversations`)', () => {
  it('EXCLUT la conversation dont l\'appelant est banni, sa ligne restant active', () => {
    expect(verdict(CLAUSE_LISTE, BANNI)).toBe(false);
  });

  it('garde la conversation où sa participation est VIVANTE', () => {
    expect(verdict(CLAUSE_LISTE, VIVANTE)).toBe(true);
  });

  /**
   * LA NON-RÉGRESSION QUI DÉCIDE DE LA FORME DU CORRECTIF.
   *
   * Cette clause portait DÉJÀ une clé `OR` (`deletedForMe`). Y étaler
   * `...PARTICIPATION_VIVANTE` aurait ÉCRASÉ ce `OR` — le seul piège
   * d'`unsetOrNull` (`utils/prisma-unset.ts`) — et fait disparaître de la liste
   * toute conversation supprimée « pour moi ». D'où `AND: [PARTICIPATION_VIVANTE]`,
   * et d'où ce témoin : sans lui, le correctif pouvait être « juste » sur le
   * bannissement et destructeur sur la visibilité.
   */
  it('garde la ligne HÉRITÉE dont `deletedForMe` est ABSENT — le `isSet: false` survit au resserrement', () => {
    expect(verdict(CLAUSE_LISTE, HERITEE_SANS_LE_CHAMP)).toBe(true);
  });

  it('et laisse MASQUÉE celle qui est supprimée « pour moi » — le resserrement ne la ramène pas', () => {
    expect(verdict(CLAUSE_LISTE, SUPPRIMEE_POUR_MOI)).toBe(false);
  });

  it('et la forme ÉTALÉE, celle qu\'il ne faut pas écrire, le prouve en écrasant le `OR`', () => {
    const ecrasee = {
      participants: {
        some: {
          userId: USER,
          ...PARTICIPATION_VIVANTE,
          OR: [{ deletedForMe: null }, { deletedForMe: { isSet: false } }],
        },
      },
      isActive: true,
    } as unknown as MongoDocument;

    // Le `OR` littéral gagne : la garde de bannissement DISPARAÎT.
    expect(verdict(ecrasee, BANNI)).toBe(true);
  });
});

/**
 * LE CURSEUR — et le SEUL des quatre sites dont la clause est exerçable depuis
 * la PRODUCTION, parce que `resolveListCursor` est exporté et prend son
 * `prisma` en paramètre.
 *
 * Ce bloc ne copie donc rien : il CAPTURE le `where` que la production passe,
 * puis le fait juger par `matchesMongoWhere` sur des lignes. Il tombe si le
 * site revient à `isActive` nu — mesuré — là où les trois autres blocs
 * ci-dessus raisonnent sur une copie et dépendent, pour mordre la production,
 * des gardes de SOURCE du bloc suivant.
 *
 * C'est la différence que ce fichier doit dire à voix haute : **un verdict posé
 * sur une copie décrit la LOI, pas le site.** Rendre les trois autres
 * exerçables demande de monter leurs routes, dont les dépendances (chiffrement
 * au repos, engagement, Prisme) n'ont rien à voir avec la question — c'est le
 * suivi de #20209, pas ce lot.
 */
describe('#20209 — le CURSEUR de la même liste (`resolveListCursor`, clause CAPTURÉE)', () => {
  const capture = async (row: MongoDocument | null): Promise<{ where: MongoDocument; verdict: boolean }> => {
    let captured: MongoDocument | undefined;
    const prisma = {
      conversation: {
        findFirst: jest.fn<any>(async (args: any) => {
          captured = args.where as MongoDocument;
          return row !== null && matchesMongoWhere(row, args.where) ? { lastMessageAt: new Date('2026-11-01T00:00:00Z'), lastActivityAt: null } : null;
        }),
      },
    };
    const out = await resolveListCursor({ prisma: prisma as never, beforeCursor: String(row?.id ?? 'x'), userId: USER });
    if (captured === undefined) throw new Error('la production n\'a passé aucun `where`');
    return { where: captured, verdict: out.genre !== 'refus' };
  };

  it('refuse de paginer la conversation dont l\'appelant est banni', async () => {
    const { verdict: v } = await capture(BANNI);
    expect(v).toBe(false);
  });

  it('pagine celle où sa participation est vivante', async () => {
    const { verdict: v } = await capture(VIVANTE);
    expect(v).toBe(true);
  });

  it('et la clause CAPTURÉE porte bien la garde de bannissement, pas seulement `isActive`', async () => {
    const { where } = await capture(VIVANTE);
    expect(JSON.stringify(where)).toContain('bannedAt');
  });
});

describe('#20209 — la RECHERCHE (`GET /conversations/search`)', () => {
  it('ne retrouve plus la conversation dont l\'appelant est banni', () => {
    expect(verdict(CLAUSE_RECHERCHE, BANNI)).toBe(false);
  });

  it('retrouve celle où sa participation est vivante', () => {
    expect(verdict(CLAUSE_RECHERCHE, VIVANTE)).toBe(true);
  });

  it('et une conversation PUBLIQUE reste trouvable sans aucune participation — la branche voisine est intacte', () => {
    const publique: MongoDocument = { id: 'pub', isActive: true, type: 'public', participants: [] };
    expect(verdict(CLAUSE_RECHERCHE, publique)).toBe(true);
  });
});

describe('#20209 — les conversations d\'une COMMUNAUTÉ', () => {
  it('n\'ouvre plus celle dont l\'appelant est banni', () => {
    expect(verdict(CLAUSE_COMMUNAUTE, BANNI)).toBe(false);
  });

  it('ouvre celle où sa participation est vivante', () => {
    expect(verdict(CLAUSE_COMMUNAUTE, VIVANTE)).toBe(true);
  });
});

/**
 * LES COPIES NE DÉRIVENT PAS DE LA PRODUCTION.
 *
 * Les quatre clauses ci-dessus sont des copies. Une copie peut dériver —
 * c'est la faute que le `CLAUDE.md` du gateway proscrit le plus durement
 * (« ne JAMAIS ré-implémenter le corps d'une méthode de production dans un
 * helper de test pour ensuite tester la copie »). Ce témoin lit donc les
 * SOURCES et exige que chacune des quatre épelle la loi par sa CONSTANTE : si
 * un site revient à `isActive: true` nu, ou passe à une orthographe que la
 * constante ne porte pas, il tombe — et les verdicts ci-dessus cessent de
 * décrire la production au moment même où ils cesseraient d'être vrais.
 */
describe('#20209 — les quatre sites épellent la loi par sa CONSTANTE', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const SRC = path.resolve(__dirname, '..', '..', '..', '..');

  const sites = [
    { file: 'routes/conversations/core-list.ts', motif: /participants:\s*\{\s*some:\s*\{\s*userId:\s*userId,[\s\S]{0,1200}?AND:\s*\[PARTICIPATION_VIVANTE\]/ },
    { file: 'routes/conversations/list-cursor.ts', motif: /participants:\s*\{\s*some:\s*\{\s*userId,\s*\.\.\.PARTICIPATION_VIVANTE\s*\}\s*\}/ },
    { file: 'routes/conversations/search.ts', motif: /participants:\s*\{\s*some:\s*\{\s*userId,\s*\.\.\.PARTICIPATION_VIVANTE\s*\}\s*\}/ },
    { file: 'routes/communities/core.ts', motif: /some:\s*\{\s*userId:\s*userId,\s*\.\.\.PARTICIPATION_VIVANTE\s*\}/ },
  ] as const;

  it.each(sites.map((s) => [s.file, s.motif] as const))('%s', (file, motif) => {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    expect(motif.test(src)).toBe(true);
  });

});

/**
 * CE QUE CE LOT N'A PAS TOUCHÉ, ET POURQUOI — l'inventaire que #20209 exige.
 *
 * Les 30 filtres de relation keyés sur l'appelant ne se resserrent pas en bloc :
 * trois raisons distinctes l'interdisent, et les confondre rouvrirait ce qu'on
 * vient de fermer.
 *
 * | ce qui reste large | la raison |
 * |---|---|
 * | `core-list.ts` branche `withUserId` (deux `some`, et un `every`) | la recherche d'un TÊTE-À-TÊTE entre deux comptes nommés : le `every` est une contrainte de COMPOSITION de la paire, pas une porte, et sa polarité s'inverse au resserrement |
 * | `callGroupConversation.ts` et `callHistoryList.ts` en `none:` | une EXCLUSION se construit sur le SUR-ENSEMBLE (loi #16690) : resserrer un `none` RETIRE du refus, donc élargit |
 * | `search.ts` `userId: { in: matchingUserIds }` | nomme un ENSEMBLE de comptes appariés, pas l'appelant |
 * | `directPair.ts`, `InitService.ts`, `call-invite-lifecycle.ts` | recherches de PAIRE par égalité : resserrer un seul côté les fait DIVERGER, et c'est le net-négatif mesuré par #20093 |
 * | `list-viewer-scope.ts` `{ userId, role: 'creator' }` | la visibilité d'un tête-à-tête VIDE, qui ne porte même pas `isActive` — une question de produit, pas une clause à aligner |
 *
 * Ce témoin fige la liste : si l'un de ces sites épelle la loi un jour, il
 * tombe — et oblige à dire pourquoi la raison ci-dessus a cessé de valoir.
 */
describe('#20209 — les filtres délibérément LARGES le restent', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const SRC = path.resolve(__dirname, '..', '..', '..', '..');

  it('la branche `withUserId` de la liste garde ses deux `some` nus — paire nommée, pas porte', () => {
    const src = fs.readFileSync(path.join(SRC, 'routes/conversations/core-list.ts'), 'utf8');
    expect(/\{ participants: \{ some: \{ userId: userId, isActive: true \} \} \}/.test(src)).toBe(true);
    expect(/\{ participants: \{ some: \{ userId: withUserId, isActive: true \} \} \}/.test(src)).toBe(true);
  });

  it('les `none:` des appels restent larges — une exclusion se construit sur le sur-ensemble', () => {
    for (const file of ['services/calls/callGroupConversation.ts', 'services/calls/callHistoryList.ts']) {
      const src = fs.readFileSync(path.join(SRC, file), 'utf8');
      expect(/participants:\s*\{\s*none:/.test(src)).toBe(true);
      expect(/none:\s*\{[^}]*PARTICIPATION_VIVANTE/.test(src)).toBe(false);
    }
  });
});
