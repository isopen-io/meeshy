import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { auth } from '@/lib/api/auth';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { pendingVerificationFor } from '@/lib/pending-verification';
import { secondClock, type IntervalClock } from '@/lib/view/interval-clock';
import { type MagicLinkDeadline } from '@/lib/view/magic-link';
import { useCountdown } from '@/lib/view/use-countdown';
import { resolveVerifyEmailOutcome } from '@/lib/view/auth-feedback';
import { Link } from '@/routes/route-table';

import { AuthBrandFooter } from './auth-chrome';
import { AuthColumn, AuthColumnBar } from './auth-column';
import { EmailCodeForm, goToLanding, verifyEmailErrorText, withStrongEmail } from './email-code-form';
import { Glyph } from './glyph';

/**
 * LE FLUX DE VÉRIFICATION D'E-MAIL (T-verify, #5672) — anatomie de
 * `EmailVerificationView.swift` (271 l.) : icône + titre + sous-titre + champ
 * à 6 chiffres + refus + bouton + renvoi (compte à rebours) + overlay de
 * succès. Extrait en composant INJECTABLE (patron `MagicLinkFlow`) — la
 * route (`routes/verify-email.tsx`) ne fait que lire l'adresse et la passer.
 *
 * LA VÉRIFICATION CONNECTE (#8034, contrat #8033). Le code saisi comme le
 * lien de l'e-mail (`?token=`, consommé au montage) rendent une session, que
 * `auth.verifyEmail` établit : l'écran mène alors là où une connexion mène
 * (`?next=` s'il est sûr, l'accueil sinon). Une passerelle antérieure
 * vérifie SANS connecter : l'overlay « E-mail vérifié ! » et sa porte de
 * sortie restent pour elle — vers la liste si une session existe, vers la
 * connexion sinon.
 *
 * Arrivé depuis la connexion par mot de passe d'un e-mail inconnu, l'écran
 * DIT ce qui vient de se passer (compte créé, code et lien envoyés), et le
 * mot de passe tapé voyage avec le code (`pending-verification.ts`).
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

type LinkPhase = 'idle' | 'checking' | 'refused';

export function VerifyEmailFlow({
  email,
  token = null,
  next = null,
  deps = defaultDeps,
}: {
  readonly email: string | null;
  /** Le jeton du lien reçu par e-mail (`?token=`), consommé au montage. */
  readonly token?: string | null;
  /** La valeur BRUTE de `?next=` — clampée là où elle sert. */
  readonly next?: string | null;
  readonly deps?: VerifyEmailFlowDeps;
}) {
  const online = useOnline();
  const session = useStore(sessionStore, (s) => s.session);
  const language = currentInterfaceLanguage();

  const [verified, setVerified] = useState(false);
  const [linkPhase, setLinkPhase] = useState<LinkPhase>(email !== null && token !== null && token !== '' ? 'checking' : 'idle');
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkConsumed = useRef(false);

  const [resendSending, setResendSending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendDeadline, setResendDeadline] = useState<MagicLinkDeadline | null>(null);
  const resendRemaining = useCountdown(resendDeadline, deps.clock, deps.now);
  const resendLocked = resendDeadline !== null && resendRemaining > 0;

  const closeTarget = session.status === 'authenticated' ? 'list' : 'login';

  useEffect(() => {
    if (linkPhase !== 'checking' || email === null || token === null || linkConsumed.current) return;
    linkConsumed.current = true;
    void deps.verifyEmail({ email, token }).then((result) => {
      const outcome = resolveVerifyEmailOutcome(result);
      if (outcome.kind === 'signed-in') {
        goToLanding(next);
        return;
      }
      if (outcome.kind === 'verified') {
        setVerified(true);
        setLinkPhase('idle');
        return;
      }
      setLinkError(outcome.kind === 'invalid-code' ? translate(language, 'verifyEmail.link.invalid') : verifyEmailErrorText(outcome));
      setLinkPhase('refused');
    });
  }, [linkPhase, email, token, next, deps, language]);

  async function handleResend() {
    if (email === null || resendSending || resendLocked || !online) return;
    setResendSending(true);
    setResendSent(false);
    await deps.resendVerification(email);
    setResendSending(false);
    setResendSent(true);
    setResendDeadline({ startedAt: deps.now(), expiresInSeconds: RESEND_COOLDOWN_SECONDS });
  }

  if (email === null) {
    return (
      <AuthColumn>
        <AuthColumnBar to={closeTarget} title={translate(language, 'verifyEmail.bar.title')} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <Glyph name="warningCircle" size={48} style={{ color: 'var(--ios-error)' }} />
          <p style={{ color: 'var(--color-ios-ink-2)' }}>{translate(language, 'verifyEmail.noAddress')}</p>
          <Link
            to="login"
            replace
            className="grid place-items-center rounded-[14px] px-6 font-semibold"
            style={{ minHeight: 44, border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)', color: 'var(--color-ios-ink)' }}
          >
            {translate(language, 'verifyEmail.backToLogin')}
          </Link>
        </div>
        <AuthBrandFooter />
      </AuthColumn>
    );
  }

  const pending = pendingVerificationFor(email);
  const lead =
    pending === null
      ? translate(language, 'verifyEmail.subtitle', { email })
      : translate(language, pending.accountCreated ? 'verifyEmail.subtitle.created' : 'verifyEmail.subtitle.pending', { email });

  return (
    <AuthColumn>
      <AuthColumnBar to={closeTarget} title={translate(language, 'verifyEmail.bar.title')} />

      {verified ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center" role="status">
          <span aria-hidden="true" style={{ color: 'var(--ios-success)' }}>
            <Glyph name="checks" size={48} />
          </span>
          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {translate(language, 'verifyEmail.verified')}
          </h2>
          <Link
            to={closeTarget}
            replace
            className="grid w-full place-items-center rounded-[14px] px-8 font-bold text-white"
            style={{ minHeight: 52, background: VERIFY_TINT }}
          >
            {translate(language, 'verifyEmail.continue')}
          </Link>
        </div>
      ) : linkPhase === 'checking' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center" role="status" aria-live="polite">
          <span aria-hidden="true" style={{ color: VERIFY_TINT }}>
            <Glyph name="envelopeOpen" size={48} />
          </span>
          <p className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {translate(language, 'verifyEmail.link.checking')}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
          <span aria-hidden="true" style={{ color: VERIFY_TINT }}>
            <Glyph name="envelopeOpen" size={48} />
          </span>
          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {translate(language, 'verifyEmail.title')}
          </h2>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>{withStrongEmail(lead, email)}</p>

          <EmailCodeForm
            email={email}
            next={next}
            verifyEmail={deps.verifyEmail}
            onVerified={() => setVerified(true)}
            autoFocus
            initialError={linkError}
          />

          <div className="grid gap-2">
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, 'verifyEmail.resend.prompt')}
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendSending || resendLocked || !online}
              aria-label={translate(language, 'verifyEmail.resend')}
              className="text-caption font-medium"
              style={{ color: VERIFY_TINT, opacity: resendSending || resendLocked ? 0.6 : 1, minHeight: 44 }}
            >
              {resendSending
                ? translate(language, 'verifyEmail.resend.busy')
                : resendLocked
                  ? translate(language, 'verifyEmail.resend.locked', { seconds: String(resendRemaining) })
                  : resendSent
                    ? translate(language, 'verifyEmail.resend.done')
                    : translate(language, 'verifyEmail.resend')}
            </button>
          </div>
        </div>
      )}

      <AuthBrandFooter />
    </AuthColumn>
  );
}
