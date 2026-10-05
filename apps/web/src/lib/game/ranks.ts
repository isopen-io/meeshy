import type { GloryRankKey, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';

import type { GameBirdKey } from './birds';
import type { GameMaterial } from './materials';

/**
 * LES ONZE BLASONS (#9380, conception IV.3). Les RANGS, leurs seuils et leurs
 * divisions sont la loi partagée (`@meeshy/shared/utils/game/glory`) ; ce
 * module ne dit que COMMENT chaque rang se dessine : « un écu par rang, la
 * matière et les pièces héraldiques montent avec lui. À partir d'Ambassadeur,
 * Mee et Meo tiennent l'écu ; à Légende ils sont couronnés ; à Mythe,
 * auréolés. »
 */

export const BLASON_RANKS: readonly GloryRankOrMythic[] = ['murmure', 'echo', 'voix', 'conteur', 'passeur', 'polyglotte', 'ambassadeur', 'orateur', 'oracle', 'legende', 'mythe'];

export type BlasonPieces = 'none' | 'stars' | 'dots';
export type BlasonCrest = 'none' | 'star' | 'crown';

export type BlasonDesign = {
  readonly index: number;
  readonly material: GameMaterial;
  /** Le liseré intérieur clair (dès Écho). */
  readonly inner: boolean;
  /** Le chef sombre en haut de l'écu (dès Conteur). */
  readonly band: boolean;
  readonly pieces: BlasonPieces;
  readonly crest: BlasonCrest;
  readonly laurel: boolean;
  readonly ribbon: boolean;
  readonly tenants: { readonly mee: GameBirdKey; readonly meo: GameBirdKey } | null;
  /** Les chevrons de division sous l'écu : tous les rangs sauf le Mythe (qui n'a pas de division). */
  readonly chevrons: boolean;
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
  const pieces: BlasonPieces = rank === 'passeur' ? 'stars' : rank === 'polyglotte' ? 'dots' : 'none';
  const crest: BlasonCrest = rank === 'oracle' ? 'star' : index >= 9 ? 'crown' : 'none';
  return {
    index,
    material: MATERIAL[rank],
    inner: index >= 1,
    band: index >= 3,
    pieces,
    crest,
    laurel: index >= 7,
    ribbon: index >= 6,
    tenants: tenantsAt(rank, index),
    chevrons: rank !== 'mythe',
  };
};

export type { GloryRankKey };
