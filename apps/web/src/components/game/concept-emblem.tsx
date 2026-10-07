import { useId } from 'react';

import { CONCEPT_EMBLEM_BOX, CONCEPT_EMBLEMS, type ConceptEmblemKind, type EmblemAccent, type EmblemTone } from '@/lib/game/concept-emblems';
import { inkToken, paintUrl, safeUid, tokenVar, type GamePaint } from '@/lib/game/materials';

import { PaintDefs } from './paint-defs';
import { SignatureGlyph } from './signature';

/**
 * L'EMBLÈME D'UN CONCEPT SANS OBJET (#9563, amendement n° 2) — Points et Élans.
 * Le niveau a son anneau, la Gloire son blason, la Meesh sa pièce ; ces deux-là
 * portaient une Signature dans une pastille teintée, deux fois la même. Leur dessin vient de la table `lib/game/concept-emblems.ts`.
 *
 * DÉCORATIF (`aria-hidden`) : l'hôte dit le nom du concept.
 */

const GOLD: GamePaint = 'gold';

const toneFill = (tone: EmblemTone, uid: string, paint: GamePaint): string =>
  tone === 'gold' ? paintUrl(uid, GOLD) : inkToken(paint);

function Accent({ accent, uid, paint }: { readonly accent: EmblemAccent; readonly uid: string; readonly paint: GamePaint }) {
  const color = toneFill(accent.tone, uid, paint);
  if (accent.kind === 'spark') {
    return <path data-game-emblem-accent="spark" d={accent.d} fill={color} stroke={tokenVar('glint')} strokeWidth="1.5" strokeLinejoin="round" />;
  }
  return <path data-game-emblem-accent="chevron" d={accent.d} fill="none" stroke={color} strokeWidth={accent.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />;
}

export function ConceptMark({ kind, size }: { readonly kind: ConceptEmblemKind; readonly size: number }) {
  const uid = safeUid(useId());
  const design = CONCEPT_EMBLEMS[kind];
  const { body, signature, paint } = design;
  const paints: readonly GamePaint[] = design.accents.some((accent) => accent.tone === 'gold') ? [paint, GOLD] : [paint];
  const edge = { stroke: tokenVar('edge'), strokeOpacity: 0.25 } as const;
  return (
    <svg viewBox={`0 0 ${CONCEPT_EMBLEM_BOX} ${CONCEPT_EMBLEM_BOX}`} width={size} height={size} aria-hidden="true" focusable="false" data-game-emblem={kind}>
      <defs>
        <PaintDefs uid={uid} paints={paints} />
      </defs>
      {body.shape === 'circle' ? (
        <circle cx={body.cx} cy={body.cy} r={body.r} fill={paintUrl(uid, paint)} {...edge} />
      ) : (
        <rect x={body.x} y={body.y} width={body.width} height={body.height} rx={body.rx} fill={paintUrl(uid, paint)} {...edge} />
      )}
      <SignatureGlyph cx={signature.cx} cy={signature.cy} size={signature.size} color={inkToken(paint)} mode="engraved" strokeWidth={signature.strokeWidth} />
      {design.accents.map((accent, index) => (
        <Accent key={`${accent.kind}-${index}`} accent={accent} uid={uid} paint={paint} />
      ))}
    </svg>
  );
}
