import * as z from 'zod/mini';
import * as e2eeEndpoints from '@meeshy/shared/api/endpoints/e2-ee';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DE « MES APPAREILS CHIFFRÉS »** (#13013, jumelle web de #13009).
 *
 *  - `GET /e2ee/devices` (#13014, `E2EEOwnDevice`) — MES appareils où le
 *    chiffrement de bout en bout est activé : numéro, plateforme, nom déclaré,
 *    enrôlé le, vu le, et s'il est celui de la session qui lit (`current`) ;
 *  - `DELETE /e2ee/devices/:deviceId` — le retirer. La passerelle
 *    ferme sa session PUIS révoque son identité (un appareil volé ne se
 *    réenrôle pas) ; une session qui ne se ferme pas rend 503, rien retiré.
 *
 * Le navigateur n'a aucune pile libsignal (#12975) : il ne s'enrôle pas, il
 * n'approuve rien. L'APPROBATION d'un appareil par un autre vit sur chaque
 * appareil (`E2EEOwnDeviceApprovals`, iOS) et le serveur ne la connaît pas : ce
 * port ne la sert donc pas, et l'écran ne l'invente pas.
 *
 * Aucune branche `fixtures`, même raison que `account-security.ts` : un écran
 * qui dit la vérité sur les appareils d'un compte ne montre pas d'appareils
 * inventés.
 */

export type E2eeDeviceDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const E2EE_DEVICES_QUERY_KEY = ['me', 'e2ee-devices'] as const;

export const E2EE_DEVICE_PLATFORMS = ['ios', 'macos', 'android', 'web'] as const;

export type E2eeDevicePlatform = (typeof E2EE_DEVICE_PLATFORMS)[number];

export type E2eeDevice = {
  readonly deviceId: number;
  /** Hors contrat ⇒ `null` : une plateforme ne s'invente pas. */
  readonly platform: E2eeDevicePlatform | null;
  /** Déclaré par l'appareil lui-même, nettoyé de ses caractères de contrôle et d'orientation. */
  readonly label: string | null;
  readonly enrolledAt: string | null;
  readonly lastSeenAt: string | null;
  readonly current: boolean;
};

const optionalText = z.optional(z.nullable(z.string()));

const WireDevice = z.object({
  deviceId: z.number().check(z.int(), z.gte(1), z.lte(127)),
  platform: optionalText,
  label: optionalText,
  enrolledAt: optionalText,
  lastSeenAt: optionalText,
  current: z.optional(z.nullable(z.boolean())),
});

/** Un nom DÉCLARÉ ne porte ni contrôle ni renversement d'orientation (U+202E) : « iPhone de Awa » ne se maquille pas. */
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;

const labelOf = (value: string | null | undefined): string | null => {
  const cleaned = (value ?? '').replace(UNSAFE_CHARACTERS, '').trim();
  return cleaned === '' ? null : cleaned;
};

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/** Construit champ par champ : jamais un `...wire`, qui recopierait ce que la passerelle ajouterait. */
export function decodeE2eeDevice(raw: unknown): E2eeDevice | null {
  const parsed = WireDevice.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    deviceId: wire.deviceId,
    platform: E2EE_DEVICE_PLATFORMS.find((platform) => platform === wire.platform) ?? null,
    label: labelOf(wire.label),
    enrolledAt: textOrNull(wire.enrolledAt),
    lastSeenAt: textOrNull(wire.lastSeenAt),
    current: wire.current === true,
  };
}

const NOT_SERVED: ApiFailure = { ok: false, status: 501, error: 'Les appareils chiffrés n’ont pas de démonstration' };

export async function loadE2eeDevices(params: E2eeDeviceDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<readonly E2eeDevice[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') return NOT_SERVED;
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: e2eeEndpoints.devices,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const charge = result.data !== null && typeof result.data === 'object' ? (result.data as { devices?: unknown }).devices : undefined;
  const devices = (Array.isArray(charge) ? charge : []).flatMap((raw) => {
    const device = decodeE2eeDevice(raw);
    return device === null ? [] : [device];
  });
  return { ok: true, data: devices };
}

export async function retireE2eeDevice(deps: E2eeDeviceDeps, deviceId: number): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return NOT_SERVED;
  return deps.transport.request<unknown>({ method: 'DELETE', path: e2eeEndpoints.devicesByDeviceId(String(deviceId)) });
}

/** La courante en tête, puis la plus récemment vue. */
export function orderedE2eeDevices(devices: readonly E2eeDevice[]): readonly E2eeDevice[] {
  const seen = (device: E2eeDevice) => (device.lastSeenAt === null ? 0 : new Date(device.lastSeenAt).getTime() || 0);
  return [...devices].sort((a, b) => Number(b.current) - Number(a.current) || seen(b) - seen(a) || a.deviceId - b.deviceId);
}
