import * as z from 'zod/mini';

import type { ApiResult, HttpRequest } from '@/lib/api/http';

import { appUpdateStore, type StoreUpdate } from './pending-store';

/**
 * LA COQUE APPREND QU'UNE VERSION EST PUBLIÉE (#6937).
 *
 * Le web l'apprend par son service worker (#6936) ; la coque Capacitor n'en a
 * pas (`check-shell-dist.mjs`) et embarque ses actifs, donc une version neuve
 * n'y arrive que par le magasin. La SOURCE est nommée : `GET
 * /api/v1/app/shell-version` (`services/gateway/src/routes/app.ts`), qui sert
 * `SHELL_LATEST_VERSION` et la fiche du magasin de la plateforme demandée.
 * Une version vide, illisible, pas plus récente que celle installée, une fiche
 * qui n'est pas `https:` ou une panne réseau ne fabriquent AUCUNE annonce.
 */

const VERSION = /^\d+(\.\d+){0,2}$/;

const parts = (version: string): readonly number[] => {
  const numbers = version.split('.').map(Number);
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
};

export function isNewerVersion(candidate: string, installed: string): boolean {
  if (!VERSION.test(candidate) || !VERSION.test(installed)) return false;
  const a = parts(candidate);
  const b = parts(installed);
  const rank = a.findIndex((n, i) => n !== b[i]);
  return rank !== -1 && (a[rank] ?? 0) > (b[rank] ?? 0);
}

const Served = z.object({ latestVersion: z.string(), storeUrl: z.string() });

export function storeUpdateFrom(served: unknown, installed: string): StoreUpdate | null {
  const parsed = Served.safeParse(served);
  if (!parsed.success) return null;
  const { latestVersion, storeUrl } = parsed.data;
  if (!isNewerVersion(latestVersion, installed) || !storeUrl.startsWith('https://')) return null;
  return { version: latestVersion, storeUrl };
}

export type ShellPlatform = 'android' | 'ios';

export function shellPlatform(bridge: { readonly getPlatform?: () => string } | undefined): ShellPlatform | null {
  const platform = bridge?.getPlatform?.();
  return platform === 'android' || platform === 'ios' ? platform : null;
}

type ShellUpdateTransport = {
  request<T>(request: HttpRequest): Promise<ApiResult<T>>;
};

export async function checkShellUpdate({
  transport,
  installed,
  platform,
}: {
  readonly transport: ShellUpdateTransport;
  readonly installed: string;
  readonly platform: ShellPlatform;
}): Promise<void> {
  const result = await transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/app/shell-version?platform=${platform}`,
  });
  if (!result.ok) return;
  const update = storeUpdateFrom(result.data, installed);
  if (update !== null) appUpdateStore.getState().announceStore(update);
}

type VisibilityHost = {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
};

/**
 * Les deux déclencheurs du web (#6936) qui ont un sens ici : le démarrage et
 * le retour au premier plan — c'est là qu'une coque restée ouverte des jours
 * apprend la publication. Rendu : la fonction qui débranche.
 */
export function watchShellUpdates({
  transport,
  installed,
  bridge,
  host,
}: {
  readonly transport: ShellUpdateTransport;
  readonly installed: string;
  readonly bridge: { readonly getPlatform?: () => string } | undefined;
  readonly host: VisibilityHost;
}): () => void {
  const platform = shellPlatform(bridge);
  if (platform === null) return () => undefined;
  const check = (): void => {
    if (host.visibilityState !== 'visible') return;
    void checkShellUpdate({ transport, installed, platform });
  };
  check();
  host.addEventListener('visibilitychange', check);
  return () => host.removeEventListener('visibilitychange', check);
}
