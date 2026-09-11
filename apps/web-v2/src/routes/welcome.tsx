import { AuthAmbient, AuthBrandFooter, AuthTitle } from '@/components/auth-chrome';
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
 */

const CREATE_ACCOUNT_GRADIENT = 'linear-gradient(135deg, var(--ios-indigo-500), var(--ios-indigo-700))';

export default function WelcomeScreen() {
  return (
    <div className="relative flex h-dvh flex-col items-center overflow-y-auto pt-safe pb-safe">
      <AuthAmbient />

      <div className="relative flex w-full max-w-sm flex-1 flex-col items-center px-6 py-10">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <AuthTitle gradient="brand" />
          <p className="mt-3 px-8 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
            Écrivez dans votre langue. Tout le monde vous lit dans la sienne.
          </p>
        </div>

        <div className="grid w-full gap-3 px-8">
          <Link
            to="signup"
            onClick={() => welcomeStore.markCompleted()}
            aria-describedby="welcome-create-account-hint"
            className="grid place-items-center rounded-[14px] font-bold text-white"
            style={{ minHeight: 52, background: CREATE_ACCOUNT_GRADIENT }}
          >
            Créer un compte
          </Link>
          <span id="welcome-create-account-hint" className="sr-only">
            Ouvre le formulaire d’inscription
          </span>

          <Link
            to="login"
            onClick={() => welcomeStore.markCompleted()}
            aria-describedby="welcome-sign-in-hint"
            className="grid place-items-center rounded-[14px] font-semibold"
            style={{
              minHeight: 52,
              border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
              color: 'var(--color-ios-ink)',
            }}
          >
            Se connecter
          </Link>
          <span id="welcome-sign-in-hint" className="sr-only">
            Ouvre l’écran de connexion
          </span>
        </div>

        <AuthBrandFooter />
      </div>
    </div>
  );
}
