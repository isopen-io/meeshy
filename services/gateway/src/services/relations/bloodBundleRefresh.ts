/**
 * LES RELAIS RELUS APRÈS L'ACCORD AU PALIER (constat 8) : ce que l'accord ouvre arrive aussitôt chez l'autre.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { refreshNowPlayingAfter } from '../nowPlaying/nowPlayingDeps';
import { refreshBatteryAfter } from '../battery/batteryDeps';
import { refreshSharedLocationAfter } from '../sharedLocation/sharedLocationDeps';
import { refreshInactivityServedAfter } from '../inactivityCheck/inactivityDeps';

type RelayIo = Parameters<typeof refreshNowPlayingAfter>[0]['io'];

export type BloodBundleRefreshDeps = {
  readonly prisma: PrismaClient;
  readonly io: RelayIo;
  readonly report: (what: string, error: unknown) => void;
};

/**
 * Les relais relus après un changement de l'accord au palier, comme après un rituel ou une baisse :
 * écoute, batterie, position partagée, inactivité et chute. Best-effort, jamais levant.
 */
export async function refreshBloodBundleRelays(deps: BloodBundleRefreshDeps, pair: { readonly userA: string; readonly userB: string }): Promise<void> {
  const relay = (what: string) => ({ prisma: deps.prisma, io: deps.io, report: (error: unknown) => deps.report(what, error) });
  await refreshNowPlayingAfter(relay('Now playing'), pair);
  await refreshBatteryAfter(relay('Battery'), pair);
  await refreshSharedLocationAfter(relay('Shared location'), pair);
  await refreshInactivityServedAfter(relay('Inactivity'), pair.userA);
}
