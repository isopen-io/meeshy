import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { auth } from '@/lib/api/auth';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { forgetPendingVerification, pendingVerificationFor } from '@/lib/pending-verification';
import { landingAfterSession } from '@/lib/session-guard';
import { resolveVerifyEmailOutcome, type VerifyEmailOutcome } from '@/lib/view/auth-feedback';
import { watchVerificationStatus, type VerificationStatusReader } from '@/lib/view/verification-watch';
import { href, navigate } from '@/routes/route-table';

import { AuthSubmitButton } from './auth-chrome';
import { Field } from './field';

/**
 * LA SAISIE DU CODE REÇU PAR E-MAIL (#8034, contrat #8033) — le champ à six
 * chiffres, son refus et son bouton, SANS chrome de page. Deux hôtes :
 * `/auth/verify-email` (l'écran du code) et l'étape « e-mail envoyé » de la
 * connexion par e-mail (`MagicLinkPanel`), où le porteur veut la saisie SUR
 * PLACE (arbitrage 2026-09-26 : « email seul → code + lien »). Une machine,
 * deux hôtes — même doctrine que `MagicLinkPanel` lui-même.
 *
 * **La vérification OUVRE la session.** La passerelle rend `{ token,
 * sessionToken, user }` ; `auth.verifyEmail` l'établit par le même `establish`
 * que la connexion, et ce formulaire mène là où une connexion mène
 * (`landingAfterSession`). Une passerelle antérieure vérifie sans connecter :
 * l'hôte reçoit alors `onVerified` et garde son ancien comportement.
 *
 * **Le mot de passe tapé à la connexion** (`pending-verification.ts`) voyage
 * AVEC le code, jamais avec un lien, et s'oublie dès que la session s'ouvre.
 * Un code refusé le garde : l'essai suivant doit pouvoir le porter.
 *
 * **L'adresse confirmée AILLEURS** (#8083, « si et seulement si ») : avec le
 * jeton d'attente de CET appareil, le formulaire lit l'état de l'adresse
 * (`verification-watch.ts`) et, `proven`, le DIT — le lien ouvert sur un autre
 * appareil ne fige plus cet écran. Il n'ouvre aucune session : le code saisi
 * ici reste la seule clé de cet appareil.
 */

export type EmailCodeFormDeps = {
  readonly verifyEmail: typeof auth.verifyEmail;
  readonly verificationStatus: VerificationStatusReader;
};

function useAddressProvenElsewhere(pendingSessionToken: string | null, read: VerificationStatusReader): boolean {
  const [proven, setProven] = useState(false);
  useEffect(() => {
    if (pendingSessionToken === null || pendingSessionToken === '') return;
    return watchVerificationStatus({ token: pendingSessionToken, read, view: window, onProven: () => setProven(true) });
  }, [pendingSessionToken, read]);
  return proven;
}

const VERIFY_TINT = 'var(--color-ios-brand)';

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function verifyEmailErrorText(outcome: VerifyEmailOutcome): string | null {
  const language = currentInterfaceLanguage();
  if (outcome.kind === 'invalid-code') return translate(language, 'verifyEmail.error.invalid');
  if (outcome.kind === 'offline') return translate(language, 'verifyEmail.error.offline');
  if (outcome.kind === 'rate-limited') return translate(language, 'verifyEmail.error.rateLimited');
  if (outcome.kind === 'failed') return outcome.message;
  return null;
}

/** Une phrase du catalogue dont l'adresse ressort en gras — le texte vient
 * ENTIER de la langue (l'ordre des mots n'est pas le nôtre), l'adresse est
 * retrouvée DANS la phrase rendue. */
export function withStrongEmail(text: string, email: string, color?: string): ReactNode {
  const at = text.indexOf(email);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <strong style={color === undefined ? undefined : { color }}>{email}</strong>
      {text.slice(at + email.length)}
    </>
  );
}

export function goToLanding(next: string | null): void {
  forgetPendingVerification();
  navigate(landingAfterSession(next, href('list')), true);
}

export function EmailCodeForm({
  email,
  next,
  onVerified,
  verifyEmail = auth.verifyEmail,
  verificationStatus = auth.verificationStatus,
  pendingSessionToken = null,
  autoFocus = false,
  initialError = null,
}: {
  readonly email: string;
  readonly next: string | null;
  /** Vérifié SANS session (passerelle antérieure) — l'hôte décide de la suite. */
  readonly onVerified: () => void;
  readonly verifyEmail?: EmailCodeFormDeps['verifyEmail'];
  readonly verificationStatus?: EmailCodeFormDeps['verificationStatus'];
  /** Le jeton d'attente de CET appareil (#8083) — `null` : rien à surveiller. */
  readonly pendingSessionToken?: string | null;
  readonly autoFocus?: boolean;
  readonly initialError?: string | null;
}) {
  const online = useOnline();
  const language = currentInterfaceLanguage();
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const provenElsewhere = useAddressProvenElsewhere(pendingSessionToken, verificationStatus);

  const isComplete = code.length === 6;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isComplete || verifying || !online) return;
    setVerifying(true);
    setError(null);
    const password = pendingVerificationFor(email)?.password;
    const result = await verifyEmail({ email, code, ...(password !== undefined ? { password } : {}) });
    setVerifying(false);
    const outcome = resolveVerifyEmailOutcome(result);
    if (outcome.kind === 'signed-in') {
      goToLanding(next);
      return;
    }
    if (outcome.kind === 'verified') {
      forgetPendingVerification();
      onVerified();
      return;
    }
    setError(verifyEmailErrorText(outcome));
  }

  return (
    <form onSubmit={handleSubmit} className="grid w-full gap-4" noValidate>
      {provenElsewhere ? (
        <p role="status" className="text-caption font-semibold" style={{ color: 'var(--ios-success)' }}>
          {translate(language, 'verifyEmail.proven')}
        </p>
      ) : null}
      <Field id="verify-email-code" tint={VERIFY_TINT} focused={focused} error={error ?? undefined}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-label={translate(language, 'verifyEmail.code.label')}
            aria-invalid={error !== null}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus={autoFocus}
            value={code}
            /* `onInput`, jamais `onChange` (motif `magic-link-flow.tsx#magic-link-email`) —
               un témoin qui pose `.value` puis redispatche un `input` natif n'est vu QUE par
               `onInput` sous ce harnais. */
            onInput={(e) => setCode(onlyDigits(e.currentTarget.value))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="000000"
            disabled={verifying || !online}
            className="w-full bg-transparent py-3 text-center text-input font-semibold tracking-wide outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
          />
        )}
      </Field>

      <AuthSubmitButton
        disabled={!isComplete || !online}
        isSubmitting={verifying}
        label={translate(language, 'verifyEmail.submit')}
        busyLabel={translate(language, 'verifyEmail.submit.busy')}
        background={VERIFY_TINT}
      />
    </form>
  );
}
