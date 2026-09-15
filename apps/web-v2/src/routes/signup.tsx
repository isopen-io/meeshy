import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { CountrySheet } from '@/components/country-sheet';
import { DerivedIdentity } from '@/components/derived-identity';
import { Field } from '@/components/field';
import { Glyph } from '@/components/glyph';
import { AUTH_GLYPHS } from '@/components/glyphs-auth';
import { InfoHintButton, InfoHintText, useInfoHint, type InfoHint } from '@/components/info-hint';
import { LanguageSheet } from '@/components/language-sheet';
import { RungReveal } from '@/components/rung-reveal';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { auth, isPhoneConflict } from '@/lib/api/auth';
import { countryName, type Country } from '@/lib/countries';
import { sessionStore } from '@/lib/api/session';
import { useOnline } from '@/lib/net/online';
import {
  PASSWORD_MIN,
  canSubmit,
  effectiveDisplayName,
  effectiveUsername,
  composeRegisterBody,
  emptySignupForm,
  isEmailValid,
  type SignupFormState,
} from '@/lib/signup-form';
import {
  INITIAL_SIGNUP_REVEAL,
  SIGNUP_RUNGS,
  nextSignupReveal,
  showsSignupRung,
  visibleSignupRungs,
  type SignupReveal,
} from '@/lib/view/signup-rungs';
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
/**
 * L'AVERTISSEMENT DE VALIDATION (#6479) — derrière un (i) depuis #6626.
 *
 * #6479 le posait en clair, au motif que c'est une CONDITION du compte et non un
 * détail qu'on consulte. La directive porteur postérieure (2026-09-15 : « moins
 * de détails sur la page de connexion et d'enregistrement ; utiliser des (i)
 * pour pouvoir informer sur le mode de fonctionnement si naturellement ce n'est
 * pas clair ») le supplante : l'écran ne dit plus en toutes lettres qu'un lien
 * partira, il le dit à qui demande « Pourquoi un lien ». La condition, elle,
 * n'est pas cachée à qui ne voit pas l'écran — la note reste citée par
 * `aria-describedby` de l'adresse.
 */
const EMAIL_VERIFICATION: InfoHint = {
  label: 'Pourquoi un lien',
  text: 'Nous vous enverrons un lien à cette adresse : il faudra l’ouvrir pour valider votre compte.',
  glyph: AUTH_GLYPHS.info,
};

/**
 * CE QUE LE NUMÉRO OUVRE — derrière le (i) depuis le retour porteur « la page
 * est trop surchargée » (#6441). Les deux usages sont MESURÉS, pas promis :
 * identifiant de connexion (`AuthService.ts:158`) et découverte par un contact
 * qui l'a au carnet (`contacts-match.ts`, `matchedBy: 'phone'`).
 */
const PHONE_BENEFIT: InfoHint = {
  label: 'À quoi sert le numéro',
  text: 'Il vous permettra de vous connecter, et à vos proches de vous retrouver.',
  glyph: AUTH_GLYPHS.info,
};

