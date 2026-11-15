import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { arrowTarget } from '@/lib/appearance/picker-model';

/**
 * **UN GROUPE DE CHOIX** (#10631, § 13 accessibilité) — `radiogroup` : un seul
 * choix tabulable (le coché, sinon le premier), les flèches déplacent ET
 * choisissent (inversées en RTL), chaque cible mesure au moins 44 pt, son nom
 * accessible est le libellé localisé et son état « sélectionné » est annoncé
 * (`aria-checked`).
 */
export type ChoiceItem = {
  readonly key: string;
  readonly label: string;
  readonly selected: boolean;
  readonly content: ReactNode;
  readonly onSelect: () => void;
};

const MIN_TARGET = 44;

export function ChoiceGroup({
  label,
  items,
  rtl,
  size = MIN_TARGET,
  marker,
}: {
  readonly label: string;
  readonly items: readonly ChoiceItem[];
  readonly rtl: boolean;
  readonly size?: number;
  readonly marker: `data-${string}`;
}) {
  const group = useRef<HTMLDivElement | null>(null);
  const selectedIndex = items.findIndex((item) => item.selected);
  const tabbable = selectedIndex === -1 ? 0 : selectedIndex;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const origin = (event.target as HTMLElement).closest<HTMLElement>('[role="radio"]');
    const from = origin === null ? tabbable : Number(origin.dataset['index'] ?? tabbable);
    const next = arrowTarget({ count: items.length, index: from, key: event.key, rtl });
    if (next === null) return;
    event.preventDefault();
    items[next]?.onSelect();
    group.current?.querySelector<HTMLElement>(`[role="radio"][data-index="${next}"]`)?.focus();
  };

  return (
    <div ref={group} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-2 px-4" {...{ [marker]: '' }}>
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="radio"
          aria-checked={item.selected}
          aria-label={item.label}
          tabIndex={index === tabbable ? 0 : -1}
          data-index={index}
          onClick={item.onSelect}
          className="grid place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            minWidth: size,
            minHeight: size,
            outlineColor: 'var(--accent)',
            border: item.selected ? '2px solid var(--accent)' : '2px solid transparent',
            padding: 2,
          }}
        >
          {item.content}
        </button>
      ))}
    </div>
  );
}

export function PickerSection({ title, children, marker }: { readonly title: string; readonly children: ReactNode; readonly marker: `data-${string}` }) {
  return (
    <section className="flex flex-col gap-2 pb-5" {...{ [marker]: '' }}>
      <h4 className="px-4 text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {title}
      </h4>
      {children}
    </section>
  );
}
