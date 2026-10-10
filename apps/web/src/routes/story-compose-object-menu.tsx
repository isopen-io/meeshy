import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

import { studioMenuFrame } from '@/lib/stories/studio-scene-menu';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

export type StudioObjectAction = {
  readonly id: string;
  readonly label: string;
  readonly destructive?: boolean;
  /** Le glyphe devant le verbe (#8717, `ComposerSceneContextMenu`). */
  readonly glyph?: ReactNode;
  readonly onSelect: () => void;
};

const WIDTH = 250;
const MARGIN = 12;
const ROW = 44;
const TITLE = 32;

/**
 * **LE MENU D'UN OBJET OU DU FOND** (lot 6 — appui long, clic droit au
 * bureau ; #8716 / #8717) — un menu de VERRE (`glass-prominent`, le pendant
 * web de `adaptiveGlass` : flou d'arrière-plan, repli opaque quand le moteur
 * ne le sert pas), posé comme iOS le pose (`ComposerSceneMenu.frame`) :
 * centré sur le doigt, sous lui s'il tient, au-dessus sinon, toujours dans
 * l'écran. Chaque ligne : un glyphe et un verbe ; la seule entrée qui détruit
 * se peint en couleur d'erreur. Seules les actions qui ont un effet sont
 * offertes (l'hôte les compose).
 *
 * Échap, le retour matériel ou un appui HORS du menu le referment — lui seul,
 * jamais la plaque ouverte dessous (#8517) ; le focus entre sur la première
 * action, les flèches le déplacent.
 */
export function StudioObjectMenu({
  label,
  title,
  point,
  actions,
  onClose,
}: {
  readonly label: string;
  /** Un en-tête lisible (« Fond de la scène ») — absent pour un objet. */
  readonly title?: string;
  readonly point: { readonly x: number; readonly y: number };
  readonly actions: readonly StudioObjectAction[];
  readonly onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  useBackDismiss(onClose, { escape: true });

  useLayoutEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onDown = (event: PointerEvent) => {
      if (menuRef.current !== null && event.target instanceof Node && !menuRef.current.contains(event.target)) onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (actions.length === 0) onClose();
  }, [actions.length, onClose]);

  const frame = studioMenuFrame({
    anchor: point,
    menu: { width: WIDTH, height: actions.length * ROW + 12 + (title !== undefined ? TITLE : 0) },
    container: { width: window.innerWidth, height: window.innerHeight },
    margin: MARGIN,
  });

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
      className="glass-prominent fixed z-50 flex flex-col overflow-y-auto rounded-[20px] py-1.5 shadow-lg"
      style={{ left: frame.x, top: frame.y, width: frame.width, maxHeight: frame.height }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        move(event.target as HTMLElement, event.key === 'ArrowDown' ? 1 : -1);
      }}
    >
      {title !== undefined ? (
        <p aria-hidden="true" className="px-4 pt-1.5 pb-1 text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
          {title}
        </p>
      ) : null}
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
          className="flex shrink-0 items-center gap-3 px-4 text-start text-body focus-visible:outline-2 focus-visible:-outline-offset-2"
          style={{ minHeight: ROW, color: action.destructive === true ? 'var(--color-error)' : 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
        >
          {action.glyph !== undefined ? (
            <span aria-hidden="true" className="grid w-6 shrink-0 place-items-center">
              {action.glyph}
            </span>
          ) : null}
          {action.label}
        </button>
      ))}
    </div>
  );
}
