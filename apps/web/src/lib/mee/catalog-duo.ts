import type { BirdPose } from './art';
import { act, duo } from './build';
import type { Entry } from './build';
import { hearts, label, many, notes, rain, shadow, sparkles, tears } from './kit';
import { P, at, confettiBurst, speech } from './props';
import type { MeeCharacterFeeling, MeeIntent, MeeSticker } from './types';

/**
 * À DEUX (#9034) — vingt-deux scènes, chacune en DEUX versions, toutes deux
 * dans l'onglet « Mee & Meo » (#9058). Dans `duo-mee-…`, c'est Mee qui fait
 * le geste et Meo qui réagit ; dans `duo-meo-…`, l'inverse — et la réaction
 * n'est pas la même : Meo rougit sous le bisou de Mee, Mee s'évanouit sous
 * celui de Meo. Les deux sens ne sont donc jamais le même sticker.
 *
 * Le repère : l'acteur est à gauche (corps en (50, 118), bec vers (90, 131),
 * aile tendue vers l'autre en (80, 112)), le partenaire à droite, retourné
 * vers lui (corps en (150, 118), bec vers (110, 131)).
 */

type Side = Omit<Entry, 'id' | 'title' | 'feeling' | 'emoji'> & {
  readonly intent?: MeeIntent;
  readonly title?: string;
  readonly actor: BirdPose;
  readonly partner: BirdPose;
  readonly back?: string;
  readonly front?: string;
};

type Scene = {
  readonly id: string;
  readonly title: string;
  readonly feeling: MeeCharacterFeeling;
  readonly intent?: MeeIntent;
  readonly emoji: string;
  readonly mee: Side;
  readonly meo: Side;
};

const floor = `${shadow(50, 160, 24)}${shadow(150, 160, 24)}`;

