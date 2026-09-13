import { useEffect, useRef, useState } from 'react';

import { auth } from '@/lib/api/auth';
import { placeMagicLinkValidationFailure } from '@/lib/view/auth-feedback';
import { safeReturnPath } from '@/lib/view/magic-link';
import { href, Link, navigate } from '@/routes/route-table';

import { AUTH_GLYPHS } from './glyphs-auth';
import { Glyph, GlyphSvg } from './glyph';

/**
 * LA VALIDATION D'UN LIEN MAGIQUE (#5816) — un appel EXACTEMENT une fois
 * (`useRef` gardé, StrictMode monte deux fois en dev), même le jeton
 * ABSENT ne déclenche RIEN. Sur succès : `clearSession()` + connexion sont
 * portées par `auth.validateMagicLink()` lui-même (le P0
 * `MeeshyApp.swift:1019-1034`) — cet écran ne fait que naviguer ensuite.
 */

type ValidationState = 'validating' | 'invalid' | 'offline' | 'done';

export function MagicLinkValidation({
  token,
  returnUrl,
  validate = auth.validateMagicLink,
  go = navigate,
}: {
  token: string | null;
  returnUrl: string | null;
  validate?: typeof auth.validateMagicLink;
  go?: typeof navigate;
}) {
  const [state, setState] = useState<ValidationState>(token === null ? 'invalid' : 'validating');
  const [message, setMessage] = useState<string | null>(null);
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
        if ('requires2FA' in result.data && result.data.requires2FA) {
          go(href('login'), true);
          return;
        }
        setState('done');
        go(safeReturnPath(returnUrl), true);
        return;
      }
      if (result.status === 0) {
        setState('offline');
        setMessage(placeMagicLinkValidationFailure(result).message);
        return;
      }
      setState('invalid');
    }
  }, [token]);

  function retry() {
    called.current = false;
    setState(token === null ? 'invalid' : 'validating');
  }

  return (
    <div className="grid h-dvh content-center gap-6 px-8 pt-safe pb-safe text-center">
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
          <p style={{ color: 'var(--color-ios-ink-2)' }}>Un lien magique expire après 10 minutes et ne sert qu’une fois.</p>
          <div className="grid gap-3">
            <Link
              to="magicLink"
              replace
              className="grid place-items-center rounded-[14px] font-bold text-white"
              style={{ minHeight: 52, background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))' }}
            >
              Demander un nouveau lien
            </Link>
            <Link
              to="login"
              replace
              className="grid place-items-center rounded-[14px] font-semibold"
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

      {state === 'offline' ? (
        <>
          <p role="alert" style={{ color: 'var(--ios-error)' }}>
            {message}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mx-auto grid place-items-center rounded-[14px] px-6 font-semibold text-white"
            style={{ minHeight: 44, background: 'var(--color-ios-brand)' }}
          >
            Réessayer
          </button>
        </>
      ) : null}
    </div>
  );
}
