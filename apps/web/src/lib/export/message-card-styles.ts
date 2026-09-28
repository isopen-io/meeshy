import type { MessageCardStyleId } from './message-card-style-ids';

/**
 * **LES STYLES D'UNE CARTE D'EXPORT** — l'image qu'on garde ou qu'on partage
 * d'un message (et de ce à quoi il répond). Chaque style est une DIRECTION
 * artistique complète : fond, encres, et deux polices — celle de la réponse
 * (la voix du message, mise en avant) et celle de la citation (réduite).
 *
 * LES POLICES NE SONT PAS NOUVELLES : ce sont les substituts redistribuables
 * que `story-fonts.ts` sert déjà aux textes de story (OFL/Apache, sous-ensemble
 * latin). Une carte n'ajoute AUCUN octet au dépôt ni au bundle ; elle réveille
 * un fichier que le lecteur a peut-être déjà en cache. Un texte hors latin
 * (arabe…) est peint par la pile native — même contrat que la story.
 *
 * Les familles sont ÉCRITES ici plutôt qu'importées de `story-fonts.ts` : un
 * import ferait de cette table un morceau partagé compté dans le budget du
 * lecteur de story (`budgets.json › story_reader`). Le témoin
 * `message-card-styles.test.ts` tient chaque nom égal à la table — une famille
 * renommée là-bas fait rougir ici.
 */

/** La pile native, écrite pour un `CanvasRenderingContext2D` : `var(--font-native)`
 * n'a aucun sens hors CSS. Même liste que `packages/design-tokens/tokens.css`. */
export const CANVAS_NATIVE_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export { MESSAGE_CARD_STYLE_IDS, type MessageCardStyleId } from './message-card-style-ids';

export type CardFont = {
  /** La famille du fichier embarqué, `null` pour la seule pile native. */
  readonly family: string | null;
  readonly weight: number;
  readonly style: 'normal' | 'italic';
};

export type MessageCardStyle = {
  readonly id: MessageCardStyleId;
  /** Dégradé du fond, de haut en bas (deux à quatre arrêts). */
  readonly background: readonly (readonly [offset: number, color: string])[];
  /** Un halo doux posé sur le fond — donne la profondeur des cartes « vendables ». */
  readonly glow: string | null;
  readonly replyFont: CardFont;
  readonly quoteFont: CardFont;
  readonly replyInk: string;
  readonly quoteInk: string;
  readonly authorInk: string;
  /** Le filet de citation (barre verticale) et le séparateur « ——— ○ ——— ». */
  readonly accent: string;
  readonly separatorDash: readonly number[];
  readonly footerInk: string;
  /** L'opacité du filigrane diagonal — lisible si on le cherche, jamais sur le texte. */
  readonly watermarkAlpha: number;
  readonly watermarkInk: string;
};

/** Les familles de `STORY_FONT_FAMILIES` que les cartes emploient, avec la graisse de LEUR fichier. */
export const CARD_STORY_FONTS = {
  bubble: { family: 'Fredoka', weight: 600 },
  elegant: { family: 'Prata', weight: 400 },
  brush: { family: 'Caveat', weight: 700 },
  note: { family: 'Patrick Hand', weight: 400 },
} as const;

const story = (style: keyof typeof CARD_STORY_FONTS): CardFont => ({ ...CARD_STORY_FONTS[style], style: 'normal' });

const native = (weight: number, italic = false): CardFont => ({ family: null, weight, style: italic ? 'italic' : 'normal' });

export const MESSAGE_CARD_STYLES: Readonly<Record<MessageCardStyleId, MessageCardStyle>> = {
  /** Nuit indigo et halo magenta — la carte « réseau social », voix ronde. */
  aurore: {
    id: 'aurore',
    background: [
      [0, '#1B1340'],
      [0.55, '#2A1B5C'],
      [1, '#0E0A24'],
    ],
    glow: 'rgba(236, 72, 153, 0.28)',
    replyFont: story('bubble'),
    quoteFont: native(400, true),
    replyInk: '#FFFFFF',
    quoteInk: 'rgba(255, 255, 255, 0.62)',
    authorInk: '#F9A8D4',
    accent: '#A78BFA',
    separatorDash: [2, 14],
    footerInk: 'rgba(255, 255, 255, 0.78)',
    watermarkAlpha: 0.05,
    watermarkInk: '#FFFFFF',
  },
  /** Papier ivoire et didone — la citation de magazine. */
  editorial: {
    id: 'editorial',
    background: [
      [0, '#FBF8F1'],
      [1, '#F1EADB'],
    ],
    glow: null,
    replyFont: story('elegant'),
    quoteFont: story('elegant'),
    replyInk: '#1C1917',
    quoteInk: '#78716C',
    authorInk: '#9A3412',
    accent: '#1C1917',
    separatorDash: [],
    footerInk: '#44403C',
    watermarkAlpha: 0.045,
    watermarkInk: '#1C1917',
  },
  /** Crème chaud et plume — le mot qu'on garde. */
  manuscrit: {
    id: 'manuscrit',
    background: [
      [0, '#FFF4E0'],
      [1, '#FDE2C3'],
    ],
    glow: 'rgba(251, 146, 60, 0.22)',
    replyFont: story('brush'),
    quoteFont: story('note'),
    replyInk: '#3B2314',
    quoteInk: '#8A6A55',
    authorInk: '#C2410C',
    accent: '#EA580C',
    separatorDash: [3, 12],
    footerInk: '#5B3A26',
    watermarkAlpha: 0.06,
    watermarkInk: '#7C2D12',
  },
};

/** La chaîne `font` d'un contexte 2D — la famille embarquée puis la pile native, jamais un générique. */
export function canvasFont(font: CardFont, sizePx: number): string {
  const family = font.family === null ? CANVAS_NATIVE_STACK : `"${font.family}", ${CANVAS_NATIVE_STACK}`;
  return `${font.style === 'italic' ? 'italic ' : ''}${font.weight} ${Math.round(sizePx)}px ${family}`;
}
