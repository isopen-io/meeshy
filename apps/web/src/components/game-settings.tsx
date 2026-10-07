import type { GameLeagueBlock, GameVisibility } from '@meeshy/shared/types/game';
import { ATLAS_DEFAULT_VISIBILITY, SHOWCASE_DEFAULT_VISIBILITY } from '@meeshy/shared/utils/game/trophies';

import type { GameDevicePrefs } from '@/lib/game/preferences';
import { gameText } from '@/lib/view/game-copy';

import { GAME_ERROR, GAME_INK, GAME_INK_2, GameCard } from './game-surface';
import { GameVisibilityPicker } from './game-visibility-picker';

/**
 * LES RÉGLAGES DU JEU (#9481) — un seul écran pour ce que le jeu laisse
 * choisir : les célébrations de Mee et Meo, les notifications du jeu (#9490), le mode « Jeu masqué », qui voit
 * quoi (rang, trésor, vitrine, Atlas — #5738), la ligue publique (consentement
 * et pseudonyme). Aucun lien transverse (carte de navigation, #9563, amendement
 * n° 4) : les règles et le carnet sont des portes de Progression, et la ligue se
 * rejoint depuis sa fiche — un écran du jeu n'a qu'un parent.
 *
 * **« Jeu masqué » est un geste composé, et il le dit.** Il masque le jeu sur le
 * compte (`PUT /me/game/privacy` ; `gamePrefs.hidden` n'en est que la copie du
 * dernier état connu), ferme les quatre visibilités à « moi seul » et retire la
 * personne de la ligue publique (conformité A-7, D-2). Le réafficher ne rouvre
 * RIEN des visibilités : l'écran le dit, la personne rouvre ce qu'elle veut, un
 * réglage à la fois. Défaut sûr : on ne devine jamais ce qu'elle aurait choisi
 * d'ouvrir. Dans les deux sens le geste exige le réseau : le serveur fait foi.
 *
 * Les valeurs par défaut quand le serveur ne les sert pas encore sont les PLUS
 * FERMÉES de la loi : « amis » (rang, trésor, vitrine) et « moi seul » (Atlas).
 */
export type GameSettingsProps = {
  readonly prefs: GameDevicePrefs;
  readonly visibility: GameVisibility | undefined;
  readonly league: GameLeagueBlock | undefined;
  readonly online: boolean;
  readonly savingVisibility: boolean;
  readonly leavingLeague: boolean;
  readonly errors: { readonly visibility?: string | undefined; readonly league?: string | undefined; readonly notifications?: string | undefined };
  /**
   * L'interrupteur « Notifications du jeu » (#9490) — `notification.gameEnabled`, la préférence du COMPTE. `undefined` :
   * pas encore lu (il attend, désactivé). Le branchement (`onGameNotifications`) est facultatif : sans lui, pas de carte.
   */
  readonly gameNotifications?: boolean | undefined;
  readonly onGameNotifications?: ((on: boolean) => void) | undefined;
  readonly onCelebrations: (on: boolean) => void;
  readonly onHidden: (on: boolean) => void;
  readonly onVisibility: (patch: Partial<GameVisibility>) => void;
  readonly onLeaveLeague: () => void;
};

const FIELDS = ['rank', 'treasury', 'showcase', 'atlas'] as const;

const DEFAULT_LEVEL: Readonly<Record<(typeof FIELDS)[number], GameVisibility['showcase']>> = {
  rank: 'friends',
  treasury: 'friends',
  showcase: SHOWCASE_DEFAULT_VISIBILITY,
  atlas: ATLAS_DEFAULT_VISIBILITY,
};

function SwitchRow({ marker, label, checked, disabled, onChange }: { readonly marker: string; readonly label: string; readonly checked: boolean; readonly disabled?: boolean; readonly onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-chip px-1 has-[:disabled]:opacity-60" style={{ minHeight: 44 }}>
      <span className="min-w-0 break-words text-body font-semibold" style={{ color: GAME_INK }}>
        {label}
      </span>
      <input
        type="checkbox"
        role="switch"
        {...{ [marker]: '' }}
        checked={checked}
        disabled={disabled === true}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="size-6 shrink-0 accent-[var(--color-ios-brand)]"
      />
    </label>
  );
}

