import { useEffect, useRef, type KeyboardEvent } from 'react';

import { isGridKey, nextGridIndex } from '@/lib/emoji/emoji-grid-keys';
import { skinToneVariants, type EmojiSkinTone } from '@/lib/emoji/emoji-skin-tone';
import { layerMotion } from '@/lib/view/dialog-exit';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/**
 * LES TEINTES D'UN EMOJI (#10533) — ses six variantes, « par défaut » en tête,
 * sur une rangée posée au bas de la grille : un menu à choix unique, dont la
 * teinte en cours est cochée et reçoit le focus. Les flèches le parcourent (de
 * droite à gauche, elles s'inversent), Échap le referme SANS fermer la feuille,
 * et le retour Android comme Précédent aussi : la rangée est la couche du dessus.
 * Choisir une variante la rend à l'hôte, qui retient la teinte.
 */
export function EmojiToneMenu({
  base,
  tone,
  label,
  toneLabel,
  rtl,
  onChoose,
  onDismiss,
  leaving = false,
}: {
  readonly base: string;
  readonly tone: EmojiSkinTone;
  readonly label: string;
  readonly toneLabel: (tone: EmojiSkinTone) => string;
  readonly rtl: boolean;
  readonly onChoose: (tone: EmojiSkinTone) => void;
  readonly onDismiss: () => void;
  /** Refermée, la rangée reste peinte le temps de son fondu (#18327), hors de la pile du retour. */
  readonly leaving?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useBackDismiss(onDismiss, { active: !leaving });

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [base]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      return;
    }
    if (!isGridKey(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.findIndex((button) => button === event.target);
    if (index === -1) return;
    event.preventDefault();
    event.stopPropagation();
    buttons[nextGridIndex({ index, count: buttons.length, columns: buttons.length, key: event.key, rtl })]?.focus();
  };

  return (
    <div className="pointer-events-none sticky bottom-0 flex justify-center pb-3 pt-2">
      <div
        ref={ref}
        role="menu"
        aria-label={`${label} ${base}`}
        aria-orientation="horizontal"
        data-emoji-tones={base}
        className="pointer-events-auto flex max-w-full gap-0.5 rounded-card p-1"
        {...layerMotion(leaving, {
          backgroundColor: 'var(--color-ios-card)',
          boxShadow: '0 8px 24px color-mix(in srgb, var(--color-media-backdrop) 24%, transparent)',
        })}
        onKeyDown={onKeyDown}
      >
        {skinToneVariants(base).map((variant) => {
          const checked = variant.tone === tone;
          return (
            <button
              key={variant.tone}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              aria-label={toneLabel(variant.tone)}
              data-emoji-tone={variant.tone}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChoose(variant.tone)}
              className="btn-press grid shrink place-items-center rounded-chip text-2xl focus-visible:outline-2 focus-visible:-outline-offset-2"
              style={{
                minHeight: 44,
                minWidth: 44,
                outlineColor: 'var(--color-ios-brand)',
                backgroundColor: checked ? 'color-mix(in srgb, var(--accent, var(--color-ios-brand)) 18%, transparent)' : 'transparent',
              }}
            >
              {variant.emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
