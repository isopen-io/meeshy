import { useEffect, useRef, useState, type FormEvent } from 'react';

import { auth } from '@/lib/api/auth';
import { forgetEmailLinkSecret } from '@/lib/links/email-link-secret';
import { translateRecovery } from '@/lib/i18n-account-recovery-catalog';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { isPasswordValid, PASSWORD_MIN } from '@/lib/signup-form';
import {
  resetTokenProvenSpent,
  resetTokenRequiresSecondFactor,
  resolveResetPasswordOutcome,
  resolveResetTokenState,
  type ResetPasswordOutcome,
} from '@/lib/view/auth-feedback';
import { Link } from '@/routes/route-table';

import { AuthBrandFooter, AuthSubmitButton } from './auth-chrome';
import { AuthColumn, AuthColumnBar } from './auth-column';
import { Field } from './field';
import { Glyph } from './glyph';
import { PasswordInput } from './password-input';

/**
 * LE FLUX DE RÉINITIALISATION DU MOT DE PASSE (T-reset, #5672) — extrait en
 * composant INJECTABLE (patron `MagicLinkFlow`) : la route
 * (`routes/reset-password.tsx`) ne fait que lire `?token=` et le passer.
 *
 * `GET /reset-password/verify-token` tranche AVANT de montrer le formulaire
 * (§ doc-comment de la route) — un jeton périmé ne doit jamais laisser
 * saisir un mot de passe pour échouer seulement à l'envoi. Un appel
 * EXACTEMENT une fois (`useRef` gardé, StrictMode monte deux fois en dev) —
 * même dispositif que `MagicLinkValidation`.
 */

type ScreenState = 'checking' | 'invalid' | 'exhausted' | 'offline-check' | 'form' | 'done';

const RESET_TINT = 'var(--color-ios-brand)';

const SECOND_FACTOR_LENGTH = 6;

type BannerKey =
  | 'recovery.reset.error.weak'
  | 'recovery.reset.error.reused'
  | 'recovery.reset.error.codeRequired'
  | 'recovery.reset.error.codeInvalid'
  | 'recovery.reset.error.locked'
  | 'recovery.reset.error.rateLimited';

/** Le texte d'un refus qui laisse l'écran sur le formulaire (#10866). */
const BANNER_OF: Partial<Record<ResetPasswordOutcome['kind'], BannerKey>> = {
  'weak-password': 'recovery.reset.error.weak',
  'reused-password': 'recovery.reset.error.reused',
  'second-factor-required': 'recovery.reset.error.codeRequired',
  'second-factor-invalid': 'recovery.reset.error.codeInvalid',
  'account-locked': 'recovery.reset.error.locked',
  'rate-limited': 'recovery.reset.error.rateLimited',
};

export type ResetPasswordFlowDeps = {
  readonly verifyResetToken: typeof auth.verifyResetToken;
  readonly resetPassword: typeof auth.resetPassword;
};

const defaultDeps: ResetPasswordFlowDeps = {
  verifyResetToken: auth.verifyResetToken,
  resetPassword: auth.resetPassword,
};

