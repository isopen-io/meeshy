import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { memo } from 'react';

import { Avatar } from '@/components/avatar';
import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALLS_GLYPHS } from '@/components/glyphs-calls';
import type { PersonSummary } from '@/lib/api/friend-requests';
import type { CallMedia } from '@/lib/calls/call-store';
import { KEYPAD_KEYS } from '@/lib/calls/keypad';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DU PAVÉ** (#6454) — miroir de `KeypadTab.swift` : le champ
 * « Numéro ou nom » et son effacement, la zone de résultats (repos, recherche,
 * résultats, aucun résultat, erreur, hors ligne), puis le pavé de douze
 * touches. Chaque pièce est PURE (`routes/calls-keypad.test.tsx`).
 *
 * **La présence n'y paraît pas.** iOS écrit « en ligne » à côté d'un résultat
 * quand la passerelle le sert ; ici, le décodeur de la recherche l'écarte
 * (`decodePerson`) : une personne trouvée par son numéro n'est en général pas
 * une amie, et la loi de visibilité (`resolvePresenceVisibility`) ne sert sa
 * présence qu'aux amis — le pavé ne peint donc rien qu'il ne puisse montrer à
 * tous, et rien n'entre dans le cache persisté.
 */

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';
const EDGE = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)';

export function KeypadHeader({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: 64 }}>
      <Link
        to="calls"
        aria-label={translate(language, 'pending.back')}
        data-keypad-back
        className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'keypad.title')}
      </h1>
    </header>
  );
}

export function KeypadField({
  language,
  value,
  onChange,
  onDelete,
  onClear,
}: {
  readonly language: InterfaceLanguage;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onDelete: () => void;
  readonly onClear: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
      <input
        type="text"
        data-keypad-input
        value={value}
        onInput={(event) => onChange((event.currentTarget as HTMLInputElement).value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClear();
        }}
        placeholder={translate(language, 'keypad.input.placeholder')}
        aria-label={translate(language, 'keypad.input.label')}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="min-h-12 min-w-0 flex-1 rounded-card bg-transparent px-3 text-center text-screen font-semibold tabular-nums outline-none focus-visible:outline-2"
        style={{ color: INK, outlineColor: BRAND, backgroundColor: 'var(--color-ios-card)' }}
      />
      {value === '' ? null : (
        <button
          type="button"
          data-keypad-delete
          aria-label={translate(language, 'keypad.delete')}
          onClick={onDelete}
          onContextMenu={(event) => {
            event.preventDefault();
            onClear();
          }}
          className="grid size-12 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: INK_2, outlineColor: BRAND }}
        >
          <GlyphSvg glyph={CALLS_GLYPHS.backspace} size={22} />
        </button>
      )}
    </div>
  );
}

export function KeypadPad({ onKey }: { readonly onKey: (digit: string) => void }) {
  return (
    <div data-keypad-pad className="mx-auto grid w-full max-w-xs shrink-0 grid-cols-3 gap-2 px-6 pb-4 pt-2">
      {KEYPAD_KEYS.map((key) => (
        <button
          key={key.digit}
          type="button"
          data-keypad-key={key.digit}
          aria-label={key.digit}
          onClick={() => onKey(key.digit)}
          className="mx-auto grid size-14 place-items-center rounded-full leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ backgroundColor: 'var(--color-ios-card)', color: INK, outlineColor: BRAND }}
        >
          <span aria-hidden="true" className="grid justify-items-center gap-0.5">
            <span className="text-screen font-medium">{key.digit}</span>
            {key.letters === '' ? null : (
              <span className="text-[9px] font-semibold tracking-widest" style={{ color: INK_2 }}>
                {key.letters}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export type KeypadStatus = 'idle' | 'searching' | 'none' | 'error' | 'offline';

const STATUS_COPY: Readonly<Record<KeypadStatus, readonly ['keypad.prompt.title' | 'keypad.searching' | 'keypad.noMatch.title' | 'keypad.error.title' | 'keypad.offline.title', 'keypad.prompt.subtitle' | 'keypad.noMatch.subtitle' | 'keypad.error.body' | 'keypad.offline.body' | null]>> = {
  idle: ['keypad.prompt.title', 'keypad.prompt.subtitle'],
  searching: ['keypad.searching', null],
  none: ['keypad.noMatch.title', 'keypad.noMatch.subtitle'],
  error: ['keypad.error.title', 'keypad.error.body'],
  offline: ['keypad.offline.title', 'keypad.offline.body'],
};

export function KeypadStatusView({ language, status, onRetry }: { readonly language: InterfaceLanguage; readonly status: KeypadStatus; readonly onRetry: () => void }) {
  const [title, body] = STATUS_COPY[status];
  return (
    <div
      role={status === 'error' ? 'alert' : 'status'}
      data-keypad-status={status}
      className="grid flex-1 content-center justify-items-center gap-2 px-6 py-6 text-center"
    >
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, title)}
      </p>
      {body === null ? null : (
        <p className="text-caption" style={{ color: INK_2 }}>
          {translate(language, body)}
        </p>
      )}
      {status === 'error' ? (
        <button
          type="button"
          data-keypad-retry
          onClick={onRetry}
          className="mt-1 grid place-items-center rounded-chip px-5 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ backgroundColor: 'var(--ios-indigo-600)', minHeight: 44, outlineColor: BRAND }}
        >
          {translate(language, 'keypad.retry')}
        </button>
      ) : null}
    </div>
  );
}

const personName = (person: PersonSummary): string => person.displayName ?? person.username;

export const KeypadResult = memo(function KeypadResult({
  language,
  person,
  onCall,
}: {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  readonly onCall: (person: PersonSummary, media: CallMedia) => void;
}) {
  const name = personName(person);
  return (
    <li data-keypad-result={person.id} className="flex items-center" style={{ borderBottom: EDGE }}>
      <Link
        to="userProfile"
        params={{ username: person.username }}
        data-keypad-profile
        aria-label={`${name}, @${person.username}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 pr-2 focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ outlineColor: BRAND }}
      >
        <Avatar initials={initialsOf(name)} color={colorForName(name)} size={40} {...(person.avatar === null ? {} : { src: person.avatar })} />
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-body font-semibold" style={{ color: INK }}>
            {name}
          </span>
          <span className="truncate text-caption" style={{ color: INK_2 }}>
            @{person.username}
          </span>
        </span>
      </Link>
      {(['audio', 'video'] as const).map((media) => (
        <button
          key={media}
          type="button"
          data-keypad-call={media}
          aria-label={translate(language, media === 'video' ? 'keypad.call.video.named' : 'keypad.call.audio.named', { name })}
          onClick={() => onCall(person, media)}
          className="grid size-11 shrink-0 place-items-center rounded-full last:mr-3 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: BRAND, outlineColor: BRAND }}
        >
          {media === 'video' ? <GlyphSvg glyph={CALLS_GLYPHS.videoCamera} size={20} /> : <Glyph name="phone" size={20} />}
        </button>
      ))}
    </li>
  );
});

export function KeypadCallFailed({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <p role="alert" data-keypad-call-failed className="px-4 py-2 text-center text-caption font-medium" style={{ color: 'var(--color-error)' }}>
      {translate(language, 'keypad.call.failed')}
    </p>
  );
}
