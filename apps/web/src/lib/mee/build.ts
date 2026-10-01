import { DUO_LEFT_AT, DUO_RIGHT_AT, SOLO_AT, bird, placed } from './art';
import type { BirdPose, MeeCharacter } from './art';
import type { Beat, Motion, Role } from './motion';
import type { MeeFeeling, MeeSection, MeeSlot, MeeSlots, MeeSticker, MeeTab } from './types';

/**
 * LES OUTILS D'ÉCRITURE DU CATALOGUE (#9034) — pour qu'une entrée tienne en
 * quelques lignes lisibles : qui, quelle pose, quels accessoires, quel geste.
 */

export const act = (roles: Partial<Record<Role, Beat>>): Motion => ({ kind: 'action', roles });
export const ambient = (roles: Partial<Record<Role, Beat>>): Motion => ({ kind: 'ambient', roles });

type Layers = { readonly back?: string; readonly front?: string };
type Dyn<T> = T | ((slots: MeeSlots) => T);
const resolve = <T,>(value: Dyn<T> | undefined, slots: MeeSlots, fallback: T): T =>
  value === undefined ? fallback : typeof value === 'function' ? (value as (s: MeeSlots) => T)(slots) : value;

export type Entry = {
  readonly id: string;
  readonly title: string;
  readonly feeling: MeeFeeling;
  readonly emoji: string;
  readonly motion?: Motion | null;
};

const base = (tab: MeeTab, section: MeeSection, e: Entry, scene: MeeSticker['scene'], slots: readonly MeeSlot[] = [], defaults: MeeSlots = {}): MeeSticker => ({
  id: e.id,
  tab,
  section,
  title: e.title,
  feeling: e.feeling,
  emoji: e.emoji,
  motion: e.motion ?? null,
  slots,
  defaults,
  scene,
});

/** Un personnage SEUL. */
export function solo(tab: 'mee' | 'meo', e: Entry & { readonly pose: BirdPose } & Layers): MeeSticker {
  const c: MeeCharacter = tab;
  return base(tab, 'solo', e, (uid) => `${e.back ?? ''}${placed(SOLO_AT, bird(c, e.pose, 1, uid), 'b1')}${e.front ?? ''}`);
}

/**
 * DEUX personnages : l'ACTEUR à gauche (rôles `…1`), le partenaire à droite,
 * retourné vers lui (rôles `…2`). Dans l'onglet `mee`, Mee agit ; dans
 * l'onglet `meo`, Meo agit.
 */
export function duo(tab: 'mee' | 'meo', e: Entry & { readonly actor: BirdPose; readonly partner: BirdPose } & Layers): MeeSticker {
  const actor: MeeCharacter = tab;
  const partner: MeeCharacter = tab === 'mee' ? 'meo' : 'mee';
  return base(
    tab,
    'duo',
    e,
    (uid) =>
      `${e.back ?? ''}${placed(DUO_LEFT_AT, bird(actor, e.actor, 1, uid), 'b1')}${placed(DUO_RIGHT_AT, bird(partner, e.partner, 2, uid), 'b2')}${e.front ?? ''}`,
  );
}

/** Le personnage d'un sticker DYNAMIQUE : plus petit, il laisse la place au bandeau. */
export const INSTANT_AT = 'translate(44 26) scale(.8)';

export function instant(
  section: 'meteo' | 'moment' | 'lieu' | 'message',
  c: MeeCharacter,
  e: Entry & {
    readonly pose: BirdPose;
    readonly back?: Dyn<string>;
    readonly front?: Dyn<string>;
    readonly slots: readonly MeeSlot[];
    readonly defaults: MeeSlots;
    readonly at?: string;
  },
): MeeSticker {
  return base(
    'instants',
    section,
    e,
    (uid, slots) => {
      const s: MeeSlots = { ...e.defaults, ...Object.fromEntries(Object.entries(slots).filter(([, v]) => v !== undefined && v.trim() !== '')) };
      return `${resolve(e.back, s, '')}${placed(e.at ?? INSTANT_AT, bird(c, e.pose, 1, uid), 'b1')}${resolve(e.front, s, '')}`;
    },
    e.slots,
    e.defaults,
  );
}
