/**
 * #6581 — une adresse vérifiée D'OFFICE ne devient pas un destinataire.
 *
 * `emailVerifiedAt` n'est pas qu'une porte de publication : c'est le prédicat
 * de DÉLIVRABILITÉ du canal e-mail (`buildRecipientFilter`, et l'aperçu admin
 * qui en annonce le décompte). Poser la date sur les trois comptes de
 * bootstrap PARCE QUE leurs adresses ne reçoivent aucun courrier, et laisser
 * l'envoyeur en déduire qu'elles en reçoivent, fait de chaque campagne trois
 * REBONDS DURS — et un rebond dur se paie sur la réputation d'expéditeur, donc
 * sur la délivrabilité de toutes les autres adresses.
 *
 * ─── CE QUE CE FICHIER OBSERVE ────────────────────────────────────────────
 *
 * Pas la FORME du filtre : l'EFFET. Le double Prisma ÉVALUE la clause `where`
 * contre une petite base en mémoire (`matchesWhere`, la sémantique
 * Prisma-sur-MongoDB déjà outillée du dépôt) — un `findMany` stubé à une liste
 * fixe rendrait ce témoin vert quel que soit le filtre, puisque c'est le stub
 * qui déciderait des destinataires. Ce qu'on lit à la fin est la liste des
 * adresses auxquelles `EmailService` a RÉELLEMENT écrit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { BroadcastSenderJob } from '../../../jobs/broadcast-sender';
import { matchesWhere, type MongoDoc, type WhereShape } from '../../../services/posts/__tests__/helpers/mongoWhereMatcher';

const BROADCAST = {
  id: 'bc-6581',
  status: 'SENDING',
  subject: 'Nouveautés Meeshy',
  body: 'Bonjour !',
  sourceLanguage: 'fr',
  translatedSubjects: {},
  translatedBodies: {},
  targeting: {},
};

/** Un vrai membre : adresse réelle, vérifiée à la main. */
const HUMAIN: MongoDoc = {
  id: 'u-humain',
  email: 'zuymanto@gmail.com',
  displayName: 'André',
  username: 'atabeth-perso',
  systemLanguage: 'fr',
  isActive: true,
  deletedAt: null,
  emailVerifiedAt: new Date('2026-02-15T13:01:17.760Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** Les trois comptes semés, vérifiés D'OFFICE par le boot (#6581). */
const SEMES: readonly MongoDoc[] = ['meeshy', 'admin', 'atabeth'].map((nom, rang) => ({
  id: `u-${nom}`,
  email: `${nom}@meeshy.me`,
  displayName: nom,
  username: nom,
  systemLanguage: 'fr',
  isActive: true,
  deletedAt: null,
  emailVerifiedAt: new Date('2026-09-15T00:00:00.000Z'),
  createdAt: new Date(`2026-01-0${rang + 2}T00:00:00.000Z`),
}));

function makePrisma(base: readonly MongoDoc[]) {
  const select = (where: WhereShape) => base.filter((doc) => matchesWhere(doc, where));
  return {
    adminBroadcast: {
      findUnique: jest.fn<any>().mockResolvedValue(BROADCAST),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      count: jest.fn<any>(async (args: { where: WhereShape }) => select(args.where).length),
      findMany: jest.fn<any>(async (args: { where?: WhereShape; distinct?: string[]; skip?: number; take?: number }) => {
        if (args?.distinct?.includes('systemLanguage')) return [];
        const rows = select(args.where ?? {});
        return rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length));
      }),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  };
}

function makeEmailService() {
  const sent: string[] = [];
  return {
    sent,
    service: {
      sendBroadcastEmail: jest.fn<any>(async ({ to }: { to: string }) => {
        sent.push(to);
        return { success: true };
      }),
    },
  };
}

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('BroadcastSenderJob — le canal e-mail n’écrit jamais à une adresse de bootstrap (#6581)', () => {
  it('n’écrit à AUCUNE des trois adresses semées, et écrit bien à l’adresse réelle', async () => {
    const prisma = makePrisma([HUMAIN, ...SEMES]);
    const { sent, service } = makeEmailService();

    await new BroadcastSenderJob(prisma as never, service as never).execute('bc-6581');

    expect(sent).toEqual(['zuymanto@gmail.com']);
  });

  it.each(SEMES.map((u) => [u.email as string]))(
    'exclut %s même seule en base — le décompte tombe à zéro, pas à un rebond',
    async (email) => {
      const prisma = makePrisma(SEMES.filter((u) => u.email === email));
      const { sent, service } = makeEmailService();

      await new BroadcastSenderJob(prisma as never, service as never).execute('bc-6581');

      expect(sent).toEqual([]);
    },
  );

  it('suit l’adresse CONFIGURÉE — ATABETH_EMAIL redirigé, c’est la nouvelle qui est exclue', async () => {
    process.env.ATABETH_EMAIL = 'demo@meeshy.me';
    const redirige: MongoDoc = { ...SEMES[2], id: 'u-demo', email: 'demo@meeshy.me' };
    const prisma = makePrisma([HUMAIN, redirige, SEMES[2]]);
    const { sent, service } = makeEmailService();

    await new BroadcastSenderJob(prisma as never, service as never).execute('bc-6581');

    // `atabeth@meeshy.me` n'est plus une adresse de seed : elle redevient un
    // destinataire ordinaire. C'est la CONFIGURATION qui décide, pas une liste figée.
    expect(sent.sort()).toEqual(['atabeth@meeshy.me', 'zuymanto@gmail.com']);
  });

  it('exclut une adresse semée écrite en CASSE différente — `User.email` est persisté verbatim', async () => {
    const majuscules: MongoDoc = { ...SEMES[1], id: 'u-admin-maj', email: 'Admin@Meeshy.me' };
    const prisma = makePrisma([HUMAIN, majuscules]);
    const { sent, service } = makeEmailService();

    await new BroadcastSenderJob(prisma as never, service as never).execute('bc-6581');

    expect(sent).toEqual(['zuymanto@gmail.com']);
  });

  it('n’écrit toujours à personne dont l’adresse n’est pas vérifiée — la contrainte d’origine du canal tient', async () => {
    const jamaisVerifie: MongoDoc = { ...HUMAIN, id: 'u-neuf', email: 'neuf@example.com', emailVerifiedAt: null };
    const prisma = makePrisma([jamaisVerifie]);
    const { sent, service } = makeEmailService();

    await new BroadcastSenderJob(prisma as never, service as never).execute('bc-6581');

    expect(sent).toEqual([]);
  });
});
