import { useEffect, useState } from 'react';

import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import type { BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import { designToSvg, type AppearanceScheme } from '@meeshy/shared/utils/appearance-svg';

import { currentScheme } from '@/lib/scheme';

import { BannerFrame } from './frame-art';
import { PackLottieLayer } from './pack-lottie-layer';

/**
 * **LA BANNIÈRE DE DESIGN** (#10632, § 5.1 et § 8.1) — le MÊME `AppearanceDesign`
 * qu'un fond de conversation, cadré en 3:1 : `designToSvg` (rendu de référence
 * partagé) peint motif, dégradé ou illustration, `slice` la rogne pour remplir
 * la boîte de la bannière quel que soit son rapport. Décorative (`aria-hidden`).
 * Elle ne se peint qu'en l'ABSENCE de photo de bannière : la photo gagne
 * toujours (#10933) — `bannerPaint` est l'unique site de cette règle.
 */

export type BannerPaint =
  | { readonly kind: 'photo'; readonly image: string }
  | { readonly kind: 'design'; readonly design: AppearanceDesign }
  | { readonly kind: 'plain' };

export function bannerPaint({ image, design }: { readonly image: string | null; readonly design: AppearanceDesign | null }): BannerPaint {
  if (image !== null && image !== '') return { kind: 'photo', image };
  if (design !== null) return { kind: 'design', design };
  return { kind: 'plain' };
}

const BANNER_WIDTH = 600;
const BANNER_HEIGHT = 200;

export function bannerSvgMarkup(args: { readonly design: AppearanceDesign; readonly scheme: AppearanceScheme; readonly accent: string }): string {
  return designToSvg({ ...args, width: BANNER_WIDTH, height: BANNER_HEIGHT }).replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ');
}

/** Le schéma peint (classe `light` de la racine), suivi quand il bascule. */
export function useScheme(): AppearanceScheme {
  const [scheme, setScheme] = useState<AppearanceScheme>(() => (typeof document === 'undefined' ? 'dark' : currentScheme()));
  useEffect(() => {
    const observer = new MutationObserver(() => setScheme(currentScheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setScheme(currentScheme());
    return () => observer.disconnect();
  }, []);
  return scheme;
}

export function ProfileBannerDesign({ design, accent, scheme }: { readonly design: AppearanceDesign; readonly accent: string; readonly scheme: AppearanceScheme }) {
  const painted = (
    <span
      aria-hidden="true"
      data-banner-design={design.key}
      className="pointer-events-none block size-full [&>svg]:block [&>svg]:size-full"
      dangerouslySetInnerHTML={{ __html: bannerSvgMarkup({ design, scheme, accent }) }}
    />
  );
  if (design.lottie === undefined) return painted;
  return (
    <span className="pointer-events-none relative block size-full">
      {painted}
      <PackLottieLayer lottie={design.lottie} />
    </span>
  );
}

/**
 * **LE CADRE DE BANNIÈRE ÉQUIPÉ** (#10935) — posé PAR-DESSUS ce que `bannerPaint`
 * a peint (photo, design ou dégradé), sous les badges : il ne remplace jamais ce
 * qui est dessous, son centre reste transparent. Sans cadre, rien n'est ajouté.
 */
export function ProfileBannerFrame({ frame }: { readonly frame: BannerFrameDesign | null | undefined }) {
  if (frame === null || frame === undefined) return null;
  return <BannerFrame frame={frame} />;
}
