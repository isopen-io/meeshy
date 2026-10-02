import { CallStatus } from '@meeshy/shared/prisma/client';

const ANSWERED_LIVE_STATUSES: readonly string[] = [CallStatus.connecting, CallStatus.active, CallStatus.reconnecting];

/**
 * **UN APPEL DE GROUPE NE GARDE PAS UN PARTICIPANT SEUL** (#9109).
 *
 * Un appel continue tant qu'il réunit au moins DEUX participants. Quand les
 * départs d'un appel de groupe DÉCROCHÉ n'en laissent qu'un, l'appel attend
 * `CALL_REJOIN_GRACE_MS` qu'un partant revienne (#9111 — une coupure réseau,
 * un plantage ou un raccroché qu'on regrette se rattrapent), puis se termine
 * pour le dernier, comme si lui aussi était parti : même raison de fin
 * (`completed`), même diffusion, même résumé.
 *
 * Le minuteur ne décide de rien quand il est posé : il RELIT l'appel à
 * l'échéance. Un retour entre-temps, un second départ, une fin par un autre
 * chemin — tout se lit à l'échéance, sans annulation à câbler sur chaque
 * chemin de retour.
 */

type SurvivorRow = {
  readonly id: string;
  readonly participantId: string;
  readonly leftAt?: Date | null;
  readonly participant?: { readonly userId?: string | null } | null;
};

export type LoneSurvivorCall = {
  readonly id: string;
  readonly status: string;
  readonly answeredAt?: Date | null;
  readonly endedAt?: Date | null;
  readonly conversation?: { readonly type?: string | null } | null;
  readonly participants: readonly SurvivorRow[];
};

export type LoneSurvivor = {
  readonly callId: string;
  readonly userId: string;
  readonly participantId: string;
  /** Le dernier parti — c'est lui qui a « fini » l'appel pour le survivant. */
  readonly lastLeaverUserId: string;
};

const userOf = (row: SurvivorRow): string => row.participant?.userId || row.participantId;

/**
 * Le seul participant actif d'un appel de groupe décroché et encore ouvert,
 * ou `null` quand l'appel n'est pas dans ce cas (direct, jamais décroché,
 * terminé, deux actifs ou plus, aucun).
 */
export function loneSurvivorOf(call: LoneSurvivorCall): LoneSurvivor | null {
  if (call.conversation?.type === 'direct' || !call.answeredAt || call.endedAt) return null;
  if (!ANSWERED_LIVE_STATUSES.includes(call.status)) return null;
  const active = call.participants.filter((row) => !row.leftAt);
  const survivor = active.length === 1 ? active[0] : undefined;
  if (survivor === undefined) return null;
  const departed = call.participants
    .filter((row) => Boolean(row.leftAt) && userOf(row) !== userOf(survivor))
    .sort((a, b) => (b.leftAt?.getTime() ?? 0) - (a.leftAt?.getTime() ?? 0));
  const lastLeaver = departed[0];
  if (lastLeaver === undefined) return null;
  return { callId: call.id, userId: userOf(survivor), participantId: survivor.participantId, lastLeaverUserId: userOf(lastLeaver) };
}

export type LoneSurvivorGraceDeps = {
  readonly graceMs: number;
  readonly readCall: (callId: string) => Promise<LoneSurvivorCall | null>;
  readonly endFor: (survivor: LoneSurvivor) => Promise<void>;
  readonly onError: (callId: string, error: unknown) => void;
};

export class LoneSurvivorGrace {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly deps: LoneSurvivorGraceDeps) {}

  /** Après un départ d'un appel de groupe qui continue : l'échéance relira l'appel. */
  arm(callId: string): void {
    this.cancel(callId);
    const timer = setTimeout(() => {
      this.timers.delete(callId);
      void this.expire(callId).catch((error: unknown) => this.deps.onError(callId, error));
    }, this.deps.graceMs);
    timer.unref?.();
    this.timers.set(callId, timer);
  }

  cancel(callId: string): void {
    const timer = this.timers.get(callId);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.timers.delete(callId);
  }

  destroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async expire(callId: string): Promise<void> {
    const call = await this.deps.readCall(callId);
    const survivor = call === null ? null : loneSurvivorOf(call);
    if (survivor !== null) await this.deps.endFor(survivor);
  }
}
