import type { UserShowcaseResponse } from "@meeshy/shared/types/game";
import {
  CONSTELLATION_FRAGMENTS_PER_STAR,
  constellationOf,
  type ConstellationCosmetic,
  type ConstellationCosmeticKind,
} from "@meeshy/shared/utils/game/constellation";

import { formatGameNumber, translateGamePlural } from "@/lib/i18n-game-catalog";
import { currentInterfaceLanguage } from "@/lib/interface-language";
import { gameText } from "@/lib/view/game-copy";

import { GAME_BRAND, GAME_INK, GAME_INK_2, GameCard } from "./game-surface";

/**
 * LA CONSTELLATION (#10053, décision du porteur du 2026-10-11) — à quoi servent les fragments d'étoile. Une étoile
 * s'allume tous les dix fragments collectés (`constellationOf`, `packages/shared/utils/game/constellation.ts`), et
 * chacune débloque un cosmétique de profil — halo, cadre, scintillement — sans avantage de jeu. Le total est
 * DÉRIVÉ, jamais dépensé ; rien n'y vaut des points, une Meesh ou de l'argent.
 *
 * Le membre (`collected`) voit l'étoile suivante se remplir ; un visiteur (`stars`) ne voit que les étoiles que le
 * serveur lui sert, figées au mois et selon le réglage de la vitrine. Le dessin se retourne en arabe ; il est
 * décoratif (`aria-hidden`) : le texte dit tout. Miroir de `GameConstellationCard` (iOS).
 */

/** Le dessin montre au plus douze étoiles : au-delà, le texte compte. */
const DRAWN_MAX = 12;
/** Des points fixes, de gauche à droite : la même figure partout, sans hasard. */
const POINTS: readonly (readonly [number, number])[] = [
  [14, 52],
  [40, 24],
  [66, 44],
  [92, 16],
  [118, 38],
  [144, 60],
  [170, 30],
  [196, 50],
  [222, 20],
  [248, 42],
  [274, 62],
  [300, 34],
];

const kindLabel = (kind: ConstellationCosmeticKind): string =>
  gameText(`game.constellation.kind.${kind}`);

/** Les étoiles qu'un VISITEUR peut voir : une vitrine ouverte qui en sert au moins une ; `null` sinon. */
export function visitorConstellation(
  showcase: UserShowcaseResponse | undefined
): number | null {
  const stars =
    showcase?.visible === true ? showcase.constellation?.stars : undefined;
  return stars === undefined || !Number.isInteger(stars) || stars < 1
    ? null
    : stars;
}

function Sky({
  stars,
  inStar,
}: {
  readonly stars: number;
  readonly inStar: number | null;
}) {
  const drawn = Math.min(DRAWN_MAX, Math.max(5, stars + 1));
  const lit = Math.min(stars, drawn);
  const points = POINTS.slice(0, drawn);
  const width = (points[points.length - 1]?.[0] ?? 0) + 14;
  return (
    <svg
      viewBox={`0 0 ${width} 76`}
      className="h-16 w-full rtl:-scale-x-100"
      aria-hidden="true"
      preserveAspectRatio="xMinYMid meet"
    >
      {points.slice(0, lit).map(([x, y], index) => {
        const next = points[index + 1];
        if (next === undefined || index + 1 >= lit) return null;
        return (
          <line
            key={`l${x}`}
            x1={x}
            y1={y}
            x2={next[0]}
            y2={next[1]}
            stroke={GAME_BRAND}
            strokeOpacity={0.45}
            strokeWidth={1.5}
          />
        );
      })}
      {points.map(([x, y], index) => {
        const on = index < lit;
        const filling = !on && index === lit && inStar !== null;
        return (
          <g key={`s${x}`} data-constellation-star={on ? "lit" : "dim"}>
            <circle
              cx={x}
              cy={y}
              r={on ? 6 : 4}
              fill={on ? GAME_BRAND : "none"}
              stroke={on ? "none" : GAME_INK_2}
              strokeOpacity={0.5}
            />
            {filling && inStar > 0 ? (
              <circle
                cx={x}
                cy={y}
                r={8}
                fill="none"
                stroke={GAME_BRAND}
                strokeWidth={2}
                pathLength={CONSTELLATION_FRAGMENTS_PER_STAR}
                strokeDasharray={`${inStar} ${CONSTELLATION_FRAGMENTS_PER_STAR}`}
                transform={`rotate(-90 ${x} ${y})`}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** L'aperçu d'un cosmétique : un médaillon de profil qui le porte. */
function CosmeticSwatch({
  kind,
}: {
  readonly kind: ConstellationCosmeticKind;
}) {
  const style =
    kind === "halo"
      ? {
          boxShadow: `0 0 0 3px color-mix(in srgb, ${GAME_BRAND} 35%, transparent), 0 0 10px ${GAME_BRAND}`,
        }
      : kind === "frame"
      ? { border: `2px solid ${GAME_BRAND}` }
      : {};
  return (
    <span
      aria-hidden="true"
      className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--color-ios-ink) 10%, transparent)",
        ...style,
      }}
    >
      {kind === "sparkle" ? <span style={{ color: GAME_BRAND }}>✦</span> : null}
    </span>
  );
}

function Cosmetics({
  cosmetics,
}: {
  readonly cosmetics: readonly ConstellationCosmetic[];
}) {
  const language = currentInterfaceLanguage();
  if (cosmetics.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h3
        className="text-check font-semibold uppercase tracking-wide"
        style={{ color: GAME_INK_2 }}
      >
        {gameText("game.constellation.cosmetics")}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {cosmetics.map((cosmetic) => (
          <li
            key={cosmetic.cosmeticKey}
            data-constellation-cosmetic={cosmetic.cosmeticKey}
            className="flex items-center gap-2 rounded-chip px-2 py-1"
            style={{ color: GAME_INK }}
          >
            <CosmeticSwatch kind={cosmetic.kind} />
            <span className="text-caption">
              {gameText("game.constellation.cosmetic", {
                kind: kindLabel(cosmetic.kind),
                star: formatGameNumber(language, cosmetic.star),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * `collected` : le membre lui-même, sur son total collecté (`game.starFragments.collected`).
 * `stars` : un visiteur, sur les étoiles que le serveur lui sert (`visitorConstellation`).
 */
export function GameConstellation(
  props: { readonly collected: number } | { readonly stars: number }
) {
  const language = currentInterfaceLanguage();
  const own = "collected" in props;
  const shape = constellationOf(
    own ? props.collected : props.stars * CONSTELLATION_FRAGMENTS_PER_STAR
  );
  return (
    <GameCard id="game-constellation" labelledBy="game-constellation-title">
      <h2
        id="game-constellation-title"
        className="text-body font-bold"
        style={{ color: GAME_INK }}
      >
        {gameText("game.constellation.title")} ·{" "}
        {translateGamePlural(language, "game.constellation.stars", shape.stars)}
      </h2>
      <Sky stars={shape.stars} inStar={own ? shape.inStar : null} />
      {own ? (
        <>
          <p className="text-caption" style={{ color: GAME_INK }}>
            {translateGamePlural(
              language,
              "game.constellation.next",
              shape.toNextStar
            )}
          </p>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText("game.constellation.how")}
          </p>
        </>
      ) : null}
      <Cosmetics cosmetics={shape.cosmetics} />
      {own ? (
        <p className="text-check" style={{ color: GAME_INK_2 }}>
          {gameText("game.constellation.visibility")}
        </p>
      ) : null}
    </GameCard>
  );
}
