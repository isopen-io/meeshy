import { useState } from 'react';

import { LEAGUE_PSEUDONYM_MAX, isValidLeaguePseudonym } from '@meeshy/shared/utils/game/league';

import { gameText } from '@/lib/view/game-copy';

import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2, GameCard } from './game-surface';

/**
 * LE CONSENTEMENT À LA LIGUE PUBLIQUE (#9384, conformité A-1 et A-2) — la
 * notice COMPLÈTE avant le geste : ce qui est montré, à qui, comment on est
 * placé, le risque qui reste, et comment se retirer. Un consentement qu'on
 * donne sans avoir lu ce qui précède n'en est pas un (RGPD art. 4(11), 13).
 *
 * Le pseudonyme est FACULTATIF : laissé vide, la passerelle en tire un au sort
 * (jamais calculé depuis le compte). Choisi, il est vérifié ici sur sa forme
 * (`isValidLeaguePseudonym`) avant l'envoi ; la passerelle seule dit s'il est
 * pris ou interdit (noms réservés, nom d'utilisateur, nom civil).
 */

export const PSEUDONYM_FIELD_ID = 'game-league-pseudonym';

export function PseudonymField({
  initial = '',
  busy,
  error,
  submitLabel,
  onSubmit,
  allowEmpty,
  label,
  hint,
}: {
  readonly initial?: string;
  readonly busy: boolean;
  readonly error?: string | undefined;
  readonly submitLabel: string;
  readonly onSubmit: (value: string) => void;
  /** Vide permis (le consentement : un pseudonyme est alors tiré) ; refusé au changement de pseudonyme. */
  readonly allowEmpty: boolean;
  readonly label: string;
  readonly hint: string;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && !isValidLeaguePseudonym(trimmed);
  const submittable = !busy && !invalid && (allowEmpty || trimmed.length > 0);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (submittable) onSubmit(trimmed);
      }}
    >
      <label htmlFor={PSEUDONYM_FIELD_ID} className="text-caption font-semibold" style={{ color: GAME_INK }}>
        {label}
      </label>
      <input
        id={PSEUDONYM_FIELD_ID}
        type="text"
        value={value}
        maxLength={LEAGUE_PSEUDONYM_MAX}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-describedby={`${PSEUDONYM_FIELD_ID}-hint`}
        aria-invalid={invalid || error !== undefined}
        onInput={(event) => setValue(event.currentTarget.value)}
        className="rounded-chip px-3 text-body"
        style={{ minHeight: 44, color: GAME_INK, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 6%, transparent)' }}
      />
      <p id={`${PSEUDONYM_FIELD_ID}-hint`} className="text-caption" style={{ color: GAME_INK_2 }}>
        {hint}
      </p>
      {invalid ? (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {gameText('game.league.pseudonym.invalid')}
        </p>
      ) : null}
      {error === undefined ? null : (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        data-game-pseudonym-submit=""
        disabled={!submittable}
        aria-busy={busy}
        className="rounded-chip px-4 text-body font-bold disabled:opacity-60"
        style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: 'var(--color-on-state)' }}
      >
        {submitLabel}
      </button>
    </form>
  );
}

export function GameLeagueConsent({
  online,
  busy,
  error,
  onAccept,
}: {
  readonly online: boolean;
  readonly busy: boolean;
  readonly error?: string | undefined;
  readonly onAccept: (pseudonym: string | undefined) => void;
}) {
  return (
    <GameCard id="game-league-consent" labelledBy="game-league-consent-title">
      <h2 id="game-league-consent-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.league.consent.title')}
      </h2>
      <ul className="flex flex-col gap-1.5 text-caption" style={{ color: GAME_INK_2 }}>
        <li>{gameText('game.league.consent.shown')}</li>
        <li>{gameText('game.league.consent.who')}</li>
        <li>{gameText('game.league.consent.how')}</li>
        <li>{gameText('game.league.consent.risk')}</li>
        <li>{gameText('game.league.consent.withdraw_info')}</li>
      </ul>
      <PseudonymField
        allowEmpty
        label={gameText('game.league.pseudonym.label')}
        hint={gameText('game.league.pseudonym.hint')}
        busy={busy || !online}
        error={error}
        submitLabel={gameText('game.league.consent.accept')}
        onSubmit={(value) => onAccept(value.length === 0 ? undefined : value)}
      />
      {online ? null : (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.offline.action')}
        </p>
      )}
    </GameCard>
  );
}
