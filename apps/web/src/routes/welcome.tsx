import { AuthBrandFooter, AuthTitle } from '@/components/auth-chrome';
import { AuthColumn } from '@/components/auth-column';
import { AuthHeader } from '@/components/auth-header';
import { useInterfaceLanguage } from '@/components/public-header';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { welcomeStore } from '@/lib/welcome';
import { Link } from '@/routes/route-table';

/**
 * L'ACCUEIL À DEUX PORTES (#5816) — anatomie de `WelcomeView.swift` (136 l.) :
 * fond dégradé, halo, les trois traits + « Meeshy » (`brandGradient`, indigo500
 * → indigo700 diagonal, l.42-46), tagline `welcome.tagline`, deux boutons
 * pleine largeur (« Créer un compte » plein, « Se connecter » à contour), pied
 * de marque.
 *
 * Rendu UNE fois par appareil (`welcomeStore`, miroir `@AppStorage
 * ("hasCompletedOnboarding")`, `MeeshyApp.swift:18, 37-39`) : les DEUX portes
 * SOLDENT l'accueil AU CLIC (`onClick`, jamais un `useEffect` de montage — un
 * visiteur qui ferme l'onglet ici le revoit, § 9 Q1 de la spécification).
 *
 * AUCUN TEXTE EN DUR (épure #17584) : la phrase d'accueil est `welcome.tagline`
 * du lexique de l'épure (`docs/product/epure-lexique.md`), les deux portes
 * portent les mots de l'écran de connexion (`login.createAccount`,
 * `login.submit`), dans la langue que l'en-tête laisse choisir.
 */

const CREATE_ACCOUNT_GRADIENT = 'linear-gradient(135deg, var(--ios-indigo-500), var(--ios-indigo-700))';

export default function WelcomeScreen() {
  return <WelcomeDoors language={useInterfaceLanguage()} />;
}

export function WelcomeDoors({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <AuthColumn className="items-center px-6 pb-10">
      <AuthHeader back="home" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <AuthTitle gradient="brand" />
        <p className="mt-3 px-8 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'welcome.tagline')}
        </p>
      </div>

      <div className="grid w-full gap-3 px-8">
        <Link
          to="signup"
          onClick={() => welcomeStore.markCompleted()}
          aria-describedby="welcome-create-account-hint"
          className="btn-press grid place-items-center rounded-field font-bold text-ios-on-brand"
          style={{ minHeight: 52, background: CREATE_ACCOUNT_GRADIENT }}
        >
          {translate(language, 'login.createAccount')}
        </Link>
        <span id="welcome-create-account-hint" className="sr-only">
          {translate(language, 'welcome.createAccount.hint')}
        </span>

        <Link
          to="login"
          onClick={() => welcomeStore.markCompleted()}
          aria-describedby="welcome-sign-in-hint"
          className="btn-press grid place-items-center rounded-field font-semibold"
          style={{
            minHeight: 52,
            border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
            color: 'var(--color-ios-ink)',
          }}
        >
          {translate(language, 'login.submit')}
        </Link>
        <span id="welcome-sign-in-hint" className="sr-only">
          {translate(language, 'welcome.signIn.hint')}
        </span>
      </div>

      <AuthBrandFooter />
    </AuthColumn>
  );
}
