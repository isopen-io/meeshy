import type { PackAssetRef } from '@meeshy/shared/types/content-pack';

import { packAssetUrl } from '../packs/pack-asset-url';

/**
 * **D'OÙ VIENNENT LES OCTETS D'UNE COUCHE** (#10638) — un `PackAssetRef` (adresse
 * par contenu) devient un chargeur d'octets. Les couches des packs INTÉGRÉS
 * voyagent avec l'application (import à la demande, aucun réseau) ; les autres
 * se téléchargent sur `/pack-assets/<sha16>.<ext>` et leur empreinte COMPLÈTE
 * est vérifiée avant qu'on les rende. Un refus ou un échec rend `null` : l'hôte
 * garde son image fixe.
 */
export type LottieBytesLoader = () => Promise<Uint8Array | null>;

/** Les couches intégrées, par adresse : chacune est un module JSON chargé seul. */
const BUILTIN: Readonly<Record<string, () => Promise<unknown>>> = {
  'b19ebab0f4cfeed8.json': () => import('@meeshy/shared/design/appearance/lottie/b19ebab0f4cfeed8.json'),
  'ec52a7f12af8a193.json': () => import('@meeshy/shared/design/appearance/lottie/ec52a7f12af8a193.json'),
  'cad11fe66d4fc9ec.json': () => import('@meeshy/shared/design/appearance/lottie/cad11fe66d4fc9ec.json'),
  '5aff839c02a1cfcb.json': () => import('@meeshy/shared/design/appearance/lottie/5aff839c02a1cfcb.json'),
  '6ba39ccae139a4bb.json': () => import('@meeshy/shared/design/appearance/lottie/6ba39ccae139a4bb.json'),
  '9eeb258fda7680b6.json': () => import('@meeshy/shared/design/appearance/lottie/9eeb258fda7680b6.json'),
  'b91b4b2e5d828890.json': () => import('@meeshy/shared/design/appearance/lottie/b91b4b2e5d828890.json'),
  '039a32b2874b1119.json': () => import('@meeshy/shared/design/appearance/lottie/039a32b2874b1119.json'),
  '3e282f6c9c6c6064.json': () => import('@meeshy/shared/design/appearance/lottie/3e282f6c9c6c6064.json'),
  '57404ed57c27976e.json': () => import('@meeshy/shared/design/appearance/lottie/57404ed57c27976e.json'),
  '3a9eb7427fe1c7d3.json': () => import('@meeshy/shared/design/appearance/lottie/3a9eb7427fe1c7d3.json'),
  '04fdacd3b3baeb16.json': () => import('@meeshy/shared/design/appearance/lottie/04fdacd3b3baeb16.json'),
  '1fd16cbcf0a17155.json': () => import('@meeshy/shared/design/appearance/lottie/1fd16cbcf0a17155.json'),
  'dbce7ad829a8ff3d.json': () => import('@meeshy/shared/design/appearance/lottie/dbce7ad829a8ff3d.json'),
  'fc93e6a04bbb1bec.json': () => import('@meeshy/shared/design/appearance/lottie/fc93e6a04bbb1bec.json'),
  'a03aac7d7b944984.json': () => import('@meeshy/shared/design/appearance/lottie/a03aac7d7b944984.json'),
  'cd2bdcb8d1d4c722.json': () => import('@meeshy/shared/design/appearance/lottie/cd2bdcb8d1d4c722.json'),
  '1988db0bd7d4dd37.json': () => import('@meeshy/shared/design/appearance/lottie/1988db0bd7d4dd37.json'),
  'ea1979b682cf59e1.json': () => import('@meeshy/shared/design/appearance/lottie/ea1979b682cf59e1.json'),
  'c22415459436e9ec.json': () => import('@meeshy/shared/design/appearance/lottie/c22415459436e9ec.json'),
  '57fc2eff0bdcfd5d.json': () => import('@meeshy/shared/design/appearance/lottie/57fc2eff0bdcfd5d.json'),
  'ce832a2e34cd4864.json': () => import('@meeshy/shared/design/appearance/lottie/ce832a2e34cd4864.json'),
};

/** Les adresses intégrées : le témoin du catalogue exige que toute couche des packs `builtin` y figure. */
export const BUILTIN_LOTTIE_SRCS: readonly string[] = Object.keys(BUILTIN);

const sha256Hex = async (bytes: ArrayBuffer): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');

export function lottieBytesLoader(ref: PackAssetRef, deps: { readonly origin: string; readonly fetcher?: typeof fetch }): LottieBytesLoader {
  const builtin = BUILTIN[ref.src];
  if (builtin !== undefined) {
    return async () => {
      try {
        const module = (await builtin()) as { readonly default: unknown };
        return new TextEncoder().encode(JSON.stringify(module.default));
      } catch {
        return null;
      }
    };
  }
  return async () => {
    try {
      const fetcher = deps.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
      const response = await fetcher(packAssetUrl(ref.src, deps.origin), { mode: 'cors', credentials: 'omit' });
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      return (await sha256Hex(buffer)) === ref.sha256 ? new Uint8Array(buffer) : null;
    } catch {
      return null;
    }
  };
}
