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

type Piece = { id: string; filePath: string; thumbnailPath?: string | null; messageId: string | null; isViewOnce: boolean };
type Carrier = { id: string; deletedAt: Date | null; expiresAt: Date | null; viewOnceBurnAt: Date | null; isViewOnce: boolean };

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
  return {
    messageAttachment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => pieces.filter((piece) => matches(piece, where)),
      findUnique: async ({ where }: { where: { id: string } }) => pieces.find((piece) => piece.id === where.id) ?? null,
    },
    message: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        carriers.filter((carrier) => where.id.in.includes(carrier.id)),
    },
  } as unknown as FileRouteVerdictPrisma;
}

const piece = (over: Partial<Piece>): Piece => ({ id: SOURCE_PIECE, filePath: KEY, messageId: SOURCE_MESSAGE, isViewOnce: false, ...over });
const carrier = (over: Partial<Carrier>): Carrier => ({ id: SOURCE_MESSAGE, deletedAt: null, expiresAt: null, viewOnceBurnAt: null, isViewOnce: false, ...over });

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
