import {
  CALL_RECORDING_CONSENT_TIMEOUT_MS,
  type CallRecordingAck,
  type CallRecordingConsentEvent,
  type CallRecordingErrorCode,
  type CallRecordingRequestEvent,
  type CallRecordingRequestedEvent,
  type CallRecordingStartedEvent,
  type CallRecordingStopEvent,
  type CallRecordingStopReason,
  type CallRecordingStoppedEvent,
} from '@meeshy/shared/types/call-recording';
import {
  evaluateArrival,
  evaluateConsent,
  hasEveryConsent,
  recordingPhase,
  type CallRecordingState,
} from '@meeshy/shared/utils/call-recording-consent';

/**
 * L'AUTORITÉ du consentement à l'enregistrement d'un appel (#8064).
 *
 * Le client n'est jamais cru : c'est ici que se décide qu'un enregistrement
 * peut démarrer — quand TOUS les participants présents à la demande ont
 * accepté, avant le délai, et qu'aucun participant n'est arrivé sans
 * consentir. Chaque transition passe par une écriture CONDITIONNELLE du dépôt
 * (`markStarted` / `markStopped` ne gagnent qu'une fois) : deux accords
 * simultanés ne démarrent pas deux fois, un refus et un accord croisés ne
 * laissent jamais un enregistrement démarré après le refus.
 *
 * Le service ne connaît pas Socket.IO : il rend l'accusé et la liste des
 * diffusions, que `socketio/call-recording-events.ts` émet dans la room.
 */

export type CallRecordingRow = {
  readonly id: string;
  readonly callSessionId: string;
  readonly requesterId: string;
  readonly requiredUserIds: readonly string[];
  readonly consentedUserIds: readonly string[];
  readonly requestedAt: Date;
  readonly startedAt: Date | null;
  readonly stoppedAt: Date | null;
  readonly stopReason: string | null;
  readonly attachmentId: string | null;
};

export type CallRecordingStop = {
  readonly reason: CallRecordingStopReason;
  readonly byUserId: string | null;
  readonly at: Date;
};

export type CallRecordingRepository = {
  create(input: {
    readonly callSessionId: string;
    readonly requesterId: string;
    readonly requiredUserIds: readonly string[];
    readonly requestedAt: Date;
  }): Promise<CallRecordingRow>;
  findById(id: string): Promise<CallRecordingRow | null>;
  findOpen(callSessionId: string): Promise<CallRecordingRow | null>;
  addConsent(id: string, userId: string): Promise<void>;
  markStarted(id: string, at: Date): Promise<boolean>;
  markStopped(id: string, stop: CallRecordingStop): Promise<boolean>;
};

export type CallRoster = {
  readonly status: string;
  readonly conversationId: string;
  readonly activeUserIds: readonly string[];
};

export type CallRecordingDeps = {
  readonly repository: CallRecordingRepository;
  readonly roster: (callId: string) => Promise<CallRoster | null>;
  readonly now: () => Date;
};

export type RecordingBroadcast =
  | { readonly event: 'requested'; readonly payload: CallRecordingRequestedEvent }
  | { readonly event: 'started'; readonly payload: CallRecordingStartedEvent }
  | { readonly event: 'stopped'; readonly payload: CallRecordingStoppedEvent };

export type RecordingOutcome = {
  readonly ack: CallRecordingAck;
  readonly broadcasts: readonly RecordingBroadcast[];
};

export const RECORDABLE_CALL_STATUSES: readonly string[] = ['connecting', 'active', 'reconnecting'];

const refuse = (code: CallRecordingErrorCode, broadcasts: readonly RecordingBroadcast[] = []): RecordingOutcome => ({
  ack: { success: false, code },
  broadcasts,
});

const accept = (recordingId: string, broadcasts: readonly RecordingBroadcast[] = []): RecordingOutcome => ({
  ack: { success: true, recordingId },
  broadcasts,
});

export const toConsentState = (row: CallRecordingRow): CallRecordingState => ({
  requesterId: row.requesterId,
  requiredUserIds: row.requiredUserIds,
  consentedUserIds: row.consentedUserIds,
  requestedAt: row.requestedAt.getTime(),
  startedAt: row.startedAt?.getTime() ?? null,
  stoppedAt: row.stoppedAt?.getTime() ?? null,
});

export class CallRecordingService {
  constructor(private readonly deps: CallRecordingDeps) {}

  async request(userId: string, input: CallRecordingRequestEvent): Promise<RecordingOutcome> {
    const roster = await this.deps.roster(input.callId);
    if (!roster || !roster.activeUserIds.includes(userId)) return refuse('NOT_A_PARTICIPANT');
    if (!RECORDABLE_CALL_STATUSES.includes(roster.status)) return refuse('CALL_NOT_ACTIVE');
    const requiredUserIds = roster.activeUserIds.filter((id) => id !== userId);
    if (requiredUserIds.length === 0) return refuse('NO_PEER_TO_CONSENT');

    const now = this.deps.now();
    const open = await this.deps.repository.findOpen(input.callId);
    const cleared = open ? await this.clearIfExpired(open, now) : [];
    if (open && cleared.length === 0) return refuse('RECORDING_ALREADY_PENDING');

    const created = await this.deps.repository.create({
      callSessionId: input.callId,
      requesterId: userId,
      requiredUserIds,
      requestedAt: now,
    });
    const winner = await this.deps.repository.findOpen(input.callId);
    if (winner && winner.id !== created.id) {
      await this.deps.repository.markStopped(created.id, { reason: 'stopped', byUserId: userId, at: now });
      return refuse('RECORDING_ALREADY_PENDING', cleared);
    }

    return accept(created.id, [
      ...cleared,
      {
        event: 'requested',
        payload: {
          callId: input.callId,
          recordingId: created.id,
          requesterId: userId,
          requiredUserIds,
          expiresAt: new Date(now.getTime() + CALL_RECORDING_CONSENT_TIMEOUT_MS).toISOString(),
        },
      },
    ]);
  }