const SCENES: readonly Scene[] = [
  {
    id: 'bisou',
    title: 'Bisou',
    feeling: 'amour',
    emoji: '😘',
    mee: {
      actor: { eyes: 'closed', beak: 'kiss' },
      partner: { eyes: 'closed', beak: 'smile', acc: ['blush'] },
      back: floor,
      front: hearts('p1', [[100, 110], [96, 100]], 2.6),
      motion: act({ b1: ['leanIn', 2.6], p1: ['rise', 2.6], b2: ['tremble', 0.4] }),
    },
    meo: {
      actor: { eyes: 'closed', beak: 'kiss' },
      partner: { eyes: 'heart', beak: 'o' },
      back: floor,
      front: hearts('p1', [[100, 110], [104, 100]], 2.6, '#8b5cf6'),
      motion: act({ b1: ['leanIn', 2.6], p1: ['rise', 2.6], b2: ['faint', 2.6] }),
    },
  },
  {
    id: 'calin',
    title: 'Câlin',
    feeling: 'amour',
    emoji: '🤗',
    mee: {
      actor: { eyes: 'closed', beak: 'smile' },
      partner: { eyes: 'joy', beak: 'open' },
      back: floor,
      front: at(100, 72, P.heart('#e11d48', 11), { role: 'p1' }),
      motion: act({ b1: ['approach', 2.4], wr1: ['hugR', 2.4], wr2: ['flapR', 0.3], p1: ['pop', 2.4] }),
    },
    meo: {
      actor: { eyes: 'closed', beak: 'smile' },
      partner: { eyes: 'heart', beak: 'smile', acc: ['blush'] },
      back: floor,
      front: hearts('p1', [[140, 80], [160, 76], [150, 66]], 2.4, '#f472b6'),
      motion: act({ b1: ['approach', 2.4], wr1: ['hugR', 2.4], p1: ['pop', 2.4], e2: ['widen', 2.4] }),
    },
  },
  {
    id: 'coeur-lance',
    title: 'Je te lance mon cœur',
    feeling: 'amour',
    emoji: '💘',
    mee: {
      actor: { eyes: 'wink', beak: 'open' },
      partner: { eyes: 'heart', beak: 'open' },
      back: floor,
      front: at(70, 96, P.heart('#e11d48', 12), { role: 'p1' }),
      motion: act({ wr1: ['offerR', 2.4], p1: ['arcR', 2.4], b2: ['hop', 2.4, 0.9] }),
    },
    meo: {
      actor: { eyes: 'wink', beak: 'open' },
      partner: { eyes: 'star', beak: 'smile' },
      back: floor,
      front: at(70, 96, P.heart('#7c3aed', 12), { role: 'p1' }),
      motion: act({ wr1: ['offerR', 2.4], p1: ['arcR', 2.4], b2: ['spin', 2.4, 0.9] }),
    },
  },
  {
    id: 'fleurs',
    title: 'Des fleurs pour toi',
    feeling: 'amour',
    emoji: '💐',
    mee: {
      actor: { eyes: 'joy', beak: 'smile' },
      partner: { eyes: 'closed', beak: 'smile', acc: ['blush'] },
      back: floor,
      front: at(98, 128, P.bouquet(), { role: 'p1', rot: -15 }),
      motion: act({ p1: ['approach', 2.8], wr1: ['offerR', 2.8], b2: ['bow', 2.8] }),
    },
    meo: {
      actor: { eyes: 'joy', beak: 'smile', acc: ['tie'] },
      partner: { eyes: 'heart', beak: 'open' },
      back: floor,
      front: `${at(98, 128, P.bouquet(), { role: 'p1', rot: -15 })}${hearts('p2', [[150, 70], [168, 84]], 2.8)}`,
      motion: act({ p1: ['approach', 2.8], wr1: ['offerR', 2.8], b2: ['hops', 1.4], p2: ['pop', 2.8] }),
    },
  },
  {
    id: 'cupidon',
    title: 'Cupidon',
    feeling: 'amour',
    emoji: '🏹',
    mee: {
      actor: { eyes: 'smirk', beak: 'smile' },
      partner: { eyes: 'heart', beak: 'o' },
      back: floor,
      front: `${at(88, 104, `${P.bowString()}${P.bow()}`, { role: 'p2' })}${at(64, 104, P.arrow(), { role: 'p1', s: 0.8 })}${at(150, 84, P.heart('#e11d48', 10), { role: 'p3' })}`,
      motion: act({ p2: ['stretchBow', 2.4], p1: ['shoot', 2.4], p3: ['pop', 2.4, 0.9], b2: ['recoil', 2.4, 0.2] }),
    },
    meo: {
      actor: { eyes: 'smirk', beak: 'smile' },
      partner: { eyes: 'joy', beak: 'tongue' },
      back: floor,
      front: `${at(88, 104, `${P.bowString()}${P.bow()}`, { role: 'p2' })}${at(64, 104, P.arrow(), { role: 'p1', s: 0.8 })}${at(150, 76, label(0, 0, 'raté !', { size: 12, fill: '#7c3aed' }), { role: 'p3' })}`,
      motion: act({ p2: ['stretchBow', 2.4], p1: ['shoot', 2.4], b2: ['hop', 2.4, 0.3], p3: ['pop', 2.4, 1] }),
    },
  },
  {
    id: 'boude',
    title: 'Je te boude',
    feeling: 'rejet',
    emoji: '😤',
    mee: {
      actor: { eyes: 'closed', beak: 'flat' },
      partner: { eyes: 'teary', beak: 'frown' },
      back: floor,
      front: tears('p1', [[144, 124], [156, 124]], 1.6),
      motion: act({ b1: ['sulk', 3], p1: ['tearFall', 1.6] }),
    },
    meo: {
      actor: { eyes: 'closed', beak: 'flat' },
      partner: { eyes: 'side', beak: 'o' },
      back: floor,
      front: at(150, 70, P.question(), { role: 'p1' }),
      motion: act({ b1: ['sulk', 3], wr2: ['tapR', 0.6], p1: ['pop', 3] }),
    },
  },
  {
    id: 'repousse',
    title: 'Laisse-moi',
    feeling: 'rejet',
    emoji: '✋',
    mee: {
      actor: { eyes: 'angry', beak: 'frown' },
      partner: { eyes: 'wide', beak: 'o' },
      back: floor,
      front: at(118, 92, P.dust(), { role: 'p1', s: 0.6 }),
      motion: act({ wr1: ['pushR', 2.4], b2: ['recoil', 2.4], p1: ['pop', 2.4, 1] }),
    },
    meo: {
      actor: { eyes: 'angry', beak: 'frown' },
      partner: { eyes: 'dizzy', beak: 'open' },
      back: floor,
      front: at(150, 70, P.speedLines(), { role: 'p1' }),
      motion: act({ wr1: ['pushR', 2.4], b2: ['flyOff', 2.4], p1: ['flash', 2.4] }),
    },
  },
  {
    id: 'porte',
    title: 'Je claque la porte',
    feeling: 'colere',
    emoji: '🚪',
    mee: {
      actor: { eyes: 'angry', beak: 'grit' },
      partner: { eyes: 'wide', beak: 'o' },
      back: floor,
      front: `${at(100, 118, P.doorFrame())}${at(100, 118, P.door(), { role: 'p1' })}${at(118, 70, P.exclaim(), { role: 'p2' })}`,
      motion: act({ b1: ['stomp', 2.2], p1: ['shut', 2.2], p2: ['pop', 2.2, 0.9] }),
    },
    meo: {
      actor: { eyes: 'angry', beak: 'grit' },
      partner: { eyes: 'teary', beak: 'frown' },
      back: floor,
      front: `${at(100, 118, P.doorFrame())}${at(100, 118, P.door(), { role: 'p1' })}${at(118, 66, P.anger(), { role: 'p2', s: 1.3 })}`,
      motion: act({ b1: ['stomp', 2.2], p1: ['shut', 2.2], p2: ['flash', 2.2, 0.9] }),
    },
  },
  {
    id: 'console',
    title: 'Je suis là',
    feeling: 'consolation',
    emoji: '🫶',
    mee: {
      actor: { eyes: 'sad', beak: 'smile' },
      partner: { eyes: 'teary', beak: 'frown' },
      back: floor,
      front: tears('p1', [[140, 124], [158, 124]], 1.4),
      motion: act({ wr1: ['patR', 2.4], b2: ['tremble', 0.4], p1: ['tearFall', 1.4] }),
    },
    meo: {
      actor: { eyes: 'sad', beak: 'smile' },
      partner: { eyes: 'closed', beak: 'smile' },
      back: floor,
      front: at(150, 74, P.heart('#e11d48', 9), { role: 'p1' }),
      motion: act({ wr1: ['patR', 2.4], p1: ['rise', 2.4, 0.6] }),
    },
  },
  {
    id: 'parapluie',
    title: 'Sous mon parapluie',
    feeling: 'consolation',
    emoji: '☂️',
    mee: {
      actor: { eyes: 'joy', beak: 'smile' },
      partner: { eyes: 'open', beak: 'smile' },
      back: `${rain('p1', 20, 190, 20, 8)}${floor}`,
      front: at(120, 54, P.umbrella('#14b8a6'), { role: 'p2', rot: 10 }),
      motion: act({ p1: ['fall', 1.1], p2: ['sway', 3], b1: ['approach', 3] }),
    },
    meo: {
      actor: { eyes: 'joy', beak: 'smile' },
      partner: { eyes: 'closed', beak: 'flat', acc: ['scarf'] },
      back: `${rain('p1', 20, 190, 20, 8)}${floor}`,
      front: at(120, 54, P.umbrella('#7c3aed'), { role: 'p2', rot: 10 }),
      motion: act({ p1: ['fall', 1.1], p2: ['sway', 3], b2: ['shiver', 0.6] }),
    },
  },
  {
    id: 'chatouille',
    title: 'Guili guili',
    feeling: 'joie',
    emoji: '🤭',
    mee: {
      actor: { eyes: 'smirk', beak: 'smile' },
      partner: { eyes: 'joy', beak: 'open' },
      back: floor,
      front: at(150, 70, label(0, 0, 'hi hi', { size: 13, fill: '#059669' }), { role: 'p1' }),
      motion: act({ wr1: ['tapR', 0.4], b2: ['shake', 0.8], p1: ['pop', 1.6] }),
    },
    meo: {
      actor: { eyes: 'smirk', beak: 'smile' },
      partner: { eyes: 'joy', beak: 'tongue' },
      back: floor,
      front: tears('p1', [[140, 120], [158, 120]], 1),
      motion: act({ wr1: ['tapR', 0.4], b2: ['hops', 1], p1: ['tearFall', 1] }),
    },
  },
  {
    id: 'tope-la',
    title: 'Tope là',
    feeling: 'celebration',
    emoji: '🙌',
    mee: {
      actor: { eyes: 'joy', beak: 'open' },
      partner: { eyes: 'joy', beak: 'open' },
      back: floor,
      front: at(100, 92, P.sparkle('#fde047', 14), { role: 'p1' }),
      motion: act({ wr1: ['hugR', 1.6], wr2: ['hugR', 1.6], p1: ['pop', 1.6, 0.4], b1: ['hop', 1.6] }),
    },
    meo: {
      actor: { eyes: 'joy', beak: 'open' },
      partner: { eyes: 'star', beak: 'open' },
      back: floor,
      front: confettiBurst(100, 92, 'p1', 10, 0.4),
      motion: act({ wr1: ['hugR', 1.6], wr2: ['hugR', 1.6], p1: ['burst', 1.6] }),
    },
  },
  {
    id: 'cadeau',
    title: 'Un cadeau',
    feeling: 'celebration',
    emoji: '🎁',
    mee: {
      actor: { eyes: 'joy', beak: 'smile' },
      partner: { eyes: 'star', beak: 'open' },
      back: floor,
      front: `${at(100, 150, P.giftBox())}${at(100, 150, P.giftLid(), { role: 'p1' })}${hearts('p2', [[100, 140]], 2.8)}`,
      motion: act({ wr1: ['offerR', 2.8], p1: ['lid', 2.8], p2: ['rise', 2.8, 0.8], b2: ['hop', 2.8, 0.8] }),
    },
    meo: {
      actor: { eyes: 'joy', beak: 'smile' },
      partner: { eyes: 'teary', beak: 'smile' },
      back: floor,
      front: `${at(100, 150, P.giftBox())}${at(100, 150, P.giftLid(), { role: 'p1' })}${sparkles('p2', [[96, 136], [108, 132]], 1.4)}${tears('p3', [[144, 122], [158, 122]], 1.4)}`,
      motion: act({ wr1: ['offerR', 2.8], p1: ['lid', 2.8], p2: ['twinkle', 1.4], p3: ['tearFall', 1.4] }),
    },
  },
  {
    id: 'bague',
    title: 'Veux-tu… ?',
    feeling: 'amour',
    emoji: '💍',
    mee: {
      actor: { eyes: 'heart', beak: 'smile' },
      partner: { eyes: 'wide', beak: 'o' },
      back: floor,
      front: `${at(96, 140, P.ringBox(), { role: 'p1' })}${at(150, 70, P.exclaim(), { role: 'p2' })}`,
      motion: act({ b1: ['bow', 3], p1: ['grow', 3], p2: ['pop', 3, 1], e2: ['widen', 3] }),
    },
    meo: {
      actor: { eyes: 'heart', beak: 'smile', acc: ['tophat'] },
      partner: { eyes: 'teary', beak: 'smile', acc: ['veil'] },
      back: floor,
      front: `${at(96, 140, P.ringBox(), { role: 'p1' })}${tears('p2', [[140, 120], [156, 120]], 1.5)}${hearts('p3', [[150, 66]], 3)}`,
      motion: act({ b1: ['bow', 3], p1: ['grow', 3], p2: ['tearFall', 1.5], p3: ['rise', 3] }),
    },
  },
  {
    id: 'jaloux',
    title: 'Jaloux',
    feeling: 'jalousie',
    emoji: '😒',
    mee: {
      actor: { eyes: 'side', beak: 'frown' },
      partner: { eyes: 'closed', beak: 'o' },
      back: floor,
      front: `${at(40, 70, P.anger(), { role: 'p1', s: 1.3 })}${notes('p2', [[160, 80], [172, 70]], 2)}`,
      motion: act({ e1: ['lookSide', 3], p1: ['pop', 1.5], p2: ['rise', 2] }),
    },
    meo: {
      actor: { eyes: 'side', beak: 'frown' },
      partner: { eyes: 'joy', beak: 'smile' },
      back: floor,
      front: at(48, 64, many([[0, 0], [10, -6]], P.steamPuff(), 'p1', 1.2)),
      motion: act({ e1: ['lookSide', 3], p1: ['steam', 1.2], wl2: ['raiseL', 1.4] }),
    },
  },
  {
    id: 'tu-me-tues',
    title: 'Tu me tues',
    feeling: 'morbide',
    emoji: '💀',
    mee: {
      actor: { eyes: 'heart', beak: 'open' },
      partner: { eyes: 'dead', beak: 'tongue' },
      back: floor,
      front: `${at(78, 70, speech('trop mignon', { w: 90 }), { s: 0.8 })}${at(150, 90, P.ghost(), { role: 'p1', s: 0.7 })}`,
      motion: act({ b2: ['topple', 3], p1: ['ghost', 3, 1] }),
    },
    meo: {
      actor: { eyes: 'smirk', beak: 'smile' },
      partner: { eyes: 'dead', beak: 'o', acc: ['halo'] },
      back: floor,
      front: at(78, 70, speech('beau gosse', { w: 90 }), { s: 0.8 }),
      motion: act({ b2: ['melt', 3], b1: ['nod', 1.5] }),
    },
  },
  {
    id: 'selfie',
    title: 'Selfie',
    feeling: 'joie',
    emoji: '🤳',
    mee: {
      actor: { eyes: 'wink', beak: 'tongue' },
      partner: { eyes: 'joy', beak: 'smile' },
      back: floor,
      front: at(100, 56, P.phone(), { rot: -10 }),
    },
    meo: {
      actor: { eyes: 'cool', beak: 'smile' },
      partner: { eyes: 'wink', beak: 'kiss' },
      back: floor,
      front: at(100, 56, P.phone(), { rot: 10 }),
    },
  },
  {
    id: 'dodo',
    title: 'Dodo ensemble',
    feeling: 'amour',
    emoji: '🛌',
    mee: {
      actor: { eyes: 'closed', beak: 'smile', acc: ['nightcap'] },
      partner: { eyes: 'closed', beak: 'flat' },
      back: `${at(100, 160, P.bed(), { s: 1.6 })}`,
      front: `${at(158, 74, P.zzz())}${at(166, 64, P.zzz(), { s: 0.8 })}`,
    },
    meo: {
      actor: { eyes: 'closed', beak: 'flat', acc: ['nightcap'] },
      partner: { eyes: 'closed', beak: 'smile', acc: ['blush'] },
      back: `${at(100, 160, P.bed(), { s: 1.6 })}`,
      front: at(100, 74, P.heart('#e11d48', 8)),
    },
  },
  {
    id: 'trinquer',
    title: 'Santé',
    feeling: 'celebration',
    emoji: '🥂',
    mee: {
      actor: { eyes: 'joy', beak: 'open' },
      partner: { eyes: 'joy', beak: 'smile' },
      back: floor,
      front: `${at(92, 100, P.glass(), { rot: 18 })}${at(108, 100, P.glass(), { rot: -18 })}${at(100, 80, P.sparkle())}`,
    },
    meo: {
      actor: { eyes: 'wink', beak: 'smile', acc: ['tie'] },
      partner: { eyes: 'heart', beak: 'smile' },
      back: floor,
      front: `${at(92, 100, P.glass(), { rot: 18 })}${at(108, 100, P.glass(), { rot: -18 })}${at(100, 80, P.heart('#e11d48', 7))}`,
    },
  },
  {
    id: 'bobo',
    title: 'Un bisou magique',
    feeling: 'consolation',
    emoji: '🩹',
    mee: {
      actor: { eyes: 'sad', beak: 'kiss' },
      partner: { eyes: 'teary', beak: 'frown', acc: ['bandage'] },
      back: floor,
      front: at(120, 110, P.bandaid()),
    },
    meo: {
      actor: { eyes: 'open', beak: 'smile' },
      partner: { eyes: 'joy', beak: 'smile', acc: ['bandage'] },
      back: floor,
      front: at(100, 76, P.heart('#7c3aed', 8)),
    },
  },
  {
    id: 'dispute',
    title: 'La dispute',
    feeling: 'colere',
    emoji: '💢',
    mee: {
      actor: { eyes: 'angry', beak: 'grit' },
      partner: { eyes: 'side', beak: 'flat' },
      back: floor,
      front: `${at(100, 70, P.bolt())}${at(70, 66, P.anger())}`,
    },
    meo: {
      actor: { eyes: 'angry', beak: 'open' },
      partner: { eyes: 'angry', beak: 'grit' },
      back: floor,
      front: `${at(100, 70, P.bolt())}${at(130, 66, P.anger())}`,
    },
  },
  {
    id: 'regime',
    title: 'Ici gît mon régime',
    feeling: 'morbide',
    emoji: '🪦',
    mee: {
      actor: { eyes: 'closed', beak: 'flat' },
      partner: { eyes: 'joy', beak: 'tongue' },
      back: `${at(100, 140, P.tombstone('RÉGIME'), { s: 1.1 })}${floor}`,
      front: at(150, 74, P.pizza(), { s: 0.6, rot: -20 }),
    },
    meo: {
      actor: { eyes: 'teary', beak: 'frown' },
      partner: { eyes: 'closed', beak: 'smile' },
      back: `${at(100, 140, P.tombstone('RÉGIME'), { s: 1.1 })}${floor}`,
      front: at(100, 96, P.rose(), { s: 0.6 }),
    },
  },
];

const side = (actor: 'mee' | 'meo', scene: Scene): MeeSticker => {
  const s = scene[actor];
  const intent = s.intent ?? scene.intent;
  return duo(actor, {
    id: `duo-${actor}-${scene.id}`,
    title: s.title ?? scene.title,
    feeling: scene.feeling,
    ...(intent !== undefined ? { intent } : {}),
    emoji: scene.emoji,
    actor: s.actor,
    partner: s.partner,
    ...(s.back !== undefined ? { back: s.back } : {}),
    ...(s.front !== undefined ? { front: s.front } : {}),
    motion: s.motion ?? null,
  });
};

/** Chaque scène, jouée par Mee puis par Meo : les deux sens se voient côte à côte dans la grille. */
export const DUO_TWINS: readonly MeeSticker[] = SCENES.flatMap((scene) => [side('mee', scene), side('meo', scene)]);
