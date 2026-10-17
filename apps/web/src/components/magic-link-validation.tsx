import { useEffect, useRef, useState } from 'react';

import { auth } from '@/lib/api/auth';
import { accountReplacementOf, provenSessionOf, type AccountReplacement, type ProvenSessionGestures } from '@/lib/api/proven-session';
import { heldAccountOf, sessionStore } from '@/lib/api/session';
import { forgetEmailLinkSecret } from '@/lib/links/email-link-secret';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { placeMagicLinkValidationFailure } from '@/lib/view/auth-feedback';
import { landingAfterSession } from '@/lib/session-guard';
import { href, Link, navigate } from '@/routes/route-table';

import { AccountReplacementPrompt, deviceProvenSessions } from './account-replacement-prompt';
import { AgeBlocked, AuthColumn, isAgeBelowMinimum } from './auth-column';
import { AUTH_GLYPHS } from './glyphs-auth';
import { Glyph, GlyphSvg } from './glyph';

/**
 * LA VALIDATION D'UN LIEN MAGIQUE (#5816) — un appel EXACTEMENT une fois
 * (`useRef` gardé, StrictMode monte deux fois en dev), même le jeton
 * ABSENT ne déclenche RIEN. Rien n'est purgé avant la preuve (#10451) :
 * `auth.validateMagicLink()` pose la session prouvée sauf quand elle
 * appartient à un AUTRE compte que le compte ouvert — l'écran pose alors la
 * question (`AccountReplacementPrompt`), et un refus laisse la session ouverte
 * intacte.
 */

type ValidationState = 'validating' | 'invalid' | 'offline' | 'age-blocked' | 'confirm' | 'done';

export function MagicLinkValidation({
  token,
  returnUrl,
  validate = auth.validateMagicLink,
  go = navigate,
  gestures = deviceProvenSessions,
}: {
  token: string | null;
  returnUrl: string | null;
  validate?: typeof auth.validateMagicLink;
  go?: typeof navigate;
  gestures?: ProvenSessionGestures;
}) {
  const [state, setState] = useState<ValidationState>(token === null ? 'invalid' : 'validating');
  const [message, setMessage] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<AccountReplacement | null>(null);
  const called = useRef(false);

  useEffect(() => {
    if (token === null) return;
    if (called.current) return;
    called.current = true;
    void run();

    async function run() {
      setState('validating');
      const result = await validate(token as string);
      if (result.ok) {
        forgetEmailLinkSecret();
        const session = sessionStore.getState().session;
        const pending = accountReplacementOf(session, provenSessionOf(result.data));
        if (pending !== null) {
          setReplacement(pending);
          setState('confirm');
          return;
        }
        if ('requires2FA' in result.data && result.data.requires2FA && heldAccountOf(session) === null) {
          go(href('login'), true);
          return;
        }
        setState('done');
        go(landingAfterSession(returnUrl, href('list')), true);
        return;
      }
      if (isAgeBelowMinimum(result)) {
        forgetEmailLinkSecret();
        setState('age-blocked');
        return;
      }
      if (result.status === 0) {
        setState('offline');
        setMessage(placeMagicLinkValidationFailure(result).message);
        return;
      }
      if (result.status === 400) forgetEmailLinkSecret();
      setState('invalid');
    }
  }, [token]);

  function retry() {
    called.current = false;
    setState(token === null ? 'invalid' : 'validating');
  }

  return (
    <AuthColumn className="justify-center gap-6 px-8 text-center">
      {state === 'validating' ? (
        <>
          <span aria-hidden="true" className="mx-auto" style={{ color: 'var(--ios-indigo-500)' }}>
            <GlyphSvg glyph={AUTH_GLYPHS.magicWand} size={56} />
          </span>
          <p aria-busy="true" style={{ color: 'var(--color-ios-ink-2)' }}>
            Vérification du lien…
          </p>
        </>
      ) : null}

      {state === 'invalid' ? (
        <>
          <Glyph name="warningCircle" size={48} className="mx-auto" style={{ color: 'var(--ios-error)' }} />
          <h1 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            Lien invalide ou expiré
          </h1>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>Un lien de connexion expire après 10 minutes et ne sert qu’une fois.</p>
          <div className="grid gap-3">
            <Link
              to="magicLink"
              replace
              search={{ next: returnUrl ?? undefined }}
              className="grid place-items-center rounded-field font-bold text-ios-on-brand"
              style={{ minHeight: 52, background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))' }}
            >
              Demander un nouveau lien
            </Link>
            <Link
              to="login"
              search={{ next: returnUrl ?? undefined }}
              replace
              className="grid place-items-center rounded-field font-semibold"
              style={{
                minHeight: 52,
                border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
                color: 'var(--color-ios-ink)',
              }}
            >
              Retour à la connexion
            </Link>
          </div>
        </>
      ) : null}

      {state === 'confirm' && replacement !== null ? (
        <AccountReplacementPrompt
          language={currentInterfaceLanguage()}
          replacement={replacement}
          gestures={gestures}
          onAdopted={() => go(replacement.proven.kind === 'second-factor' ? href('login') : landingAfterSession(returnUrl, href('list')), true)}
          onDiscarded={() => go(href('list'), true)}
        />
      ) : null}

      {state === 'age-blocked' ? <AgeBlocked language={currentInterfaceLanguage()} onConfirm={() => go(href('login'), true)} /> : null}

      {state === 'offline' ? (
        <>
          <p role="alert" style={{ color: 'var(--ios-error)' }}>
            {message}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mx-auto grid place-items-center rounded-field px-6 font-semibold text-ios-on-brand"
            style={{ minHeight: 44, background: 'var(--color-ios-brand)' }}
          >
            Réessayer
          </button>
        </>
      ) : null}
    </AuthColumn>
  );
}
