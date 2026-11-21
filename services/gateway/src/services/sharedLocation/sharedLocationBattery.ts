/**
 * L'ACCORD DE BATTERIE D'UN PARTAGE DE POSITION (#19204) — « Partager aussi ma batterie, pendant
 * le partage seulement ». Lu par le relais de la batterie (`batteryAccess.ts`), qui en fait le
 * consentement de l'émetteur envers ces personnes, sous SA loi (`device.battery`, dès Proche, sans
 * blocage) et sa coupure globale.
 *
 * L'accord vit DANS l'état scellé du partage COURANT : il ne vaut que pour ses destinataires dont
 * l'échéance n'est pas passée, et s'éteint au terme, à l'arrêt ou au remplacement. Aucune table,
 * aucune clé à part : rien à purger ni à exporter au-delà du partage lui-même.
 */
import { readSharedLocations, type SharedLocationCache } from './sharedLocationStore';
import { liveRecipients } from './sharedLocationRelay';

/** Pour chaque émetteur (minuscules) qui a un partage avec la batterie, l'ensemble de ses destinataires vivants (minuscules). */
export async function sharedBatteryGrantsAmong(
  cache: SharedLocationCache,
  emitterIds: readonly string[],
  now: number,
): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  if (emitterIds.length === 0) return new Map();
  const states = await readSharedLocations(cache, [...new Set(emitterIds)], now);
  return new Map(
    [...states]
      .filter(([, state]) => state.shareBattery === true)
      .map(([emitterId, state]) => [emitterId.toLowerCase(), new Set(liveRecipients(state, now).map((recipient) => recipient.userId.toLowerCase()))] as const),
  );
}
