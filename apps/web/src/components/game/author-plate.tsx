import { useId } from 'react';

import type { AuthorPlate as AuthorPlateData } from '@/lib/game-photo/author-plate';
import { PLATE_BOX } from '@/lib/game-photo/author-plate-motion';
import { inkToken, paintUrl, safeUid, tokenVar, type GamePaint } from '@/lib/game/materials';

import { PaintDefs } from './paint-defs';

/**
 * LA PLAQUE D'AUTEUR (#10816) — le cartouche à bouts entaillés qui grave le
 * pseudo de l'auteur : à gauche le médaillon (photo de profil dans la carte
 * posée, monogramme dans l'image exportée — une image SVG rastérisée ne charge
 * rien d'extérieur), à droite la formule de la famille en petites capitales et
 * le `@pseudo` dans le fini de l'étape :
 *  - `engrave` : les lettres creusées, encre du métal et arête claire décalée ;
 *  - `emboss` : la feuille d'or frappée sur un champ creusé sombre, lisible sur
 *    tout métal ;
 *  - `scratch` : le nom doré sous une couche d'argent grattée en trois passes.
 *
 * Un dessin pour tous, qui lit la donnée (`authorPlateOf`) et ne décide rien.
 * Décoratif : l'hôte dit la plaque en toutes lettres (`plate.label`). Aucune
 * couleur écrite : métaux et lumières sont des jetons (`styles/game.css`),
 * résolus par la composition de l'image (`css-vars.ts`).
 */

const BODY = 'M22 8 H338 L352 50 L338 92 H22 L8 50 Z';
const INNER = 'M27 15 H333 L344 50 L333 85 H27 L16 50 Z';
/** Les trois passes de la pièce : ce qui en a été gratté ne cache plus le nom. */
const SCRATCH_PASSES = 'M118 46 L310 50 L120 58 L312 62 L118 70 L310 76';
const NAME_X = 214;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Sur un métal sombre, l'arête de la gravure est une ombre : la lumière y serait une tache. */
const DARK_METALS: ReadonlySet<GamePaint> = new Set(['indigo', 'obsidian']);

function Name({ plate, uid }: { readonly plate: AuthorPlateData; readonly uid: string }) {
  const ink = inkToken(plate.metal);
  const common = { x: NAME_X, textAnchor: 'middle', fontWeight: 800, fontFamily: FONT, direction: 'ltr', unicodeBidi: 'embed' } as const;
  switch (plate.finish) {
    case 'engrave': {
      const edge = DARK_METALS.has(plate.metal) ? tokenVar('shade') : tokenVar('glint');
      return (
        <g data-plate-name="">
          <text {...common} y={71} fontSize={27} fill={edge} fillOpacity={0.55} transform="translate(0 1.2)">
            {plate.name}
          </text>
          <text {...common} y={71} fontSize={27} fill={ink}>
            {plate.name}
          </text>
        </g>
      );
    }
    case 'emboss':
      return (
        <g data-plate-name="">
          <rect data-plate-field="" x={104} y={47} width={220} height={34} rx={7} fill={tokenVar('edge')} stroke={ink} strokeOpacity={0.5} strokeWidth={1.2} />
          <text {...common} y={72} fontSize={24} fill={tokenVar('shade')} fillOpacity={0.7} transform="translate(0 1.4)">
            {plate.name}
          </text>
          <text {...common} y={72} fontSize={24} fill={paintUrl(uid, 'gold')} stroke={tokenVar('glint')} strokeOpacity={0.35} strokeWidth={0.5}>
            {plate.name}
          </text>
        </g>
      );
    case 'scratch':
      return (
        <g data-plate-name="">
          <text {...common} y={71} fontSize={27} fill={paintUrl(uid, 'gold')} stroke={ink} strokeOpacity={0.35} strokeWidth={0.6}>
            {plate.name}
          </text>
          <mask id={`${uid}-scratch`} maskUnits="userSpaceOnUse" x={0} y={0} width={PLATE_BOX.width} height={PLATE_BOX.height}>
            <rect x={0} y={0} width={PLATE_BOX.width} height={PLATE_BOX.height} fill="white" />
            <path d={SCRATCH_PASSES} stroke="black" strokeWidth={11} strokeLinejoin="round" fill="none" />
          </mask>
          <rect data-plate-scratch="" x={112} y={40} width={204} height={40} rx={6} fill={paintUrl(uid, 'silver')} mask={`url(#${uid}-scratch)`} />
        </g>
      );
  }
}

function Medallion({ plate, uid, showAvatar }: { readonly plate: AuthorPlateData; readonly uid: string; readonly showAvatar: boolean }) {
  const ink = inkToken(plate.metal);
  const photo = showAvatar ? plate.avatar : undefined;
  return (
    <g data-plate-medallion={photo === undefined ? 'monogram' : 'avatar'}>
      <circle cx={58} cy={50} r={35} fill={paintUrl(uid, plate.metal)} stroke={ink} strokeOpacity={0.4} strokeWidth={1.2} />
      <circle cx={58} cy={50} r={31} fill={tokenVar('edge')} />
      {photo === undefined ? (
        <text x={58} y={59} textAnchor="middle" fontSize={25} fontWeight={800} fontFamily={FONT} fill={tokenVar('glint')}>
          {plate.monogram}
        </text>
      ) : (
        <>
          <clipPath id={`${uid}-avatar`}>
            <circle cx={58} cy={50} r={31} />
          </clipPath>
          <image href={photo} x={27} y={19} width={62} height={62} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}-avatar)`} />
        </>
      )}
    </g>
  );
}

export function AuthorPlate({ plate, width, showAvatar = false }: { readonly plate: AuthorPlateData; readonly width: number; readonly showAvatar?: boolean }) {
  const uid = safeUid(useId());
  const ink = inkToken(plate.metal);
  const paints: readonly GamePaint[] = [...new Set<GamePaint>([plate.metal, 'gold', 'silver'])];
  return (
    <svg
      viewBox={`0 0 ${PLATE_BOX.width} ${PLATE_BOX.height}`}
      width={width}
      height={Math.round((width * PLATE_BOX.height) / PLATE_BOX.width)}
      aria-hidden="true"
      data-author-plate={plate.family}
      data-plate-finish={plate.finish}
      data-plate-metal={plate.metal}
      style={{ display: 'block' }}
    >
      <defs>
        <PaintDefs uid={uid} paints={paints} />
      </defs>
      <path d={BODY} fill={paintUrl(uid, plate.metal)} />
      <path d={INNER} fill="none" stroke={ink} strokeOpacity={0.35} strokeWidth={1.2} />
      <circle cx={16} cy={50} r={2.6} fill={ink} fillOpacity={0.45} />
      <circle cx={344} cy={50} r={2.6} fill={ink} fillOpacity={0.45} />
      <Medallion plate={plate} uid={uid} showAvatar={showAvatar} />
      <text x={NAME_X} y={37} textAnchor="middle" fontSize={10.5} fontWeight={700} letterSpacing={2.6} fontFamily={FONT} fill={ink} fillOpacity={0.8}>
        {plate.caption.toLocaleUpperCase()}
      </text>
      <Name plate={plate} uid={uid} />
    </svg>
  );
}
