/**
 * La route par chemin, vue depuis la COPIE transférée d'une flamme (#9588).
 *
 * Le transfert recopie `filePath` sans dupliquer les octets : le fichier reste
 * servi, sans authentification, tant qu'UN porteur vit. Tant que la copie
 * naissait à sept jours, transférer une flamme prolongeait d'une semaine
 * l'adresse que les destinataires de la source connaissaient déjà.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { EPHEMERAL_UNAVAILABILITY_GRACE_MS } from '@meeshy/shared/utils/ephemeral-countdown';

import { ephemeralSendFields } from '../../messaging/ephemeralSendFields';
import {
  EPHEMERAL_ATTACHMENT_CACHE,
  resolveFileRouteVerdict,
  type FileRouteVerdictPrisma,
} from '../fileRouteVerdict';

const SOURCE_PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const COPY_PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const SOURCE_MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const COPY_MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/flamme_8b1f0c1e.jpg';
const TRACK = `translated/${SOURCE_PIECE}_fr.mp3`;

const FORWARDED_AT = new Date('2026-10-07T10:00:00.000Z');
const after = (ms: number): Date => new Date(FORWARDED_AT.getTime() + ms);
const DURATION = 30;
const COPY_FLAGS = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

type Piece = {
  id: string;
  filePath: string;
  thumbnailPath?: string | null;
  messageId: string | null;
  isViewOnce: boolean;
  isBlurred: boolean;
  effectFlags: number;
};
type Carrier = {
  id: string;
  deletedAt: Date | null;
  expiresAt: Date | null;
  viewOnceBurnAt: Date | null;
  isViewOnce: boolean;
  isBlurred: boolean;
  effectFlags: number;
  ephemeralDuration: number | null;
};

function prismaWith(pieces: readonly Piece[], carriers: readonly Carrier[]): FileRouteVerdictPrisma {
  const matches = (piece: Piece, where: Record<string, unknown>): boolean => {
    const branches = (where.OR as Array<Record<string, unknown>> | undefined) ?? [where];
    return branches.some((branch) =>
      Object.entries(branch).every(([field, wanted]) => {
        const value = (piece as Record<string, unknown>)[field];
        if (typeof wanted !== 'object' || wanted === null) return value === wanted;
        const prefix = (wanted as { startsWith: string }).startsWith;
        return typeof value === 'string' && value.startsWith(prefix);
      }),
    );
  };
  // Le faux magasin PROJETTE comme le vrai : une colonne absente du `select`
  // est absente de la ligne rendue — un oubli de `select` en production fait
  // donc tomber les témoins au lieu de les laisser lire la fixture entière.
  const project = <T extends object>(row: T, select?: Record<string, boolean>): Partial<T> =>
    select ? (Object.fromEntries(Object.entries(row).filter(([key]) => select[key])) as Partial<T>) : row;
  type Query = { where: Record<string, unknown>; select?: Record<string, boolean> };
  return {
    messageAttachment: {
      findMany: async ({ where, select }: Query) => pieces.filter((piece) => matches(piece, where)).map((p) => project(p, select)),
      findUnique: async ({ where, select }: Query) => {
        const found = pieces.find((piece) => piece.id === (where as { id: string }).id);
        return found ? project(found, select) : null;
      },
    },
    message: {
      findMany: async ({ where, select }: Query) =>
        carriers.filter((carrier) => (where as { id: { in: string[] } }).id.in.includes(carrier.id)).map((c) => project(c, select)),
    },
  } as unknown as FileRouteVerdictPrisma;
}

const piece = (over: Partial<Piece>): Piece => ({
  id: SOURCE_PIECE,
  filePath: KEY,
  messageId: SOURCE_MESSAGE,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...over,
});
const carrier = (over: Partial<Carrier>): Carrier => ({
  id: SOURCE_MESSAGE,
  deletedAt: null,
  expiresAt: null,
  viewOnceBurnAt: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ephemeralDuration: null,
  ...over,
});

describe('la fenêtre des octets partagés retombe à celle de la copie (#9588)', () => {
  const copyColumns = ephemeralSendFields({
    ephemeralDuration: DURATION,
    effectFlags: COPY_FLAGS,
    durationBoundsAfterRead: true,
    now: FORWARDED_AT,
  });
  const prisma = prismaWith(
    [piece({}), piece({ id: COPY_PIECE, messageId: COPY_MESSAGE })],
    [
      // La source a fini sa vie une minute après le transfert.
      carrier({ expiresAt: after(60_000) }),
      // La copie : personne ne l'a reçue, sa colonne est celle de l'envoi.
      carrier({ id: COPY_MESSAGE, expiresAt: copyColumns.expiresAt }),
    ],
  );
  const copyDeath = DURATION * 1000 + EPHEMERAL_UNAVAILABILITY_GRACE_MS;

  it('sert encore le fichier, sous revalidation, tant que la copie vit', async () => {
    expect(await resolveFileRouteVerdict(KEY, prisma, after(copyDeath - 1))).toEqual({
      kind: 'serve',
      cacheControl: EPHEMERAL_ATTACHMENT_CACHE,
      readerBound: true,
    });
  });

  it('refuse le fichier à « transfert + durée + une heure » — plus jamais sept jours', async () => {
    expect(await resolveFileRouteVerdict(KEY, prisma, after(copyDeath))).toEqual({ kind: 'gone' });
    expect(await resolveFileRouteVerdict(KEY, prisma, after(24 * 60 * 60 * 1000))).toEqual({ kind: 'gone' });
  });

  it('applique la même fenêtre à la piste traduite que la copie partage', async () => {
    expect(await resolveFileRouteVerdict(TRACK, prisma, after(copyDeath - 1))).toMatchObject({ kind: 'serve' });
    expect(await resolveFileRouteVerdict(TRACK, prisma, after(copyDeath))).toEqual({ kind: 'gone' });
  });
});

describe('une piste dérivée dont la pièce ne résout plus est refusée (#9588)', () => {
  it('rend `gone` quand la ligne nommée par la piste a disparu — jamais le régime d’un fichier ordinaire', async () => {
    // La ligne source est supprimée ; la copie vit encore et partage la piste,
    // mais rien ne relie plus la clé à un porteur : sans verdict, la piste
    // d'une flamme partait avec un cache d'un an.
    const prisma = prismaWith(
      [piece({ id: COPY_PIECE, messageId: COPY_MESSAGE })],
      [carrier({ id: COPY_MESSAGE, expiresAt: after(60_000) })],
    );

    expect(await resolveFileRouteVerdict(TRACK, prisma, after(1_000))).toEqual({ kind: 'gone' });
  });

  it('laisse à son régime une clé qui n’est pas une pièce jointe de message', async () => {
    const prisma = prismaWith([], []);

    expect(await resolveFileRouteVerdict('posts/2026/10/affiche.jpg', prisma, after(1_000))).toEqual({
      kind: 'not-an-attachment',
    });
  });

  it('sert la piste d’une pièce ordinaire qui résout encore', async () => {
    const prisma = prismaWith([piece({})], [carrier({})]);

    expect(await resolveFileRouteVerdict(TRACK, prisma, after(1_000))).toMatchObject({ kind: 'serve' });
  });
});

describe('un fichier dont TOUS les porteurs vivants disparaissent se lit par lecteur (#9600)', () => {
  const at = after(1_000);

  it('ne lie pas au lecteur le fichier d\'un message ordinaire, ni celui d\'un message seulement flouté', async () => {
    expect(await resolveFileRouteVerdict(KEY, prismaWith([piece({})], [carrier({})]), at)).toMatchObject({ readerBound: false });
    const blurred = prismaWith([piece({ isBlurred: true })], [carrier({ isBlurred: true, effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED })]);
    expect(await resolveFileRouteVerdict(KEY, blurred, at)).toMatchObject({ readerBound: false });
  });

  it.each([
    ['un message à vue unique', [piece({})], [carrier({ isViewOnce: true })]],
    ['une pièce à vue unique', [piece({ isViewOnce: true })], [carrier({})]],
    ['une flamme à durée', [piece({})], [carrier({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: after(60_000) })]],
    ['une flamme après lecture', [piece({})], [carrier({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ, expiresAt: after(60_000) })]],
  ])('lie au lecteur le fichier d\'%s', async (_label, pieces, carriers) => {
    expect(await resolveFileRouteVerdict(KEY, prismaWith(pieces, carriers), at)).toMatchObject({ kind: 'serve', readerBound: true });
  });

  it('lie aussi sa piste traduite et sa miniature', async () => {
    const prisma = prismaWith([piece({ thumbnailPath: `${KEY}_thumb.webp` })], [carrier({ isViewOnce: true })]);
    expect(await resolveFileRouteVerdict(TRACK, prisma, at)).toMatchObject({ readerBound: true });
    expect(await resolveFileRouteVerdict(`${KEY}_thumb.webp`, prisma, at)).toMatchObject({ readerBound: true });
  });

  it("ne lie pas les octets qu'un porteur ORDINAIRE vivant partage — ses lecteurs ont l'adresse nue", async () => {
    const prisma = prismaWith(
      [piece({}), piece({ id: COPY_PIECE, messageId: COPY_MESSAGE, isViewOnce: true })],
      [carrier({}), carrier({ id: COPY_MESSAGE })],
    );
    expect(await resolveFileRouteVerdict(KEY, prisma, at)).toMatchObject({ readerBound: false });
  });

  it("lie les octets partagés quand le seul porteur ordinaire est MORT", async () => {
    const prisma = prismaWith(
      [piece({}), piece({ id: COPY_PIECE, messageId: COPY_MESSAGE, isViewOnce: true })],
      [carrier({ deletedAt: FORWARDED_AT }), carrier({ id: COPY_MESSAGE })],
    );
    expect(await resolveFileRouteVerdict(KEY, prisma, at)).toMatchObject({ readerBound: true });
  });

  it('ne lie pas un fichier en cours d\'envoi (ligne pas encore rattachée)', async () => {
    const prisma = prismaWith([piece({ messageId: null }), piece({ id: COPY_PIECE, messageId: COPY_MESSAGE })], [carrier({ id: COPY_MESSAGE, isViewOnce: true })]);
    expect(await resolveFileRouteVerdict(KEY, prisma, at)).toMatchObject({ readerBound: false });
  });

  it("lie au lecteur un porteur dont la protection n'a pas été lue — l'absence ne prouve pas l'ordinaire", async () => {
    const { ephemeralDuration: _dropped, ...partial } = carrier({});
    const prisma = prismaWith([piece({})], [partial as Carrier]);
    expect(await resolveFileRouteVerdict(KEY, prisma, at)).toMatchObject({ readerBound: true });
  });
});
