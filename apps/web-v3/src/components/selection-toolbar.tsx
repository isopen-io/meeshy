import { useEffect, useRef } from 'react';

/**
 * LA BARRE DE SÉLECTION (#5814, question 5) — REMPLACE le composeur, jamais
 * un second bandeau (miroir `ConversationView.swift:1986`). Mode MINIMAL :
 * Annuler · « N sélectionnés » (≥ 2 seulement, miroir `SelectionToolbar`
 * iOS) · Copier. Transférer/Supprimer restent une issue compagnon — aucun
 * transport serveur ce lot (loi 4, un contrôle existe s'il a un effet).
 */
export function SelectionToolbar({
  count,
  onEnd,
  onCopy,
}: {
  readonly count: number;
  readonly onEnd: () => void;
  readonly onCopy: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  /**
   * « SÉLECTIONNER » MET LE FOCUS SUR CETTE BARRE (revue #5814, défaut
   * majeur 8) — `useMessageMenu.onMenuAction('select')` pose
   * `focusTakenRef.current = true` sur la PROMESSE que quelqu'un prend le
   * focus ; mesuré, `document.activeElement` valait BODY après ce geste.
   * Cette barre REMPLACE le composeur exactement quand la sélection
   * démarre (`thread.tsx`, `messageMenu.selection !== null`) : elle MONTE
   * une seule fois par entrée en sélection, donc un effet de montage suffit
   * — pas de coche de rangée à référencer (les rangées sont virtualisées,
   * une réf y survivrait moins sûrement qu'un bouton de la barre elle-même).
   * « Annuler » est le premier contrôle, le plus sûr : il ramène toujours à
   * un état connu, quoi que le lecteur fasse ensuite.
   */
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      role="toolbar"
      aria-label="Sélection de messages"
      className="flex shrink-0 items-center gap-2 border-t px-3 py-2"
      style={{ borderColor: 'var(--color-edge)', backgroundColor: 'var(--color-ios-surface)' }}
    >
      <button
        ref={cancelRef}
        type="button"
        onClick={onEnd}
        className="grid place-items-center rounded-chip px-3 text-body font-semibold"
        style={{ minHeight: 44, color: 'var(--accent)' }}
      >
        Annuler
      </button>
      <span className="flex-1 text-center text-body font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
        {count >= 2 ? `${count} sélectionnés` : ''}
      </span>
      <button
        type="button"
        onClick={onCopy}
        disabled={count === 0}
        className="grid place-items-center rounded-chip px-3 text-body font-semibold disabled:opacity-40"
        style={{ minHeight: 44, color: 'var(--accent)' }}
      >
        Copier
      </button>
    </div>
  );
}
