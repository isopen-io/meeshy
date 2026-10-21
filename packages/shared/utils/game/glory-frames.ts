/**
 * LA LOI DE PROPOSITION DES CADRES DE GLOIRE (#10156, L4, § 5.4 de
 * `docs/product/cadres-de-gloire/PROMPT-developpement.md`) — pour chaque étape
 * du jeu, quels cadres proposer d'abord, selon l'atmosphère choisie, le dernier
 * choix et les packs installés.
 *
 * Une loi PURE : elle ne lit ni l'horloge, ni le réseau, ni le stockage.
 * L'appelant lui remet le catalogue (les contrats des packs `glory-frame`, L3),
 * l'atmosphère du compte (L10a), le dernier cadre gardé pour la même famille
 * (déduit du carnet) et l'ensemble des packs installés OU embarqués, calculé
 * par l'étagère (`isPackInstalled`) — jamais redérivé ici.
 *
 *  - `suggested` ne contient QUE des cadres de packs installés ;
 *  - `others` ordonne et filtre la boutique en mode « choisir » : chaque autre
 *    pack d'atmosphère, installé ou non, par ses cadres pour cette étape ;
 *  - `reinstall` nomme le pack de l'atmosphère choisie quand il n'est pas
 *    installé : le client le réinstalle en une écriture, sans rien demander ;
 *  - `preselected` est le dernier choix s'il est parmi `suggested`, sinon le
 *    premier de `suggested`.
 *
 * La loi d'usage (#10146, `types/frame-usage.ts`) borne TOUT ce qui sort :
 * chaque cadre proposé passe `canUseFrame(usage, contexte de l'étape)`. Un
 * cadre de rang ne sert que son rang ; un Prestige, un niveau 100, un départ,
 * un trophée, une ligue ou une saison sans cadre déclaré pour eux reçoivent la
 * carte simple — la recommandation D5 (« cadres du rang courant ») est
 * suspendue par cette loi, postérieure (directive porteur 2026-10-11), et la
 * décision reste ouverte (#10180). D3 (les cinq décorations du rang, celle de
 * la division d'abord) et D4 (le palier dessiné le plus proche en dessous)
 * sont appliquées, réversibles ici seulement. Un succès se photographie dans
 * SA rareté ; sans cadre de cette rareté, ou sans rareté servie, le cadre
 * NEUTRE — jamais celui d'une autre rareté.
 *
 * Miroir Swift : `packages/MeeshySDK/Sources/MeeshySDK/Game/GameGloryFrames.swift`,
 * rejoué sur `packages/shared/design/packs/frame-offer-vectors.json`.
 */
import type { FrameUseContext } from '../../types/frame-usage.js';
import { canUseFrame } from '../../types/frame-usage.js';
import type { GloryAtmosphere } from '../../types/glory-atmospheres.js';
import type { GloryFrame, MeeshFrameEdition } from '../../types/glory-frames.js';
import { GLORY_RANKS, type AchievementRarity, type GloryDivision5, type GloryRankOrMythic } from './glory.js';
import { LEVEL_TIER_KEYS, type LevelTierKey } from './levels.js';
import { meeshEdition } from './mint.js';

/** Ce que la loi lit d'un cadre : son identité, son usage et son placement. */
export type GloryFrameOfferFrame = Pick<GloryFrame, 'id' | 'usage' | 'collection' | 'appliesTo' | 'option' | 'hidden'>;

/** Un pack du catalogue, dans l'ordre éditorial du registre. */
export type GloryFrameOfferPack = {
  readonly slug: string;
  readonly atmosphere: GloryAtmosphere | null;
  /** L'ordre des collections du pack (l'Afrique éternelle : Savane puis Royaumes). */
  readonly collections: readonly string[];
  readonly frames: readonly GloryFrameOfferFrame[];
};

export type FrameRef = { readonly pack: string; readonly frameId: string };

