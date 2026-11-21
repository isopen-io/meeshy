/**
 * « DEMANDER À PROLONGER » ET « REDEMANDER » (#19204) — un destinataire demande à l'émetteur de
 * prolonger son partage de position, ou d'en refaire un après sa fin.
 *
 * - la loi `location.temporary` juge la paire comme si l'émetteur consentait (`pairAccessAmong`,
 *   site unique) : dès Ami, sans blocage, sans bouclier des mineurs ; les deux comptes doivent
 *   être utilisables. Sinon `REQUEST_FORBIDDEN`, ce que le lien dit déjà — comme le relevé de
 *   batterie à la demande (`batteryPull.ts`) ;
 * - UNE demande par paire et par fenêtre (`SHARED_LOCATION_REQUEST_WINDOW_MINUTES`), quel que
 *   soit son genre : la prise est atomique (`claim`, un `SET NX EX`) ;
 * - la demande part vers les sockets de l'émetteur (`location:share-requested`) ET en
 *   notification (`location_share_requested`, sous sa préférence) : qui, quoi, quand — jamais une
 *   coordonnée, le demandeur n'en a pas ;
 * - AUCUN effet automatique : rien du partage n'est lu ni écrit. L'émetteur relance ou prolonge
 *   lui-même, par `location:share-start`.
 */
import {
  SHARED_LOCATION_ERROR_CODES,
  SHARED_LOCATION_REQUEST_WINDOW_MINUTES,
  sharedLocationRequestPayloadSchema,
  type SharedLocationErrorCode,
  type SharedLocationRequestedEventData,
} from '@meeshy/shared/types/shared-location';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { pairAccessAmong, type PairAccessDb } from '../relations/pairAccess';
import { ACCOUNT_STATE_SELECT, isUsableAccount } from '../relations/usableAccount';
import type { SharedLocationRequestNotice } from './sharedLocationNotices';

export type SharedLocationRequestDeps = {
  readonly prisma: PairAccessDb;
  readonly io: ServerEmitIO | undefined;
  readonly now: () => number;
  /** Prend la clé pour `ttlSeconds` si elle est libre (atomique) ; rend `false` si elle est déjà prise. */
  readonly claim: (key: string, ttlSeconds: number) => Promise<boolean>;
  /** La notification à l'émetteur ; un échec n'annule pas la demande. */
  readonly notify: (notice: SharedLocationRequestNotice) => Promise<boolean>;
};

export type SharedLocationRequestAck =
  | { readonly success: true; readonly data: { readonly requestedAt: string } }
  | { readonly success: false; readonly error: string; readonly code: SharedLocationErrorCode };

const refused = (code: SharedLocationErrorCode, error: string) => ({ success: false, error, code }) as const;
const FORBIDDEN = refused(SHARED_LOCATION_ERROR_CODES.REQUEST_FORBIDDEN, 'Demande indisponible');

/** La clé du plafond : une par paire orientée (l'émetteur, le demandeur). */
export const sharedLocationRequestKey = (emitterId: string, requesterId: string): string =>
  `shared-location-request:{${emitterId.toLowerCase()}}:${requesterId.toLowerCase()}`;

/** La loi ouvre-t-elle `location.temporary` dans la paire, l'émetteur consentant, entre deux comptes utilisables ? */
async function requestOpens(prisma: PairAccessDb, params: { readonly requesterId: string; readonly emitterId: string; readonly now: Date }): Promise<boolean> {
  const [law, accounts] = await Promise.all([
    pairAccessAmong(prisma, {
      feature: 'location.temporary',
      subjectId: params.requesterId,
      otherIds: [params.emitterId],
      subjectIs: 'viewer',
      now: params.now,
      consentOf: () => 'granted',
    }),
    prisma.user.findMany({ where: { id: { in: [params.requesterId, params.emitterId] } }, select: { id: true, ...ACCOUNT_STATE_SELECT } }),
  ]);
  const usable = new Set(accounts.filter((account) => isUsableAccount(account)).map((account) => account.id.toLowerCase()));
  return law.get(params.emitterId)?.allowed === true && usable.has(params.requesterId.toLowerCase()) && usable.has(params.emitterId.toLowerCase());
}

export async function requestSharedLocation(
  deps: SharedLocationRequestDeps,
  params: { readonly requesterId: string; readonly emitterId: string; readonly payload: unknown },
): Promise<SharedLocationRequestAck> {
  const parsed = sharedLocationRequestPayloadSchema.safeParse(params.payload);
  if (!parsed.success) return refused(SHARED_LOCATION_ERROR_CODES.INVALID, 'Demande illisible');
  if (params.requesterId.toLowerCase() === params.emitterId.toLowerCase()) return refused(SHARED_LOCATION_ERROR_CODES.INVALID, 'Demande illisible');

  const now = new Date(deps.now());
  if (!(await requestOpens(deps.prisma, { requesterId: params.requesterId, emitterId: params.emitterId, now }))) return FORBIDDEN;
  if (!(await deps.claim(sharedLocationRequestKey(params.emitterId, params.requesterId), SHARED_LOCATION_REQUEST_WINDOW_MINUTES * 60))) {
    return refused(SHARED_LOCATION_ERROR_CODES.REQUEST_TOO_SOON, 'Une demande vient d\'être faite');
  }

  const requestedAt = now.toISOString();
  const event: SharedLocationRequestedEventData = { userId: params.requesterId, kind: parsed.data.kind, requestedAt };
  try {
    deps.io?.to(ROOMS.user(params.emitterId)).emit(SERVER_EVENTS.SHARED_LOCATION_REQUESTED, event);
  } catch {
    /* la notification suit */
  }
  await deps.notify({ emitterId: params.emitterId, requesterId: params.requesterId, kind: parsed.data.kind, requestedAt }).catch(() => false);
  return { success: true, data: { requestedAt } };
}
