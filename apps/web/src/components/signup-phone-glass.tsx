import { useRef, type Ref } from 'react';

import { Glyph } from '@/components/glyph';
import { InfoHintButton, InfoHintText, type InfoHint, type InfoHintState } from '@/components/info-hint';
import { countryName, type Country } from '@/lib/countries';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { prefersReducedMotion } from '@/lib/view/effects-runner';
import { playTypingWave } from '@/lib/view/typing-wave';

/**
 * PHASE 1 DE L'INSCRIPTION — LE TÉLÉPHONE, EN VERRE LIQUIDE (#8288).
 *
 * Le numéro vient d'abord, dans une barre de verre qui ONDULE À LA FRAPPE,
 * comme la barre du composeur universel iOS (`typing-wave.ts`). Le pays se
 * choisit dans la barre même ; un lien discret, « Continuer avec l'e-mail
 * seulement », passe le numéro (décision porteur 2026-09-27) — il disparaît
 * une fois l'adresse parue : il n'y a plus rien à passer.
 *
 * Jamais annoncé « facultatif » (#6582) : le lien le dit par le geste.
 */
export function SignupPhoneGlass({
  language,
  locale,
  country,
  phoneDigits,
  onPhoneDigits,
  onOpenCountry,
  onSkip,
  showsSkip,
  focused,
  onFocus,
  onBlur,
  error,
  hint,
  hintState,
  inputRef,
}: {
  readonly language: InterfaceLanguage;
  readonly locale: string;
  readonly country: Country;
  readonly phoneDigits: string;
  readonly onPhoneDigits: (value: string) => void;
  readonly onOpenCountry: () => void;
  readonly onSkip: () => void;
  readonly showsSkip: boolean;
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly error: string | undefined;
  readonly hint: InfoHint;
  readonly hintState: InfoHintState;
  readonly inputRef: Ref<HTMLInputElement>;
}) {
  const glass = useRef<HTMLDivElement>(null);
  return (
    <div className="grid gap-2">
      <label htmlFor="signup-phone" className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
        Téléphone
      </label>
      <div
        ref={glass}
        data-signup-phone-glass
        className="glass glass-card flex items-center gap-1 rounded-[22px] ps-1.5 pe-3"
        style={{
          minHeight: 56,
          border: `1px solid ${focused ? 'color-mix(in srgb, var(--ios-indigo-500) 60%, transparent)' : 'color-mix(in srgb, var(--color-ios-ink) 12%, transparent)'}`,
          boxShadow: focused
            ? '0 0 0 4px color-mix(in srgb, var(--ios-indigo-500) 14%, transparent), 0 10px 30px color-mix(in srgb, var(--color-ios-ink) 12%, transparent)'
            : '0 8px 24px color-mix(in srgb, var(--color-ios-ink) 8%, transparent)',
          transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
          transformOrigin: 'center',
          willChange: 'transform',
        }}
      >
        <button
          type="button"
          data-signup-country
          onClick={onOpenCountry}
          className="flex items-center gap-1.5 rounded-[18px] px-3"
          style={{ minHeight: 44 }}
          aria-label={`Pays : ${countryName(country, locale)}, ${country.dialCode}`}
        >
          <span aria-hidden="true">{country.flag}</span>
          <span className="text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
            {country.dialCode}
          </span>
          <Glyph name="caretDown" size={14} style={{ color: 'var(--color-ios-ink-3)' }} />
        </button>
        <span aria-hidden="true" className="h-6 w-px" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 35%, transparent)' }} />
        <input
          ref={inputRef}
          id="signup-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={phoneDigits}
          onInput={(event) => {
            onPhoneDigits(event.currentTarget.value);
            playTypingWave(glass.current, { reducedMotion: prefersReducedMotion });
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="Numéro de téléphone"
          className="min-w-0 flex-1 bg-transparent py-3 ps-2 text-input outline-none"
          style={{ color: 'var(--color-ios-ink)' }}
          aria-describedby="signup-phone-hint"
          aria-invalid={error !== undefined}
        />
        <InfoHintButton hint={hint} state={hintState} style={{ marginRight: -10 }} />
      </div>
      {error !== undefined ? (
        <p role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
          {error}
        </p>
      ) : null}
      <InfoHintText hint={hint} state={hintState} />
      {showsSkip ? (
        <button
          type="button"
          data-signup-skip-phone
          onClick={onSkip}
          className="justify-self-center text-caption font-medium underline-offset-4 hover:underline"
          style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
        >
          {translate(language, 'signup.phone.skip')}
        </button>
      ) : null}
    </div>
  );
}
