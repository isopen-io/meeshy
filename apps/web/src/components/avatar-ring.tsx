import type { CSSProperties, ReactNode } from 'react';

import { RING_AVATAR_RADIUS, ringDecorFit, type AvatarRingDecor, type AvatarRingDesign, type RingDecorFit } from '@meeshy/shared/types/avatar-ring-design';

import { usePrefersReducedMotion } from '@/lib/lottie/use-reduced-motion';

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

/**
 * Ce que le film d'un cadre demande au-delà de sa boîte `box`, de chaque côté (#15157) : la place
 * qu'un hôte RÉSERVE, puis déclare en `room`, pour le montrer sans réduire l'avatar. `0` sans film.
 */
export const ringDecorSpill = (ring: AvatarRingDesign | null | undefined, box: number): number => {
  const decor = ring?.decor;
  if (decor === undefined) return 0;
  return (box * (decor.reach - 1)) / 2;
};

/**
 * **LES CALQUES ILLUSTRÉS D'UN CADRE** (#13960) — un film DERRIÈRE l'avatar
 * (`back`, sous le contenu : `z-index: -1` dans la boîte isolée) et un film
 * AU-DESSUS (`front`), chacun carré, centré, posé par `ringDecorFit` (#15157) :
 * il ne sort de la boîte que de la place `room` que l'hôte déclare libre, et
 * l'avatar se réduit avec lui quand le film demande plus — à TOUTES les tailles
 * (#16114). Sous « Réduire les animations », ou chez l'hôte qui le retire
 * (`decor={false}` : la cellule de frappe), aucun film : l'anneau fixe reste
 * l'image — et il ne se dessine jamais SOUS un film qui s'affiche.
 */
function RingDecorLayer({ decor, fit, side }: { readonly decor: AvatarRingDecor; readonly fit: RingDecorFit; readonly side: 'back' | 'front' }) {
  const film = decor[side];
  if (film === undefined) return null;
  return (
    <span data-ring-decor={side} aria-hidden="true" className="pointer-events-none absolute block" style={{ inset: `${fit.offset}px`, zIndex: side === 'back' ? -1 : 1 }}>
      <PackLottieLayer lottie={film} />
    </span>
  );
}

function useDecorFit(ring: AvatarRingDesign, box: number, room: number, decor: boolean): RingDecorFit | null {
  const reduced = usePrefersReducedMotion();
  if (ring.decor === undefined || reduced || !decor) return null;
  return ringDecorFit({ box, reach: ring.decor.reach, room });
}

type BoxProps = { readonly ring: AvatarRingDesign; readonly box: number; readonly room: number; readonly decor: boolean; readonly className: string; readonly children: ReactNode };

function RingBox({ ring, box, room, decor, className, children }: BoxProps) {
  const fit = useDecorFit(ring, box, room, decor);
  const style: CSSProperties = { width: box, height: box };
  if (ring.decor === undefined || fit === null) {
    return (
      <span data-avatar-ring={ring.key} className={className} style={style}>
        <RingArt ring={ring} size={box} />
        <PackLottieLayer lottie={ring.lottie} />
        {children}
      </span>
    );
  }
  const inner = fit.scale === 1 ? (
    <>
      <PackLottieLayer lottie={ring.lottie} />
      {children}
    </>
  ) : (
    <span className="relative inline-grid size-full place-items-center" style={{ transform: `scale(${fit.scale})` }}>
      <PackLottieLayer lottie={ring.lottie} />
      {children}
    </span>
  );
  return (
    <span data-avatar-ring={ring.key} className={className} style={{ ...style, isolation: 'isolate' }}>
      <RingDecorLayer decor={ring.decor} fit={fit} side="back" />
      {inner}
      <RingDecorLayer decor={ring.decor} fit={fit} side="front" />
    </span>
  );
}

/**
 * `room` : la place libre (px) que l'hôte garantit autour de la boîte — aucun texte, aucun avatar voisin n'y vit (#15157).
 * `decor` : `false` retire les films illustrés et garde l'anneau fixe — réservé à la cellule de frappe (#16114).
 */
type RingProps = { readonly size: number; readonly room?: number; readonly decor?: boolean; readonly children: ReactNode };

export function AvatarRing({ ring, size, room = 0, decor = true, children }: RingProps & { readonly ring: AvatarRingDesign | null }) {
  if (ring === null) return <>{children}</>;
  return (
    <RingBox ring={ring} box={ringBoxSize(size)} room={room} decor={decor} className="relative inline-grid place-items-center">
      {children}
    </RingBox>
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

export function AvatarRingFrame({ ring, size, room = 0, decor = true, children }: RingProps & { readonly ring: AvatarRingDesign }) {
  return (
    <RingBox ring={ring} box={size} room={room} decor={decor} className="relative inline-grid shrink-0 place-items-center">
      {children}
    </RingBox>
  );
}
