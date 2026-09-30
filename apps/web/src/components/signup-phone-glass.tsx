import { useRef, type Ref } from 'react';

import { Glyph } from '@/components/glyph';
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
  benefit,
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
  /** Ce que le numéro ouvre — lu d'emblée sous le champ, plus derrière un (i) (#8842). */
  readonly benefit: string;
  readonly inputRef: Ref<HTMLInputElement>;
}) {
  const glass = useRef<HTMLDivElement>(null);
  return (
    <div className="grid gap-2">
      {/* « PLUS TARD → » SUR LA LIGNE DU LIBELLÉ (#8842) — le refus reste un
          vrai bouton, lisible, 44 px, nommé pour un lecteur d'écran. */}
      <div data-signup-phone-label-row className="flex items-center justify-between gap-3">
        <label htmlFor="signup-phone" className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
          Téléphone
        </label>
        {showsSkip ? (
          <button
            type="button"
            data-signup-skip-phone
            onClick={onSkip}
            aria-label={translate(language, 'signup.phone.later.a11y')}
            className="inline-flex items-center gap-1 rounded-chip px-2 text-caption font-semibold focus-visible:outline-2"
            style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translate(language, 'signup.phone.later')}
            <svg aria-hidden="true" viewBox="0 0 256 256" width="14" height="14" fill="currentColor" className="rtl:-scale-x-100">
              <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
            </svg>
          </button>
        ) : null}
      </div>
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
          <Glyph name="caretDown" size={14} style={{ color: 'var(--color-ios-ink)' }} />
        </button>
        <span aria-hidden="true" className="h-6 w-px" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 20%, transparent)' }} />
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
          className="w-0 min-w-0 flex-1 bg-transparent py-3 ps-2 text-input outline-none"
          style={{ color: 'var(--color-ios-ink)' }}
          aria-describedby="signup-phone-hint"
          aria-invalid={error !== undefined}
        />
      </div>
      {error !== undefined ? (
        <p role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
          {error}
        </p>
      ) : null}
      <p id="signup-phone-hint" className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {benefit}
      </p>
    </div>
  );
}
