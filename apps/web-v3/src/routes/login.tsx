import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { BrandMark } from '@/components/brand-mark';
import { Field } from '@/components/field';
import { Glyph } from '@/components/glyph';
import { auth } from '@/lib/api/auth';
import { sessionStore } from '@/lib/api/session';
import { BRAND_CREDIT, BRAND_SIGNATURE_MASK_PATH, brandVersionLine } from '@/lib/brand';
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
      {/* Le halo d'ambiance — statique, sans les orbes animés de LoginView.swift
          (§ 9 Q5 de la spécification) : `prefers-reduced-motion` coupe déjà
          toute animation (app.css), et un halo qui respire n'apportait rien
          qu'un dégradé fixe ne dise déjà. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(60% 40% at 50% 20%, color-mix(in srgb, var(--color-ios-brand) 18%, transparent), transparent)' }}
      />

      <div className="relative flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8 px-6 py-10">
        {/* Les trois traits, JAMAIS l'icône d'application — `LoginView.swift:96-103`
            monte `AnimatedLogoView(color: isDark ? .white : indigo950, lineWidth: 10)`,
            soit le glyphe SEUL, teinté par le schéma. `var(--color-ios-ink)`
            EST ce couple de valeurs dans la table dérivée (D-4). */}
        <span style={{ color: 'var(--color-ios-ink)' }}>
          <BrandMark size={100} lineWidth={10} />
        </span>

        <h1
          className="text-large-title font-bold"
          style={{ background: TITLE_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
        >
          Meeshy
        </h1>

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

            <SubmitButton
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

            <SubmitButton
              disabled={username.trim() === '' || password === '' || !online}
              isSubmitting={isSubmitting}
              label="Se connecter"
              busyLabel="Connexion…"
            />
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

/**
 * LE PIED DE MARQUE — mêmes constantes que `institutional/brand-signature.tsx`
 * (`brandVersionLine`, `BRAND_CREDIT`, `BRAND_SIGNATURE_MASK_PATH`, § `lib/brand.ts`,
 * et la version par `__APP_VERSION__`, le littéral que `vite.config.ts` LIT
 * dans `package.json` — jamais une chaîne recopiée),
 * un rendu LOCAL plutôt qu'une reprise du composant lui-même : ce fichier
 * compile son JSX vers `react/jsx-runtime` (le défaut de l'application),
 * `brand-signature.tsx` vers `preact/jsx-runtime` — sa pragma de tête, requise
 * par son second consommateur `preact-render-to-string`. Les deux ALIAS vers
 * le même module au runtime (D-2, `vite.config.ts`), mais portent des types de
 * retour distincts que TypeScript refuse de composer en JSX. Les VALEURS
 * restent la source unique ; seul le RENDU est dupliqué, par la frontière de
 * pragma, pas par choix.
 *
 * ⚠ NE PAS ÉCRIRE LE NOM DE CETTE PRAGMA ICI, MÊME ENTRE GUILLEMETS (revue de
 * #5555, défaut 9). Le transpileur de bun cherche la directive dans TOUT
 * commentaire du fichier, pas seulement en tête : la mentionner dans cette
 * explication la rendait ACTIVE, avec pour valeur le reste de la ligne
 * (`preact`,`). `bun run build` passait — le module n'était jamais résolu
 * qu'au rendu — et `bun test` échouait sur `Cannot find module 'preact`,\n
 * /jsx-dev-runtime'` dès qu'un témoin montait l'écran. Un commentaire qui
 * DÉCRIT une directive ne doit jamais pouvoir EN ÊTRE une.
 */
function AuthBrandFooter() {
  return (
    <div className="mt-6 flex flex-col items-center gap-1 text-center text-sm">
      <p style={{ color: 'var(--color-ios-ink-2)' }}>{brandVersionLine(__APP_VERSION__)}</p>
      <p className="font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
        {BRAND_CREDIT}
      </p>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 28,
          height: 28,
          marginTop: 2,
          opacity: 0.9,
          backgroundColor: 'var(--ios-error)',
          maskImage: `url(${BRAND_SIGNATURE_MASK_PATH})`,
          WebkitMaskImage: `url(${BRAND_SIGNATURE_MASK_PATH})`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
        }}
      />
    </div>
  );
}

/** Le bouton d'envoi PARTAGÉ des deux formulaires — hauteur 52,
 * gradient `error → indigo400` (`LoginView.swift:524-552`), disabled
 * pendant l'envoi OU tant qu'un champ requis manque. */
function SubmitButton({
  disabled,
  isSubmitting,
  label,
  busyLabel,
}: {
  disabled: boolean;
  isSubmitting: boolean;
  label: string;
  /** Ce que dit le bouton PENDANT l'envoi. Il entre en paramètre parce que les
   * deux formulaires n'envoient pas la même chose : « Connexion… » pour la
   * connexion, « Vérification… » pour le second facteur — un libellé d'envoi
   * en dur annonçait « Connexion… » sous un bouton « Valider ». */
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || isSubmitting}
      aria-busy={isSubmitting}
      className="grid place-items-center rounded-[14px] font-bold text-white transition-opacity"
      style={{
        minHeight: 52,
        background: 'linear-gradient(90deg, var(--ios-error), var(--ios-indigo-400))',
        opacity: disabled || isSubmitting ? 0.6 : 1,
      }}
    >
      {isSubmitting ? (
        <span className="flex items-center gap-2">
          <Glyph name="clock" size={18} className="animate-pulse" />
          {busyLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
}