const EMPTY_FEEDBACK: SignupFeedback = {
  fieldErrors: {},
  bannerError: null,
  showSignIn: false,
  usernameSuggestions: [],
};

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
  // Le téléphone ne passe pas par `Field` (il porte le sélecteur de pays) : il
  // pose le MÊME (i), dont la note garde l'identifiant que sa saisie cite.
  const phoneHint = useInfoHint('signup-phone-hint');
  // Une inscription réussie AUTHENTIFIE déjà (`auth.register` établit la
  // session, #4264) — sans ce drapeau, l'effet ci-dessous mènerait à `list`
  // avant que `handleSubmit` n'ait pu router vers la vérification d'e-mail
  // (D-53, #5672, raccordement).
  const [justRegistered, setJustRegistered] = useState(false);

  /**
   * CE QUI EST PARU (#6405) — la loi est dans `signup-rungs.ts` ; ici, sa
   * mémoire et ses trois observations.
   *
   * `phoneAnswered` n'est PAS « le numéro est rempli » : le numéro est
   * facultatif, et exiger des chiffres pour ouvrir la suite en ferait une
   * obligation déguisée. Y répondre, c'est taper, quitter le champ, ou le dire
   * — les trois gestes posent ce drapeau, qui ne se lève qu'une fois.
   *
   * L'avancée se DÉRIVE pendant le rendu plutôt que dans un effet : l'effet
   * aurait peint une image de plus avec l'ancien état, et le barreau aurait
   * paru un battement APRÈS la frappe qui l'ouvre. `nextSignupReveal` rend
   * l'objet précédent à l'identique quand rien ne change, ce qui referme la
   * boucle.
   */
  const [reveal, setReveal] = useState<SignupReveal>(INITIAL_SIGNUP_REVEAL);
  const [isPhoneAnswered, setPhoneAnswered] = useState(false);
  const nextReveal = nextSignupReveal(reveal, {
    emailValid: isEmailValid(form.email),
    phoneAnswered: isPhoneAnswered || form.phoneDigits.trim() !== '',
  });
  if (nextReveal !== reveal) setReveal(nextReveal);

  // Même doctrine que login.tsx : `auth.register` parle TOUJOURS à la
  // passerelle réelle, indépendamment de `apiConfig.source`.
  useEffect(() => {
    if (session.status === 'authenticated' && !justRegistered) navigate(href('list'), true);
  }, [session.status, justRegistered]);

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
    // (`auth.ts#register`) — mais l'e-mail reste à vérifier (T-verify,
    // #5672) avant d'entrer dans la Lentille. `justRegistered` retient
    // l'effet ci-dessus le temps de ce routage, IMMÉDIATEMENT, sans pause
    // d'aucune sorte (doctrine SignupView.swift:413-429).
    setJustRegistered(true);
    navigate(href('verifyEmail', undefined, { email: form.email }), true);
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

          {/* OÙ L'ON EN EST (#6405). Trois segments, un par barreau : un
              formulaire qui se déplie SANS dire combien il reste laisse croire
              qu'il est sans fin — c'est le prix qu'on paie pour ne pas tout
              montrer d'un coup, et une jauge de 3 pixels le rembourse.
              `aria-hidden` : le compte est DIT juste à côté, en toutes lettres,
              plutôt que d'être déduit de trois traits colorés. */}
          <div className="mt-1 flex items-center gap-2">
            <div aria-hidden="true" className="flex flex-1 gap-1">
              {SIGNUP_RUNGS.map((rung) => (
                <span
                  key={rung}
                  data-signup-step={showsSignupRung(reveal, rung) ? 'atteint' : 'a-venir'}
                  className="h-1 flex-1 rounded-full transition-colors"
                  style={{
                    backgroundColor: showsSignupRung(reveal, rung)
                      ? 'var(--ios-indigo-500)'
                      : 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)',
                  }}
                />
              ))}
            </div>
            <span className="text-caption tabular-nums" style={{ color: 'var(--color-ios-ink-3)' }}>
              Étape {visibleSignupRungs(reveal).length} sur {SIGNUP_RUNGS.length}
            </span>
          </div>
        </div>

        <div className="grid gap-5 pb-8">
          <div className="grid gap-1">
            {/* `aria-invalid` suit le REFUS, jamais `describedBy` : le champ
                cite aussi la note de son (i), et s'annoncerait « invalide »
                avant la première lettre. */}
            <Field
              id="signup-email"
              label="Adresse e-mail"
              tint={INDIGO_TINT}
              focused={focused === 'email'}
              error={emailError}
              hint={EMAIL_VERIFICATION}
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={form.email}
                  onInput={(e) => patch({ email: e.currentTarget.value })}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  placeholder="vous@exemple.com"
                  className="w-full bg-transparent py-3 text-input outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                  aria-describedby={describedBy}
                  aria-invalid={emailError !== undefined}
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

          {/* LE NUMÉRO — DEUXIÈME BARREAU (#6405) : il ne paraît qu'une fois
              l'adresse valide. Jamais annoncé « facultatif »
              (`SignupView.swift:169-171`) : le laisser vide est le chemin
              nominal, et « Je continue sans numéro » le dit mieux qu'une
              étiquette, parce que c'est un GESTE, pas une mention. */}
          <RungReveal shown={showsSignupRung(reveal, 'phone')}>
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
                  onInput={(e) => patch({ phoneDigits: e.currentTarget.value })}
                  onFocus={() => setFocused('phoneNumber')}
                  onBlur={() => {
                    setFocused(null);
                    setPhoneAnswered(true);
                  }}
                  placeholder="Numéro de téléphone"
                  className="w-full bg-transparent py-3 text-input outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                  aria-label="Téléphone"
                  aria-describedby="signup-phone-hint"
                />
                <InfoHintButton hint={PHONE_BENEFIT} state={phoneHint} style={{ marginRight: -10 }} />
              </div>
            </div>
            {feedback.fieldErrors.phoneNumber !== undefined ? (
              <p role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
                {feedback.fieldErrors.phoneNumber}
              </p>
            ) : null}
            {/* CE QU'IL OUVRE — voir `PHONE_BENEFIT`. Replié, jamais démonté :
                `aria-describedby` de la saisie le porte toujours. */}
            <InfoHintText hint={PHONE_BENEFIT} state={phoneHint} />
          </div>

            {showsSignupRung(reveal, 'identity') ? null : (
              <button
                type="button"
                data-signup-skip-phone
                onClick={() => setPhoneAnswered(true)}
                className={`inline-flex items-center justify-self-start text-caption font-semibold ${INDIGO_LINK}`}
                style={{ minHeight: 44 }}
              >
                Je continue sans numéro
              </button>
            )}
          </RungReveal>

          {/* LE RESTE — TROISIÈME BARREAU (#6405) : identité dérivée, mot de
              passe facultatif, langue, bouton et mentions. Il ne paraît
              qu'une fois le numéro RÉPONDU — tapé, quitté, ou passé. */}
          <RungReveal shown={showsSignupRung(reveal, 'identity')}>
          {/* CE QUE L'INSCRIPTION VA CRÉER — montré, modifiable, et ENVOYÉ
              (#6479). Placé APRÈS l'adresse parce qu'il en DÉCOULE : tant
              qu'elle n'est pas tapée, il n'y a rien à montrer. */}
          <DerivedIdentity
            username={effectiveUsername(form)}
            displayName={effectiveDisplayName(form)}
            onUsernameChange={(username) => patch({ username })}
            onDisplayNameChange={(displayName) => patch({ displayName })}
            tint={INDIGO_TINT}
            focusedField={focused === 'username' || focused === 'displayName' ? focused : null}
            onFocus={(field) => setFocused(field)}
            onBlur={() => setFocused(null)}
            usernameError={feedback.fieldErrors.username}
            displayNameError={feedback.fieldErrors.displayName}
            suggestions={feedback.usernameSuggestions}
          />

          {/* LE MOT DE PASSE EST FACULTATIF (#6424). Le libellé le DIT, et la
              note en dessous dit ce qui se passe sans lui — sans quoi laisser
              le champ vide serait un geste qu'on ne pose que par accident.
              La note disparaît dès qu'un mot de passe est tapé : elle décrit
              alors un état qui n'est plus celui du formulaire.

              Le gabarit lit `PASSWORD_MIN`, jamais un littéral : celui qui
              vivait ici annonçait « 12 caractères minimum » alors que la borne
              était passée à 6 — exactement le défaut que le doc-comment de
              `PASSWORD_MIN` dit vouloir empêcher. */}
          <Field
            id="signup-password"
            label="Mot de passe (facultatif)"
            tint={INDIGO_TINT}
            focused={focused === 'password'}
            error={feedback.fieldErrors.password}
            hint={{
              text: 'Sans mot de passe, vous vous connecterez par un lien envoyé à votre adresse. Vous pourrez en définir un plus tard.',
              glyph: AUTH_GLYPHS.info,
              label: 'Que se passe-t-il sans mot de passe',
            }}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                type="password"
                autoComplete="new-password"
                value={form.password}
                onInput={(e) => patch({ password: e.currentTarget.value })}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                placeholder={`${PASSWORD_MIN} caractères minimum`}
                className="w-full bg-transparent py-3 text-input outline-none"
                aria-describedby={describedBy}
                aria-invalid={feedback.fieldErrors.password !== undefined}
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

          </RungReveal>

          {/* HORS DES BARREAUX, DÉLIBÉRÉMENT (#6405) : ce n'est pas un champ,
              c'est une SORTIE. Quelqu'un qui a déjà un compte doit pouvoir le
              dire à la première seconde, sans avoir à remplir une adresse pour
              faire paraître le lien qui l'emmène ailleurs. */}
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
