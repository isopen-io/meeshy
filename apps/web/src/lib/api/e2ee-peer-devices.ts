import * as e2eeEndpoints from '@meeshy/shared/api/endpoints/e2-ee';

import type { DataSource } from './config';
import type { HttpTransport } from './http';

/**
 * **COMBIEN D'APPAREILS CHIFFRÉS UN PAIR A PUBLIÉS** (#20075, jumelle de
 * `EndToEndDirectoryDeviceCounter`, iOS #20074) — `GET e2-ee.keysByUserIdDevices`,
 * ouvert à qui partage une conversation avec lui. Seul le COMPTE sert : un
 * tête-à-tête chiffré dont le pair n'a aucun appareil chiffré ne peut rien
 * recevoir. Un refus, une panne ou une charge illisible rendent `null` — rien
 * n'est su, et rien ne s'affiche sur une supposition. Aucune démonstration en
 * `fixtures` : on n'invente pas les appareils d'un tiers.
 */
export type PeerDevicesDeps = { readonly source: DataSource; readonly transport: HttpTransport };

const devicesOf = (data: unknown): unknown =>
  data !== null && typeof data === 'object' ? (data as { readonly devices?: unknown }).devices : undefined;

export async function encryptedDeviceCountOf(deps: PeerDevicesDeps, userId: string): Promise<number | null> {
  if (userId === '' || deps.source === 'fixtures') return null;
  const result = await deps.transport.request<unknown>({ method: 'GET', path: e2eeEndpoints.keysByUserIdDevices(userId) }).catch(() => null);
  if (result === null || !result.ok) return null;
  const devices = devicesOf(result.data);
  return Array.isArray(devices) ? devices.length : null;
}
