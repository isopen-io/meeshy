import { GAME_BIRD_BOX, birdCutFilter, gameBirdMarkup, gameBirdPlacement, type GameBirdKey } from '@/lib/game/birds';
import { paintAxis, paintId, paintStops, type GamePaint } from '@/lib/game/materials';

import '@/styles/game.css';

/**
 * LES DÉGRADÉS D'UNE INSTANCE (#9380). Chaque objet du jeu déclare ses propres
 * `<defs>` : l'identifiant est préfixé par `uid` (dérivé de `useId`), si bien
 * que deux pièces sur une même page ne se volent pas leurs métaux. Les couleurs
 * sont des JETONS (`styles/game.css`) — le métal n'a pas de schéma.
 */

type Props = {
  readonly uid: string;
  readonly paints: readonly GamePaint[];
  /** Ajoute le dégradé du reflet (`${uid}-sheen`) : un trait blanc qui s'efface sur ses bords. */
  readonly sheen?: boolean;
};

export function PaintDefs({ uid, paints, sheen = false }: Props) {
  return (
    <>
      {paints.map((paint) => {
        const axis = paintAxis(paint);
        return (
          <linearGradient key={paint} id={paintId(uid, paint)} x1={axis.x1} y1={axis.y1} x2={axis.x2} y2={axis.y2}>
            {paintStops(paint).map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        );
      })}
      {sheen ? (
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--game-glint)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--game-glint)" stopOpacity="0.8" />
          <stop offset="1" stopColor="var(--game-glint)" stopOpacity="0" />
        </linearGradient>
      ) : null}
    </>
  );
}

type PlacedBirdProps = {
  readonly uid: string;
  readonly bird: GameBirdKey;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly flip?: boolean;
};

/** Une figure posée dans le SVG d'un objet, avec son contour de sticker. Le filtre est `${uid}-cut`, déclaré par l'hôte via `BirdCutDefs`. */
export function PlacedBird({ uid, bird, x, y, scale, flip = false }: PlacedBirdProps) {
  return (
    <g data-game-bird={bird} transform={gameBirdPlacement({ x, y, scale, flip })}>
      <g filter={`url(#${uid}-cut)`} dangerouslySetInnerHTML={{ __html: gameBirdMarkup(bird, uid) }} />
    </g>
  );
}

/** Le contour blanc commun aux figures d'un objet. */
export function BirdCutDefs({ uid }: { readonly uid: string }) {
  return <g dangerouslySetInnerHTML={{ __html: birdCutFilter(`${uid}-cut`) }} />;
}

export { GAME_BIRD_BOX };
