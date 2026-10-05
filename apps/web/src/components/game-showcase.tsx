import type { GameTrophiesBlock, GameVisibility } from '@meeshy/shared/types/game';

import { gameText } from '@/lib/view/game-copy';
import { awardedDate, trophyView } from '@/lib/view/game-copy-v2';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { GAME_ERROR, GAME_INK, GAME_INK_2, GameCard } from './game-surface';
import { GameTrophyShelf, type ShelfEntry } from './game-trophy-shelf';
import { GameVisibilityPicker } from './game-visibility-picker';

/**
 * LA VITRINE DE TROPHÉES (#9387, conception II.9) — coupes de ligue, de saison,
 * de Prestige et de Flamme, dans l'ordre que la personne a rangé (les clés
 * rangées d'abord, le reste du plus précieux au moins précieux : c'est
 * `trophies.order`, calculé par la loi, que l'écran PARCOURT sans le recalculer).
 *
 * Ranger = monter ou descendre d'un cran : deux boutons de 44 points par coupe,
 * pas un glisser-déposer que ni le clavier ni un lecteur d'écran ne savent faire.
 * Le geste est optimiste (l'ordre change tout de suite) avec retour arrière.
 *
 * Un trophée ne rapporte JAMAIS de points ni de Gloire : c'est un objet reçu à
 * un moment précis. La visibilité se règle ici (« amis » par défaut).
 */

export type GameShowcaseProps = {
  readonly trophies: GameTrophiesBlock;
  readonly visibility: GameVisibility['showcase'];
  readonly online: boolean;
  readonly savingOrder: boolean;
  readonly savingVisibility: boolean;
  readonly errors: { readonly order?: string | undefined; readonly visibility?: string | undefined };
  readonly onOrder: (order: readonly string[]) => void;
  readonly onVisibility: (level: GameVisibility['showcase']) => void;
};

/** L'ordre PARCOURU : les clés rangées qui existent, puis tout ce que l'ordre ne cite pas, dans l'ordre servi. */
export function shelfOrder(trophies: GameTrophiesBlock): readonly string[] {
  const owned = new Set(trophies.items.map((item) => item.key));
  const ordered = trophies.order.filter((key, index) => owned.has(key) && trophies.order.indexOf(key) === index);
  const rest = trophies.items.map((item) => item.key).filter((key) => !ordered.includes(key));
  return [...ordered, ...rest];
}

const moved = (order: readonly string[], index: number, delta: -1 | 1): readonly string[] => {
  const target = index + delta;
  if (target < 0 || target >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
};

export function GameShowcase(props: GameShowcaseProps) {
  const { trophies, visibility, online, savingOrder, savingVisibility, errors, onOrder, onVisibility } = props;
  const language = currentInterfaceLanguage();
  const awarded = new Map(trophies.items.map((item) => [item.key, item.awardedAt]));
  const order = shelfOrder(trophies).filter((key) => trophyView(key, language) !== null);

  const entries: ShelfEntry[] = order.flatMap((key, index) => {
    const view = trophyView(key, language);
    if (view === null) return [];
    const at = awarded.get(key);
    const button = (marker: string, delta: -1 | 1, label: string, glyph: string, disabled: boolean) => (
      <button
        type="button"
        {...{ [marker]: '' }}
        disabled={disabled || !online || savingOrder}
        aria-label={label}
        onClick={() => onOrder(moved(order, index, delta))}
        className="grid place-items-center rounded-chip text-body font-bold disabled:opacity-40"
        style={{ minHeight: 44, minWidth: 44, color: GAME_INK, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 7%, transparent)' }}
      >
        <span aria-hidden="true">{glyph}</span>
      </button>
    );
    return [
      {
        key,
        view,
        caption: at === undefined ? '' : gameText('game.showcase.awarded', { date: awardedDate(at, language) }),
        controls: (
          <div className="flex gap-1">
            {button('data-game-trophy-up', -1, gameText('game.showcase.move_up', { name: view.title }), '↑', index === 0)}
            {button('data-game-trophy-down', 1, gameText('game.showcase.move_down', { name: view.title }), '↓', index === order.length - 1)}
          </div>
        ),
      },
    ];
  });

  return (
    <>
      <GameCard id="game-showcase" labelledBy="game-showcase-title">
        <h2 id="game-showcase-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.showcase.title')} · {translateGamePlural(language, 'game.door.showcase.count', entries.length)}
        </h2>
        {entries.length === 0 ? (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.showcase.empty')}
          </p>
        ) : (
          <>
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              {gameText('game.showcase.order_hint')}
            </p>
            <GameTrophyShelf entries={entries} />
          </>
        )}
        {errors.order === undefined ? null : (
          <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
            {errors.order}
          </p>
        )}
        {online ? null : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.offline.action')}
          </p>
        )}
      </GameCard>

      <GameCard id="game-showcase-visibility" labelledBy="game-showcase-visibility-title">
        <h2 id="game-showcase-visibility-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.showcase.visibility')}
        </h2>
        <GameVisibilityPicker legend={gameText('game.visibility.field.showcase')} value={visibility} disabled={!online || savingVisibility} onChange={onVisibility} />
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.showcase.visibility_hint')}
        </p>
        {errors.visibility === undefined ? null : (
          <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
            {errors.visibility}
          </p>
        )}
        {savingVisibility ? (
          <p role="status" className="text-check" style={{ color: GAME_INK_2 }}>
            {gameText('game.visibility.saving')}
          </p>
        ) : null}
      </GameCard>
    </>
  );
}
