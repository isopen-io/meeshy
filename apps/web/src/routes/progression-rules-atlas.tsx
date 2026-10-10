import type { ReactNode } from 'react';

import { FLAME_FORMS } from '@meeshy/shared/utils/game/flame';
import { ACHIEVEMENT_RARITIES, GLORY_RANKS, gloryForAchievement, type GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';
import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';
import { LEAGUE_KEYS } from '@meeshy/shared/utils/game/league';
import { TREASURY_TIERS } from '@meeshy/shared/utils/game/treasury';

import { Flame, GameBadge, GameBird, LeagueGem, LevelRing, MeeshCoin, RankBlason, Signature, Trophy } from '@/components/game';
import { GAME_CARD, GAME_INK, GAME_INK_2 } from '@/components/game-surface';
import { rarityRim } from '@/lib/game/rarity';
import {
  ATLAS_COIN_PLATES,
  ATLAS_FAMILIES,
  ATLAS_MEDAL_MATERIALS,
  ATLAS_TROPHY_PLATES,
  atlasSpeaker,
  firstLevelOfTier,
  treasuryPile,
  type AtlasFamily,
} from '@/lib/game/rules-atlas';
import { actionsLabel, daysLabel, flameFormName, formatCount, gameText, levelTierName, materialName, rankName, treasuryName } from '@/lib/view/game-copy';
import { leagueName } from '@/lib/view/game-copy-v2';

/**
 * LE CARNET DES RÈGLES, ILLUSTRÉ (#9538) — le détail de la conception (parties
 * I, II et IV) AVEC ses dessins : les dix paliers, la Meesh (avers, revers,
 * éditions), les six paliers du trésor, les onze blasons, les cinq Flammes, les
 * huit ligues, les médailles (trois formes, sept matières, l'empreinte), les
 * trophées et les cinq raretés. Mee et Meo y parlent : l'un montre le geste,
 * l'autre dit la règle, tour à tour.
 *
 * Aucune image bitmap : chaque famille est dessinée par la brique qui la dessine
 * déjà là où on la gagne (anneau, pièce, blason, Flamme, gemme, médaille, coupe,
 * liseré). Une brique retouchée change ici en même temps. Une page qui
 * EXPLIQUE : aucun bouton, tout y est décoratif sauf le texte.
 *
 * Miroir de `GameRulesAtlasView` (iOS).
 */

const TITLE: Readonly<Record<AtlasFamily, () => string>> = {
  levels: () => gameText('game.rules.atlas.levels'),
  coin: () => gameText('game.rules.atlas.meesh'),
  treasury: () => gameText('game.rules.atlas.treasury'),
  ranks: () => gameText('game.rules.atlas.ranks'),
  flames: () => gameText('game.rules.atlas.flames'),
  leagues: () => gameText('game.rules.atlas.leagues'),
  medals: () => gameText('game.rules.atlas.medals'),
  trophies: () => gameText('game.rules.atlas.trophies'),
  rarities: () => gameText('game.rules.atlas.rarities'),
};

const LINE: Readonly<Record<AtlasFamily, () => string>> = {
  levels: () => gameText('game.rules.atlas.line.levels'),
  coin: () => gameText('game.rules.atlas.line.meesh'),
  treasury: () => gameText('game.rules.atlas.line.treasury'),
  ranks: () => gameText('game.rules.atlas.line.rank'),
  flames: () => gameText('game.rules.atlas.line.flame'),
  leagues: () => gameText('game.rules.atlas.line.league'),
  medals: () => gameText('game.rules.atlas.line.medals'),
  trophies: () => gameText('game.rules.atlas.line.trophies'),
  rarities: () => gameText('game.rules.atlas.line.rarities'),
};

function Cell({ name, detail, children }: { readonly name: string; readonly detail?: string; readonly children: ReactNode }) {
  return (
    <li className="flex flex-col items-center gap-1 text-center">
      <div className="grid place-items-center" aria-hidden="true">
        {children}
      </div>
      <p className="text-check font-semibold" style={{ color: GAME_INK }}>
        {name}
      </p>
      {detail === undefined ? null : (
        <p className="text-check" style={{ color: GAME_INK_2 }}>
          {detail}
        </p>
      )}
    </li>
  );
}

function Grid({ children }: { readonly children: ReactNode }) {
  return <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] items-start gap-x-2 gap-y-4">{children}</ul>;
}

