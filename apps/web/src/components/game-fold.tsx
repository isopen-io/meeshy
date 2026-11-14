import { useState, type ReactNode } from 'react';

import { GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * UNE RANGÉE QUI SE DÉPLIE (épure #17584, règle 6) — le carnet des règles ne
 * déroule plus tout à la suite : chaque concept, chaque famille dessinée, la
 * section des médailles et les sept cartes sont une rangée repliée, et UNE
 * seule est ouverte à la fois (`useOneOpen`).
 *
 * Replié ne veut pas dire absent : le panneau reste dans le document (`hidden`),
 * donc atteignable par le bouton — et le bouton est le seul contrôle, nommé par
 * la rangée, avec `aria-expanded` et `aria-controls`.
 */
export type OneOpen = {
  readonly isOpen: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  readonly open: (id: string) => void;
};

export function useOneOpen(initial: string | null = null): OneOpen {
  const [openId, setOpenId] = useState<string | null>(initial);
  return {
    isOpen: (id) => openId === id,
    toggle: (id) => setOpenId((current) => (current === id ? null : id)),
    open: (id) => setOpenId(id),
  };
}

export function GameFold({
  id,
  open,
  onToggle,
  level = 3,
  headingId,
  lead,
  title,
  className,
  children,
}: {
  readonly id: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly level?: 2 | 3;
  readonly headingId?: string;
  /** Ce qui précède le nom dans la rangée (l'oiseau qui parle, un dessin décoratif). */
  readonly lead?: ReactNode;
  readonly title: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  const panel = `${id}-panel`;
  return (
    <div data-game-fold={id} className={className}>
      <Heading {...(headingId === undefined ? {} : { id: headingId })} className="text-body font-bold" style={{ color: GAME_INK }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={onToggle}
          className="flex w-full items-center gap-2 text-start"
          style={{ minHeight: 44 }}
        >
          {lead}
          <span className="min-w-0 flex-1">{title}</span>
          <span aria-hidden="true" className="shrink-0" style={{ color: GAME_INK_2 }}>
            {open ? '−' : '+'}
          </span>
        </button>
      </Heading>
      <div id={panel} hidden={!open} className="flex flex-col gap-3 pb-2">
        {children}
      </div>
    </div>
  );
}
