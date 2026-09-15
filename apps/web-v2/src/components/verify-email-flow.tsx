import { useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { auth } from '@/lib/api/auth';
import { sessionStore } from '@/lib/api/session';
import { useOnline } from '@/lib/net/online';
import { secondClock, type IntervalClock } from '@/lib/view/interval-clock';
import { type MagicLinkDeadline } from '@/lib/view/magic-link';
import { useCountdown } from '@/lib/view/use-countdown';
import { resolveVerifyEmailOutcome } from '@/lib/view/auth-feedback';
import { Link } from '@/routes/route-table';

import { AuthBrandFooter, AuthSubmitButton } from './auth-chrome';
import { AuthColumn, AuthColumnBar } from './auth-column';
import { Field } from './field';
import { Glyph } from './glyph';

/**
 * LE FLUX DE VÉRIFICATION D'E-MAIL (T-verify, #5672) — anatomie de
 * `EmailVerificationView.swift` (271 l.) : icône + titre + sous-titre + champ
 * à 6 chiffres + refus + bouton + renvoi (compte à rebours) + overlay de
 * succès. Extrait en composant INJECTABLE (patron `MagicLinkFlow`) — la
 * route (`routes/verify-email.tsx`) ne fait que lire `?email=` et le passer.
 *
 * AUCUNE écriture de session : `register()` a déjà établi la session avant
 * cet écran (#4264) ; vérifier le code ne (re)connecte personne, il ouvre la
 * SUITE — le bouton « Continuer » de l'overlay mène vers la liste si une
 * session existe, vers la connexion sinon (lien ouvert sur un navigateur qui
 * n'a jamais vu ce compte).
 */

const VERIFY_TINT = 'var(--color-ios-brand)';
const RESEND_COOLDOWN_SECONDS = 30;

export type VerifyEmailFlowDeps = {
  readonly verifyEmail: typeof auth.verifyEmail;
  readonly resendVerification: typeof auth.resendVerification;
  readonly clock: IntervalClock;
  readonly now: () => number;
};

const defaultDeps: VerifyEmailFlowDeps = {
  verifyEmail: auth.verifyEmail,
  resendVerification: auth.resendVerification,
  clock: secondClock,
  now: () => Date.now(),
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function VerifyEmailFlow({ email, deps = defaultDeps }: { email: string | null; deps?: VerifyEmailFlowDeps }) {
  const online = useOnline();
  const session = useStore(sessionStore, (s) => s.session);

  const [code, setCode] = useState('');
  const [codeFocused, setCodeFocused] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [resendSending, setResendSending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendDeadline, setResendDeadline] = useState<MagicLinkDeadline | null>(null);
  const resendRemaining = useCountdown(resendDeadline, deps.clock, deps.now);
  const resendLocked = resendDeadline !== null && resendRemaining > 0;

  const isCodeComplete = code.length === 6;
  const closeTarget = session.status === 'authenticated' ? 'list' : 'login';

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (email === null || !isCodeComplete || verifying || verified || !online) return;
    setVerifying(true);
    setCodeError(null);
    const result = await deps.verifyEmail({ email, code });
    setVerifying(false);
    const outcome = resolveVerifyEmailOutcome(result);
    if (outcome.kind === 'verified') {
      setVerified(true);
      return;
    }
    if (outcome.kind === 'invalid-code') {
      setCodeError('Code invalide ou expiré');
      return;
    }
    if (outcome.kind === 'offline') {
      setCodeError('Pas de connexion. Vérifiez votre réseau et réessayez.');
      return;
    }
    setCodeError(outcome.message);
  }

  async function handleResend() {
    if (email === null || resendSending || resendLocked || !online) return;
    setResendSending(true);
    setResendSent(false);
    await deps.resendVerification(email);
    setResendSending(false);
    setResendSent(true);
    setResendDeadline({ startedAt: deps.now(), expiresInSeconds: RESEND_COOLDOWN_SECONDS });
  }

  return (
    <AuthColumn>
      <AuthColumnBar to={closeTarget} title="Vérification de l’e-mail" />

      {email === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <Glyph name="warningCircle" size={48} style={{ color: 'var(--ios-error)' }} />
          <p style={{ color: 'var(--color-ios-ink-2)' }}>
            Ce lien ne porte aucune adresse e-mail à vérifier. Ouvrez-le depuis l’e-mail que Meeshy vous a envoyé.
          </p>
          <Link
            to="login"
            replace
            className="grid place-items-center rounded-[14px] px-6 font-semibold"
            style={{ minHeight: 44, border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)', color: 'var(--color-ios-ink)' }}
          >
            Retour à la connexion
          </Link>
        </div>
      ) : verified ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center" role="status">
          <span aria-hidden="true" style={{ color: 'var(--ios-success)' }}>
            <Glyph name="checks" size={48} />
          </span>
          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            E-mail vérifié !
          </h2>
          <Link
            to={closeTarget}
            replace
            className="grid w-full place-items-center rounded-[14px] px-8 font-bold text-white"
            style={{ minHeight: 52, background: VERIFY_TINT }}
          >
            Continuer
          </Link>
        </div>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center" noValidate>
          <span aria-hidden="true" style={{ color: VERIFY_TINT }}>
            <Glyph name="envelopeOpen" size={48} />
          </span>
          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            Vérifiez votre e-mail
          </h2>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>
            Entrez le code à 6 chiffres envoyé à <strong>{email}</strong>
          </p>

          <div className="w-full">
            <Field id="verify-email-code" tint={VERIFY_TINT} focused={codeFocused} error={codeError ?? undefined}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-label="Code de vérification"
                  aria-invalid={codeError !== null}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  /* `onInput`, jamais `onChange` (motif `magic-link-flow.tsx#magic-link-email`) —
                     un témoin qui pose `.value` puis redispatche un `input` natif n'est vu QUE par
                     `onInput` sous ce harnais. */
                  onInput={(e) => setCode(onlyDigits(e.currentTarget.value))}
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  placeholder="000000"
                  disabled={verifying || !online}
                  className="w-full bg-transparent py-3 text-center text-input font-semibold tracking-wide outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                />
              )}
            </Field>
          </div>

          <AuthSubmitButton
            disabled={!isCodeComplete || !online}
            isSubmitting={verifying}
            label="Vérifier"
            busyLabel="Vérification…"
            background={VERIFY_TINT}
          />

          <div className="grid gap-2">
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              Vous n’avez pas reçu le code ?
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendSending || resendLocked || !online}
              aria-label="Renvoyer le code"
              className="text-caption font-medium"
              style={{ color: VERIFY_TINT, opacity: resendSending || resendLocked ? 0.6 : 1 }}
            >
              {resendSending
                ? 'Envoi…'
                : resendLocked
                  ? `Renvoyer le code (${resendRemaining}s)`
                  : resendSent
                    ? 'Code renvoyé !'
                    : 'Renvoyer le code'}
            </button>
          </div>
        </form>
      )}

      <AuthBrandFooter />
    </AuthColumn>
  );
}