export type GloryFramesForInput = {
  readonly stepId: string;
  readonly atmosphere: GloryAtmosphere | null;
  /** Le dernier cadre gardé pour la MÊME famille, déduit du carnet ; `null` sinon. */
  readonly lastChosen: string | null;
  readonly catalog: readonly GloryFrameOfferPack[];
  /** Les packs `glory-frame` installés OU embarqués sur cet appareil (`isPackInstalled`). */
  readonly installed: ReadonlySet<string>;
  /** La rareté SERVIE d'un succès ; absente ou `null` ⇒ le cadre neutre, jamais une rareté supposée. */
  readonly rarity?: AchievementRarity | null;
};

export type GloryFramesOffer = {
  readonly needsAtmosphere: boolean;
  readonly suggested: readonly FrameRef[];
  readonly others: readonly { readonly pack: string; readonly atmosphere: GloryAtmosphere | null; readonly installed: boolean; readonly frames: readonly FrameRef[] }[];
  readonly reinstall: string | null;
  readonly preselected: FrameRef | null;
};

/** L'atmosphère de « Choisir plus tard », installée par défaut et non retirable. */
const DEFAULT_ATMOSPHERE: GloryAtmosphere = 'afrique';

/** Les rangs qui se photographient dans une atmosphère ; les rangs d'avant ont leurs mythologies (L15). */
const ATMOSPHERE_RANKS: readonly GloryRankOrMythic[] = ['ambassadeur', 'orateur', 'oracle', 'legende', 'mythe'];

/**
 * Les familles d'étapes qui n'ont, AUJOURD'HUI, aucun cadre à proposer — chacune nommée par la décision ou le lot
 * qui la comble : les rangs de Murmure à Polyglotte (mythologies, D16 / L15), le départ, le niveau 100, le Prestige
 * et les trophées (D5, #10180), les succès (pack `succes`, LS). Cliquet de la matrice de couverture : il ne fait que
 * se vider.
 */
export const GLORY_FRAME_OFFER_EXEMPT_FAMILIES: readonly string[] = [
  'rank:murmure',
  'rank:echo',
  'rank:voix',
  'rank:conteur',
  'rank:passeur',
  'rank:polyglotte',
  'start',
  'level-100',
  'prestige',
  'trophy',
  'achievement',
];

const RANK_KEYS: readonly string[] = [...GLORY_RANKS.map((rank) => rank.key), 'mythe'];
const DIVISION = /^[1-5]$/;

type StepTarget =
  | { readonly family: 'rank'; readonly rank: GloryRankOrMythic; readonly division: GloryDivision5 | null }
  | { readonly family: 'tier'; readonly tier: LevelTierKey }
  | { readonly family: 'meesh'; readonly edition: MeeshFrameEdition }
  | { readonly family: 'treasury'; readonly treasury: string }
  | { readonly family: 'flame'; readonly days: number }
  | { readonly family: 'day' }
  | { readonly family: 'achievement' }
  | { readonly family: 'level-100' }
  | { readonly family: 'prestige' }
  | { readonly family: 'none' };

const POSITIVE = /^[1-9]\d*$/;

function stepTargetOf(stepId: string): StepTarget {
  const [prefix, first, second] = stepId.split(':');
  switch (prefix) {
    case 'rank': {
      if (first === undefined || !RANK_KEYS.includes(first)) return { family: 'none' };
      if (first === 'mythe') return second === '0' ? { family: 'rank', rank: 'mythe', division: null } : { family: 'none' };
      return second !== undefined && DIVISION.test(second) ? { family: 'rank', rank: first as GloryRankOrMythic, division: Number(second) as GloryDivision5 } : { family: 'none' };
    }
    case 'tier':
      return (LEVEL_TIER_KEYS as readonly string[]).includes(first ?? '') ? { family: 'tier', tier: first as LevelTierKey } : { family: 'none' };
    case 'meesh': {
      if (first === undefined || !POSITIVE.test(first)) return { family: 'none' };
      const number = Number(first);
      return { family: 'meesh', edition: number === 1 ? 'first' : meeshEdition(number) };
    }
    case 'treasury':
      return first === undefined ? { family: 'none' } : { family: 'treasury', treasury: first };
    case 'flame':
      return first !== undefined && POSITIVE.test(first) ? { family: 'flame', days: Number(first) } : { family: 'none' };
    case 'day':
      return { family: 'day' };
    case 'achievement':
      return { family: 'achievement' };
    case 'level-100':
      return { family: 'level-100' };
    case 'prestige':
      return { family: 'prestige' };
    default:
      return { family: 'none' };
  }
}

