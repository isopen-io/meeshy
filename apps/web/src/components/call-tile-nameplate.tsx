import type { CSSProperties } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { MeeshyGlass } from '@/components/kit/meeshy-glass-tone';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { HeldSwap } from '@/lib/calls/use-pill-motion';

/**
 * **LA PLAQUE DE NOM D'UNE VIGNETTE D'APPEL** (P11.6, #17982 ; miroir de `CallTileNameplate` d'iOS) — UN composant
 * pour la vignette d'un groupe, ma vignette du duo et ma vignette pendant la sonnerie : une capsule du verre du kit
 * (`MeeshyGlass`, l'atome adaptatif, comme l'étiquette de l'appel réduit, P18.5) en bas,
 * côté début, DANS le liseré, le nom en encre du média, et le micro coupé devant lui, qui arrive et repart en fondu
 * (loi 17). La grille, la vignette du coin (`call-duo-corner.tsx`) et la sonnerie l'importent, trois chunks chargés à
 * part : elle forme le sien, et aucun d'eux n'importe l'écran d'appel.
 *
 * `scale` : rangée par une échelle (G1.11), une vignette contre-met sa plaque à l'échelle — elle garde sa taille de
 * petite vignette, comme le liseré.
 */
export type CallTileNameplateProps = {
  readonly name: string;
  readonly muted?: boolean;
  readonly suffix?: string | null;
  readonly scale?: number;
};

export function CallTileNameplate({ name, muted = false, suffix = null, scale = 1 }: CallTileNameplateProps) {
  const style: CSSProperties = { scale: String(scale) };
  return (
    <MeeshyGlass as="span" tone="deep" className="absolute bottom-2 start-2 flex max-w-[85%] origin-bottom-left items-center gap-1 truncate rounded-full px-2 py-0.5 text-mini text-on-media rtl:origin-bottom-right" style={style} data-call-tile-plate="">
      <HeldSwap value={muted ? true : null} shape="fade" className="inline-flex" data-call-tile-muted="">
        {() => <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={12} />}
      </HeldSwap>
      {name}
      {suffix === null ? null : ` · ${suffix}`}
    </MeeshyGlass>
  );
}
