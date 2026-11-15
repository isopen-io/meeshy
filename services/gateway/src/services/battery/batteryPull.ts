/**
 * LE RELEVÉ À LA DEMANDE (#14147, spec § 2) — un Sang demande à l'émetteur de relever sa
 * batterie MAINTENANT : `device.battery.pull` (min Sang, action dirigée, même consentement
 * que la batterie), au plus une fois toutes les 5 min par paire.
 *
 * La demande part vers les sockets de l'émetteur (`battery:pull-requested`) ET en push
 * silencieux vers son téléphone, qui peut dormir : ni l'un ni l'autre ne dit QUI demande.
 */
import {
  BATTERY_ERROR_CODES,
  batteryPullPayloadSchema,
  type BatteryPullAck,
} from '@meeshy/shared/types/battery';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { batteryAccessAmong } from './batteryAccess';
import type { BatteryRelayDeps } from './batteryRelay';
import { claimBatteryPull } from './batteryStore';

export type BatteryPullDeps = Pick<BatteryRelayDeps, 'prisma' | 'cache' | 'io' | 'now'> & {
  /** Le push silencieux de relevé vers le téléphone de l'émetteur ; un échec n'annule pas la demande. */
  readonly wake: (emitterId: string, requestedAt: string) => Promise<void>;
};

const refused = (code: (typeof BATTERY_ERROR_CODES)[keyof typeof BATTERY_ERROR_CODES], error: string) => ({ success: false, error, code }) as const;

export async function requestBatteryPull(deps: BatteryPullDeps, params: { readonly readerId: string; readonly payload: unknown }): Promise<BatteryPullAck> {
  const parsed = batteryPullPayloadSchema.safeParse(params.payload);
  if (!parsed.success) return refused(BATTERY_ERROR_CODES.INVALID, 'Demande illisible');
  const emitterId = parsed.data.userId.toLowerCase();
  if (emitterId === params.readerId.toLowerCase()) return refused(BATTERY_ERROR_CODES.PULL_FORBIDDEN, 'Relevé indisponible');

  const access = await batteryAccessAmong(deps.prisma, {
    subjectId: emitterId,
    otherIds: [params.readerId],
    subjectIs: 'target',
    now: new Date(deps.now()),
    feature: 'device.battery.pull',
  });
  if (access.get(params.readerId)?.allowed !== true) return refused(BATTERY_ERROR_CODES.PULL_FORBIDDEN, 'Relevé indisponible');
  if (!(await claimBatteryPull(deps.cache, { emitterId, readerId: params.readerId }))) {
    return refused(BATTERY_ERROR_CODES.PULL_TOO_SOON, 'Un relevé vient d\'être demandé');
  }

  const requestedAt = new Date(deps.now()).toISOString();
  try {
    deps.io?.to(ROOMS.user(emitterId)).emit(SERVER_EVENTS.BATTERY_PULL_REQUESTED, { requestedAt });
  } catch {
    /* le push silencieux suit */
  }
  await deps.wake(emitterId, requestedAt).catch(() => undefined);
  return { success: true, data: { requestedAt } };
}
