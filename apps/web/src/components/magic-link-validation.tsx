import { useEffect, useRef, useState } from 'react';

import { auth } from '@/lib/api/auth';
import { confirmsSilently, linkConfirmationOf, type LinkQuestion } from '@/lib/api/link-confirmation';
import { accountReplacementOf, provenSessionOf, type AccountReplacement, type ProvenSessionGestures } from '@/lib/api/proven-session';
import { heldAccountOf, sessionStore } from '@/lib/api/session';
import { forgetEmailLinkSecret } from '@/lib/links/email-link-secret';
import { linkDeviceSecrets } from '@/lib/links/link-device-secret';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { translate } from '@/lib/i18n-catalog';
import { placeMagicLinkValidationFailure } from '@/lib/view/auth-feedback';
import { landingAfterSession } from '@/lib/session-guard';
import { href, Link, navigate } from '@/routes/route-table';

import { AccountReplacementPrompt, deviceProvenSessions } from './account-replacement-prompt';
import { AgeBlocked, AuthColumn, isAgeBelowMinimum } from './auth-column';
import { LinkSignInConfirmation } from './link-sign-in-confirmation';
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
 *
 * Un lien ouvert ailleurs que dans le navigateur qui l'a demandé (#10872) —
 * dont tout lien du digest — ne pose RIEN : la passerelle rend le compte
 * visé, l'écran demande « Se connecter en tant que @x ? », et seul le « oui »
 * rejoue la validation avec `confirm`. Le même compte déjà ouvert se confirme
 * sans question.
 */

type ValidationState = 'validating' | 'invalid' | 'offline' | 'age-blocked' | 'ask' | 'confirm' | 'done';

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
  const [asked, setAsked] = useState<LinkQuestion | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const called = useRef(false);
  const language = currentInterfaceLanguage();

  useEffect(() => {
    if (token === null) return;
    if (called.current) return;
    called.current = true;
    void run(false);
  }, [token]);

  async function run(confirm: boolean) {
    setState('validating');
    const result = await validate(token as string, confirm ? { confirm } : {});
    const question = result.ok ? linkConfirmationOf(result.data) : null;
    if (question !== null) {
      if (!confirm && confirmsSilently(sessionStore.getState().session, question.account)) {
        setConfirmed(true);
        void run(true);
        return;
      }
      setAsked(question);
      setState('ask');
      return;
    }
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

  function decline() {
    forgetEmailLinkSecret();
    linkDeviceSecrets.forget();
    go(href(sessionStore.getState().session.status === 'authenticated' ? 'list' : 'login'), true);
  }

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
            {translate(language, 'magicLink.validating')}
          </p>
        </>
      ) : null}

      {state === 'invalid' ? (
        <>
          <Glyph name="warningCircle" size={48} className="mx-auto" style={{ color: 'var(--ios-error)' }} />
          <h1 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {translate(language, 'magicLink.invalid.title')}
          </h1>
          <p style={{ color: 'var(--color-ios-ink-2)' }}>{translate(language, 'magicLink.invalid.body')}</p>
          <div className="grid gap-3">
            <Link
              to="magicLink"
              replace
              search={{ next: returnUrl ?? undefined }}
              className="grid place-items-center rounded-field font-bold text-ios-on-brand"
              style={{ minHeight: 52, background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))' }}
            >
              {translate(language, 'magicLink.requestNew')}
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
              {translate(language, 'magicLink.backToLogin')}
            </Link>
          </div>
        </>
      ) : null}

      {state === 'ask' && asked !== null ? (
        <LinkSignInConfirmation
          language={language}
          question={asked}
          current={heldAccountOf(sessionStore.getState().session)?.user ?? null}
          onConfirm={() => {
            setConfirmed(true);
            void run(true);
          }}
          onCancel={decline}
        />
      ) : null}

      {state === 'confirm' && replacement !== null ? (
        <AccountReplacementPrompt
          language={language}
          replacement={replacement}
          gestures={gestures}
          alreadyConfirmed={confirmed}
          onAdopted={() => go(replacement.proven.kind === 'second-factor' ? href('login') : landingAfterSession(returnUrl, href('list')), true)}
          onDiscarded={() => go(href('list'), true)}
        />
      ) : null}

      {state === 'age-blocked' ? <AgeBlocked language={language} onConfirm={() => go(href('login'), true)} /> : null}

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
            {translate(language, 'magicLink.retry')}
          </button>
        </>
      ) : null}
    </AuthColumn>
  );
}
