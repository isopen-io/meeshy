import { useId, useState } from 'react';

import type { ApiResult } from '@/lib/api/http';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Field } from './field';

/**
 * **AJOUTER SON NUMÉRO PAR SMS — UNE SEULE FOIS DANS LE WEB** (#8843).
 *
 * Extrait tel quel du dialogue d'activation (`activation-invite-dialog.tsx`,
 * #8239) pour servir aussi la proposition « Ajoutez votre numéro »
 * (`phone-add-prompt.tsx`) : « Ajouter mon numéro » ⇒ numéro ⇒ code SMS
 * (`POST users.meChangePhone`) ⇒ code à 6 chiffres
 * (`POST users.meVerifyPhoneChange`). Deux copies de ce parcours auraient
 * divergé à la première erreur traduite.
 */

const TINT = 'var(--color-ios-brand)';

export type PhoneCodeDeps = {
  readonly requestPhoneCode: (phone: string) => Promise<ApiResult<unknown>>;
  readonly verifyPhoneCode: (code: string) => Promise<ApiResult<unknown>>;
};

type PhoneStep = 'idle' | 'editing' | 'sending' | 'code' | 'verifying';

export const phonePrimaryButton = { minHeight: 48, background: TINT } as const;
export const phoneSecondaryButton = {
  minHeight: 44,
  color: 'var(--color-ios-ink)',
  border: '1.5px solid color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)',
} as const;

export function PhoneCodeForm({
  language,
  deps,
  onVerified,
}: {
  readonly language: InterfaceLanguage;
  readonly deps: PhoneCodeDeps;
  readonly onVerified: () => void;
}) {
  const phoneHintId = useId();
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('idle');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'phone' | 'code' | null>(null);

  async function sendPhoneCode() {
    if (phoneStep === 'sending') return;
    setPhoneStep('sending');
    setPhoneError(null);
    const result = await deps.requestPhoneCode(phone);
    if (result.ok) {
      setPhoneStep('code');
      return;
    }
    setPhoneStep('editing');
    setPhoneError(translate(language, result.code === 'INVALID_PHONE' ? 'activation.phone.invalid' : 'activation.phone.failed'));
  }

  async function confirmPhoneCode() {
    if (phoneCode.length !== 6 || phoneStep === 'verifying') return;
    setPhoneStep('verifying');
    setCodeError(null);
    const result = await deps.verifyPhoneCode(phoneCode);
    if (result.ok) {
      setPhoneStep('idle');
      onVerified();
      return;
    }
    setPhoneStep('code');
    setCodeError(translate(language, 'activation.phone.codeInvalid'));
  }

  if (phoneStep === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setPhoneStep('editing')}
        className="grid place-items-center rounded-chip px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={phoneSecondaryButton}
      >
        {translate(language, 'activation.phone.add')}
      </button>
    );
  }

  if (phoneStep === 'editing' || phoneStep === 'sending') {
    return (
      <>
        <Field id="activation-phone" label={translate(language, 'activation.phone.field')} tint={TINT} focused={focusedField === 'phone'} error={phoneError ?? undefined}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy === undefined ? phoneHintId : `${describedBy} ${phoneHintId}`}
              aria-invalid={phoneError !== null}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              value={phone}
              onInput={(e) => setPhone(e.currentTarget.value)}
              onFocus={() => setFocusedField('phone')}
              onBlur={() => setFocusedField(null)}
              placeholder="+33 6 12 34 56 78"
              className="w-full bg-transparent py-3 text-input outline-none"
              style={{ color: 'var(--color-ios-ink)' }}
            />
          )}
        </Field>
        <p id={phoneHintId} className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'activation.phone.hint')}
        </p>
        <button
          type="button"
          onClick={() => void sendPhoneCode()}
          disabled={phoneStep === 'sending' || phone.trim() === ''}
          aria-busy={phoneStep === 'sending'}
          className="grid place-items-center rounded-chip px-4 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          style={phonePrimaryButton}
        >
          {translate(language, phoneStep === 'sending' ? 'activation.phone.busy' : 'activation.phone.send')}
        </button>
      </>
    );
  }

  return (
    <>
      <Field id="activation-phone-code" label={translate(language, 'activation.phone.code')} tint={TINT} focused={focusedField === 'code'} error={codeError ?? undefined}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={codeError !== null}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={phoneCode}
            onInput={(e) => setPhoneCode(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
            onFocus={() => setFocusedField('code')}
            onBlur={() => setFocusedField(null)}
            placeholder="000000"
            className="w-full bg-transparent py-3 text-center text-input font-semibold tracking-wide outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
          />
        )}
      </Field>
      <button
        type="button"
        onClick={() => void confirmPhoneCode()}
        disabled={phoneCode.length !== 6 || phoneStep === 'verifying'}
        aria-busy={phoneStep === 'verifying'}
        className="grid place-items-center rounded-chip px-4 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        style={phonePrimaryButton}
      >
        {translate(language, 'activation.phone.verify')}
      </button>
    </>
  );
}
