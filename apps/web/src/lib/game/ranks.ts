import type { GloryRankKey, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';
import { RANK_CRESTS, type CrestPiece } from '@meeshy/shared/utils/game/rank-crest';

import type { GameBirdKey } from './birds';
import type { GameMaterial } from './materials';

/**
 * LES ONZE BLASONS (#9380, conception IV.3). Les RANGS, leurs seuils et leurs
 * divisions sont la loi partagée (`@meeshy/shared/utils/game/glory`) ; ce
 * module ne dit que COMMENT chaque rang se dessine : « un écu par rang, la
 * matière et les pièces héraldiques montent avec lui. À partir d'Ambassadeur,
 * Mee et Meo tiennent l'écu ; à Légende ils sont couronnés ; à Mythe,
 * auréolés. »
 *
 * La DÉCORATION propre à chaque rang (un trait, deux arcs… la couronne de
 * traits) n'est pas écrite ici : c'est la table partagée par le web et iOS,
 * `@meeshy/shared/utils/game/rank-crest` (#9636).
 */

export const BLASON_RANKS: readonly GloryRankOrMythic[] = ['murmure', 'echo', 'voix', 'conteur', 'passeur', 'polyglotte', 'ambassadeur', 'orateur', 'oracle', 'legende', 'mythe'];

export type BlasonDesign = {
  readonly index: number;
  readonly material: GameMaterial;
  /** Le liseré intérieur clair (dès Écho). */
  readonly inner: boolean;
  /** Le chef sombre en haut de l'écu (dès Conteur). */
  readonly band: boolean;
  /** La décoration du rang, à la Signature — la table partagée (`RANK_CRESTS`). */
  readonly crest: readonly CrestPiece[];
  readonly ribbon: boolean;
  readonly tenants: { readonly mee: GameBirdKey; readonly meo: GameBirdKey } | null;
  /** Les encoches de division sous l'écu : tous les rangs sauf le Mythe (qui n'a pas de division). */
  readonly notches: boolean;
};

const MATERIAL: Readonly<Record<GloryRankOrMythic, GameMaterial>> = {
  murmure: 'copper',
  echo: 'copper',
  voix: 'bronze',
  conteur: 'bronze',
  passeur: 'silver',
  polyglotte: 'silver',
  ambassadeur: 'gold',
  orateur: 'gold',
  oracle: 'platinum',
  legende: 'obsidian',
  mythe: 'prism',
};

const tenantsAt = (rank: GloryRankOrMythic, index: number): BlasonDesign['tenants'] => {
  if (index < 6) return null;
  if (rank === 'mythe') return { mee: 'meeHalo', meo: 'meoHalo' };
  if (rank === 'legende') return { mee: 'meeCrown', meo: 'meoCrown' };
  return { mee: 'meeJoy', meo: 'meoOpen' };
};

export const blasonDesign = (rank: GloryRankOrMythic): BlasonDesign => {
  const index = BLASON_RANKS.indexOf(rank);
  return {
    index,
    material: MATERIAL[rank],
    inner: index >= 1,
    band: index >= 3,
    crest: RANK_CRESTS[rank],
    ribbon: index >= 6,
    tenants: tenantsAt(rank, index),
    notches: rank !== 'mythe',
  };
};

export type { GloryRankKey };
