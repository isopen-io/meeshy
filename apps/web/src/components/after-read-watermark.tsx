import { ROW_PADDING_HORIZONTAL, TEXT_INDENT } from '@/lib/reading-mode/metrics';

import { FLAME_EYE_GLYPH } from './flame-eye-glyph';

/** La marge intérieure du défilement du fil (`px-3.5`, `routes/thread.tsx`). */
export const THREAD_SCROLLER_INSET = 14;

/** La marge intérieure d'une bulle de texte (`px-3.5`, `components/bubble.tsx`). */
const BUBBLE_TEXT_INSET = 14;

/**
 * JUSQU'OÙ VA LE FILIGRANE — depuis le bord du défilement jusqu'à la première
 * lettre : la colonne du nom en rangée plate (le contenu comme la pièce jointe
 * y partent, #7995), la marge intérieure de la bulle en mode bulles — et le
 * bord même de la bulle quand elle ne porte qu'une pièce jointe, dont l'angle
 * est alors la limite.
 */
export function afterReadReachOf(input: { readonly flat: boolean; readonly mediaOnly: boolean }): number {
  if (input.flat) return THREAD_SCROLLER_INSET + ROW_PADDING_HORIZONTAL + TEXT_INDENT;
  return THREAD_SCROLLER_INSET + (input.mediaOnly ? 0 : BUBBLE_TEXT_INSET);
}

/**
 * LE FILIGRANE DE LA FLAMME-ŒIL (#8304, précision porteur 2026-09-27) — « ni
 * décompte ni indicateur. À la place : une grande flamme en FILIGRANE derrière
 * le message, posée à GAUCHE derrière l'avatar, qui s'étend jusqu'à la
 * première lettre du message — ou jusqu'à l'angle de la pièce jointe.
 * Discrète, jamais par-dessus le texte. »
 *
 * Il se pose sur le nœud qui enveloppe LES DEUX peaux (`thread-modes.tsx`),
 * comme la destruction et les effets : un mode ajouté demain le reçoit sans
 * rien câbler. `zIndex: -1` dans un contexte ISOLÉ le range sous la rangée
 * entière — avatar, texte, pièce jointe — et jamais sous le fil.
 *
 * `reach` (`afterReadReachOf`) est la distance, depuis le bord du défilement,
 * jusqu'à la première lettre : le filigrane part du bord (dans la marge du
 * défilement) et s'arrête là.
 */
export function AfterReadWatermark({ reach }: { readonly reach: number }) {
  return (
    <span
      data-after-read-watermark
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        insetInlineStart: -THREAD_SCROLLER_INSET,
        width: reach,
        zIndex: -1,
        pointerEvents: 'none',
        color: 'var(--color-error)',
        opacity: 0.14,
      }}
    >
      <svg
        viewBox={FLAME_EYE_GLYPH.viewBox}
        width="100%"
        height="100%"
        fill="currentColor"
        preserveAspectRatio="xMidYMid meet"
        dangerouslySetInnerHTML={{ __html: FLAME_EYE_GLYPH.body }}
      />
    </span>
  );
}
