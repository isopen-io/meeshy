import { useEffect, useLayoutEffect, useRef } from 'react';

export type StudioObjectAction = { readonly id: string; readonly label: string; readonly destructive?: boolean; readonly onSelect: () => void };

const WIDTH = 220;
const MARGIN = 12;
const ROW = 44;

/**
 * **LE MENU D'UN OBJET** (lot 6 — appui long, clic droit au bureau) — un menu
 * de verre posé AU DOIGT, borné à l'écran : monter, reculer, dupliquer,
 * modifier, retirer (« sortir de la scène » pour un média hors story). Seules
 * les actions qui ont un effet sont offertes (l'hôte les compose).
 *
 * Échap ou un appui HORS du menu le referment ; le focus entre sur la
 * première action, les flèches le déplacent.
 */
export function StudioObjectMenu({
  label,
  point,
  actions,
  onClose,
}: {
  readonly label: string;
  readonly point: { readonly x: number; readonly y: number };
  readonly actions: readonly StudioObjectAction[];
  readonly onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onDown = (event: PointerEvent) => {
      if (menuRef.current !== null && event.target instanceof Node && !menuRef.current.contains(event.target)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (actions.length === 0) onClose();
  }, [actions.length, onClose]);

  const height = actions.length * ROW + 12;
  const left = Math.max(MARGIN, Math.min(point.x, window.innerWidth - WIDTH - MARGIN));
  const top = Math.max(MARGIN, Math.min(point.y, window.innerHeight - height - MARGIN));

  const move = (from: HTMLElement, step: 1 | -1) => {
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = buttons.indexOf(from as HTMLButtonElement);
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      data-story-object-menu
      className="glass-prominent fixed z-50 flex flex-col overflow-hidden rounded-[20px] py-1.5 shadow-lg"
      style={{ left, top, width: WIDTH }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        move(event.target as HTMLElement, event.key === 'ArrowDown' ? 1 : -1);
      }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          data-story-object-action={action.id}
          onClick={() => {
            onClose();
            action.onSelect();
          }}
          className="px-4 text-start text-body focus-visible:outline-2 focus-visible:-outline-offset-2"
          style={{ minHeight: ROW, color: action.destructive === true ? 'var(--color-error)' : 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
