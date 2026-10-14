import type { ReactNode } from 'react';

import { RING_AVATAR_RADIUS, type AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';
import { avatarRingSvg } from '@meeshy/shared/utils/appearance-svg';

/**
 * **LE CONTOUR D'AVATAR** (#10632, § 8.1) — une COUCHE autour de l'avatar, qui
 * ne le modifie pas (`avatar.tsx` reste intact). Le dessin vient de
 * `avatarRingSvg` (rendu de référence partagé) : l'avatar occupe le cercle de
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
      <span aria-hidden="true" className="pointer-events-none absolute inset-0" dangerouslySetInnerHTML={{ __html: avatarRingSvg({ ring, size: box }) }} />
      {children}
    </span>
  );
}
