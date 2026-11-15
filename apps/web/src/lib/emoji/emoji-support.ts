/**
 * CE QUE L'APPAREIL SAIT PEINDRE (#10531) — la table porte les emojis
 * d'Unicode Emoji 16, et une coque Android 7 à 10 n'en connaît pas les plus
 * récents : sa police les rend en carrés vides. La feuille ne propose donc que
 * les emojis jusqu'au PALIER de l'appareil.
 *
 * Le palier se MESURE, il ne se déduit pas du nom du système : un emoji témoin
 * par version, dessiné deux fois sur un canevas, en noir puis en blanc. Une
 * police d'emojis en couleurs ignore la couleur du texte — les deux dessins
 * sont identiques. Un caractère absent est dessiné dans la couleur demandée,
 * ou pas du tout.
 *
 * FERMÉ À RIEN : une mesure impossible ou incohérente (canevas absent, lecture
 * de pixels brouillée par le navigateur, police d'emojis sans couleur) ne
 * retire aucun emoji.
 */
export const ALWAYS_SHOWN_EMOJI_LEVEL = 5;

export const EMOJI_BASELINE_PROBE = '😀';

/** Du plus récent au plus ancien : `[version majeure d'Unicode Emoji, un emoji simple qu'elle a introduit]`. */
export const EMOJI_LEVEL_PROBES: ReadonlyArray<readonly [level: number, emoji: string]> = [
  [16, '🫩'],
  [15, '🫨'],
  [14, '🫠'],
  [13, '🥲'],
  [12, '🥱'],
  [11, '🥰'],
];

export function resolveEmojiLevel(paints: (emoji: string) => boolean): number {
  if (!paints(EMOJI_BASELINE_PROBE)) return Number.POSITIVE_INFINITY;
  return EMOJI_LEVEL_PROBES.find(([, emoji]) => paints(emoji))?.[0] ?? ALWAYS_SHOWN_EMOJI_LEVEL;
}

const PROBE_SIZE = 16;
const [INK, PAPER] = ['black', 'white'] as const; /* harmony-exempt: deux encres de MESURE sur un canevas jamais affiché, aucune couleur d'interface */

function canvasPaints(): ((emoji: string) => boolean) | null {
  const canvas = document.createElement('canvas');
  canvas.width = PROBE_SIZE;
  canvas.height = PROBE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) return null;
  context.textBaseline = 'top';
  context.font = '12px sans-serif';
  const drawn = (emoji: string, color: string): string => {
    context.clearRect(0, 0, PROBE_SIZE, PROBE_SIZE);
    context.fillStyle = color;
    context.fillText(emoji, 0, 0);
    return context.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data.join(',');
  };
  const blank = drawn('', INK);
  return (emoji) => {
    const inked = drawn(emoji, INK);
    return inked !== blank && inked === drawn(emoji, PAPER);
  };
}

const measured: { level: number | null } = { level: null };

export function supportedEmojiLevel(): number {
  if (measured.level !== null) return measured.level;
  try {
    const paints = canvasPaints();
    measured.level = paints === null ? Number.POSITIVE_INFINITY : resolveEmojiLevel(paints);
  } catch {
    measured.level = Number.POSITIVE_INFINITY;
  }
  return measured.level;
}
