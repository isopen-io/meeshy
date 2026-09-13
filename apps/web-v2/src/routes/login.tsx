import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { AuthAmbient, AuthBrandFooter, AuthSubmitButton, AuthTitle } from '@/components/auth-chrome';
import { Field } from '@/components/field';
import { auth } from '@/lib/api/auth';
import { sessionStore } from '@/lib/api/session';
import { useOnline } from '@/lib/net/online';
import { placeLoginFailure } from '@/lib/view/auth-feedback';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * L'ÉCRAN DE CONNEXION (#5555) — anatomie de `LoginView.swift:93-166`.
 *
 * TROIS sections EXCLUSIVES : la connexion normale, le second facteur, et le
 * sélecteur de comptes sauvegardés — ce dernier NON REPRIS (§ 9 Q3 de la
 * spécification, aucun trousseau web). La section active se lit sur le
 * MAGASIN DE SESSION partagé (`session.status === 'pending2fa'`), jamais un
 * état local dupliqué : c'est la MÊME source que `SessionGate` (`main.tsx`)
 * consulte pour décider si cet écran doit même rester affiché.
 */

/** Le violet de marque du titre — `purple700 → purple600 → purple500`
 * (`LoginView.swift:109`), dérivé de Swift (D-4). C'est la SEULE surface de
 * l'application qui emploie cette rampe : la marque partout ailleurs est
 * indigo (`--color-ios-brand`). */
const TITLE_GRADIENT = 'linear-gradient(90deg, var(--ios-purple-700), var(--ios-purple-600), var(--ios-purple-500))';
const FOCUS_TINT = 'var(--ios-purple-600)';

export default function LoginScreen() {
  const session = useStore(sessionStore, (s) => s.session);
  const online = useOnline();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [focused, setFocused] = useState<'username' | 'password' | 'code' | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requires2FA = session.status === 'pending2fa';

  /**
   * L'AUTHENTIFICATION PARLE TOUJOURS À LA PASSERELLE RÉELLE (`auth.ts` importe
   * `httpTransport`, jamais les fixtures) — indépendamment de `apiConfig.source`,
   * qui ne gouverne QUE les données de liste/fil. Une connexion réussie doit
   * donc mener vers `/` ICI, sans attendre `SessionGate` (`main.tsx`), dont la
   * garde `redirect-home` ne mord qu'en source `'gateway'` (T7 : les fixtures
   * restent `allow` partout, délibérément, pour ne pas casser le POC).
   */
  useEffect(() => {
    if (session.status === 'authenticated') navigate(href('list'), true);
  }, [session.status]);

  async function handleLoginSubmit(event: FormEvent) {
    event.preventDefault();
    if (username.trim() === '' || password === '' || isSubmitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    const result = await auth.login({ username, password });
    setSubmitting(false);
    if (!result.ok) setErrorMessage(placeLoginFailure(result).message);
    // Un succès (avec ou sans 2FA) écrit le magasin — `session.status` change
    // et `SessionGate` (`main.tsx`) prend la suite (redirection vers `/`).
  }

  async function handleTwoFactorSubmit(event: FormEvent) {
    event.preventDefault();
    if (twoFactorCode.length < 6 || isSubmitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    const result = await auth.completeTwoFactor(twoFactorCode);
    setSubmitting(false);
    if (!result.ok) setErrorMessage(placeLoginFailure(result).message);
  }

  function cancelTwoFactor() {
    sessionStore.getState().clearSession();
    setTwoFactorCode('');
    setErrorMessage(null);
  }

  return (
    <div className="relative flex h-dvh flex-col items-center overflow-y-auto pt-safe pb-safe">
      <AuthAmbient />

      <div className="relative flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8 px-6 py-10">
        <AuthTitle gradient="login" />

        {!online ? (
          <p className="w-full rounded-[14px] px-4 py-2 text-center text-caption" style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink-2)' }}>
            Hors ligne — la connexion n’est pas possible pour l’instant.
          </p>
        ) : null}

        {requires2FA ? (
          <form onSubmit={handleTwoFactorSubmit} className="grid w-full gap-4" noValidate>
            <div className="grid gap-1 text-center">
              <h2 className="text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
                Double authentification
              </h2>
              <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                Entrez le code de votre application d’authentification.
              </p>
            </div>

            <Field id="login-2fa-code" icon="key" tint={FOCUS_TINT} focused={focused === 'code'}>
              {({ id }) => (
                <input
                  id={id}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="Code à 6 chiffres"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.currentTarget.value.replace(/\D/g, ''))}
                  onFocus={() => setFocused('code')}
                  onBlur={() => setFocused(null)}
                  placeholder="Code à 6 chiffres"
                  className="w-full bg-transparent py-3 text-input outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                />
              )}
            </Field>

            {errorMessage !== null ? (
              <p role="alert" className="text-center text-caption" style={{ color: 'var(--ios-error)' }}>
                {errorMessage}
              </p>
            ) : null}

            <AuthSubmitButton
              disabled={twoFactorCode.length < 6 || !online}
              isSubmitting={isSubmitting}
              label="Valider"
              busyLabel="Vérification…"
            />

            <button
              type="button"
              onClick={cancelTwoFactor}
              className="py-2 text-center text-title font-semibold"
              style={{ color: 'var(--color-ios-ink-2)', minHeight: 44 }}
            >
              Annuler
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="grid w-full gap-4" noValidate>
            <Field id="login-username" label="Identifiant" icon="user" tint={FOCUS_TINT} focused={focused === 'username'}>
              {({ id }) => (
                <input
                  id={id}
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                  onFocus={() => setFocused('username')}
                  onBlur={() => setFocused(null)}
                  placeholder="Identifiant, e-mail ou téléphone"
                  className="w-full bg-transparent py-3 text-input outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                />
              )}
            </Field>

            <Field id="login-password" label="Mot de passe" icon="lock" tint={FOCUS_TINT} focused={focused === 'password'}>
              {({ id }) => (
                <input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="Mot de passe"
                  className="w-full bg-transparent py-3 text-input outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                />
              )}
            </Field>

            {errorMessage !== null ? (
              <p role="alert" className="text-center text-caption" style={{ color: 'var(--ios-error)' }}>
                {errorMessage}
              </p>
            ) : null}

            <AuthSubmitButton
              disabled={username.trim() === '' || password === '' || !online}
              isSubmitting={isSubmitting}
              label="Se connecter"
              busyLabel="Connexion…"
            />

            {/* LES DEUX PORTES (#5816) — `LoginView.swift:478-503` : « Connexion
                sans mot de passe » EN PREMIER (action mise en avant, l.481-493),
                « Mot de passe oublié ? » EN DESSOUS (l.495-501) — empilées,
                jamais côte à côte (doc-comment l.479-480). Ancres, pas des
                boutons qui naviguent : pas d'`history`, un vrai `href`. */}
            <div className="mt-1 grid justify-items-center gap-2">
              <Link
                to="magicLink"
                className="inline-flex items-center font-semibold text-title"
                style={{
                  minHeight: 44,
                  background: 'linear-gradient(90deg, var(--ios-purple-500), var(--ios-indigo-400))',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Connexion sans mot de passe
              </Link>
              <Link
                to="forgotPassword"
                className="inline-flex items-center font-medium text-title"
                style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
                aria-label="Mot de passe oublié"
              >
                Mot de passe oublié ?
              </Link>
            </div>
          </form>
        )}

        <p className="text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
          Pas de compte ?{' '}
          <Link to="signup" className="font-semibold" style={{ background: TITLE_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            Créer un compte
          </Link>
        </p>

        <AuthBrandFooter />
      </div>
    </div>
  );
}
