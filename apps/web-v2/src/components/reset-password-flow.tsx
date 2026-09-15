import { useEffect, useRef, useState, type FormEvent } from 'react';

import { auth } from '@/lib/api/auth';
import { useOnline } from '@/lib/net/online';
import { isPasswordValid, PASSWORD_MIN } from '@/lib/signup-form';
import { resolveResetPasswordOutcome, resolveResetTokenState } from '@/lib/view/auth-feedback';
import { Link } from '@/routes/route-table';

import { AuthBrandFooter, AuthSubmitButton } from './auth-chrome';
import { AuthColumn, AuthColumnBar } from './auth-column';
import { Field } from './field';
import { Glyph } from './glyph';

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

type ScreenState = 'checking' | 'invalid' | 'offline-check' | 'form' | 'done';

const RESET_TINT = 'var(--color-ios-brand)';

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
  const [focused, setFocused] = useState<'password' | 'confirm' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const passwordOk = isPasswordValid(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = passwordOk && confirm === password && !submitting && online;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || token === null) return;
    setSubmitting(true);
    setBanner(null);
    const result = await deps.resetPassword({ token, newPassword: password, confirmPassword: confirm });
    setSubmitting(false);
    const outcome = resolveResetPasswordOutcome(result);
    if (outcome.kind === 'reset') {
      setState('done');
      return;
    }
    if (outcome.kind === 'invalid-token') {
      setState('invalid');
      return;
    }
    if (outcome.kind === 'offline') {
      setBanner('Pas de connexion. Vérifiez votre réseau et réessayez.');
      return;
    }
    setBanner(outcome.message);
  }

  return (
    <AuthColumn>
      <AuthColumnBar to="login" title="Nouveau mot de passe" />

      {state === 'checking' ? (
        <div className="grid flex-1 place-items-center gap-4 px-8 text-center">
          <span aria-hidden="true" style={{ color: RESET_TINT }}>
            <Glyph name="key" size={48} />
          </span>
          <p aria-busy="true" style={{ color: 'var(--color-ios-ink-2)' }}>
            Vérification du lien…
          </p>
        </div>
      ) : null}

      {state === 'invalid' ? (
        <div className="grid flex-1 content-center gap-6 px-8 text-center">
          <Glyph name="warningCircle" size={48} className="mx-auto" style={{ color: 'var(--ios-error)' }} />
          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            Lien invalide ou expiré
          </h2>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>Demandez un nouveau lien pour choisir votre mot de passe.</p>
          <Link
            to="forgotPassword"
            replace
            className="grid place-items-center rounded-[14px] font-bold text-white"
            style={{ minHeight: 52, background: RESET_TINT }}
          >
            Demander un nouveau lien
          </Link>
        </div>
      ) : null}

      {state === 'offline-check' ? (
        <div className="grid flex-1 content-center gap-4 px-8 text-center">
          <p role="alert" style={{ color: 'var(--ios-error)' }}>
            Pas de connexion. Vérifiez votre réseau et réessayez.
          </p>
          <button
            type="button"
            onClick={retryCheck}
            className="mx-auto grid place-items-center rounded-[14px] px-6 font-semibold text-white"
            style={{ minHeight: 44, background: RESET_TINT }}
          >
            Réessayer
          </button>
        </div>
      ) : null}

      {state === 'done' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center" role="status">
          <span aria-hidden="true" style={{ color: 'var(--ios-success)' }}>
            <Glyph name="checks" size={48} />
          </span>
          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            Mot de passe enregistré
          </h2>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
          <Link
            to="login"
            replace
            className="grid place-items-center rounded-[14px] px-8 font-bold text-white"
            style={{ minHeight: 52, background: RESET_TINT }}
          >
            Se connecter
          </Link>
        </div>
      ) : null}

      {state === 'form' ? (
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col content-center justify-center gap-4 px-8" noValidate>
          <p className="text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
            Choisissez un nouveau mot de passe.
          </p>

          <Field
            id="reset-password"
            label="Nouveau mot de passe"
            icon="lock"
            tint={RESET_TINT}
            focused={focused === 'password'}
            error={password.length > 0 && !passwordOk ? `Mot de passe trop court (min ${PASSWORD_MIN} caractères)` : undefined}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                /* `onInput`, jamais `onChange` (motif `magic-link-flow.tsx#magic-link-email`). */
                onInput={(e) => setPassword(e.currentTarget.value)}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                className="w-full bg-transparent py-3 text-input outline-none"
                style={{ color: 'var(--color-ios-ink)' }}
              />
            )}
          </Field>

          <Field
            id="reset-password-confirm"
            label="Confirmer le mot de passe"
            icon="lock"
            tint={RESET_TINT}
            focused={focused === 'confirm'}
            error={mismatch ? 'Les mots de passe ne correspondent pas' : undefined}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onInput={(e) => setConfirm(e.currentTarget.value)}
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
                className="w-full bg-transparent py-3 text-input outline-none"
                style={{ color: 'var(--color-ios-ink)' }}
              />
            )}
          </Field>

          {banner !== null ? (
            <p role="alert" className="text-center text-caption" style={{ color: 'var(--ios-error)' }}>
              {banner}
            </p>
          ) : null}

          <AuthSubmitButton
            disabled={!canSubmit}
            isSubmitting={submitting}
            label="Enregistrer le mot de passe"
            busyLabel="Enregistrement…"
            background={RESET_TINT}
          />
        </form>
      ) : null}

      <AuthBrandFooter />
    </AuthColumn>
  );
}
