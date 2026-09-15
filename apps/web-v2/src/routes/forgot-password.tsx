import { useState, type FormEvent } from 'react';

import { AuthBrandFooter, AuthSubmitButton } from '@/components/auth-chrome';
import { AuthColumn, AuthColumnBar } from '@/components/auth-column';
import { EmailSentNotice } from '@/components/email-sent-notice';
import { Field } from '@/components/field';
import { AUTH_GLYPHS } from '@/components/glyphs-auth';
import { InfoHintButton, InfoHintText, useInfoHint, type InfoHint } from '@/components/info-hint';
import { auth } from '@/lib/api/auth';
import { useOnline } from '@/lib/net/online';
import { isEmailValid } from '@/lib/signup-form';
import { resolveForgotPasswordOutcome, type ForgotPasswordOutcome } from '@/lib/view/auth-feedback';
import { Link } from '@/routes/route-table';

/**
 * MOT DE PASSE OUBLIÉ, flux E-MAIL (#5816) — anatomie de
 * `MeeshyForgotPasswordView.swift` (402 l.), segment Email/Téléphone NON
 * rendu (le flux téléphone n'existe pas encore, § 9 Q6 : un segment inerte
 * violerait la loi 4). 200 ET 404 rendent le MÊME écran « E-mail envoyé »
 * (`resolveForgotPasswordOutcome`, garde de non-révélation) — celui de la
 * connexion par e-mail (`EmailSentNotice`).
 *
 * **Il sert aussi à CRÉER un mot de passe (#6643).** Directive porteur
 * 2026-09-15 : « la page de récupération de mot de passe doit permettre de
 * setter le mot de passe même si on a jamais eu de mot de passe ». La passerelle
 * envoie le lien à un compte qui n'en a jamais eu (#6642) ; l'écran le dit sans
 * détail technique. La phrase parle de CHOISIR un mot de passe, jamais de le
 * réinitialiser, et le cas du premier mot de passe vit derrière un (i) qui
 * nomme la question qu'on se pose (D-71). Même vocabulaire sur les trois
 * clients.
 */

const FORGOT_PASSWORD_TINT = 'var(--color-ios-brand)';

/** Le libellé se LIT à côté du glyphe (`showsLabel`) : c'est la question que
 * se pose exactement la personne à qui la note s'adresse, et un (i) muet sous
 * une phrase qui parle d'un « nouveau » mot de passe ne lui dirait pas que
 * l'écran la concerne. */
const NEVER_HAD_A_PASSWORD: InfoHint = {
  label: 'Jamais eu de mot de passe ?',
  text: 'Ce même lien vous permet d’en créer un.',
  glyph: AUTH_GLYPHS.info,
};

export type ForgotPasswordDeps = {
  readonly forgotPassword: typeof auth.forgotPassword;
};

const defaultDeps: ForgotPasswordDeps = { forgotPassword: auth.forgotPassword };

export default function ForgotPasswordScreen({ deps = defaultDeps }: { readonly deps?: ForgotPasswordDeps } = {}) {
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<ForgotPasswordOutcome | null>(null);
  const neverHadOne = useInfoHint();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isEmailValid(email) || submitting || !online) return;
    setSubmitting(true);
    setOutcome(null);
    const result = await deps.forgotPassword(email);
    setSubmitting(false);
    setOutcome(resolveForgotPasswordOutcome(result));
  }

  const sent = outcome?.kind === 'sent';
  const fieldError = outcome?.kind === 'invalid-email' ? 'Adresse e-mail invalide' : undefined;
  const banner = outcome?.kind === 'offline' ? 'Pas de connexion. Vérifiez votre réseau et réessayez.' : outcome?.kind === 'failed' ? outcome.message : null;

  return (
    <AuthColumn>
      <AuthColumnBar to="login" title="Mot de passe oublié" />

      {sent ? (
        <EmailSentNotice email={email}>
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
        </EmailSentNotice>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col content-center justify-center gap-4 px-8" noValidate>
          <div className="grid justify-items-center gap-1 text-center">
            <p className="text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
              Recevez par e-mail un lien pour choisir un nouveau mot de passe.
            </p>
            <InfoHintButton hint={NEVER_HAD_A_PASSWORD} state={neverHadOne} showsLabel />
            <InfoHintText hint={NEVER_HAD_A_PASSWORD} state={neverHadOne} />
          </div>

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
                /* `onInput`, jamais `onChange` (motif `magic-link-panel.tsx#magic-link-email`) :
                   un témoin qui pose `.value` puis redispatche un `input` natif n'est vu QUE
                   par `onInput` sous ce harnais (leçon 603). */
                onInput={(e) => setEmail(e.currentTarget.value)}
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
            label="Recevoir le lien"
            busyLabel="Envoi…"
            background={FORGOT_PASSWORD_TINT}
          />
        </form>
      )}

      <AuthBrandFooter />
    </AuthColumn>
  );
}