/** Une pile de pièces d'argent : une de plus à chaque palier, posées en escalier. */
function TreasuryPile({ count }: { readonly count: number }) {
  const box = 76;
  return (
    <div className="relative" style={{ width: box, height: box }}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="absolute"
          style={{ insetInlineStart: 4 + (index % 3) * 17, top: 42 - Math.floor(index / 3) * 18 - (index % 3) * 4 }}
        >
          <MeeshCoin side="obverse" size={32} />
        </span>
      ))}
    </div>
  );
}

const RANKS: readonly GloryRankOrMythic[] = [...GLORY_RANKS.map((rank) => rank.key), 'mythe'];

const rankDetail = (rank: GloryRankOrMythic): string => {
  const entry = GLORY_RANKS.find((candidate) => candidate.key === rank);
  return entry === undefined ? gameText('game.rules.atlas.myth') : gameText('game.rank.glory', { glory: formatCount(entry.minGlory) });
};

function Levels() {
  return (
    <Grid>
      {LEVEL_TIER_KEYS.map((tier, index) => {
        const level = firstLevelOfTier(index + 1);
        return (
          <Cell key={tier} name={levelTierName(tier)} detail={gameText('game.banner.level', { level: formatCount(level) })}>
            <LevelRing level={level} tier={tier} progress={1} size={64} />
          </Cell>
        );
      })}
    </Grid>
  );
}

function Coin() {
  const names = {
    obverse: gameText('game.rules.atlas.obverse'),
    reverse: gameText('game.rules.atlas.reverse'),
    gold: gameText('game.rules.atlas.edition_gold'),
    prism: gameText('game.rules.atlas.edition_prism'),
  } as const;
  const year = new Date().getFullYear();
  return (
    <Grid>
      {ATLAS_COIN_PLATES.map((plate) => (
        <Cell key={plate.key} name={names[plate.key]}>
          <MeeshCoin side={plate.side} size={84} edition={plate.edition} {...(plate.side === 'reverse' ? { number: plate.number, year } : {})} />
        </Cell>
      ))}
    </Grid>
  );
}

function Treasury() {
  return (
    <Grid>
      {TREASURY_TIERS.map((tier, index) => (
        <Cell key={tier.key} name={treasuryName(tier.key)} detail={`${formatCount(tier.minHeld)}+`}>
          <TreasuryPile count={treasuryPile(index + 1)} />
        </Cell>
      ))}
    </Grid>
  );
}

function Ranks() {
  return (
    <Grid>
      {RANKS.map((rank) => (
        <Cell key={rank} name={rankName(rank)} detail={rankDetail(rank)}>
          <RankBlason rank={rank} division={rank === 'mythe' ? null : 3} size={84} />
        </Cell>
      ))}
    </Grid>
  );
}

function Flames() {
  return (
    <Grid>
      {FLAME_FORMS.map((form) => (
        <Cell key={form.key} name={flameFormName(form.key)} detail={`${daysLabel(form.minDays)}${form.key === 'braise' ? '' : '+'}`}>
          <Flame form={form.key} size={64} />
        </Cell>
      ))}
    </Grid>
  );
}

function Leagues() {
  return (
    <Grid>
      {LEAGUE_KEYS.map((league) => (
        <Cell key={league} name={leagueName(league)}>
          <LeagueGem league={league} size={58} />
        </Cell>
      ))}
    </Grid>
  );
}

