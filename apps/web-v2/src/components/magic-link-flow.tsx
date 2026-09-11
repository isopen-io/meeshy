import { useState } from 'react';

import { auth } from '@/lib/api/auth';
import { isEmailValid } from '@/lib/signup-form';
import { useOnline } from '@/lib/net/online';
import { secondClock, type IntervalClock } from '@/lib/view/interval-clock';
import {
  formatCountdown,
  resolveMagicLinkRequest,
  spokenCountdown,
  type MagicLinkDeadline,
  type MagicLinkRequestOutcome,
} from '@/lib/view/magic-link';
import { useCountdown } from '@/lib/view/use-countdown';
import { Link } from '@/routes/route-table';

import { AuthBrandFooter, AuthSubmitButton } from './auth-chrome';
import { Field } from './field';
import { Glyph, GlyphSvg } from './glyph';
import { AUTH_GLYPHS } from './glyphs-auth';

/**
 * LE FLUX DU LIEN MAGIQUE (#5816) — anatomie de `MagicLinkView.swift`
 * (351 l.) : DEUX étapes exclusives (saisie / attente), le compte à rebours
 * dérivant de `Date.now()` via `useCountdown` (jamais un compteur qui saute
 * quand l'onglet dort, dimension 4).
 */

const MAGIC_LINK_SUBMIT_GRADIENT = 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))';

export type MagicLinkFlowDeps = {
  readonly request: typeof auth.requestMagicLink;
  readonly clock: IntervalClock;
  readonly now: () => number;
};

const defaultDeps: MagicLinkFlowDeps = { request: auth.requestMagicLink, clock: secondClock, now: () => Date.now() };

const OUTCOME_FIELD_ERROR = 'Adresse e-mail invalide';

function bannerFor(outcome: MagicLinkRequestOutcome | null): string | null {
  if (outcome === null) return null;
  if (outcome.kind === 'rate-limited') return 'Trop de demandes — réessayez dans une heure.';
  if (outcome.kind === 'offline') return 'Pas de connexion. Vérifiez votre réseau et réessayez.';
  if (outcome.kind === 'failed') return outcome.message;
  return null;
}

export function MagicLinkFlow({ deps = defaultDeps }: { deps?: MagicLinkFlowDeps }) {
  const online = useOnline();
  const [step, setStep] = useState<'input' | 'waiting'>('input');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<MagicLinkRequestOutcome | null>(null);
  const [deadline, setDeadline] = useState<MagicLinkDeadline | null>(null);
  const [focused, setFocused] = useState(false);

  const remaining = useCountdown(deadline, deps.clock, deps.now);
  const locale = typeof document === 'object' ? document.documentElement.lang || 'fr' : 'fr';

  async function send() {
    if (!isEmailValid(email) || submitting || !online) return;
    setSubmitting(true);
    setOutcome(null);
    const result = await deps.request({ email });
    setSubmitting(false);
    const resolved = resolveMagicLinkRequest(result);
    if (resolved.kind === 'sent') {
      setDeadline({ startedAt: deps.now(), expiresInSeconds: resolved.expiresInSeconds });
      setStep('waiting');
      return;
    }
    setOutcome(resolved);
  }

  function cancel() {
    setStep('input');
    setOutcome(null);
  }

  const fieldError = outcome?.kind === 'invalid-email' ? OUTCOME_FIELD_ERROR : undefined;
  const banner = bannerFor(outcome);

  if (step === 'waiting') {
    const expired = deadline !== null && remaining <= 0;
    return (
      <div className="flex h-dvh flex-col pt-safe pb-safe">
        <FlowHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
          <div
            aria-hidden="true"
            className="grid place-items-center rounded-full"
            style={{ width: 120, height: 120, backgroundColor: 'color-mix(in srgb, var(--ios-indigo-600) 10%, transparent)' }}
          >
            <Glyph name="envelopeOpen" size={48} style={{ color: 'var(--ios-indigo-500)' }} />
          </div>

          <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            Lien envoyé !
          </h2>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>
            Un lien de connexion a été envoyé à <strong style={{ color: 'var(--ios-indigo-400)' }}>{email}</strong>
          </p>

          {expired ? (
            <p role="alert" style={{ color: 'var(--ios-error)' }}>
              Lien expiré, renvoyez-en un nouveau
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--color-ios-ink-2)' }}>Ouvrez votre email et cliquez sur le lien</p>
              <p
                role="timer"
                aria-live="off"
                aria-label={`Le lien expire dans ${spokenCountdown(remaining, locale)}`}
                className="font-bold tabular-nums text-screen"
                style={{ color: 'var(--ios-indigo-600)' }}
              >
                {formatCountdown(remaining, locale)}
              </p>
            </>
          )}

          <button
            type="button"
            disabled={(!expired && remaining > 0) || submitting || !online}
            aria-label="Renvoyer le lien magique"
            onClick={send}
            className="inline-flex items-center gap-2 font-semibold text-title"
            style={{ minHeight: 44, color: expired ? 'var(--ios-indigo-400)' : 'var(--color-ios-ink-2)' }}
          >
            <GlyphSvg glyph={AUTH_GLYPHS.arrowClockwise} size={18} />
            Renvoyer
          </button>

          <button
            type="button"
            onClick={cancel}
            className="text-title font-medium"
            style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
          >
            Annuler
          </button>
        </div>
        <AuthBrandFooter />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col pt-safe pb-safe">
      <FlowHeader />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex flex-1 flex-col content-center justify-center gap-6 px-8"
        noValidate
      >
        <span
          aria-hidden="true"
          className="mx-auto"
          style={{ color: 'var(--ios-indigo-500)' }}
        >
          <GlyphSvg glyph={AUTH_GLYPHS.magicWand} size={56} />
        </span>

        <h2 className="text-center text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          Entrez votre adresse email
        </h2>
        <p className="text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
          Nous vous enverrons un lien de connexion sécurisé
        </p>

        <Field
          id="magic-link-email"
          glyph={AUTH_GLYPHS.envelope}
          tint="var(--ios-indigo-400)"
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
              spellCheck={false}
              autoFocus
              value={email}
              onInput={(e) => setEmail(e.currentTarget.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="nom@exemple.com"
              aria-label="Adresse email"
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
          label="Envoyer le lien magique"
          busyLabel="Envoi…"
          background={MAGIC_LINK_SUBMIT_GRADIENT}
        />
      </form>
      <AuthBrandFooter />
    </div>
  );
}

function FlowHeader() {
  return (
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
        Connexion par lien magique
      </h1>
    </div>
  );
}
