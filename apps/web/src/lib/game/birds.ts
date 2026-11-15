import { bird, type BirdPose, type MeeCharacter } from '@/lib/mee/art';

/**
 * MEE ET MEO, FIGURES DU JEU (#9380) — pièces, blasons, trophées et carte du
 * guide. Le DESSIN est celui des stickers (`lib/mee/art.ts`, miroir iOS
 * `MeeStickerCatalog`) : aucune ligne de plumage n'est refaite ici. Ce module
 * ne fait que nommer les poses du jeu et poser le contour blanc des stickers
 * découpés, que `render.ts` ne rend pas hors d'un sticker complet.
 *
 * Les clés sont celles de la conception (`jeu-meeshy-conception.html`) :
 * `meeGuide`/`meoGuide` au repos, `meeJoy`/`meoOpen` sur la pièce, `…Crown`
 * (légende), `…Halo` (mythe), puis les humeurs de l'intégration.
 */

type Figure = { readonly character: MeeCharacter; readonly pose: BirdPose };

const FIGURES = {
  meeGuide: { character: 'mee', pose: { eyes: 'open', beak: 'smile' } },
  meoGuide: { character: 'meo', pose: { eyes: 'open', beak: 'smile' } },
  meeJoy: { character: 'mee', pose: { eyes: 'joy', beak: 'smile' } },
  meoOpen: { character: 'meo', pose: { eyes: 'open', beak: 'smile' } },
  meeCrown: { character: 'mee', pose: { eyes: 'star', beak: 'open', acc: ['crown'] } },
  meoCrown: { character: 'meo', pose: { eyes: 'star', beak: 'open', acc: ['crown'] } },
  meeHalo: { character: 'mee', pose: { eyes: 'closed', beak: 'smile', acc: ['halo'] } },
  meoHalo: { character: 'meo', pose: { eyes: 'closed', beak: 'smile', acc: ['halo'] } },
  meeCoin: { character: 'mee', pose: { eyes: 'coin', beak: 'open' } },
  meoStar: { character: 'meo', pose: { eyes: 'star', beak: 'smile' } },
  meeWink: { character: 'mee', pose: { eyes: 'wink', beak: 'smile' } },
  meoHeart: { character: 'meo', pose: { eyes: 'heart', beak: 'kiss' } },
  meoCool: { character: 'meo', pose: { eyes: 'cool', beak: 'smile' } },
  meoTeary: { character: 'meo', pose: { eyes: 'teary', beak: 'frown' } },
} as const satisfies Readonly<Record<string, Figure>>;

export type GameBirdKey = keyof typeof FIGURES;
export const GAME_BIRD_KEYS = Object.keys(FIGURES) as readonly GameBirdKey[];

/** Le personnage tient dans une boîte de 140 × 140, regard vers la droite. */
export const GAME_BIRD_BOX = 140;

/** Le SVG intérieur d'une figure. `uid` doit être unique dans le document : il préfixe dégradés et classes. */
export const gameBirdMarkup = (key: GameBirdKey, uid: string): string => {
  const figure: Figure = FIGURES[key];
  return bird(figure.character, figure.pose, 1, `${uid}${key}`);
};

/** `flip` retourne le personnage autour de son bord gauche : posé à droite, il regarde vers le centre. */
export const gameBirdPlacement = ({ x, y, scale, flip = false }: { readonly x: number; readonly y: number; readonly scale: number; readonly flip?: boolean }): string =>
  `translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`;

/**
 * Le contour blanc épais et l'ombre douce du sticker découpé (même filtre que
 * `renderMeeSticker`, boîte ajustée à UN personnage de 140). `id` doit être
 * unique par instance.
 */
export const birdCutFilter = (id: string): string =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" x="-12" y="-12" width="170" height="170" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="3.2" result="grown"/><feGaussianBlur in="grown" stdDeviation="1.6" result="soft"/><feComponentTransfer in="soft" result="c"><feFuncA type="linear" slope="5" intercept="-0.9"/></feComponentTransfer><feFlood style="flood-color:var(--game-glint)"/><feComposite in2="c" operator="in" result="paper"/><feGaussianBlur in="c" stdDeviation="2.4" result="haze"/><feOffset in="haze" dy="2.2" result="drop"/><feFlood style="flood-color:var(--game-edge);flood-opacity:.26"/><feComposite in2="drop" operator="in" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="paper"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

/**
 * LE RELIEF GRAVÉ (#9540) — Mee et Meo du revers de la Meesh sont frappés DANS
 * le métal, pas collés dessus : aucun contour blanc d'autocollant. Le dessin
 * garde ses COULEURS (l'émail dans les creux) ; le relief tient en deux traits
 * — la lumière HAUTE (le bord supérieur accroche le reflet) et l'ombre BASSE
 * (le creux retient l'ombre, plus large et plus sombre). `id` doit être unique
 * par instance ; la boîte est celle de `birdCutFilter`.
 */
export const birdEngraveFilter = (id: string): string =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" x="-12" y="-12" width="170" height="170" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="0.7" result="soft"/><feOffset data-relief="shade" in="soft" dx="0" dy="2.4" result="down"/><feFlood style="flood-color:var(--game-edge);flood-opacity:.6"/><feComposite in2="down" operator="in" result="shade"/><feOffset data-relief="light" in="soft" dx="0" dy="-1.3" result="up"/><feFlood style="flood-color:var(--game-glint);flood-opacity:.85"/><feComposite in2="up" operator="in" result="light"/><feMerge><feMergeNode in="shade"/><feMergeNode in="light"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
