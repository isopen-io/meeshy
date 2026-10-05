import { useId } from 'react';

import type { GameVisibility } from '@meeshy/shared/types/game';
import { SHOWCASE_VISIBILITIES } from '@meeshy/shared/utils/game/trophies';

import { visibilityLabel } from '@/lib/view/game-copy-v2';

import { GAME_BRAND, GAME_INK } from './game-surface';

/**
 * LE CHOIX DE QUI VOIT (#5738, #9387, #9481) — trois niveaux résolus côté
 * serveur : tout le monde, mes amis, moi seul. Un groupe de boutons radio
 * natifs (clavier, lecteur d'écran) habillés en pastilles de 44 points.
 *
 * PENDANT L'ENREGISTREMENT, le choix est SUSPENDU sans être désactivé
 * (`aria-disabled`, et le clic ne change rien) : désactiver le bouton radio que
 * le clavier vient de cocher jetterait son focus au début de la page. Hors ligne,
 * il est désactivé pour de bon. La pastille entoure le focus clavier
 * (`[data-game-level-pill]`, `game.css`) : le bouton radio, lui, est masqué.
 *
 * Il ne décide rien : il pose le niveau choisi, que le geste (optimiste, avec
 * retour arrière) envoie. Le serveur reste maître : il plafonne (« caché de la
 * recherche » ne dépasse pas « amis ») et répond avec la valeur EFFECTIVE, que
 * l'écran relit. Le niveau affiché est donc toujours celui du bloc servi.
 */
export function GameVisibilityPicker({
  legend,
  value,
  disabled,
  busy = false,
  onChange,
}: {
  readonly legend: string;
  readonly value: GameVisibility['showcase'];
  readonly disabled: boolean;
  /** Un réglage part : le choix est suspendu, le focus reste où il est. */
  readonly busy?: boolean;
  readonly onChange: (level: GameVisibility['showcase']) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" data-game-visibility="">
      <legend className="text-caption font-semibold" style={{ color: GAME_INK }}>
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {SHOWCASE_VISIBILITIES.map((level) => {
          const selected = value === level;
          return (
            <label
              key={level}
              data-game-level-pill=""
              className="flex cursor-pointer items-center justify-center rounded-chip px-3 text-caption font-semibold has-[:disabled]:opacity-60"
              style={{
                minHeight: 44,
                minWidth: 44,
                color: selected ? GAME_BRAND : GAME_INK,
                backgroundColor: selected ? `color-mix(in srgb, ${GAME_BRAND} 18%, transparent)` : 'color-mix(in srgb, var(--color-ios-ink) 6%, transparent)',
                border: `1px solid ${selected ? GAME_BRAND : 'transparent'}`,
              }}
            >
              <input
                type="radio"
                name={name}
                value={level}
                checked={selected}
                disabled={disabled}
                aria-disabled={busy || undefined}
                onClick={(event) => {
                  if (busy) event.preventDefault();
                }}
                onChange={() => {
                  if (!busy) onChange(level);
                }}
                className="sr-only"
              />
              {visibilityLabel(level)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