/** Le contexte de la loi d'usage pour une étape ; `null` : aucun cadre ne la sert (départ, trophée, ligue, saison). */
export function frameUseContextOf(stepId: string, rarity: AchievementRarity | null | undefined): FrameUseContext | null {
  const target = stepTargetOf(stepId);
  switch (target.family) {
    case 'rank':
      return { kind: 'rank', rank: target.rank, division: target.division };
    case 'tier':
    case 'meesh':
    case 'treasury':
    case 'flame':
    case 'day':
    case 'level-100':
      return { kind: 'moment', family: target.family };
    case 'prestige':
      return { kind: 'prestige' };
    case 'achievement':
      return rarity === null || rarity === undefined ? { kind: 'achievement' } : { kind: 'achievement', rarity };
    case 'none':
      return null;
  }
}

const NOTHING: GloryFramesOffer = { needsAtmosphere: false, suggested: [], others: [], reinstall: null, preselected: null };

const refOf = (pack: GloryFrameOfferPack, frame: GloryFrameOfferFrame): FrameRef => ({ pack: pack.slug, frameId: frame.id });

/** Les collections d'un pack dans l'ordre : celle du dernier choix d'abord, sinon l'ordre du pack. */
const collectionOrder = (pack: GloryFrameOfferPack, lastChosen: string | null): readonly string[] => {
  const chosen = pack.frames.find((frame) => frame.id === lastChosen)?.collection;
  return chosen === undefined ? pack.collections : [chosen, ...pack.collections.filter((collection) => collection !== chosen)];
};

const byCollection = (pack: GloryFrameOfferPack, frames: readonly GloryFrameOfferFrame[], lastChosen: string | null): readonly GloryFrameOfferFrame[] =>
  collectionOrder(pack, lastChosen).flatMap((collection) => frames.filter((frame) => frame.collection === collection));

/** Les cadres d'un pack pour un rang : la division d'abord (D3), collection par collection, puis les autres décorations. */
function rankFrames(pack: GloryFrameOfferPack, target: Extract<StepTarget, { family: 'rank' }>, lastChosen: string | null): readonly GloryFrameOfferFrame[] {
  const ofRank = byCollection(
    pack,
    pack.frames.filter((frame) => frame.appliesTo.family === 'rank' && frame.appliesTo.rank === target.rank),
    lastChosen,
  );
  const sameDivision = (frame: GloryFrameOfferFrame): boolean => frame.appliesTo.family === 'rank' && frame.appliesTo.division !== null && frame.appliesTo.division === target.division;
  return [...ofRank.filter(sameDivision), ...ofRank.filter((frame) => !sameDivision(frame))];
}

const isTarget = (target: StepTarget, rarity: AchievementRarity | null) => (frame: GloryFrameOfferFrame): boolean => {
  const applies = frame.appliesTo;
  switch (target.family) {
    case 'tier':
      return applies.family === 'tier' && applies.tier === target.tier;
    case 'meesh':
      return applies.family === 'meesh' && applies.edition === target.edition;
    case 'treasury':
      return applies.family === 'treasury' && applies.treasury === target.treasury;
    case 'flame':
      return applies.family === 'flame' && applies.days === target.days;
    case 'day':
      return applies.family === 'day';
    case 'achievement':
      return applies.family === 'achievement' && applies.rarity === rarity;
    default:
      return false;
  }
};

