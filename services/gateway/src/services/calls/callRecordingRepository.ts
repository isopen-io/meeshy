import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallService } from '../CallService';
import type { CallRecordingRepository, CallRecordingRow, CallRoster } from './callRecording';

type RecordingPrisma = Pick<PrismaClient, 'callRecording'>;

const unsetOrNull = (field: 'startedAt' | 'stoppedAt' | 'attachmentId'): Prisma.CallRecordingWhereInput => ({
  OR: [{ [field]: null }, { [field]: { isSet: false } }],
});

export const OPEN_RECORDING: Prisma.CallRecordingWhereInput = unsetOrNull('stoppedAt');

export const PENDING_RECORDING: Prisma.CallRecordingWhereInput = {
  AND: [unsetOrNull('startedAt'), unsetOrNull('stoppedAt')],
};

const ROW_SELECT = {
  id: true,
  callSessionId: true,
  requesterId: true,
  requiredUserIds: true,
  consentedUserIds: true,
  requestedAt: true,
  startedAt: true,
  stoppedAt: true,
  stopReason: true,
  attachmentId: true,
} as const satisfies Prisma.CallRecordingSelect;

const toRow = (record: Prisma.CallRecordingGetPayload<{ select: typeof ROW_SELECT }>): CallRecordingRow => ({
  ...record,
  startedAt: record.startedAt ?? null,
  stoppedAt: record.stoppedAt ?? null,
  stopReason: record.stopReason ?? null,
  attachmentId: record.attachmentId ?? null,
});

export function prismaCallRecordingRepository(prisma: RecordingPrisma): CallRecordingRepository {
  return {
    async create(input) {
      const created = await prisma.callRecording.create({
        data: {
          callSessionId: input.callSessionId,
          requesterId: input.requesterId,
          requiredUserIds: [...input.requiredUserIds],
          consentedUserIds: [],
          requestedAt: input.requestedAt,
          startedAt: null,
          stoppedAt: null,
          attachmentId: null,
        },
        select: ROW_SELECT,
      });
      return toRow(created);
    },
    async findById(id) {
      const found = await prisma.callRecording.findUnique({ where: { id }, select: ROW_SELECT });
      return found ? toRow(found) : null;
    },
    async findOpen(callSessionId) {
      const found = await prisma.callRecording.findFirst({
        where: { AND: [{ callSessionId }, OPEN_RECORDING] },
        orderBy: { requestedAt: 'asc' },
        select: ROW_SELECT,
      });
      return found ? toRow(found) : null;
    },
    async addConsent(id, userId) {
      await prisma.callRecording.updateMany({
        where: { AND: [{ id }, PENDING_RECORDING, { NOT: { consentedUserIds: { has: userId } } }] },
        data: { consentedUserIds: { push: userId } },
      });
    },
    async markStarted(id, at) {
      const result = await prisma.callRecording.updateMany({
        where: { AND: [{ id }, PENDING_RECORDING] },
        data: { startedAt: at },
      });
      return result.count > 0;
    },
    async markStopped(id, stop) {
      const result = await prisma.callRecording.updateMany({
        where: { AND: [{ id }, OPEN_RECORDING] },
        data: { stoppedAt: stop.at, stopReason: stop.reason, stoppedByUserId: stop.byUserId },
      });
      return result.count > 0;
    },
  };
}

export function callRosterFrom(callService: Pick<CallService, 'getCallSession'>) {
  return async (callId: string): Promise<CallRoster | null> => {
    try {
      const session = await callService.getCallSession(callId);
      return {
        status: session.status,
        conversationId: session.conversationId,
        activeUserIds: session.participants
          .filter((participant) => !participant.leftAt)
          .map((participant) => participant.participant?.userId ?? participant.participantId),
      };
    } catch {
      return null;
    }
  };
}
