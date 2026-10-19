import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import type { AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import type { BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';

import { apiDeps } from '../api/deps';
import { packQueryKeys } from '../api/pack-query-keys';
import { loadInstalledAvatarRingPacks } from '../api/packs-avatar-ring';
import { loadInstalledBannerPacks } from '../api/packs-banner';
import { loadInstalledBannerFramePacks } from '../api/packs-banner-frame';
import { appQueryClient } from '../api/query-client';
import type { DecorSide } from './equip';
import type { DesignPackSummary } from './pack-summary';
import { bannerFrameOptions, bannerOptions, ringOptions, type ContractStore, type OptionGroup } from './resolve';
import { sharedContractLoader } from './use-decor-designs';

/**
 * **CE QUE LE SÉLECTEUR PROPOSE** (#10632, § 9) — les packs INSTALLÉS et
 * POSSÉDÉS du domaine, jamais un pack de la boutique. Cache d'abord : tant que
 * la liste installée n'est pas là (premier lancement, ancien serveur,
 * hors ligne), les packs embarqués installés d'office se montrent déjà — le
 * sélecteur n'attend jamais le réseau pour proposer quelque chose.
 */

const STALE_TIME = 5 * 60 * 1000;

const DOMAIN = { avatarRing: 'avatar-ring', banner: 'banner', bannerFrame: 'banner-frame' } as const;

const LOADERS = { avatarRing: loadInstalledAvatarRingPacks, banner: loadInstalledBannerPacks, bannerFrame: loadInstalledBannerFramePacks } as const;

const OPTIONS = { avatarRing: ringOptions, banner: bannerOptions, bannerFrame: bannerFrameOptions } as const;

async function loadInstalled(side: DecorSide, signal: AbortSignal): Promise<readonly DesignPackSummary[]> {
  const result = await LOADERS[side]({ ...apiDeps, signal });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export function useDecorOptions(side: 'avatarRing'): readonly OptionGroup<AvatarRingDesign>[];
export function useDecorOptions(side: 'banner'): readonly OptionGroup<AppearanceDesign>[];
export function useDecorOptions(side: 'bannerFrame'): readonly OptionGroup<BannerFrameDesign>[];
export function useDecorOptions(side: DecorSide): readonly OptionGroup<AvatarRingDesign>[] | readonly OptionGroup<AppearanceDesign>[] | readonly OptionGroup<BannerFrameDesign>[] {
  const installedQuery = useQuery(
    { queryKey: packQueryKeys(DOMAIN[side]).installed, queryFn: ({ signal }) => loadInstalled(side, signal), staleTime: STALE_TIME },
    appQueryClient,
  );
  const installed = installedQuery.data;
  const [contracts, setContracts] = useState<ContractStore>(() => new Map());

  useEffect(() => {
    const wanted = (installed ?? []).flatMap((pack) => (pack.origin === 'builtin' || pack.contract === null || contracts.has(pack.contract.src) ? [] : [pack.contract.src]));
    if (wanted.length === 0) return undefined;
    let live = true;
    void Promise.all(wanted.map(async (src) => [src, await sharedContractLoader().load(src)] as const)).then((loaded) => {
      const found = loaded.filter(([, contract]) => contract !== null);
      if (live && found.length > 0) setContracts((current) => new Map([...current, ...found]));
    });
    return () => {
      live = false;
    };
  }, [installed, contracts]);

  return useMemo(() => OPTIONS[side]({ installed, contracts }), [side, installed, contracts]);
}
