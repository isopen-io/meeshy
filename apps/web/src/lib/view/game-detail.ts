import type { EngagementAchievementKey, EngagementAxisFamily } from '@meeshy/shared/types/engagement';
import type { GameAtlasBlock, GameChest, GameFlame, GameGlory, GameLeagueBlock, GameLevel, GameMission, GamePrestigeBlock, GameSeasonBlock, GameTreasury } from '@meeshy/shared/types/game';
import type { AchievementEntry } from '@meeshy/shared/utils/achievement-view';
import { engagementAchievementCondition, engagementAchievementTitle, engagementAxisLabel } from '@meeshy/shared/utils/engagement-labels';
import type { EngagementAchievementProgress, EngagementAxisProgress } from '@meeshy/shared/utils/engagement-progress';
import type { FlameFormKey } from '@meeshy/shared/utils/game/flame';
import type { GloryDivision, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';
import type { LeagueKey } from '@meeshy/shared/utils/game/league';
import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';
import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';
import { seasonStepReward } from '@meeshy/shared/utils/game/season';
import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { GAME_DETAIL_HOW, type GameDetailFact, type GameDetailFamily } from '@/lib/game/detail-families';
import { earnRules } from '@/lib/game/earn-rules';
import type { GameMaterial } from '@/lib/game/materials';
import { medalOfAxis } from '@/lib/game/medal';
import { rarityPercent, visibleRarity, type AchievementRarityMap, type RarityEntry } from '@/lib/game/rarity';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import {
  boundedPercent,
  daysLabel,
  difficultyName,
  editionName,
  familyName,
  flameFormName,
  formatCount,
  gameText,
  levelTierName,
  materialName,
  meeshCount,
  missionTitle,
  pointsLabel,
  rankLabel,
  treasuryName,
} from '@/lib/view/game-copy';
import { awardedDate, dayLabel, languageName, leagueName, rarityName, trophyView, zoneLabel } from '@/lib/view/game-copy-v2';
import { generatedAchievementLabel } from '@/lib/view/progression';
import { conceptView, flameStateLabel, type ConceptFact, type DetailRef } from '@/lib/view/progression-concepts';

/**
 * LES PRÉCISIONS D'UN ÉLÉMENT (#9563, amendement n° 2) — ce que la modale dit
 * quand on touche un badge, un trophée, un gel, une pastille. UNE fonction pure
 * par famille d'élément, lue depuis le bloc `game` et la progression servie :
 * rien n'est calculé ni inventé ici. Ce que la passerelle ne sert pas (une date,
 * une rareté, une jauge) est ABSENT des précisions, jamais remplacé.
 *
 * La modale (`components/game-detail-sheet.tsx`) ne connaît que ce type : elle
 * dessine l'emblème, dit l'état, les deux phrases, la rareté, et propose la
 * fiche du concept. Les mêmes fonctions servent la fiche, ses sous-pages, le
 * tableau de bord et l'en-tête : un élément dit la même chose partout.
 */

type Trophy = 'league' | 'season' | 'prestige' | 'flame';

/** Ce que la modale dessine en grand — des DONNÉES, pas un composant : le modèle reste pur. */
export type DetailEmblem =
  | { readonly kind: 'concept'; readonly concept: ProgressionConcept }
  | { readonly kind: 'medal'; readonly axis: EngagementAxisProgress }
  | { readonly kind: 'badge'; readonly shape: 'accumulation' | 'record' | 'collection'; readonly imprint: boolean }
  | { readonly kind: 'trophy'; readonly trophy: Trophy; readonly material: GameMaterial | null }
  | { readonly kind: 'stamp'; readonly language: string | null }
  | { readonly kind: 'seal'; readonly owned: boolean }
  | { readonly kind: 'gem'; readonly league: LeagueKey }
  | { readonly kind: 'ring'; readonly level: number; readonly tier: LevelTierKey; readonly progress: number; readonly prestige: number }
  | { readonly kind: 'rank'; readonly rank: GloryRankOrMythic; readonly division: GloryDivision | null }
  | { readonly kind: 'flame'; readonly form: FlameFormKey; readonly out: boolean }
  | { readonly kind: 'chest'; readonly open: boolean }
  | { readonly kind: 'coin'; readonly edition: MeeshEdition }
  | { readonly kind: 'mark'; readonly mark: 'points' | 'elans' };

/**
 * L'état de l'élément : obtenu (avec sa date quand elle est servie), verrouillé
 * (avec ce qu'il manque et sa jauge quand ils sont servis), ou une simple valeur
 * (un niveau, un solde, une donnée).
 */
export type DetailState =
  | { readonly kind: 'earned'; readonly line: string }
  | { readonly kind: 'locked'; readonly line: string; readonly missing: string | null; readonly gauge: number | null }
  | { readonly kind: 'value'; readonly line: string; readonly gauge: number | null };

export type DetailFamily = GameDetailFamily | 'fact' | 'player';

export type ElementDetail = {
  /** `<famille>:<clé>` — stable : c'est ce que le bouton porte et que la modale reçoit. */
  readonly id: string;
  readonly family: DetailFamily;
  /** La fiche que « Voir la fiche » ouvre ; `null` : l'élément n'a pas de fiche (un joueur du classement). */
  readonly concept: ProgressionConcept | null;
  readonly emblem: DetailEmblem;
  readonly name: string;
  readonly state: DetailState;
  readonly what: string;
  readonly how: { readonly label: 'obtain' | 'gives'; readonly text: string } | null;
  /** Les lignes en plus : un prix, une récompense, une échéance. */
  readonly facts: readonly Pick<ConceptFact, 'label' | 'value'>[];
  readonly rarity: { readonly name: string; readonly share: string } | null;
};

const fraction = (done: number, total: number): string => gameText('game.fmt.fraction', { done: formatCount(done), total: formatCount(total) });

const earned = (date: string | null): DetailState => ({
  kind: 'earned',
  line: date === null ? gameText('game.detail.earned') : gameText('game.detail.earned_on', { date }),
});

const locked = (missing: string | null = null, gauge: number | null = null): DetailState => ({
  kind: 'locked',
  line: gameText('game.detail.locked'),
  missing: missing === null ? null : gameText('game.detail.missing', { missing }),
  gauge,
});

const value = (line: string, gauge: number | null = null): DetailState => ({ kind: 'value', line, gauge });

const row = (label: string, text: string): Pick<ConceptFact, 'label' | 'value'> => ({ label, value: text });

const present = <T,>(items: readonly (T | null)[]): readonly T[] => items.filter((item): item is T => item !== null);

const isoDate = (iso: string | null): string | null => (iso === null || !Number.isFinite(new Date(iso).getTime()) ? null : awardedDate(iso));

type Shell = Pick<ElementDetail, 'emblem' | 'name' | 'state'> & Partial<Pick<ElementDetail, 'facts' | 'rarity' | 'how'>>;

/** Les deux phrases et le libellé de la seconde viennent de la famille : un seul endroit les lit au catalogue. */
const ofFamily = (family: GameDetailFamily, key: string, concept: ProgressionConcept, shell: Shell): ElementDetail => ({
  id: `${family}:${key}`,
  family,
  concept,
  what: gameText(`game.detail.${family}.what`),
  how: { label: GAME_DETAIL_HOW[family], text: gameText(`game.detail.${family}.how`) },
  facts: [],
  rarity: null,
  ...shell,
});

const rarityOf = (entry: RarityEntry | undefined): ElementDetail['rarity'] => {
  const rarity = visibleRarity(entry);
  if (entry === undefined || rarity === null) return null;
  const language = currentInterfaceLanguage();
  return { name: rarityName(rarity, language), share: gameText('game.rarity.share', { percent: rarityPercent(entry, language) }) };
};

/** UN BADGE : la médaille d'un axe. Sa matière dit la hauteur atteinte ; à zéro, il manque de quoi l'allumer. */
export function badgeDetail(axis: EngagementAxisProgress): ElementDetail {
  const medal = medalOfAxis(axis);
  const name = engagementAxisLabel(currentInterfaceLanguage(), axis.axisKey);
  const lastReached = [...axis.tiers].reverse().find((tier) => tier.reached);
  const next = medal.nextThreshold;
  return ofFamily('badge', axis.axisKey, 'badges', {
    emblem: { kind: 'medal', axis },
    name,
    state: medal.material === null ? locked(medal.missing === null ? null : formatCount(medal.missing), axis.progress) : earned(isoDate(lastReached?.reachedAt ?? null)),
    facts: present([
      medal.material === null ? null : row(gameText('game.fact.form'), materialName(medal.material)),
      next === null ? null : row(gameText('game.fact.next_tier'), fraction(medal.value, next)),
    ]),
  });
}

/**
 * UN SUCCÈS nommé : son titre et SA condition viennent du catalogue partagé des
 * notifications, dans la langue. « Comment l'obtenir » dit cette condition
 * précise ; la phrase générale de la famille ne sert que si elle manque.
 */
export function succesDetail(achievement: EngagementAchievementProgress, rarities?: AchievementRarityMap): ElementDetail {
  const language = currentInterfaceLanguage();
  const key: EngagementAchievementKey = achievement.key;
  const condition = engagementAchievementCondition(language, key);
  return ofFamily('succes', key, 'succes', {
    emblem: { kind: 'badge', shape: 'collection', imprint: !achievement.unlocked },
    name: engagementAchievementTitle(language, key),
    state: achievement.unlocked ? earned(isoDate(achievement.reachedAt)) : locked(),
    how: { label: 'obtain', text: condition === '' ? gameText('game.detail.succes.how') : condition },
    rarity: rarityOf(rarities?.[key]),
  });
}

/** UN DÉFI : un palier produit par la grammaire, dans sa famille. */
export function defiDetail(entry: AchievementEntry, rarities?: AchievementRarityMap): ElementDetail {
  return ofFamily('defi', entry.key, 'defis', {
    emblem: { kind: 'badge', shape: 'record', imprint: !entry.unlocked },
    name: generatedAchievementLabel(entry.family, entry.tier),
    state: entry.unlocked ? earned(isoDate(entry.reachedAt)) : locked(),
    rarity: rarityOf(rarities?.[entry.key]),
  });
}

/** UN TROPHÉE de la vitrine ; `null` pour une clé que ce client ne sait pas lire (elle n'est pas montrée non plus). */
export function trophyDetail(item: { readonly key: string; readonly awardedAt: string }): ElementDetail | null {
  const view = trophyView(item.key);
  if (view === null) return null;
  return ofFamily('trophy', item.key, 'showcase', {
    emblem: { kind: 'trophy', trophy: view.kind, material: view.material ?? null },
    name: view.title,
    state: earned(isoDate(item.awardedAt)),
  });
}

type Stamp = GameAtlasBlock['stamps'][number];
type PendingStamp = GameAtlasBlock['pending'][number];

/** UN TAMPON de l'Atlas, posé. */
export function stampDetail(stamp: Stamp): ElementDetail {
  return ofFamily('stamp', stamp.language, 'atlas', {
    emblem: { kind: 'stamp', language: stamp.language },
    name: languageName(stamp.language),
    state: earned(dayLabel(stamp.stampedOn)),
  });
}

/** UN ÉCHANGE À MOITIÉ FAIT : ce qu'il manque est dit par le sens déjà servi. */
export function pendingStampDetail(pending: PendingStamp): ElementDetail {
  const missing = pending.sent ? gameText('game.atlas.pending.sent') : gameText('game.atlas.pending.received');
  return ofFamily('stamp', `pending-${pending.language}`, 'atlas', {
    emblem: { kind: 'stamp', language: null },
    name: languageName(pending.language),
    state: { kind: 'locked', line: gameText('game.detail.locked'), missing, gauge: null },
  });
}

const stepReward = (step: number): string | null => {
  const reward = seasonStepReward(step);
  if (reward === null) return null;
  return reward.kind === 'points' ? pointsLabel(reward.amount) : gameText(`game.season.reward.${reward.kind}`);
};

/** UNE ÉTAPE de saison : réclamée, à réclamer ou à venir, et ce qu'elle donne. */
export function stepDetail(season: GameSeasonBlock, step: number): ElementDetail {
  const claimed = season.claimedSteps.includes(step);
  const reached = step <= season.steps;
  const reward = stepReward(step);
  return ofFamily('step', String(step), 'season', {
    emblem: { kind: 'seal', owned: claimed },
    name: gameText('game.season.step', { step: formatCount(step) }),
    state: claimed
      ? earned(null)
      : reached
        ? value(gameText('game.season.step.ready'))
        : locked(translateGamePlural(currentInterfaceLanguage(), 'game.season.stars', season.starsToNext), season.progress),
    facts: reward === null ? [] : [row(gameText('game.detail.gives_label'), reward)],
  });
}

/** LE SCEAU de la saison. */
export function sealDetail(season: GameSeasonBlock): ElementDetail {
  return ofFamily('seal', String(season.number), 'season', {
    emblem: { kind: 'seal', owned: season.sealOwned },
    name: gameText('game.season.seal.title'),
    state: season.sealOwned ? earned(null) : locked(),
    facts: season.sealOwned ? [] : [row(gameText('game.mint.row.price'), meeshCount(season.sealPrice))],
  });
}

/** LA GEMME de la ligue : la ligue de la semaine, la place et ce qu'il manque pour monter quand ils sont servis. */
export function gemDetail(league: GameLeagueBlock): ElementDetail {
  const current = league.current;
  if (league.access !== 'open' || current === null) {
    return ofFamily('gem', 'none', 'league', {
      emblem: { kind: 'gem', league: 'quartz' },
      name: gameText('game.league.title'),
      state: locked(),
    });
  }
  const toPromotion = current.pointsToPromotion;
  return ofFamily('gem', current.league, 'league', {
    emblem: { kind: 'gem', league: current.league },
    name: leagueName(current.league),
    state: value(gameText('game.league.rank_line', { rank: formatCount(current.rank), size: formatCount(current.groupSize) })),
    facts: present([
      row(gameText('game.fact.week_points'), pointsLabel(current.weekPoints)),
      row(gameText('game.fact.state'), zoneLabel(current.zone)),
      toPromotion === null || toPromotion === 0 ? null : row(gameText('game.fact.missing'), pointsLabel(toPromotion)),
    ]),
  });
}

/** UNE ÉTOILE de Prestige : posée ou à venir. `index` commence à 1. */
export function starDetail(prestige: GamePrestigeBlock, index: number): ElementDetail {
  const lit = index <= prestige.stars;
  return ofFamily('star', String(index), 'prestige', {
    emblem: { kind: 'trophy', trophy: 'prestige', material: null },
    name: gameText('game.prestige.stars', { stars: formatCount(index), max: formatCount(prestige.max) }),
    state: lit ? earned(null) : locked(),
    facts: lit ? [] : [row(gameText('game.mint.row.glory'), gameText('game.fmt.signed', { value: formatCount(prestige.gloryOnPass) }))],
  });
}

/** LE BLASON du rang : le rang, la Gloire, et le rang suivant avec ce qu'il manque. */
export function rankDetail(glory: GameGlory): ElementDetail {
  const next = glory.next === null ? null : rankLabel(glory.next.rank, glory.next.division);
  return ofFamily('rank', glory.rank, 'glory', {
    emblem: { kind: 'rank', rank: glory.rank, division: glory.division },
    name: rankLabel(glory.rank, glory.division),
    state: value(gameText('game.rank.glory', { glory: formatCount(glory.glory) }), next === null ? null : glory.progress),
    facts: present([
      next === null ? row(gameText('game.fact.next_rank'), gameText('game.rank.top')) : row(gameText('game.fact.next_rank'), next),
      glory.gloryMissing === null ? null : row(gameText('game.fact.missing'), formatCount(glory.gloryMissing)),
    ]),
  });
}

/** LA FORME de la Flamme. */
export function flameDetail(flame: GameFlame): ElementDetail {
  const out = flame.status === 'out' || flame.form === null;
  return ofFamily('flame', flame.form ?? 'none', 'flame', {
    emblem: { kind: 'flame', form: flame.form ?? 'braise', out },
    name: flame.form === null ? gameText('game.flame.out_line') : flameFormName(flame.form),
    state: value(flame.days === 0 ? gameText('game.flame.no_streak') : daysLabel(flame.days)),
    facts: present([
      flame.form === null
        ? null
        : row(gameText('game.fact.form'), gameText('game.flame.form_line', { form: flameFormName(flame.form), bonus: formatCount(boundedPercent(flame.bonusPercent)) })),
      row(gameText('game.fact.state'), flameStateLabel(flame.status)),
    ]),
  });
}

/** LES GELS en réserve. */
export function freezeDetail(flame: GameFlame): ElementDetail {
  return ofFamily('freeze', 'reserve', 'flame', {
    emblem: { kind: 'flame', form: flame.form ?? 'braise', out: false },
    name: gameText('game.fact.freezes'),
    state: value(fraction(flame.freezes, flame.maxFreezes), flame.maxFreezes <= 0 ? null : Math.min(1, flame.freezes / flame.maxFreezes)),
    facts: [row(gameText('game.mint.row.price'), meeshCount(flame.freezePrice))],
  });
}

/** UNE MISSION du jour : son avancement et ce qu'elle rapporte. */
export function missionDetail(mission: GameMission): ElementDetail {
  const done = mission.completedAt !== null;
  return ofFamily('mission', mission.id, 'missions', {
    emblem: { kind: 'chest', open: false },
    name: missionTitle(mission.templateKey, mission.target),
    state: done ? earned(null) : value(fraction(mission.progress, mission.target), mission.target <= 0 ? null : Math.min(1, mission.progress / mission.target)),
    facts: present([
      row(gameText('game.fact.state'), done ? gameText('game.mission.done') : difficultyName(mission.difficulty)),
      row(gameText('game.detail.gives_label'), pointsLabel(mission.reward)),
      mission.glory > 0 ? row(gameText('game.mint.row.glory'), gameText('game.fmt.signed', { value: formatCount(mission.glory) })) : null,
      mission.prism ? row(gameText('game.mission.prism'), gameText('game.missions.prism_day')) : null,
    ]),
  });
}

const chance = (odds: number): string => gameText('game.chest.chance', { odds: formatCount(Math.round(1 / odds)) });

/** LE COFFRE du jour : fermé, prêt ou ouvert ; son contenu possible est dit avant l'ouverture, son contenu réel après. */
export function chestDetail(chest: GameChest): ElementDetail {
  const reward = chest.reward;
  const contents =
    reward === null
      ? gameText('game.chest.odds', {
          min: formatCount(chest.odds.minPoints),
          max: pointsLabel(chest.odds.maxPoints),
          fragment: chest.odds.fragment > 0 ? chance(chest.odds.fragment) : formatCount(0),
          freeze: chest.odds.freeze > 0 ? chance(chest.odds.freeze) : formatCount(0),
        })
      : [pointsLabel(reward.points), reward.fragment ? gameText('game.chest.reward.fragment') : null, reward.freeze ? gameText('game.chest.reward.freeze') : null]
          .filter((part): part is string => part !== null)
          .join(' · ');
  const line = gameText(`game.concept.chip.chest.${chest.status}`);
  return ofFamily('chest', 'day', 'missions', {
    emblem: { kind: 'chest', open: chest.status === 'claimed' },
    name: gameText('game.chest.title'),
    state: chest.status === 'claimed' ? { kind: 'earned', line } : chest.status === 'ready' ? value(line) : { kind: 'locked', line, missing: gameText('game.chest.locked'), gauge: null },
    facts: [row(gameText('game.chest.contents'), contents)],
  });
}

/** LA PIÈCE Meesh : le solde, et la prochaine à frapper. `null` quand ni solde ni aperçu de frappe ne sont servis. */
export function coinDetail(view: EngagementWithGame): ElementDetail | null {
  const mint = view.game?.mint;
  const balance = view.meesh?.balance ?? view.game?.treasury.held;
  if (balance === undefined) return null;
  return ofFamily('coin', 'balance', 'meesh', {
    emblem: { kind: 'coin', edition: 'silver' },
    name: gameText('game.concept.meesh.name'),
    state: value(meeshCount(balance)),
    facts: present([
      mint === undefined
        ? null
        : row(gameText('game.fact.next_meesh'), `${gameText('game.mint.number_label', { number: formatCount(mint.number) })} · ${editionName(mint.edition)}`),
      mint === undefined ? null : row(gameText('game.mint.row.price'), pointsLabel(mint.price)),
      mint === undefined || mint.canMint ? null : row(gameText('game.fact.missing'), pointsLabel(mint.missingPoints)),
      view.meesh === undefined ? null : row(gameText('game.fact.minted'), formatCount(view.meesh.mintedLifetime)),
    ]),
  });
}

/** L'ANNEAU du niveau. */
export function ringDetail(level: GameLevel): ElementDetail {
  const atTop = level.nextThreshold === null;
  return ofFamily('ring', 'level', 'level', {
    emblem: { kind: 'ring', level: level.level, tier: level.tier, progress: level.progress, prestige: level.prestige },
    name: gameText('game.level.title', { level: formatCount(level.level), tier: levelTierName(level.tier) }),
    state: value(
      atTop ? gameText('game.level.top') : gameText('game.level.to_next', { points: pointsLabel(level.pointsToNext), level: formatCount(level.level + 1) }),
      atTop ? null : level.progress,
    ),
    facts: present([
      row(gameText('game.concept.points.name'), pointsLabel(level.score)),
      level.record > level.level ? row(gameText('game.fact.record'), gameText('game.banner.level', { level: formatCount(level.record) })) : null,
    ]),
  });
}

/** LE PALIER du trésor. */
export function treasuryDetail(treasury: GameTreasury): ElementDetail {
  const next = treasury.next;
  return ofFamily('treasury', treasury.tier ?? 'none', 'meesh', {
    emblem: { kind: 'coin', edition: 'silver' },
    name: treasury.tier === null ? gameText('game.gauge.treasury') : treasuryName(treasury.tier),
    state: treasury.tier === null ? locked(next === null ? null : meeshCount(next.missing)) : value(meeshCount(treasury.held)),
    facts: next === null ? [] : [row(gameText('game.fact.next_tier'), gameText('game.treasury.next', { missing: meeshCount(next.missing), tier: treasuryName(next.key) }))],
  });
}

/** UNE FAMILLE d'élan : ce que rapporte un geste, et si elle est active ces jours-ci (quand la passerelle le sert). */
export function elanDetail(family: EngagementAxisFamily, elan: EngagementWithGame['elan']): ElementDetail {
  const rule = earnRules().find((entry) => entry.family === family);
  const families = elan?.activeFamilies;
  const active = families === undefined ? null : families.includes(family);
  return ofFamily('elan', family, 'elans', {
    emblem: { kind: 'mark', mark: 'elans' },
    name: familyName(family),
    state: value(active === null ? familyName(family) : gameText(active ? 'game.detail.elan.active' : 'game.detail.elan.idle')),
    facts: rule === undefined ? [] : [row(gameText('game.detail.gives_label'), gameText('game.detail.elan.points', { points: pointsLabel(rule.points) }))],
  });
}

/** UNE DONNÉE (pastille ou ligne) : son libellé, sa valeur, sa phrase — et l'emblème du concept qui la porte. */
export function factDetail(concept: ProgressionConcept, fact: GameDetailFact, label: string, text: string): ElementDetail {
  return {
    id: `fact:${concept}.${fact}`,
    family: 'fact',
    concept,
    emblem: { kind: 'concept', concept },
    name: label,
    state: value(text),
    what: gameText(`game.detail.fact.${fact}`),
    how: null,
    facts: [],
    rarity: null,
  };
}

type LeagueEntry = {
  readonly rank: number;
  readonly displayName: string;
  readonly weekPoints: number;
  readonly zone: 'promotion' | 'safe' | 'relegation';
  readonly cup: 'gold' | 'silver' | 'bronze' | null;
};

/**
 * UNE LIGNE du classement de la ligue. Elle ne dit RIEN de plus que la page :
 * le pseudonyme, la place, les points de la semaine, la zone, la coupe — jamais
 * une présence, jamais une heure.
 */
export function playerDetail(entry: LeagueEntry, league: LeagueKey): ElementDetail {
  return {
    id: `player:${entry.rank}`,
    family: 'player',
    concept: null,
    emblem: { kind: 'gem', league },
    name: entry.displayName,
    state: value(pointsLabel(entry.weekPoints)),
    what: gameText('game.detail.player.what'),
    how: null,
    facts: present([
      row(gameText('game.gauge.rank'), formatCount(entry.rank)),
      row(gameText('game.fact.state'), zoneLabel(entry.zone)),
      entry.cup === null ? null : row(gameText('game.fact.trophies'), gameText(`game.league.cup.${entry.cup}`)),
    ]),
    rarity: null,
  };
}

/**
 * Les précisions qu'une donnée de fiche ouvre (`DetailRef`). Une donnée qui EST
 * un élément ouvre celui-ci ; si la passerelle ne sert pas cet élément, la
 * donnée garde sa propre valeur, sans phrase inventée (`null` : rien à ouvrir).
 */
export function detailOfRef(ref: DetailRef, concept: ProgressionConcept, label: string, text: string, view: EngagementWithGame): ElementDetail | null {
  if (ref.kind === 'fact') return factDetail(concept, ref.fact, label, text);
  if (ref.kind === 'elan') return elanDetail(ref.family, view.elan);
  if (ref.kind === 'note') {
    return { id: `fact:${concept}.note`, family: 'fact', concept, emblem: { kind: 'concept', concept }, name: label, state: value(text), what: ref.text, how: null, facts: [], rarity: null };
  }
  const game = view.game;
  if (game === undefined) return null;
  switch (ref.family) {
    case 'ring':
      return ringDetail(game.level);
    case 'coin':
      return coinDetail(view);
    case 'treasury':
      return treasuryDetail(game.treasury);
    case 'rank':
      return rankDetail(game.glory);
    case 'flame':
      return flameDetail(game.flame);
    case 'freeze':
      return freezeDetail(game.flame);
    case 'chest':
      return chestDetail(game.chest);
    case 'gem':
      return game.league === undefined ? null : gemDetail(game.league);
    case 'star':
      return game.prestige === undefined ? null : starDetail(game.prestige, Math.min(game.prestige.max, game.prestige.stars + (game.prestige.stars >= game.prestige.max ? 0 : 1)));
    case 'seal':
      return game.season === undefined || game.season === null ? null : sealDetail(game.season);
  }
}

/** Ce que l'emblème du héros d'une fiche ouvre : l'élément premier du concept. */
export function primaryDetail(concept: ProgressionConcept, view: EngagementWithGame, now: Date = new Date()): ElementDetail | null {
  const shown = conceptView(concept, view, now);
  return detailOfRef(shown.primary, concept, shown.name, shown.value, view);
}
