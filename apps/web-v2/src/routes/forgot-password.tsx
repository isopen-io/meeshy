import { useState, type FormEvent } from 'react';

import { AuthBrandFooter, AuthSubmitButton } from '@/components/auth-chrome';
import { Field } from '@/components/field';
import { Glyph } from '@/components/glyph';
import { AUTH_GLYPHS } from '@/components/glyphs-auth';
import { auth } from '@/lib/api/auth';
import { useOnline } from '@/lib/net/online';
import { isEmailValid } from '@/lib/signup-form';
import { resolveForgotPasswordOutcome, type ForgotPasswordOutcome } from '@/lib/view/auth-feedback';
import { Link } from '@/routes/route-table';

/**
 * MOT DE PASSE OUBLIÉ, flux E-MAIL (#5816) — anatomie de
 * `MeeshyForgotPasswordView.swift` (402 l.), segment Email/Téléphone NON
 * rendu (le flux téléphone n'existe pas encore, § 9 Q6 : un segment inerte
 * violerait la loi 4). 200 ET 404 rendent le MÊME écran « E-mail envoyé ! »
 * (`resolveForgotPasswordOutcome`, garde de non-révélation).
 */

const FORGOT_PASSWORD_TINT = 'var(--color-ios-brand)';

export default function ForgotPasswordScreen() {
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<ForgotPasswordOutcome | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isEmailValid(email) || submitting || !online) return;
    setSubmitting(true);
    setOutcome(null);
    const result = await auth.forgotPassword(email);
    setSubmitting(false);
    setOutcome(resolveForgotPasswordOutcome(result));
  }

  const sent = outcome?.kind === 'sent';
  const fieldError = outcome?.kind === 'invalid-email' ? 'Adresse e-mail invalide' : undefined;
  const banner = outcome?.kind === 'offline' ? 'Pas de connexion. Vérifiez votre réseau et réessayez.' : outcome?.kind === 'failed' ? outcome.message : null;

  return (
    <div className="flex h-dvh flex-col pt-safe pb-safe">
      <div className="flex shrink-0 items-center px-2 pt-1">
        <Link
          to="login"
          replace
          className="grid place-items-center rounded-chip"
          style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink-2)' }}
          aria-label="Fermer"
        >
          <Glyph name="x" size={20} />
        </Link>
        <h1 className="flex-1 text-center text-title font-semibold" style={{ color: 'var(--color-ios-ink)', marginRight: 44 }}>
          Mot de passe oublié
        </h1>
      </div>

      {sent ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <Glyph name="envelopeOpen" size={48} style={{ color: FORGOT_PASSWORD_TINT }} />
          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            E-mail envoyé !
          </h2>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>
            Si un compte existe avec <strong>{email}</strong>, un lien de réinitialisation a été envoyé.
          </p>
          <Link
            to="login"
            replace
            className="grid place-items-center rounded-[14px] px-6 font-semibold"
            style={{
              minHeight: 44,
              border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
              color: 'var(--color-ios-ink)',
            }}
          >
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col content-center justify-center gap-4 px-8" noValidate>
          <p className="text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
            Entrez votre e-mail pour recevoir un lien de réinitialisation.
          </p>

          <Field
            id="forgot-email"
            label="E-mail"
            glyph={AUTH_GLYPHS.envelope}
            tint={FORGOT_PASSWORD_TINT}
            focused={focused}
            error={fieldError}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="nom@exemple.com"
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
            disabled={!isEmailValid(email) || !online}
            isSubmitting={submitting}
            label="Envoyer"
            busyLabel="Envoi…"
            background={FORGOT_PASSWORD_TINT}
          />
        </form>
      )}

      <AuthBrandFooter />
    </div>
  );
}
