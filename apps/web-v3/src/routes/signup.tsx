import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { CountrySheet } from '@/components/country-sheet';
import { Field } from '@/components/field';
import { Glyph } from '@/components/glyph';
import { LanguageSheet } from '@/components/language-sheet';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { auth, isPhoneConflict } from '@/lib/api/auth';
import { countryName, type Country } from '@/lib/countries';
import { sessionStore } from '@/lib/api/session';
import { useOnline } from '@/lib/net/online';
import { canSubmit, composeRegisterBody, emptySignupForm, type SignupFormState } from '@/lib/signup-form';
import { placeSignupFailure, type SignupFeedback, type SignupField } from '@/lib/view/auth-feedback';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * L'ÉCRAN D'INSCRIPTION (#5555) — UN écran, anatomie de `SignupView.swift:44-59`.
 *
 * Aucune attente ne précède ni ne suit la saisie : pas de vérification réseau
 * de disponibilité, pas de debounce, pas de pause au succès — la même
 * doctrine que son modèle iOS (doc-comment `SignupView.swift:15-17`).
 */

/** Le bord d'un champ AU FOCUS — `indigo500` à 60 %, `SignupView.swift:466-476`.
 * C'est un TRAIT, pas du texte : le seuil qui le gouverne est 3:1 (mesuré
 * au-dessus), et le pas d'iOS le tient. */
const INDIGO_TINT = 'var(--ios-indigo-500)';

/**
 * L'ACCENT DES ACTIONS EN TEXTE — indigo, mais PAS le pas 500 (revue de #5555,
 * défaut 10).
 *
 * MESURÉ sur le rendu du navigateur, dans les DEUX schémas : `indigo500` sur
 * la carte donne 4,20:1 (« Changer », 13 px) et 4,47:1 (les deux liens légaux
 * et « Se connecter », 13-14 px) en CLAIR, 4,18:1 et 4,45:1 en SOMBRE — sous
 * le seuil AA de 4,5:1 des DEUX côtés, pour du petit texte. iOS n'est pas tenu
 * par ce seuil, le web l'est (même arbitrage que `institutional/brand-signature.tsx`
 * § écart 3).
 *
 * Le correctif ne fabrique aucune couleur : il DESCEND la rampe d'un pas par
 * schéma, exactement comme iOS le fait lui-même quand la lisibilité l'exige —
 * `--ios-read-receipt` vaut `indigo400` en sombre et `indigo600` en clair
 * (`BubbleDeliveryCheck.swift`), `--ios-day-ink` `indigo200`/`indigo700`. Les
 * mêmes pas rendent ici 6,24:1 en sombre et 5,93:1 en clair.
 *
 * En CLASSE et non en style en ligne : le choix dépend du SCHÉMA, qu'un
 * attribut `style` ne sait pas lire. C'est le cas que la variante `light:`
 * d'`app.css` réserve — « les rares cas où une règle ne peut pas s'exprimer en
 * jetons ». Une constante unique pour les cinq sites : trente écrans la
 * copieront.
 */
const INDIGO_LINK = 'text-[color:var(--ios-indigo-400)] light:text-[color:var(--ios-indigo-600)]';
const EMPTY_FEEDBACK: SignupFeedback = { fieldErrors: {}, bannerError: null, showSignIn: false };

type FocusedField = SignupField | null;

export default function SignupScreen() {
  const session = useStore(sessionStore, (s) => s.session);
  const online = useOnline();
  // `navigator.language` peut manquer hors navigateur (rendu de témoin, coque
  // exotique) : le repli est la locale du produit, jamais `undefined` — que
  // `emptySignupForm` découperait sur `split('-')`.
  const locale = typeof navigator === 'object' && typeof navigator.language === 'string' ? navigator.language : 'fr-FR';

  const [form, setForm] = useState<SignupFormState>(() => emptySignupForm(locale));
  const [focused, setFocused] = useState<FocusedField>(null);
  const [feedback, setFeedback] = useState<SignupFeedback>(EMPTY_FEEDBACK);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isShowingCountrySheet, setShowingCountrySheet] = useState(false);
  const [isShowingLanguageSheet, setShowingLanguageSheet] = useState(false);

  // Même doctrine que login.tsx : `auth.register` parle TOUJOURS à la
  // passerelle réelle, indépendamment de `apiConfig.source`.
  useEffect(() => {
    if (session.status === 'authenticated') navigate(href('list'), true);
  }, [session.status]);

  function patch(fields: Partial<SignupFormState>) {
    setForm((current) => ({ ...current, ...fields }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit(form) || isSubmitting) return;
    setSubmitting(true);
    setFeedback(EMPTY_FEEDBACK);

    const result = await auth.register(composeRegisterBody(form));
    setSubmitting(false);

    if (!result.ok) {
      setFeedback(placeSignupFailure(result));
      return;
    }
    if (isPhoneConflict(result.data)) {
      setFeedback(placeSignupFailure({ kind: 'phone-conflict' }));
      return;
    }
    // Compte créé : le magasin de session est déjà `authenticated`
    // (`auth.ts#register`) — l'effet ci-dessus mène vers `/`, IMMÉDIATEMENT,
    // sans pause d'aucune sorte (doctrine SignupView.swift:413-429).
  }

  const emailError = feedback.fieldErrors.email;
  const canSend = canSubmit(form) && online;
  const language = getLanguageInfo(form.systemLanguage);

  return (
    <div className="relative flex h-dvh flex-col pt-safe">
      <div className="flex shrink-0 items-center px-2 pt-1">
        {/* FERMER MÈNE À LA CONNEXION, TOUJOURS (correction de revue, défaut 3).
            `window.history.back()` supposait qu'on venait de `/login` : sur un
            lien profond, un démarrage de PWA ou un lancement de coque, il n'y
            a AUCUNE entrée d'historique de l'application — le geste sortait de
            l'app, ou ne faisait rien. iOS referme la feuille et rend toujours
            à `LoginView` (`SignupView.swift:73-89`). `replace` parce qu'on
            REFERME : l'inscription ne doit pas rester derrière la connexion. */}
        <Link
          to="login"
          replace
          className="grid place-items-center rounded-chip"
          style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink-2)' }}
          aria-label="Fermer"
        >
          <Glyph name="x" size={20} />
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 pb-safe" noValidate>
        <div className="grid gap-2 pt-2 pb-6">
          <h1 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            Créer votre compte
          </h1>
          <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
            Vous lirez tout le monde dans votre langue.
          </p>
        </div>

        <div className="grid gap-5 pb-8">
          <Field
            id="signup-display-name"
            label="Nom affiché"
            tint={INDIGO_TINT}
            focused={focused === 'displayName'}
            error={feedback.fieldErrors.displayName}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                type="text"
                autoComplete="name"
                value={form.displayName}
                onChange={(e) => patch({ displayName: e.currentTarget.value })}
                onFocus={() => setFocused('displayName')}
                onBlur={() => setFocused(null)}
                placeholder="Comment vous appeler ?"
                className="w-full bg-transparent py-3 text-input outline-none"
                style={{ color: 'var(--color-ios-ink)' }}
                aria-describedby={describedBy}
                aria-invalid={describedBy !== undefined}
              />
            )}
          </Field>

          <div className="grid gap-1">
            <Field id="signup-email" label="Adresse e-mail" tint={INDIGO_TINT} focused={focused === 'email'} error={emailError}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={form.email}
                  onChange={(e) => patch({ email: e.currentTarget.value })}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  placeholder="vous@exemple.com"
                  className="w-full bg-transparent py-3 text-input outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                  aria-describedby={describedBy}
                  aria-invalid={describedBy !== undefined}
                />
              )}
            </Field>
            {feedback.showSignIn ? (
              <Link
                to="login"
                replace
                className={`inline-flex items-center justify-self-start text-caption font-semibold ${INDIGO_LINK}`}
                style={{ minHeight: 44 }}
              >
                Se connecter
              </Link>
            ) : null}
          </div>

          {/* Téléphone — jamais annoncé « facultatif » (SignupView.swift:169-171) :
              le laisser vide est le chemin nominal. */}
          <div className="grid gap-1">
            <label className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
              Téléphone
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowingCountrySheet(true)}
                className="flex items-center gap-1.5 rounded-[14px] px-3"
                style={{ minHeight: 48, backgroundColor: 'var(--color-ios-card)' }}
                aria-label={`Pays : ${countryName(form.country, locale)}, ${form.country.dialCode}`}
              >
                <span aria-hidden="true">{form.country.flag}</span>
                <span className="text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
                  {form.country.dialCode}
                </span>
                <Glyph name="caretDown" size={14} style={{ color: 'var(--color-ios-ink-3)' }} />
              </button>
              <div className="flex flex-1 items-center rounded-[14px] px-4" style={{ minHeight: 48, backgroundColor: 'var(--color-ios-card)' }}>
                <input
                  type="tel"
                  autoComplete="tel-national"
                  value={form.phoneDigits}
                  onChange={(e) => patch({ phoneDigits: e.currentTarget.value })}
                  onFocus={() => setFocused('phoneNumber')}
                  onBlur={() => setFocused(null)}
                  placeholder="Numéro de téléphone"
                  className="w-full bg-transparent py-3 text-input outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                  aria-label="Téléphone"
                />
              </div>
            </div>
            {feedback.fieldErrors.phoneNumber !== undefined ? (
              <p role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
                {feedback.fieldErrors.phoneNumber}
              </p>
            ) : null}
          </div>

          <Field
            id="signup-password"
            label="Mot de passe"
            tint={INDIGO_TINT}
            focused={focused === 'password'}
            error={feedback.fieldErrors.password}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => patch({ password: e.currentTarget.value })}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                placeholder="12 caractères minimum"
                className="w-full bg-transparent py-3 text-input outline-none"
                aria-describedby={describedBy}
                aria-invalid={describedBy !== undefined}
                style={{ color: 'var(--color-ios-ink)' }}
              />
            )}
          </Field>

          {/* LA PASTILLE LIT LE MÊME CATALOGUE QUE LA FEUILLE (correction de
              revue, défaut 2) : `getLanguageInfo` (`@meeshy/shared`), les 83
              langues servies, exactement ce que `SignupForm.systemLanguageFlag`
              / `systemLanguageNativeName` lisent côté iOS (`LanguageData.info`).
              La pastille lisait auparavant `lib/languages.ts` — un catalogue
              de SEPT entrées, dont le repli rend le CODE : choisir « 日本語 »
              dans la feuille affichait « Vous lirez Meeshy en JA », drapeau
              compris. Le nom natif porte `lang` : la page est en français, lui
              non. */}
          <button
            type="button"
            onClick={() => setShowingLanguageSheet(true)}
            className="flex items-center gap-2 rounded-[14px] px-4 text-left"
            style={{ minHeight: 48, backgroundColor: 'var(--color-ios-card)' }}
          >
            <span aria-hidden="true">{language.flag}</span>
            <span className="flex-1 text-title font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
              Vous lirez Meeshy en{' '}
              <span lang={language.code}>{language.nativeName ?? language.name}</span>
            </span>
            <span className={`text-title font-semibold ${INDIGO_LINK}`}>Changer</span>
          </button>

          {!online ? (
            <p
              className="rounded-[14px] px-4 py-2 text-center text-caption"
              style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink-2)' }}
            >
              Hors ligne — la création de compte n’est pas possible pour l’instant.
            </p>
          ) : null}

          {feedback.bannerError !== null ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-field-ios p-3"
              style={{ backgroundColor: 'color-mix(in srgb, var(--ios-error) 12%, transparent)' }}
            >
              <Glyph name="warningCircle" size={18} style={{ color: 'var(--ios-error)', flexShrink: 0 }} />
              <p className="text-caption" style={{ color: 'var(--ios-error)' }}>
                {feedback.bannerError}
              </p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSend || isSubmitting}
            aria-busy={isSubmitting}
            className="grid place-items-center rounded-[14px] font-bold text-white transition-opacity"
            style={{
              minHeight: 52,
              background: 'linear-gradient(90deg, var(--ios-indigo-500), var(--ios-indigo-700))',
              opacity: !canSend || isSubmitting ? 0.6 : 1,
            }}
          >
            {isSubmitting ? 'Création en cours…' : 'Créer mon compte'}
          </button>

          <div className="grid gap-2">
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
              En continuant, vous acceptez les conditions d’utilisation et la politique de confidentialité.
            </p>
            {/* Les DEUX pages institutionnelles existent déjà (`/terms`, `/privacy`,
                #5606) — des ancres PLEIN DOCUMENT, jamais des routes de l'app :
                elles n'ont ni session ni API à porter (§ leur propre doc-comment). */}
            <div className="flex gap-4">
              <a href="/terms" className={`text-caption font-semibold ${INDIGO_LINK}`} style={{ minHeight: 44 }}>
                Conditions d’utilisation
              </a>
              <a href="/privacy" className={`text-caption font-semibold ${INDIGO_LINK}`} style={{ minHeight: 44 }}>
                Politique de confidentialité
              </a>
            </div>
          </div>

          <Link
            to="login"
            replace
            className="inline-flex items-center justify-self-center text-title font-semibold"
            style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
          >
            Déjà un compte ?&nbsp;<span className={INDIGO_LINK}>Se connecter</span>
          </Link>
        </div>
      </form>

      {isShowingCountrySheet ? (
        <CountrySheet
          onSelect={(country: Country) => {
            patch({ country });
            setShowingCountrySheet(false);
          }}
          onClose={() => setShowingCountrySheet(false)}
        />
      ) : null}

      {isShowingLanguageSheet ? (
        <LanguageSheet
          onSelect={(code) => {
            patch({ systemLanguage: code });
            setShowingLanguageSheet(false);
          }}
          onClose={() => setShowingLanguageSheet(false)}
        />
      ) : null}
    </div>
  );
}
