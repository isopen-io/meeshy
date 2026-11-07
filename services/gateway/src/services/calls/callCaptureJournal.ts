import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  CALL_SCREEN_CAPTURE_DEDUPE_MS,
  isCallCaptureEventKind,
  type CallCaptureEventKind,
  type CallScreenCaptureKind,
  type CallTranscriptCapture,
} from '@meeshy/shared/types/call-capture';

/**
 * Le journal des captures d'un appel (#16665, loi 13 de
 * `docs/product/appels-vue-finale.md`) : ce qui s'écrit dans `CallCaptureEvent`
 * et ce que `GET /calls/:callId/transcript` en relit.
 *
 *  - Une capture d'ÉCRAN s'écrit à son DÉBUT seulement, au plus une ligne par
 *    participant, par sorte et par fenêtre de 5 s : un client qui redit
 *    « je capture » en rafale ne remplit pas le journal.
 *  - L'enregistrement CONSENTI note son début et sa fin, chaque moment étant
 *    déjà unique (la diffusion n'a lieu qu'au `markStarted`/`markStopped` gagnant).
 *
 * Le décalage est figé à l'écriture, depuis `CallSession.startedAt` : la même
 * origine que `callStartedAt`, que les clients soustraient aux segments.
 */

type CaptureJournalPrisma = Pick<PrismaClient, 'callSession' | 'callParticipant' | 'callCaptureEvent'>;

export type CallRecordingMomentKind = Extract<CallCaptureEventKind, 'call-recording-started' | 'call-recording-stopped'>;

export type CallCaptureJournal = {
  readonly screenCaptureStarted: (input: {
    readonly callId: string;
    readonly participantId: string;
    readonly userId: string;
    readonly kind: CallScreenCaptureKind;
  }) => Promise<boolean>;
  readonly callRecording: (input: { readonly callId: string; readonly userId: string | null; readonly kind: CallRecordingMomentKind }) => Promise<boolean>;
  readonly list: (callId: string) => Promise<readonly CallCaptureRow[]>;
};

export type CallCaptureRow = {
  readonly id: string;
  readonly participantId: string | null;
  readonly userId: string | null;
  readonly kind: string;
  readonly offsetMs: number;
  readonly createdAt: Date;
};

/** Un appel d'une heure ne garde pas des milliers de captures : la relecture est bornée. */
export const MAX_LISTED_CAPTURES = 500;

export function prismaCallCaptureJournal(prisma: CaptureJournalPrisma, now: () => Date = () => new Date()): CallCaptureJournal {
  const offsetOf = async (callId: string, at: Date): Promise<number | null> => {
    const call = await prisma.callSession.findUnique({ where: { id: callId }, select: { startedAt: true } });
    return call === null ? null : Math.max(0, at.getTime() - call.startedAt.getTime());
  };

  const write = async (row: { callId: string; participantId: string | null; userId: string | null; kind: CallCaptureEventKind; at: Date }): Promise<boolean> => {
    const offsetMs = await offsetOf(row.callId, row.at);
    if (offsetMs === null) return false;
    await prisma.callCaptureEvent.create({
      data: { callSessionId: row.callId, participantId: row.participantId, userId: row.userId, kind: row.kind, offsetMs, createdAt: row.at },
    });
    return true;
  };

  return {
    screenCaptureStarted: async ({ callId, participantId, userId, kind }) => {
      const at = now();
      const recent = await prisma.callCaptureEvent.findFirst({
        where: { callSessionId: callId, participantId, kind, createdAt: { gte: new Date(at.getTime() - CALL_SCREEN_CAPTURE_DEDUPE_MS) } },
        select: { id: true },
      });
      if (recent !== null) return false;
      return write({ callId, participantId, userId, kind, at });
    },
    callRecording: async ({ callId, userId, kind }) => {
      const participation =
        userId === null
          ? null
          : await prisma.callParticipant.findFirst({
              where: { callSessionId: callId, participant: { userId } },
              orderBy: { joinedAt: 'desc' },
              select: { participantId: true },
            });
      return write({ callId, participantId: participation?.participantId ?? null, userId, kind, at: now() });
    },
    list: (callId) =>
      prisma.callCaptureEvent.findMany({
        where: { callSessionId: callId },
        orderBy: { createdAt: 'asc' },
        take: MAX_LISTED_CAPTURES,
        select: { id: true, participantId: true, userId: true, kind: true, offsetMs: true, createdAt: true },
      }),
  };
}

type CallParticipantIdentity = {
  readonly userId?: string | null;
  readonly user?: { readonly displayName?: string | null; readonly username?: string | null } | null;
} | null | undefined;

/** La forme servie à côté des segments : l'auteur nommé depuis les participants de l'appel. */
export function toTranscriptCaptures(rows: readonly CallCaptureRow[], participantsById: ReadonlyMap<string, CallParticipantIdentity>): CallTranscriptCapture[] {
  return rows.flatMap((row) => {
    if (!isCallCaptureEventKind(row.kind)) return [];
    const participant = row.participantId === null ? undefined : participantsById.get(row.participantId);
    return [
      {
        id: row.id,
        participantId: row.participantId,
        userId: participant?.userId ?? row.userId,
        displayName: participant?.user?.displayName || participant?.user?.username || null,
        kind: row.kind,
        offsetMs: row.offsetMs,
        at: row.createdAt.toISOString(),
      },
    ];
  });
}
