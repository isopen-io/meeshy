import { useRef, type Ref } from 'react';

import { PHONE_MIN_DIGITS } from '@meeshy/shared/utils/phone-plausibility';

import { Glyph } from '@/components/glyph';
import { countryName, type Country } from '@/lib/countries';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { SignupPhoneRefusal } from '@/lib/signup-form';
import { prefersReducedMotion } from '@/lib/view/effects-runner';
import { playTypingWave } from '@/lib/view/typing-wave';

/**
 * CE QUE LE REFUS DU NUMÉRO DIT (#9343) — les mêmes mots qu'iOS
 * (`auth.signup.phone.required` / `.tooShort` / `.implausible`). Les deux
 * motifs de remplissage (chiffres identiques, motif répété) se corrigent de la
 * même façon : vérifier son numéro.
 */
export function phoneRefusalMessage(language: InterfaceLanguage, refusal: SignupPhoneRefusal): string {
  switch (refusal) {
    case 'missing':
      return translate(language, 'signup.phone.required');
    case 'too-short':
      return translate(language, 'signup.phone.tooShort', { min: String(PHONE_MIN_DIGITS) });
    case 'identical-run':
    case 'repeated-pattern':
      return translate(language, 'signup.phone.implausible');
  }
}

/**
 * PHASE 1 DE L'INSCRIPTION — LE TÉLÉPHONE, EN VERRE LIQUIDE (#8288).
 *
 * Le numéro vient d'abord, dans une barre de verre qui ONDULE À LA FRAPPE,
 * comme la barre du composeur universel iOS (`typing-wave.ts`). Le pays se
 * choisit dans la barre même. Le numéro est REQUIS par l'écran (#9343,
 * directive porteur 2026-10-04) : rien ne le passe, et l'adresse ne paraît
 * qu'à un numéro plausible. Le refus se dit SOUS le champ, lié à la saisie
 * par `aria-describedby` et annoncé (`role="alert"`).
 */
export function SignupPhoneGlass({
  locale,
  country,
  phoneDigits,
  onPhoneDigits,
  onOpenCountry,
  focused,
  onFocus,
  onBlur,
  error,
  benefit,
  inputRef,
}: {
  readonly locale: string;
  readonly country: Country;
  readonly phoneDigits: string;
  readonly onPhoneDigits: (value: string) => void;
  readonly onOpenCountry: () => void;
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  /** Le refus à dire sous le champ — celui du serveur, ou celui de la saisie. */
  readonly error: string | undefined;
  /** Ce que le numéro ouvre — lu d'emblée sous le champ, plus derrière un (i) (#8842). */
  readonly benefit: string;
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
        className="glass glass-card flex items-center gap-1 rounded-field-ios ps-1.5 pe-3"
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
          className="flex items-center gap-1.5 rounded-bubble px-3"
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
          aria-describedby={error !== undefined ? 'signup-phone-error signup-phone-hint' : 'signup-phone-hint'}
          aria-invalid={error !== undefined}
          aria-required="true"
        />
      </div>
      {error !== undefined ? (
        <p id="signup-phone-error" data-signup-phone-error role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
          {error}
        </p>
      ) : null}
      <p id="signup-phone-hint" className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {benefit}
      </p>
    </div>
  );
}
