import { useEffect, useId, useRef, useState } from 'react';

import type { Activation, ActivationChannel } from '@/lib/api/activation';
import type { auth } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { daysLeft } from '@/lib/activation/invite';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

import { EmailCodeForm, withStrongEmail } from './email-code-form';
import { Field } from './field';

/**
 * **« VALIDEZ VOTRE COMPTE »** (#8239, loi serveur #8238) — de J7 à J28, un
 * compte à l'adresse non prouvée est invité, à l'ouverture de l'app, à la
 * prouver et à ajouter un numéro, SANS quitter l'app.
 *
 * Ce qu'elle offre suit ce qui MANQUE (`activation.missing`) :
 * - l'adresse : « Recevoir le code » (`POST /auth/resend-verification`), puis
 *   la saisie SUR PLACE par `EmailCodeForm` — la machine de l'écran du code,
 *   jamais une seconde ;
 * - le numéro : « Ajouter mon numéro », le parcours d'iOS (`SecurityView` :
 *   numéro, code SMS, `change-phone` puis `verify-phone-change`).
 *
 * `<dialog>` ouvert par `showModal()`, comme `ConfirmDialog` : piège de focus,
 * Échap et inertie de l'arrière-plan NATIFS ; « Plus tard », Échap et le
 * retour matériel d'Android passent par le MÊME `onClose`. Une preuve rendue
 * ici remonte à l'hôte (`onActivationChange`) : l'adresse prouvée fait passer
 * le compte à `done`, sans attendre une relecture.
 */

const TINT = 'var(--color-ios-brand)';

export type ActivationInviteDeps = {
  readonly resendVerification: (email: string) => Promise<ApiResult<unknown>>;
  readonly verifyEmail: typeof auth.verifyEmail;
  readonly requestPhoneCode: (phone: string) => Promise<ApiResult<unknown>>;
  readonly verifyPhoneCode: (code: string) => Promise<ApiResult<unknown>>;
};

type EmailStep = 'idle' | 'sending' | 'sent' | 'failed';
type PhoneStep = 'idle' | 'editing' | 'sending' | 'code' | 'verifying';

const without = (missing: readonly ActivationChannel[], channel: ActivationChannel): readonly ActivationChannel[] =>
  missing.filter((entry) => entry !== channel);

function leadText(language: InterfaceLanguage, activation: Activation, now: number): string {
  const days = daysLeft(activation.deadline, now);
  if (days === null || days === 0) return translate(language, 'activation.invite.lead');
  if (days === 1) return translate(language, 'activation.invite.daysLeft.one');
  return translate(language, 'activation.invite.daysLeft', { days: String(days) });
}

const primaryButton = { minHeight: 48, background: TINT } as const;
const secondaryButton = {
  minHeight: 44,
  color: 'var(--color-ios-ink)',
  border: '1.5px solid color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)',
} as const;

export function ActivationInviteDialog({
  activation,
  email,
  now,
  language,
  deps,
  onActivationChange,
  onClose,
}: {
  readonly activation: Activation;
  /** L'adresse EN CLAIR, en mémoire vive — `null` : rien à envoyer. */
  readonly email: string | null;
  readonly now: number;
  readonly language: InterfaceLanguage;
  readonly deps: ActivationInviteDeps;
  readonly onActivationChange: (next: Activation) => void;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const leadId = useId();
  const phoneHintId = useId();
  useBackDismiss(onClose);

  const [missing, setMissing] = useState<readonly ActivationChannel[]>(activation.missing);
  const [proven, setProven] = useState<readonly ActivationChannel[]>([]);
  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('idle');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'phone' | 'code' | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  function prove(channel: ActivationChannel) {
    const rest = without(missing, channel);
    setMissing(rest);
    setProven((done) => [...done, channel]);
    onActivationChange(
      channel === 'email' || activation.phase === 'done'
        ? { phase: 'done', deadline: null, missing: rest }
        : { ...activation, missing: rest },
    );
  }

  async function sendEmailCode() {
    if (email === null || emailStep === 'sending') return;
    setEmailStep('sending');
    const result = await deps.resendVerification(email);
    setEmailStep(result.ok ? 'sent' : 'failed');
  }

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
      prove('phone');
      return;
    }
    setPhoneStep('code');
    setCodeError(translate(language, 'activation.phone.codeInvalid'));
  }

  const asksEmail = missing.includes('email') && email !== null;
  const asksPhone = missing.includes('phone');
  const complete = missing.length === 0;

  return (
    <dialog
      ref={ref}
      data-activation-invite
      aria-labelledby={titleId}
      aria-describedby={leadId}
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-card p-0 backdrop:bg-black/40"
      style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: 0 }}
    >
      <div className="grid gap-4 p-5">
        <h2 id={titleId} className="text-thread font-extrabold">
          {translate(language, 'activation.invite.title')}
        </h2>
        <p id={leadId} className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {leadText(language, activation, now)}
        </p>

        {proven.includes('email') ? (
          <p role="status" className="text-caption font-semibold" style={{ color: 'var(--ios-success)' }}>
            {translate(language, 'activation.email.done')}
          </p>
        ) : null}
        {proven.includes('phone') ? (
          <p role="status" className="text-caption font-semibold" style={{ color: 'var(--ios-success)' }}>
            {translate(language, 'activation.phone.done')}
          </p>
        ) : null}

        {asksEmail ? (
          <section className="grid gap-3" aria-label={translate(language, 'activation.email.label')}>
            <p className="text-body font-semibold">{translate(language, 'activation.email.label')}</p>
            {emailStep === 'sent' ? (
              <>
                <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {withStrongEmail(translate(language, 'activation.email.sent', { email }), email)}
                </p>
                <EmailCodeForm
                  email={email}
                  next={null}
                  verifyEmail={deps.verifyEmail}
                  onVerified={() => prove('email')}
                  onSignedIn={() => prove('email')}
                  autoFocus
                />
              </>
            ) : (
              <>
                {emailStep === 'failed' ? (
                  <p role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
                    {translate(language, 'activation.email.failed')}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void sendEmailCode()}
                  disabled={emailStep === 'sending'}
                  aria-busy={emailStep === 'sending'}
                  className="grid place-items-center rounded-chip px-4 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                  style={primaryButton}
                >
                  {translate(language, emailStep === 'sending' ? 'activation.email.sending' : 'activation.email.send')}
                </button>
              </>
            )}
          </section>
        ) : null}

        {asksPhone ? (
          <section className="grid gap-3" aria-label={translate(language, 'activation.phone.label')}>
            <p className="text-body font-semibold">{translate(language, 'activation.phone.label')}</p>
            {phoneStep === 'idle' ? (
              <button
                type="button"
                onClick={() => setPhoneStep('editing')}
                className="grid place-items-center rounded-chip px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                style={secondaryButton}
              >
                {translate(language, 'activation.phone.add')}
              </button>
            ) : phoneStep === 'editing' || phoneStep === 'sending' ? (
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
                  style={primaryButton}
                >
                  {translate(language, phoneStep === 'sending' ? 'activation.phone.busy' : 'activation.phone.send')}
                </button>
              </>
            ) : (
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
                  style={primaryButton}
                >
                  {translate(language, 'activation.phone.verify')}
                </button>
              </>
            )}
          </section>
        ) : null}

        {complete ? (
          <p data-activation-complete role="status" className="text-body font-semibold" style={{ color: 'var(--ios-success)' }}>
            {translate(language, 'activation.complete')}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="grid place-items-center rounded-chip px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={secondaryButton}
        >
          {translate(language, complete ? 'activation.close' : 'activation.later')}
        </button>
      </div>
    </dialog>
  );
}