export function GameSettings(props: GameSettingsProps) {
  const { prefs, visibility, league, online, savingVisibility, leavingLeague, errors } = props;
  const inLeague = league?.access === 'open';
  return (
    <>
      <GameCard id="game-settings-celebrations" labelledBy="game-settings-celebrations-title">
        <h2 id="game-settings-celebrations-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.settings.celebrations.title')}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.settings.celebrations.body')}
        </p>
        <SwitchRow marker="data-game-setting-celebrations" label={gameText('game.settings.celebrations.switch')} checked={prefs.celebrations} onChange={props.onCelebrations} />
      </GameCard>

      <GameCard id="game-settings-hidden" labelledBy="game-settings-hidden-title">
        <h2 id="game-settings-hidden-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.settings.hidden.title')}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.settings.hidden.body')}
        </p>
        <SwitchRow marker="data-game-setting-hidden" label={gameText('game.settings.hidden.switch')} checked={prefs.hidden} disabled={!online} onChange={props.onHidden} />
        {prefs.hidden ? (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.settings.hidden.reopen_note')}
          </p>
        ) : null}
        {online ? null : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.offline.action')}
          </p>
        )}
      </GameCard>

      {props.onGameNotifications === undefined ? null : (
        <GameCard id="game-settings-notifications" labelledBy="game-settings-notifications-title">
          <h2 id="game-settings-notifications-title" className="text-body font-bold" style={{ color: GAME_INK }}>
            {gameText('game.settings.notifications.title')}
          </h2>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.settings.notifications.body')}
          </p>
          <SwitchRow
            marker="data-game-setting-notifications"
            label={gameText('game.settings.notifications.switch')}
            checked={props.gameNotifications ?? true}
            disabled={!online || props.gameNotifications === undefined}
            onChange={props.onGameNotifications}
          />
          {errors.notifications === undefined ? null : (
            <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
              {errors.notifications}
            </p>
          )}
        </GameCard>
      )}

      {visibility === undefined ? null : (
        <GameCard id="game-settings-visibility" labelledBy="game-settings-visibility-title">
          <h2 id="game-settings-visibility-title" className="text-body font-bold" style={{ color: GAME_INK }}>
            {gameText('game.settings.visibility.title')}
          </h2>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.settings.visibility.body')}
          </p>
          {FIELDS.map((field) => (
            <GameVisibilityPicker
              key={field}
              legend={gameText(`game.visibility.field.${field}`)}
              value={visibility[field] ?? DEFAULT_LEVEL[field]}
              disabled={!online}
              busy={savingVisibility}
              onChange={(level) => props.onVisibility({ [field]: level })}
            />
          ))}
          {errors.visibility === undefined ? null : (
            <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
              {errors.visibility}
            </p>
          )}
        </GameCard>
      )}

      {league === undefined ? null : (
        <GameCard id="game-settings-league" labelledBy="game-settings-league-title">
          <h2 id="game-settings-league-title" className="text-body font-bold" style={{ color: GAME_INK }}>
            {gameText('game.settings.league.title')}
          </h2>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {inLeague
              ? league.pseudonym === null
                ? gameText('game.settings.league.on_unnamed')
                : gameText('game.settings.league.on', { name: league.pseudonym })
              : gameText('game.settings.league.off')}
          </p>
          {inLeague ? (
            <button
              type="button"
              data-game-setting-league-leave=""
              disabled={!online || leavingLeague}
              aria-busy={leavingLeague}
              onClick={props.onLeaveLeague}
              className="rounded-chip px-4 text-body font-semibold disabled:opacity-60"
              style={{ minHeight: 44, color: GAME_ERROR }}
            >
              {gameText('game.league.consent.leave')}
            </button>
          ) : null}
          {errors.league === undefined ? null : (
            <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
              {errors.league}
            </p>
          )}
        </GameCard>
      )}

    </>
  );
}
