import { useEffect, useMemo, useState } from 'react';

import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import type { AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import type { BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import type { ServedProfileDecor } from '@meeshy/shared/types/profile-decor';

import { apiOrigin } from '../api/api-origin';
import { createContractLoader, type ContractLoader } from './contracts';
import { resolveBanner, resolveBannerFrame, resolveRing, type ContractStore } from './resolve';

/**
 * **LES DESSINS D'UN DÉCOR SERVI** (#10632) — du `ServedProfileDecor` d'un
 * profil (le mien ou celui d'un autre) aux trois dessins à peindre (contour,
 * fond de bannière, cadre posé dessus). Les
 * `builtin` se résolvent au PREMIER rendu, sans réseau ; un contrat `official`
 * se charge ensuite (adressé par contenu, retenu pour la session) et le dessin
 * apparaît à son arrivée — jamais un spinner, jamais une erreur.
 */


let shared: ContractLoader | null = null;

/** Le chargeur de contrats de la session — un seul, pour que deux écrans ne redemandent jamais le même contrat. */
export const sharedContractLoader = (): ContractLoader => (shared ??= createContractLoader({ origin: apiOrigin() }));

export type DecorDesigns = {
  readonly ring: AvatarRingDesign | null;
  readonly banner: AppearanceDesign | null;
  /** Le cadre posé SUR la photo ou le fond (#10935) ; absent = aucun. */
  readonly bannerFrame?: BannerFrameDesign | null;
};

export const NO_DESIGNS: DecorDesigns = { ring: null, banner: null, bannerFrame: null };

/** Les adresses de contrat que ce décor demande et que le magasin n'a pas encore. */
export const missingContracts = (decor: ServedProfileDecor | undefined, loaded: ContractStore): readonly string[] =>
  [decor?.avatarRing, decor?.banner, decor?.bannerFrame].flatMap((item) => (item === null || item === undefined || item.origin === 'builtin' || item.contract === null || loaded.has(item.contract) ? [] : [item.contract]));

export function useDecorDesigns(decor: ServedProfileDecor | undefined): DecorDesigns {
  const [contracts, setContracts] = useState<ContractStore>(() => new Map());
  const ringKey = decor?.avatarRing === null || decor?.avatarRing === undefined ? '' : `${decor.avatarRing.pack}/${decor.avatarRing.item}/${decor.avatarRing.contract ?? ''}`;
  const bannerKey = decor?.banner === null || decor?.banner === undefined ? '' : `${decor.banner.pack}/${decor.banner.item}/${decor.banner.contract ?? ''}`;
  const frameKey = decor?.bannerFrame === null || decor?.bannerFrame === undefined ? '' : `${decor.bannerFrame.pack}/${decor.bannerFrame.item}/${decor.bannerFrame.contract ?? ''}`;

  useEffect(() => {
    const wanted = missingContracts(decor, contracts);
    if (wanted.length === 0) return undefined;
    let live = true;
    void Promise.all(wanted.map(async (src) => [src, await sharedContractLoader().load(src)] as const)).then((loaded) => {
      if (!live) return;
      const found = loaded.filter(([, contract]) => contract !== null);
      if (found.length > 0) setContracts((current) => new Map([...current, ...found]));
    });
    return () => {
      live = false;
    };
    // Les clés primitives, jamais l'objet : un hôte qui reconstruit `decor` à chaque rendu ne relance rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringKey, bannerKey, frameKey, contracts]);

  return useMemo(
    () => (decor === undefined ? NO_DESIGNS : { ring: resolveRing(decor.avatarRing, contracts), banner: resolveBanner(decor.banner, contracts), bannerFrame: resolveBannerFrame(decor.bannerFrame, contracts) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ringKey, bannerKey, frameKey, contracts],
  );
}
