import { Glyph } from './glyph';
import { BrandMark } from './brand-mark';
import { BRAND_CREDIT, BRAND_SIGNATURE_MASK_PATH, brandVersionLine } from '@/lib/brand';

/**
 * LE CHROME PARTAGÉ DES ÉCRANS D'AUTHENTIFICATION (#5816, E1) — extrait de
 * `routes/login.tsx` SANS changement de rendu (`auth-screens.test.tsx`
 * existant reste vert) : trois écrans neufs (`welcome`, `magic-link`,
 * `forgot-password`) en ont besoin dès ce lot, un quatrième
 * (`/reset-password`, hors tranche) les consommera à son tour.
 */

/** Le halo d'ambiance — statique (§ 9 Q10 : aucune pulsation, `prefers-reduced-motion`
 * coupe déjà toute animation). `LoginView.swift:91-95`. */
export function AuthAmbient() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ background: 'radial-gradient(60% 40% at 50% 20%, color-mix(in srgb, var(--color-ios-brand) 18%, transparent), transparent)' }}
    />
  );
}

/** Les trois traits + « Meeshy », `gradient` DIT quelle rampe teindre le
 * titre — la violette de `LoginView.swift:109` (connexion), ou `brand`
 * (indigo500 → indigo700 diagonal, `WelcomeView.swift:42-46`, l'accueil). */
export function AuthTitle({ gradient }: { gradient: 'login' | 'brand' }) {
  const background =
    gradient === 'login'
      ? 'linear-gradient(90deg, var(--ios-purple-700), var(--ios-purple-600), var(--ios-purple-500))'
      : 'linear-gradient(135deg, var(--ios-indigo-500), var(--ios-indigo-700))';
  return (
    <>
      <span style={{ color: 'var(--color-ios-ink)' }}>
        <BrandMark size={100} lineWidth={10} />
      </span>
      <h1
        className="text-large-title font-bold"
        style={{ background, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
      >
        Meeshy
      </h1>
    </>
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
export function AuthBrandFooter() {
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

/** Le bouton d'envoi PARTAGÉ des formulaires d'authentification — hauteur 52,
 * `background` par défaut le dégradé `error → indigo400` de la connexion
 * (`LoginView.swift:524-552`) ; le lien magique passe `indigo600 → indigo400`
 * (`MagicLinkView.swift:156-162`), le mot de passe oublié `brandPrimary`
 * (`MeeshyForgotPasswordView.swift:309`). `disabled` pendant l'envoi OU tant
 * qu'un champ requis manque. */
export function AuthSubmitButton({
  disabled,
  isSubmitting,
  label,
  busyLabel,
  background = 'linear-gradient(90deg, var(--ios-error), var(--ios-indigo-400))',
}: {
  disabled: boolean;
  isSubmitting: boolean;
  label: string;
  /** Ce que dit le bouton PENDANT l'envoi. Il entre en paramètre parce que les
   * formulaires n'envoient pas tous la même chose : « Connexion… » pour la
   * connexion, « Envoi… » pour le lien magique et le mot de passe oublié —
   * un libellé d'envoi en dur annonçait « Connexion… » sous un bouton
   * « Valider ». */
  busyLabel: string;
  background?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || isSubmitting}
      aria-busy={isSubmitting}
      className="grid place-items-center rounded-[14px] font-bold text-white transition-opacity"
      style={{
        minHeight: 52,
        background,
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