function Medals() {
  return (
    <Grid>
      <Cell name={gameText('game.rules.atlas.shape_accumulation')}>
        <GameBadge shape="accumulation" size={64} material="gold" label="100" />
      </Cell>
      <Cell name={gameText('game.rules.atlas.shape_record')}>
        <GameBadge shape="record" size={64} material="platinum" />
      </Cell>
      <Cell name={gameText('game.rules.atlas.shape_collection')}>
        <GameBadge shape="collection" size={64} material="prism" collected={4} total={6} />
      </Cell>
      {ATLAS_MEDAL_MATERIALS.map((entry) => (
        <Cell key={entry.material} name={materialName(entry.material)} detail={actionsLabel(entry.threshold)}>
          <GameBadge shape="accumulation" size={64} material={entry.material} label={formatCount(entry.threshold)} />
        </Cell>
      ))}
      <Cell name={gameText('game.rules.atlas.imprint')}>
        <GameBadge shape="accumulation" size={64} material="gold" label="−37" imprint />
      </Cell>
    </Grid>
  );
}

function Trophies() {
  const names = {
    league: gameText('game.rules.atlas.trophy_league'),
    season: gameText('game.rules.atlas.trophy_season'),
    prestige: gameText('game.rules.atlas.trophy_prestige'),
    flame: gameText('game.rules.atlas.trophy_flame'),
  } as const;
  return (
    <Grid>
      {ATLAS_TROPHY_PLATES.map((plate) => (
        <Cell
          key={plate.key}
          name={names[plate.kind]}
          {...(plate.kind === 'league' && plate.material !== undefined ? { detail: materialName(plate.material) } : {})}
        >
          <Trophy kind={plate.kind} size={plate.kind === 'prestige' ? 92 : 64} {...(plate.material === undefined ? {} : { material: plate.material })} />
        </Cell>
      ))}
    </Grid>
  );
}

const SHARE = {
  common: () => gameText('game.rules.atlas.share_common'),
  rare: () => gameText('game.rules.atlas.share_rare'),
  epic: () => gameText('game.rules.atlas.share_epic'),
  legendary: () => gameText('game.rules.atlas.share_legendary'),
  mythic: () => gameText('game.rules.atlas.share_mythic'),
} as const;

function Rarities() {
  return (
    <Grid>
      {ACHIEVEMENT_RARITIES.map((rarity) => (
        <Cell
          key={rarity}
          name={gameText(`game.rarity.${rarity}`)}
          detail={`${SHARE[rarity]()} · ${gameText('game.rules.atlas.rarity_glory', { glory: formatCount(gloryForAchievement(rarity)) })}`}
        >
          <span
            data-game-rarity={rarity}
            className="grid size-14 place-items-center rounded-card"
            style={{ backgroundColor: 'var(--color-ios-surface)', ...rarityRim(rarity) }}
          >
            <Signature size={28} color={GAME_INK_2} />
          </span>
        </Cell>
      ))}
    </Grid>
  );
}

const BODY: Readonly<Record<AtlasFamily, () => ReactNode>> = {
  levels: Levels,
  coin: Coin,
  treasury: Treasury,
  ranks: Ranks,
  flames: Flames,
  leagues: Leagues,
  medals: Medals,
  trophies: Trophies,
  rarities: Rarities,
};

function Family({ family }: { readonly family: AtlasFamily }) {
  const speaker = atlasSpeaker(family);
  const Body = BODY[family];
  return (
    <section
      data-game-atlas-family={family}
      aria-labelledby={`atlas-${family}`}
      className="flex flex-col gap-3 rounded-card px-3 py-3"
      style={{ backgroundColor: GAME_CARD }}
    >
      <div className="flex items-center gap-2" data-game-atlas-speaker={speaker}>
        <GameBird bird={speaker === 'mee' ? 'meeGuide' : 'meoGuide'} size={48} flip={speaker === 'meo'} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={`atlas-${family}`} className="text-body font-bold" style={{ color: GAME_INK }}>
            {TITLE[family]()}
          </h3>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {LINE[family]()}
          </p>
        </div>
      </div>
      <Body />
    </section>
  );
}

export function RulesAtlas() {
  return (
    <section aria-labelledby="atlas-titre" data-game-atlas="" className="flex flex-col gap-3">
      <h2 id="atlas-titre" className="text-title font-bold" style={{ color: GAME_INK }}>
        {gameText('game.rules.atlas.title')}
      </h2>
      {ATLAS_FAMILIES.map((family) => (
        <Family key={family} family={family} />
      ))}
    </section>
  );
}