export function ResetPasswordFlow({ token, deps = defaultDeps }: { token: string | null; deps?: ResetPasswordFlowDeps }) {
  const online = useOnline();
  const language = currentInterfaceLanguage();

  const [state, setState] = useState<ScreenState>(token === null ? 'invalid' : 'checking');
  const called = useRef(false);

  useEffect(() => {
    if (token === null) return;
    if (called.current) return;
    called.current = true;
    void run();

    async function run() {
      setState('checking');
      const result = await deps.verifyResetToken(token as string);
      const tokenState = resolveResetTokenState(result);
      if (resetTokenProvenSpent(result)) forgetEmailLinkSecret();
      setNeedsSecondFactor(resetTokenRequiresSecondFactor(result));
      if (tokenState === 'valid') setState('form');
      else if (tokenState === 'offline') setState('offline-check');
      else setState('invalid');
    }
    // `deps` est STABLE par appelant (le défaut est un module-level const) —
    // le suivre romprait la garde « exactement une fois ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function retryCheck() {
    called.current = false;
    setState(token === null ? 'invalid' : 'checking');
  }

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [secondFactorCode, setSecondFactorCode] = useState('');
  const [needsSecondFactor, setNeedsSecondFactor] = useState(false);
  const [focused, setFocused] = useState<'password' | 'confirm' | 'code' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const passwordOk = isPasswordValid(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const codeOk = !needsSecondFactor || secondFactorCode.length === SECOND_FACTOR_LENGTH;
  const canSubmit = passwordOk && confirm === password && codeOk && !submitting && online;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || token === null) return;
    setSubmitting(true);
    setBanner(null);
    const result = await deps.resetPassword({
      token,
      newPassword: password,
      confirmPassword: confirm,
      ...(needsSecondFactor ? { twoFactorCode: secondFactorCode } : {}),
    });
    setSubmitting(false);
    const outcome = resolveResetPasswordOutcome(result);
    if (outcome.kind === 'reset' || resetTokenProvenSpent(result)) forgetEmailLinkSecret();
    showOutcome(outcome);
  }

  function showOutcome(outcome: ResetPasswordOutcome) {
    if (outcome.kind === 'reset') return setState('done');
    if (outcome.kind === 'invalid-token') return setState('invalid');
    if (outcome.kind === 'attempts-exhausted') return setState('exhausted');
    if (outcome.kind === 'offline') return setBanner(translate(language, 'verifyEmail.error.offline'));
    if (outcome.kind === 'failed') return setBanner(outcome.message);
    if (outcome.kind === 'second-factor-required') setNeedsSecondFactor(true);
    if (outcome.kind === 'second-factor-invalid') setSecondFactorCode('');
    const key = BANNER_OF[outcome.kind];
    if (key !== undefined) setBanner(translateRecovery(language, key));
  }

  return (
    <AuthColumn>
      <AuthColumnBar to="login" title={translateRecovery(language, 'recovery.reset.newPassword')} />

      {state === 'checking' ? (
        <div className="grid flex-1 place-items-center gap-4 px-8 text-center">
          <span aria-hidden="true" style={{ color: RESET_TINT }}>
            <Glyph name="key" size={48} />
          </span>
          <p aria-busy="true" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, 'verifyEmail.link.checking')}
          </p>
        </div>
      ) : null}

      {state === 'invalid' || state === 'exhausted' ? (
        <div className="grid flex-1 content-center gap-6 px-8 text-center">
          <Glyph name="warningCircle" size={48} className="mx-auto" style={{ color: 'var(--ios-error)' }} />
          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {translateRecovery(language, state === 'exhausted' ? 'recovery.reset.exhausted.title' : 'recovery.reset.invalid.title')}
          </h2>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateRecovery(language, state === 'exhausted' ? 'recovery.reset.exhausted.text' : 'recovery.reset.invalid.text')}
          </p>
          <Link
            to="forgotPassword"
            replace
            className="grid place-items-center rounded-field font-bold text-ios-on-brand"
            style={{ minHeight: 52, background: RESET_TINT }}
          >
            {translateRecovery(language, 'recovery.reset.invalid.action')}
          </Link>
        </div>
      ) : null}

      {state === 'offline-check' ? (
        <div className="grid flex-1 content-center gap-4 px-8 text-center">
          <p role="alert" style={{ color: 'var(--ios-error)' }}>
            {translate(language, 'verifyEmail.error.offline')}
          </p>
          <button
            type="button"
            onClick={retryCheck}
            className="mx-auto grid place-items-center rounded-field px-6 font-semibold text-ios-on-brand"
            style={{ minHeight: 44, background: RESET_TINT }}
          >
            {translate(language, 'common.retry')}
          </button>
        </div>
      ) : null}

      {state === 'done' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center" role="status">
          <span aria-hidden="true" style={{ color: 'var(--ios-success)' }}>
            <Glyph name="checks" size={48} />
          </span>
          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {translateRecovery(language, 'recovery.reset.done.title')}
          </h2>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>{translateRecovery(language, 'recovery.reset.done.text')}</p>
          <Link
            to="login"
            replace
            className="grid w-full place-items-center rounded-field px-8 font-bold text-ios-on-brand"
            style={{ minHeight: 52, background: RESET_TINT }}
          >
            {translate(language, 'login.submit')}
          </Link>
        </div>
      ) : null}

      {state === 'form' ? (
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col content-center justify-center gap-4 px-8" noValidate>
          <p className="text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateRecovery(language, 'recovery.reset.lead')}
          </p>

          <Field
            id="reset-password"
            label={translateRecovery(language, 'recovery.reset.newPassword')}
            icon="lock"
            tint={RESET_TINT}
            focused={focused === 'password'}
            error={
              password.length > 0 && !passwordOk ? translateRecovery(language, 'recovery.reset.tooShort', { min: String(PASSWORD_MIN) }) : undefined
            }
          >
            {({ id, describedBy }) => (
              <PasswordInput
                id={id}
                describedBy={describedBy}
                autoComplete="new-password"
                autoFocus
                value={password}
                onValue={setPassword}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
              />
            )}
          </Field>

          <Field
            id="reset-password-confirm"
            label={translateRecovery(language, 'recovery.reset.confirm')}
            icon="lock"
            tint={RESET_TINT}
            focused={focused === 'confirm'}
            error={mismatch ? translateRecovery(language, 'recovery.reset.mismatch') : undefined}
          >
            {({ id, describedBy }) => (
              <PasswordInput
                id={id}
                describedBy={describedBy}
                autoComplete="new-password"
                value={confirm}
                onValue={setConfirm}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
              />
            )}
          </Field>

          {needsSecondFactor ? (
            <Field id="reset-2fa-code" label={translateRecovery(language, 'recovery.reset.code')} icon="key" tint={RESET_TINT} focused={focused === 'code'}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={[describedBy, 'reset-2fa-code-lead'].filter(Boolean).join(' ')}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={SECOND_FACTOR_LENGTH}
                  value={secondFactorCode}
                  onInput={(e) => setSecondFactorCode(e.currentTarget.value.replace(/\D/g, '').slice(0, SECOND_FACTOR_LENGTH))}
                  onFocus={() => setFocused('code')}
                  onBlur={() => setFocused(null)}
                  className="w-full bg-transparent py-3 text-input outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                />
              )}
            </Field>
          ) : null}
          {needsSecondFactor ? (
            <p id="reset-2fa-code-lead" className="text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translateRecovery(language, 'recovery.reset.code.lead')}
            </p>
          ) : null}

          {banner !== null ? (
            <p role="alert" className="text-center text-caption" style={{ color: 'var(--ios-error)' }}>
              {banner}
            </p>
          ) : null}

          <AuthSubmitButton
            disabled={!canSubmit}
            isSubmitting={submitting}
            label={translateRecovery(language, 'recovery.reset.submit')}
            busyLabel={translateRecovery(language, 'recovery.reset.submit.busy')}
            background={RESET_TINT}
          />
        </form>
      ) : null}

      <AuthBrandFooter />
    </AuthColumn>
  );
}
