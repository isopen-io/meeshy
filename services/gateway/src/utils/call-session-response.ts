/**
 * Aplatissement des participants d'une CallSession pour la surface REST.
 *
 * `getCallSession()` (et initiate/end/join/leave) renvoient la forme Prisma :
 * l'identité vit sous `participant.{userId,user}` (nested) et l'état média sous
 * `isAudioEnabled`/`isVideoEnabled`. `callSessionSchema` (fast-json-stringify)
 * whiteliste au TOP-LEVEL du participant `userId`, `user`, `isMuted`,
 * `isVideoOff` — tout ce qui n'y est pas est stripé à la sérialisation. Sans
 * aplatissement, chaque participant REST se réduit à `{ id, role, joinedAt,
 * leftAt }` : identité et média perdus.
 *
 * Impact prouvé côté client : `ActiveCallParticipant` (CallModels.swift) décode
 * `userId: String` en NON-optionnel — l'absence de `userId` casse le décodage de
 * TOUTE la réponse `GET /calls/active` / `.../active-call`, donc le crash-recovery.
 *
 * Le helper est null-safe (les routes active-call renvoient `null` s'il n'y a pas
 * d'appel) et idempotent (une entrée déjà aplatie repasse inchangée).
 */

type MinimalUser = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  avatar?: string | null;
};

type ParticipantInput = {
  id?: string;
  participantId?: string;
  userId?: string;
  role?: string;
  status?: string;
  joinedAt?: Date | string | null;
  leftAt?: Date | string | null;
  isAudioEnabled?: boolean;
  isVideoEnabled?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  user?: MinimalUser | null;
  participant?: { userId?: string; user?: MinimalUser | null } | null;
};

type SessionInput = {
  participants?: unknown;
  participantCount?: number;
  [key: string]: unknown;
};

export type CallParticipantResponse = {
  id?: string;
  userId?: string;
  role?: string;
  status?: string;
  joinedAt?: Date | string | null;
  leftAt?: Date | string | null;
  isMuted?: boolean;
  isVideoOff?: boolean;
  user?: MinimalUser | null;
};

export type CallSessionResponse = {
  participants: CallParticipantResponse[];
  participantCount: number;
  [key: string]: unknown;
};

export function toCallParticipantResponse(p: ParticipantInput): CallParticipantResponse {
  const user = p.user ?? p.participant?.user ?? undefined;
  const userId = p.userId ?? p.participant?.userId ?? p.participantId;
  const isMuted =
    typeof p.isMuted === 'boolean'
      ? p.isMuted
      : typeof p.isAudioEnabled === 'boolean'
        ? !p.isAudioEnabled
        : undefined;
  const isVideoOff =
    typeof p.isVideoOff === 'boolean'
      ? p.isVideoOff
      : typeof p.isVideoEnabled === 'boolean'
        ? !p.isVideoEnabled
        : undefined;

  return {
    id: p.id,
    userId,
    role: p.role,
    status: p.status,
    joinedAt: p.joinedAt ?? null,
    leftAt: p.leftAt ?? null,
    isMuted,
    isVideoOff,
    user: user ?? undefined,
  };
}

export function toCallSessionResponse<T extends SessionInput | null | undefined>(
  session: T
): T extends null | undefined ? T : CallSessionResponse {
  if (session === null || session === undefined) {
    return session as never;
  }

  const participants = Array.isArray(session.participants)
    ? (session.participants as ParticipantInput[]).map(toCallParticipantResponse)
    : [];

  return {
    ...session,
    participants,
    participantCount: participants.length,
  } as never;
}
