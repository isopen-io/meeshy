import { useMemo } from 'react';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';

import { apiConfig } from '@/lib/api/config';
import { sharedLottieBytes } from '@/lib/lottie/bytes-cache';
import { lottieBytesLoader } from '@/lib/lottie/sources';

import { LottieLayer } from './lottie-layer';

const apiOrigin = (): string => {
  try {
    return new URL(apiConfig.base === '' ? location.href : apiConfig.base, location.href).origin;
  } catch {
    return '';
  }
};

/**
 * **LA COUCHE `lottie` D'UN ARTICLE DE PACK** (#10638, D6) — un fond, un contour
 * ou une bannière qui déclare `lottie?: PackAssetRef` la voit jouée par le
 * moteur partagé ; sans déclaration, AUCUN nœud n'est ajouté : le rendu d'avant,
 * à l'octet. Une couche intégrée vient de l'application, une autre de
 * `/pack-assets` (empreinte vérifiée) ; ses octets sont partagés par toutes les
 * couches qui la jouent (`sharedLottieBytes`, #10815).
 */
export function PackLottieLayer({ lottie, className }: { readonly lottie: PackAssetRef | undefined; readonly className?: string }) {
  const src = lottie?.src;
  const sha256 = lottie?.sha256;
  const load = useMemo(() => {
    if (lottie === undefined) return null;
    const origin = apiOrigin();
    return sharedLottieBytes(`${origin}|${lottie.src}|${lottie.sha256}`, lottieBytesLoader(lottie, { origin }));
  }, [src, sha256]); // eslint-disable-line react-hooks/exhaustive-deps -- la référence n'est lue que par ses deux primitives
  if (lottie === undefined || load === null) return null;
  return <LottieLayer sourceKey={lottie.src} load={load} {...(className === undefined ? {} : { className })} />;
}
