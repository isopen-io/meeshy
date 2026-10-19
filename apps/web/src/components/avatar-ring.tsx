import type { ReactNode } from 'react';

import { RING_AVATAR_RADIUS, type AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';

import { RingArt } from './frame-art';
import { PackLottieLayer } from './pack-lottie-layer';
import { railRingBox } from './rail-tile';

/**
 * **LE CONTOUR D'AVATAR** (#10632, § 8.1) — une COUCHE autour de l'avatar, qui
 * ne le modifie pas (`avatar.tsx` reste intact). Le dessin vient de
 * `avatarRingMarkup` (rendu de référence partagé, mouvements en couches
 * composées — `frame-art.tsx`) : l'avatar occupe le cercle de
 * rayon 42 du viewBox 100, l'ornement s'organise autour — la boîte est donc
 * plus grande que l'avatar de `1 / 0,84`.
 *
 * Sans contour (`null`), AUCUN enrobage : le rendu d'avant, à l'octet. Le SVG
 * est décoratif (`aria-hidden`, non cliquable) : le nom et le geste restent
 * ceux de l'avatar.
 */

const AVATAR_FRACTION = (RING_AVATAR_RADIUS * 2) / 100;

export const ringBoxSize = (avatarSize: number): number => Math.round(avatarSize / AVATAR_FRACTION);

export function AvatarRing({ ring, size, children }: { readonly ring: AvatarRingDesign | null; readonly size: number; readonly children: ReactNode }) {
  if (ring === null) return <>{children}</>;
  const box = ringBoxSize(size);
  return (
    <span data-avatar-ring={ring.key} className="relative inline-grid place-items-center" style={{ width: box, height: box }}>
      <RingArt ring={ring} size={box} />
      <PackLottieLayer lottie={ring.lottie} />
      {children}
    </span>
  );
}

/**
 * **LE CONTOUR DANS L'EMPREINTE DE L'AVATAR** (#10713, #10714) — pour les
 * surfaces à cote FIXE (liste, bulle, participants) : la boîte du contour EST
 * l'empreinte `size`, rien ne grandit, rien ne se décale. Le cercle intérieur du
 * dessin (84 %) reçoit l'avatar, réduit en conséquence. Un anneau de story reste
 * à l'INTÉRIEUR du contour, concentrique (décision porteur du 2026-10-15) : les
 * deux sont visibles, le contour dehors, l'anneau juste dedans.
 */
export const ringedAvatarSize = (footprint: number, hasStoryRing: boolean): number => {
  const hole = Math.floor(footprint * AVATAR_FRACTION);
  return Math.max(1, hasStoryRing ? hole - railRingBox(0) : hole);
};

export function AvatarRingFrame({ ring, size, children }: { readonly ring: AvatarRingDesign; readonly size: number; readonly children: ReactNode }) {
  return (
    <span data-avatar-ring={ring.key} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <RingArt ring={ring} size={size} />
      <PackLottieLayer lottie={ring.lottie} />
      {children}
    </span>
  );
}