/** D4 : un palier sans cadre dessiné prend celui du palier dessiné le plus proche EN DESSOUS. */
function drawnTier(target: Extract<StepTarget, { family: 'tier' }>, frames: readonly GloryFrameOfferFrame[]): StepTarget {
  const index = LEVEL_TIER_KEYS.indexOf(target.tier);
  const drawn = LEVEL_TIER_KEYS.slice(0, index + 1)
    .reverse()
    .find((tier) => frames.some((frame) => frame.appliesTo.family === 'tier' && frame.appliesTo.tier === tier));
  return drawn === undefined ? target : { family: 'tier', tier: drawn };
}

const preselect = (suggested: readonly FrameRef[], lastChosen: string | null): FrameRef | null =>
  suggested.find((ref) => ref.frameId === lastChosen) ?? suggested[0] ?? null;

/** LA loi : les cadres proposés pour une étape. */
export function gloryFramesFor(input: GloryFramesForInput): GloryFramesOffer {
  const rarity = input.rarity ?? null;
  const context = frameUseContextOf(input.stepId, rarity);
  if (context === null) return NOTHING;
  const usable = (frame: GloryFrameOfferFrame): boolean => !frame.hidden && canUseFrame(frame.usage, context);
  const packs = input.catalog.map((pack) => ({ ...pack, frames: pack.frames.filter(usable) }));
  const installed = packs.filter((pack) => input.installed.has(pack.slug));
  const target = stepTargetOf(input.stepId);
  if (target.family === 'rank' && ATMOSPHERE_RANKS.includes(target.rank)) return atmosphereOffer(input, packs, target);
  if (target.family === 'rank') {
    const suggested = installed.filter((pack) => pack.atmosphere === null).flatMap((pack) => rankFrames(pack, target, input.lastChosen).map((frame) => refOf(pack, frame)));
    return { ...NOTHING, suggested, preselected: preselect(suggested, input.lastChosen) };
  }
  const effective = target.family === 'tier' ? drawnTier(target, installed.flatMap((pack) => pack.frames)) : target;
  const matching = (wanted: AchievementRarity | null): readonly FrameRef[] =>
    installed.flatMap((pack) => byCollection(pack, pack.frames.filter(isTarget(effective, wanted)), input.lastChosen).map((frame) => refOf(pack, frame)));
  const own = matching(rarity);
  const suggested = own.length === 0 && target.family === 'achievement' && rarity !== null ? matching(null) : own;
  return { ...NOTHING, suggested, preselected: preselect(suggested, input.lastChosen) };
}

function atmosphereOffer(input: GloryFramesForInput, packs: readonly GloryFrameOfferPack[], target: Extract<StepTarget, { family: 'rank' }>): GloryFramesOffer {
  const atmospheric = packs.filter((pack) => pack.atmosphere !== null);
  const chosenPack = input.atmosphere === null ? undefined : atmospheric.find((pack) => pack.atmosphere === input.atmosphere);
  const chosenReady = chosenPack !== undefined && input.installed.has(chosenPack.slug);
  const reinstall = chosenPack !== undefined && !chosenReady ? chosenPack.slug : null;
  const base = chosenReady ? chosenPack : atmospheric.find((pack) => pack.atmosphere === DEFAULT_ATMOSPHERE);
  const framesOf = (pack: GloryFrameOfferPack): readonly FrameRef[] => rankFrames(pack, target, input.lastChosen).map((frame) => refOf(pack, frame));
  const suggested = base !== undefined && input.installed.has(base.slug) ? framesOf(base) : [];
  const others = atmospheric
    .filter((pack) => pack.slug !== base?.slug)
    .map((pack) => ({ pack: pack.slug, atmosphere: pack.atmosphere, installed: input.installed.has(pack.slug), frames: framesOf(pack) }))
    .filter((other) => other.frames.length > 0);
  return { needsAtmosphere: input.atmosphere === null, suggested, others, reinstall, preselected: preselect(suggested, input.lastChosen) };
}