  async consent(userId: string, input: CallRecordingConsentEvent): Promise<RecordingOutcome> {
    const row = await this.deps.repository.findById(input.recordingId);
    if (!row || row.callSessionId !== input.callId) return refuse('RECORDING_NOT_FOUND');
    const roster = await this.deps.roster(input.callId);
    if (!roster || !roster.activeUserIds.includes(userId)) return refuse('NOT_A_PARTICIPANT');

    const now = this.deps.now();
    const outcome = evaluateConsent(toConsentState(row), { userId, accepted: input.accepted }, now.getTime());
    switch (outcome.kind) {
      case 'rejected':
        return outcome.code === 'RECORDING_EXPIRED'
          ? refuse(outcome.code, await this.stopRow(row, { reason: 'timeout', byUserId: null, at: now }))
          : refuse(outcome.code);
      case 'refused':
        return accept(row.id, await this.stopRow(row, { reason: 'refused', byUserId: userId, at: now }));
      case 'accepted':
        await this.deps.repository.addConsent(row.id, userId);
        return accept(row.id, outcome.allConsented ? await this.tryStart(row.id, now) : []);
    }
  }

  async stop(userId: string, input: CallRecordingStopEvent): Promise<RecordingOutcome> {
    const row = await this.deps.repository.findById(input.recordingId);
    if (!row || row.callSessionId !== input.callId) return refuse('RECORDING_NOT_FOUND');
    const roster = await this.deps.roster(input.callId);
    const isParticipant = roster?.activeUserIds.includes(userId) ?? false;
    if (!isParticipant && row.requesterId !== userId) return refuse('NOT_A_PARTICIPANT');
    return accept(row.id, await this.stopRow(row, { reason: 'stopped', byUserId: userId, at: this.deps.now() }));
  }

  async arrival(callId: string, userId: string): Promise<readonly RecordingBroadcast[]> {
    const open = await this.deps.repository.findOpen(callId);
    if (!open) return [];
    const now = this.deps.now();
    const cleared = await this.clearIfExpired(open, now);
    if (cleared.length > 0) return cleared;
    if (evaluateArrival(toConsentState(open), userId, now.getTime()) === 'ignore') return [];
    return this.stopRow(open, { reason: 'participant-joined', byUserId: null, at: now });
  }

  async expire(recordingId: string): Promise<readonly RecordingBroadcast[]> {
    const row = await this.deps.repository.findById(recordingId);
    return row ? this.clearIfExpired(row, this.deps.now()) : [];
  }

  private async clearIfExpired(row: CallRecordingRow, now: Date): Promise<readonly RecordingBroadcast[]> {
    if (recordingPhase(toConsentState(row), now.getTime()) !== 'expired') return [];
    return this.stopRow(row, { reason: 'timeout', byUserId: null, at: now });
  }

  private async tryStart(recordingId: string, now: Date): Promise<readonly RecordingBroadcast[]> {
    const fresh = await this.deps.repository.findById(recordingId);
    if (!fresh || recordingPhase(toConsentState(fresh), now.getTime()) !== 'pending') return [];
    if (!hasEveryConsent(fresh.requiredUserIds, fresh.consentedUserIds)) return [];

    const roster = await this.deps.roster(fresh.callSessionId);
    if (!roster || !RECORDABLE_CALL_STATUSES.includes(roster.status)) {
      return this.stopRow(fresh, { reason: 'call-ended', byUserId: null, at: now });
    }
    if (!roster.activeUserIds.includes(fresh.requesterId)) {
      return this.stopRow(fresh, { reason: 'requester-left', byUserId: null, at: now });
    }
    const outsiders = roster.activeUserIds.filter(
      (id) => id !== fresh.requesterId && !fresh.consentedUserIds.includes(id),
    );
    if (outsiders.length > 0) {
      return this.stopRow(fresh, { reason: 'participant-joined', byUserId: null, at: now });
    }

    const won = await this.deps.repository.markStarted(fresh.id, now);
    if (!won) return [];
    return [
      {
        event: 'started',
        payload: {
          callId: fresh.callSessionId,
          recordingId: fresh.id,
          recorderId: fresh.requesterId,
          startedAt: now.toISOString(),
        },
      },
    ];
  }

  private async stopRow(row: CallRecordingRow, stop: CallRecordingStop): Promise<readonly RecordingBroadcast[]> {
    const won = await this.deps.repository.markStopped(row.id, stop);
    if (!won) return [];
    return [
      {
        event: 'stopped',
        payload: {
          callId: row.callSessionId,
          recordingId: row.id,
          reason: stop.reason,
          byUserId: stop.byUserId,
          wasRecording: row.startedAt !== null,
        },
      },
    ];
  }
}
