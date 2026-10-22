import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { AUTHOR_MESSAGE_MAX_GRAPHEMES, authorMessageGraphemes, authorMessageOf } from '@/lib/game-photo/author-message';
import { gameText } from '@/lib/view/game-copy';

import { GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * LE CHAMP DU MESSAGE DE L'AUTEUR (#10165, L12, § 5.14 du prompt des Cadres
 * de gloire) — sur l'écran de résultat, sous l'image, pour un cadre qui a un
 * SUPPORT (cartouche, ruban, parchemin). Une ligne, ≤ 60 graphèmes comptés
 * par la loi (`author-message.ts`), un compteur, aucun texte par défaut ;
 * `dir="auto"` laisse chaque écriture s'afficher dans son sens.
 *
 * Le champ garde la frappe en local et ne REMET le message au déroulé qu'à
 * l'arrêt de la frappe (`COMMIT_MS`), à Entrée ou à la sortie du champ : chaque
 * remise recompose l'image finale (1080×1920), pas chaque lettre. Un `<input>`
 * : ce qui s'y tape n'est jamais interprété.
 */
export type GamePhotoMessageFieldProps = {
  /** Le message en vigueur dans le déroulé ; `null` : aucun. */
  readonly message: string | null;
  readonly onCommit: (message: string | null) => void;
};

const COMMIT_MS = 400;

export function GamePhotoMessageField({ message, onCommit }: GamePhotoMessageFieldProps) {
  const [draft, setDraft] = useState(message ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(message);
  /* Le déroulé a changé le message sans nous (un cadre repris, une reprise du carnet) : le champ le montre. */
  useEffect(() => {
    if (message !== committed.current) {
      committed.current = message;
      setDraft(message ?? '');
    }
  }, [message]);

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  const commit = (raw: string) => {
    cancel();
    const next = authorMessageOf(raw);
    if (next === committed.current) return;
    committed.current = next;
    onCommit(next);
  };

  const onInput = (raw: string) => {
    const bounded = authorMessageOf(raw);
    /* La borne se voit en tapant : au-delà de 60 graphèmes, rien ne s'ajoute ; les espaces intérieurs restent le temps de la frappe. */
    const shown = bounded !== null && authorMessageGraphemes(raw) > AUTHOR_MESSAGE_MAX_GRAPHEMES ? bounded : raw.replace(/[\r\n\t]+/g, ' ');
    setDraft(shown);
    cancel();
    timer.current = setTimeout(() => commit(shown), COMMIT_MS);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commit(draft);
  };

  const count = authorMessageGraphemes(authorMessageOf(draft) ?? '');
  return (
    <label className="flex flex-col gap-1" data-photo-message-field="">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-caption font-semibold" style={{ color: GAME_INK_2 }}>
          {gameText('game.photo.message.label')}
        </span>
        <span data-photo-message-count="" className="text-check tabular-nums" style={{ color: GAME_INK_2 }} aria-live="polite">
          {gameText('game.photo.message.count', { count: String(count), max: String(AUTHOR_MESSAGE_MAX_GRAPHEMES) })}
        </span>
      </span>
      <input
        type="text"
        data-photo-message=""
        value={draft}
        dir="auto"
        autoComplete="off"
        enterKeyHint="done"
        inputMode="text"
        aria-label={gameText('game.photo.message.label')}
        onInput={(event) => onInput(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        className="rounded-chip px-4 text-body"
        style={{ minHeight: 44, color: GAME_INK, backgroundColor: 'var(--color-ios-fill)' }}
      />
    </label>
  );
}
