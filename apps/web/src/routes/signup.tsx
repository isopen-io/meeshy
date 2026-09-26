import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { AuthColumn, AuthColumnBar } from '@/components/auth-column';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CountrySheet } from '@/components/country-sheet';
import { DerivedIdentity } from '@/components/derived-identity';
import { Field } from '@/components/field';
import { Glyph } from '@/components/glyph';
import { AUTH_GLYPHS } from '@/components/glyphs-auth';
import { InfoHintButton, InfoHintText, useInfoHint, type InfoHint } from '@/components/info-hint';
import { LanguageSheet } from '@/components/language-sheet';
import { RungReveal } from '@/components/rung-reveal';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { convertReferral, inviterName, validateReferralCode, type ReferralValidation } from '@/lib/api/affiliate';
import { auth, isPhoneConflict, isVerificationRequired, type RegisterBody, type RegisterResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { countryName, type Country } from '@/lib/countries';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { sessionStore } from '@/lib/api/session';
import { useOnline } from '@/lib/net/online';
import { holdPendingVerification } from '@/lib/pending-verification';
import {
  PASSWORD_MIN,
  canSubmit,
  effectiveDisplayName,
  effectiveUsername,
  composeRegisterBody,
  emptySignupForm,
  hasPassword,
  hasPhoneNumber,
  isEmailValid,
  isIdentityDefined,
  isPasswordValid,
  type SignupFormState,
} from '@/lib/signup-form';
import {
  INITIAL_SIGNUP_REVEAL,
  nextSignupReveal,
  showsSignupRung,
  type SignupReveal,
} from '@/lib/view/signup-rungs';
import { placeSignupFailure, type SignupFeedback, type SignupField } from '@/lib/view/auth-feedback';
import {
  isReferralCodeShaped,
  normalizeReferralCode,
  referralCodeFromLocation,
} from '@/lib/view/referral-code';
import { forgetReferralCode, recallReferralCode, rememberReferralCode } from '@/lib/view/referral-memory';
import { landingAfterSession, safeNextPath } from '@/lib/session-guard';
import { Link, href, navigate } from '@/routes/route-table';
import { PasswordInput } from '@/components/password-input';

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

/**
 * `SignupField` énumère ce que la PASSERELLE peut refuser ; le focus, lui,
 * couvre aussi ce qu'elle ne connaît pas — le code de parrainage n'entre dans
 * aucune charge de `POST /auth/register` (#6584). Élargir `SignupField` pour
 * ce champ ferait croire qu'un refus serveur peut le viser.
 */
type FocusedField = SignupField | 'referral' | null;

/**
 * CE QU'ON SAIT DU CODE DE PARRAINAGE (#6584) — et `idle` recouvre DEUX
 * silences qu'il serait faux de distinguer à l'écran : « on n'a pas encore
 * demandé » et « on a demandé, le réseau n'a pas répondu ». Dans les deux cas
 * l'écran n'a rien à dire, et surtout rien à REPROCHER : un code n'est pas
 * refusé parce que la requête a échoué.
 */
type ReferralStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'valid'; readonly inviter: string }
  | { readonly kind: 'invalid' };

/** La vérification, INJECTABLE — le témoin atteint les trois verdicts sans
 * parler à une passerelle (même dispositif que `MagicLinkPanel`, #6404). */
export type SignupReferralDeps = { readonly validate: (code: string) => Promise<ApiResult<ReferralValidation>> };

const defaultReferralDeps: SignupReferralDeps = { validate: (code) => validateReferralCode(code) };

/**
 * OÙ MÈNE UN COMPTE QUI VIENT D'ÊTRE CRÉÉ (#5561).
 *
 * Sans `next`, la vérification de l'e-mail (D-53, #5672), inchangée. Avec un
 * `next` sûr — l'invitation d'où l'on s'est inscrit —, l'invitation : c'est la
 * raison pour laquelle ce compte existe, et « Rejoindre » l'y attend en un
 * geste. Faire passer la vérification d'abord renverrait, à sa fin, sur la
 * liste : l'invitation serait perdue. La vérification ne l'est pas : son lien
 * part par courriel dès l'inscription (`registration.service.ts:488`), et
 * rejoindre comme écrire restent ouverts à un compte non confirmé (#6437,
 * `EMAIL_VERIFICATION_GATED_ROUTES`).
 */
export function landingAfterRegistration(input: { readonly next: string | null; readonly email: string }): string {
  return safeNextPath(input.next) ?? href('verifyEmail', undefined, { email: input.email });
}

/** `next` lu sur l'ADRESSE plutôt que par `useSearch()` — même raison que
 * `referralCodeFromLocation` : l'écran est monté tel quel par ses témoins, hors
 * du routeur, et l'invitation ne change pas sous les doigts de qui s'inscrit. */
function nextFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('next');
}

/**
 * « POURQUOI METTRE UN MOT DE PASSE MAINTENANT ? » (#7897) — une ligne
 * discrète qui se déplie. Le détail reste dans le DOM replié (`hidden`) : il
 * ne se lit qu'à la demande, sans surcharger l'écran (#6441).
 */
function PasswordWhy() {
  const [isOpen, setOpen] = useState(false);
  return (
    <div className="grid" data-signup-password-why>
      <button
        type="button"
        onClick={() => setOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="signup-password-why"
        className={`inline-flex items-center gap-1 justify-self-start text-caption font-semibold ${INDIGO_LINK}`}
        style={{ minHeight: 44 }}
      >
        Pourquoi mettre un mot de passe maintenant ?
        <Glyph name="caretDown" size={12} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>
      <p id="signup-password-why" hidden={!isOpen} className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        Vous pouvez activer votre mot de passe dès maintenant si vous le souhaitez. Sans mot de passe, vous vous
        connecterez toujours à partir d’un e-mail reçu dans votre boîte.
      </p>
    </div>
  );
}

/** `POST /auth/register` — injectable pour les témoins, `auth.register` sinon. */
export type SignupRegister = (body: RegisterBody) => Promise<ApiResult<RegisterResponseData>>;

export default function SignupScreen({
  referralDeps = defaultReferralDeps,
  register = auth.register,
}: { readonly referralDeps?: SignupReferralDeps; readonly register?: SignupRegister } = {}) {
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
  /**
   * L'ALERTE D'UNE INSCRIPTION SANS NUMÉRO (#8040) — directive porteur
   * 2026-09-26 : le numéro sécurise le compte et permet de le récupérer. Une
   * alerte, jamais un blocage : « Continuer quand même » crée le compte comme
   * avant. Le drapeau MIROIR (`ref`) répond une seule fois par ouverture —
   * le démontage du `<dialog>` émet encore `close`, qui ne doit pas rejouer
   * « Ajouter mon numéro » après « Continuer ».
   */
  const [isShowingPhoneNudge, setShowingPhoneNudge] = useState(false);
  const phoneNudgeOpen = useRef(false);
  const phoneInput = useRef<HTMLInputElement>(null);
  const [phoneFocusRequest, setPhoneFocusRequest] = useState(0);
  // APRÈS le démontage du dialogue : `close()` rend le focus à ce qui l'avait
  // avant l'ouverture (le bouton d'envoi) — le champ le reprend ensuite.
  useEffect(() => {
    if (phoneFocusRequest > 0) phoneInput.current?.focus();
  }, [phoneFocusRequest]);
  // Une inscription réussie AUTHENTIFIE déjà (`auth.register` établit la
  // session, #4264) — sans ce drapeau, l'effet ci-dessous mènerait à `list`
  // avant que `handleSubmit` n'ait pu router vers la vérification d'e-mail
  // (D-53, #5672, raccordement).
  const [justRegistered, setJustRegistered] = useState(false);
  const [next] = useState(nextFromLocation);
  /** Ce que les liens vers la connexion TRANSMETTENT — jamais une valeur hostile. */
  const safeNext = safeNextPath(next);

  /**
   * CE QUI EST PARU (#6405, redécoupé par #6582) — la loi est dans
   * `signup-rungs.ts` ; ici, sa mémoire et son unique observation.
   *
   * L'avancée se DÉRIVE pendant le rendu plutôt que dans un effet : l'effet
   * aurait peint une image de plus avec l'ancien état, et le barreau aurait
   * paru un battement APRÈS la frappe qui l'ouvre. `nextSignupReveal` rend
   * l'objet précédent à l'identique quand rien ne change, ce qui referme la
   * boucle.
   */
  const [reveal, setReveal] = useState<SignupReveal>(INITIAL_SIGNUP_REVEAL);
  const nextReveal = nextSignupReveal(reveal, { emailValid: isEmailValid(form.email) });
  if (nextReveal !== reveal) setReveal(nextReveal);
  /** Le mot de passe paru ne se REFERME pas non plus (#6405, #7897) :
   * corriger son adresse ne doit pas faire disparaître ce qu'on y a tapé. */
  const [isPasswordRevealed, setPasswordRevealed] = useState(false);
  if (!isPasswordRevealed && isIdentityDefined(form)) setPasswordRevealed(true);

  /**
   * LE PARRAINAGE (#6584) — l'adresse D'ABORD, la MÉMOIRE ensuite.
   *
   * `referralCodeFromLocation` plutôt que `useSearch()` : ce dernier exige le
   * contexte du routeur, et l'inscription est montée telle quelle par ses
   * témoins de rendu — c'est exactement ce qui a forcé `/login` à se couper en
   * deux (`LoginDoors`). Le code d'invitation ne change pas sous les doigts de
   * celui qui remplit le formulaire : le lire une fois suffit.
   *
   * **`recallReferralCode` est la reprise du LEGACY** (`apps/web` écrit le
   * jeton pour 30 jours et le relit à l'inscription) : quelqu'un qui clique une
   * invitation, regarde l'accueil et s'inscrit le lendemain garde son
   * parrainage. Sans elle, seul le cas rare — s'inscrire sans jamais quitter la
   * page d'arrivée — aurait compté. L'adresse GAGNE sur la mémoire : un
   * nouveau lien remplace un ancien, jamais l'inverse.
   *
   * Le bloc s'ouvre SEUL quand un code est connu, et reste replié sinon : la
   * très grande majorité des inscriptions n'en ont pas, et un champ de plus
   * imposé à tout le monde pour servir une minorité est exactement la surcharge
   * que le porteur a déjà refusée (#6441).
   */
  const [referralCode, setReferralCode] = useState(() => {
    const fromAddress = referralCodeFromLocation();
    if (fromAddress !== '') {
      // Il vient d'arriver par un lien : on le retient POUR la navigation qui
      // suit, au cas où l'inscription ne se termine pas dans cette page-ci.
      rememberReferralCode(fromAddress);
      return fromAddress;
    }
    return recallReferralCode();
  });
  const [isReferralOpen, setReferralOpen] = useState(() => referralCode !== '');
  const [referral, setReferral] = useState<ReferralStatus>({ kind: 'idle' });

  async function checkReferral() {
    const code = normalizeReferralCode(referralCode);
    if (!isReferralCodeShaped(code)) {
      setReferral({ kind: 'idle' });
      return;
    }
    setReferral({ kind: 'checking' });
    const result = await referralDeps.validate(code);
    // Un échec RÉSEAU n'est pas un code refusé : l'écran retombe au silence
    // plutôt que d'accuser un jeton dont il ne sait rien (§ `ReferralStatus`).
    if (!result.ok) {
      setReferral({ kind: 'idle' });
      return;
    }
    setReferral(result.data.isValid ? { kind: 'valid', inviter: inviterName(result.data) } : { kind: 'invalid' });
  }

  // Même doctrine que login.tsx : `auth.register` parle TOUJOURS à la
  // passerelle réelle, indépendamment de `apiConfig.source`.
  useEffect(() => {
    if (session.status === 'authenticated' && !justRegistered) navigate(landingAfterSession(next, href('list')), true);
  }, [session.status, justRegistered, next]);

  function patch(fields: Partial<SignupFormState>) {
    setForm((current) => ({ ...current, ...fields }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit(form) || isSubmitting) return;
    if (!hasPhoneNumber(form)) {
      openPhoneNudge();
      return;
    }
    void createAccount();
  }

  function openPhoneNudge() {
    phoneNudgeOpen.current = true;
    setShowingPhoneNudge(true);
  }

  /** Répond UNE fois : le premier geste referme, les suivants se taisent. */
  function answerPhoneNudge(choice: 'add-phone' | 'continue') {
    if (!phoneNudgeOpen.current) return;
    phoneNudgeOpen.current = false;
    setShowingPhoneNudge(false);
    if (choice === 'continue') void createAccount();
    else setPhoneFocusRequest((n) => n + 1);
  }

  async function createAccount() {
    setSubmitting(true);
    setFeedback(EMPTY_FEEDBACK);

    const result = await register(composeRegisterBody(form));
    setSubmitting(false);

    if (!result.ok) {
      setFeedback(placeSignupFailure(result));
      return;
    }
    if (isPhoneConflict(result.data)) {
      setFeedback(placeSignupFailure({ kind: 'phone-conflict' }));
      return;
    }
    /* SANS NUMÉRO, AUCUNE SESSION (#8055) : le compte attend son code. Le
       chemin est celui de la connexion d'un e-mail inconnu (#8034) — l'écran
       du code, qui ouvrira la session. Le mot de passe est DÉJÀ enregistré
       sur le compte : il n'est pas retenu pour repartir avec le code.
       L'invitation (`next`) voyage jusqu'à lui, sans le court-circuiter. */
    if (isVerificationRequired(result.data)) {
      holdPendingVerification({ email: result.data.email, accountCreated: result.data.accountCreated });
      navigate(href('verifyEmail', undefined, { email: result.data.email, next: safeNext ?? undefined }), true);
      return;
    }
    // Compte créé : le magasin de session est déjà `authenticated`
    // (`auth.ts#register`) — mais l'e-mail reste à vérifier (T-verify,
    // #5672) avant d'entrer dans la Lentille. `justRegistered` retient
    // l'effet ci-dessus le temps de ce routage, IMMÉDIATEMENT, sans pause
    // d'aucune sorte (doctrine SignupView.swift:413-429).
    setJustRegistered(true);
    /**
     * LA RELATION DE PARRAINAGE SE NOUE ICI, ET NE RETIENT RIEN (#6584).
     *
     * `POST /affiliate/register` est AUTHENTIFIÉ et porte sur l'appelant —
     * possible seulement maintenant, l'inscription venant d'établir la session
     * (#4264). Elle part sans être attendue : un parrainage qui échoue est un
     * parrainage perdu, jamais une entrée retardée. Rien dans l'écran ne
     * dépend de sa réponse, donc rien n'a à l'attendre.
     */
    const code = normalizeReferralCode(referralCode);
    if (isReferralCodeShaped(code)) {
      // OUBLIÉ tout de suite, pas à la réponse : le compte est créé, ce code a
      // servi. L'attendre pour l'oublier le laisserait se rattacher une seconde
      // fois à une inscription suivante sur le même navigateur.
      forgetReferralCode();
      void convertReferral({ code, userId: result.data.user.id }).catch(() => undefined);
    }
    navigate(landingAfterRegistration({ next, email: form.email }), true);
  }

  const emailError = feedback.fieldErrors.email;
  const canSend = canSubmit(form) && online;
  /** « OK » au sens de la directive : un mot de passe TAPÉ qui tient la borne
   * du schéma partagé. Un champ vide reste légitime (#6424) — il n'est pas
   * bon, il est ABSENT, et c'est une autre phrase que l'écran dit juste en
   * dessous. */
  const isPasswordStrong = hasPassword(form.password) && isPasswordValid(form.password);
  const language = getLanguageInfo(form.systemLanguage);
  const interfaceLanguage = currentInterfaceLanguage();

  return (
    /* LA COLONNE DE LA CONNEXION (#6643), HAUTEUR BORNÉE (`min-h-0`) : la seule
       page d'accès qui dépasse un écran fait défiler son FORMULAIRE sous la
       barre de fermeture, qui reste en place comme sur iOS
       (`SignupView.swift:74`, `safeAreaInset(edge: .top)`). Fermer mène
       toujours à la connexion — iOS referme la feuille et rend `LoginView`. */
    <AuthColumn className="min-h-0">
      <AuthColumnBar to="login" />

      <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-6" noValidate>
        <div className="grid gap-2 pt-2 pb-6">
          <h1 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            Créer votre compte
          </h1>
          <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
            Vous lirez tout le monde dans votre langue.
          </p>

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
                search={{ next: safeNext ?? undefined }}
                replace
                className={`inline-flex items-center justify-self-start text-caption font-semibold ${INDIGO_LINK}`}
                style={{ minHeight: 44 }}
              >
                Se connecter
              </Link>
            ) : null}
          </div>

          {/* LE NUMÉRO — AU PREMIER BARREAU, AVEC L'ADRESSE (#6582, directive
              porteur 2026-09-14 : « il faut mettre dès le départ le numéro et
              l'e-mail à montrer »). #6405 l'avait replié derrière une adresse
              valide ; le cacher en faisait une ÉTAPE à franchir plutôt qu'un
              champ à laisser vide. Jamais annoncé « facultatif »
              (`SignupView.swift:169-171`) : le laisser vide est le chemin
              nominal, et le bouton qui s'active sans lui le prouve mieux
              qu'une étiquette. */}
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
                  ref={phoneInput}
                  id="signup-phone"
                  type="tel"
                  autoComplete="tel-national"
                  value={form.phoneDigits}
                  onInput={(e) => patch({ phoneDigits: e.currentTarget.value })}
                  onFocus={() => setFocused('phoneNumber')}
                  onBlur={() => setFocused(null)}
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

          {/* LE RESTE — SECOND BARREAU (#6582) : identité dérivée, mot de
              passe, parrainage, langue, bouton et mentions. Il paraît DÈS que
              l'adresse est valide — aucun geste intermédiaire. */}
          <RungReveal shown={showsSignupRung(reveal, 'identity')}>
          {/* CE QUE L'INSCRIPTION VA CRÉER — montré, modifiable, et ENVOYÉ
              (#6479). Placé APRÈS l'adresse parce qu'il en DÉCOULE : tant
              qu'elle n'est pas tapée, il n'y a rien à montrer. */}
          <DerivedIdentity
            username={form.username ?? effectiveUsername(form)}
            displayName={form.displayName ?? effectiveDisplayName(form)}
            usernamePlaceholder={effectiveUsername({ ...form, username: null })}
            displayNamePlaceholder={effectiveDisplayName({ ...form, displayName: null })}
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

          {/* LE MOT DE PASSE S'ACTIVE QUAND L'IDENTITÉ EST DÉFINIE (#7897).
              Directive porteur 2026-09-25 : « c'est quand tout est défini
              qu'on active le champ mot de passe en mode vous pouvez activer
              votre mot de passe dès maintenant si vous le souhaitez […]
              Indiquer l'information discrètement, moderne mais visible, à
              partir d'une ligne « Pourquoi mettre un mot de passe
              maintenant ? » qui se déplie ».

              Il ne s'annonce toujours pas « facultatif » (#6582) : le bouton
              actif sans lui le prouve. Le bord vert d'un mot de passe qui
              tient la borne garde sa phrase (règle 17 : jamais la couleur
              seule). */}
          {isPasswordRevealed ? (
            <div className="grid gap-1" data-signup-password-block>
              <Field
                id="signup-password"
                label="Mot de passe"
                tint={INDIGO_TINT}
                focused={focused === 'password'}
                valid={isPasswordStrong}
                error={feedback.fieldErrors.password}
              >
                {({ id, describedBy }) => (
                  <PasswordInput
                    id={id}
                    autoComplete="new-password"
                    value={form.password}
                    onValue={(password) => patch({ password })}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    placeholder={`${PASSWORD_MIN} caractères minimum`}
                    describedBy={describedBy}
                    invalid={feedback.fieldErrors.password !== undefined}
                  />
                )}
              </Field>
              {isPasswordStrong ? (
                <p role="status" className="text-caption" style={{ color: 'var(--color-success)' }}>
                  Votre compte sera actif immédiatement.
                </p>
              ) : null}
              <PasswordWhy />
            </div>
          ) : null}

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

          {/* LE CODE DE PARRAINAGE (#6584) — REPLIÉ, et c'est le point.
              Question porteur 2026-09-14 : « ou de la possibilité d'entrer le
              code du référer lors de l'inscription ? ». La réponse ne peut pas
              être « un champ de plus pour tout le monde » : la très grande
              majorité des inscriptions n'ont aucun code, et le porteur a déjà
              refusé la surcharge (#6441). Un contrôle NOMMÉ l'ouvre ; un lien
              d'invitation l'ouvre tout seul, le champ déjà rempli — celui qui
              arrive par un lien n'a alors RIEN à recopier, ce qui est le seul
              usage vraiment fréquent (dimension 12 : la complexité se paie
              dans le code). */}
          {isReferralOpen ? (
            <div className="grid gap-1">
              <Field
                id="signup-referral"
                label="Code de parrainage"
                tint={INDIGO_TINT}
                focused={focused === 'referral'}
                valid={referral.kind === 'valid'}
              >
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={referralCode}
                    onInput={(e) => {
                      setReferralCode(e.currentTarget.value);
                      setReferral({ kind: 'idle' });
                    }}
                    onFocus={() => setFocused('referral')}
                    onBlur={() => {
                      setFocused(null);
                      void checkReferral();
                    }}
                    placeholder="Le code reçu de la personne qui vous invite"
                    className="w-full bg-transparent py-3 text-input outline-none"
                    style={{ color: 'var(--color-ios-ink)' }}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
              {/* CE QU'ON A APPRIS DU CODE — et rien de plus. Un refus n'est
                  pas rendu en `--ios-error` ni en `role="alert"` : ce n'est
                  PAS un refus d'inscription. Le bouton reste actif, le compte
                  se crée, et seule la relation de parrainage est perdue —
                  celui qui s'inscrit n'a pas à payer l'expiration du lien de
                  celui qui l'a invité. */}
              <p
                data-signup-referral-status={referral.kind}
                role="status"
                className="text-caption"
                style={{ color: referral.kind === 'valid' ? 'var(--color-success)' : 'var(--color-ios-ink-2)' }}
              >
                {referral.kind === 'valid'
                  ? `${referral.inviter} vous a invité — vous serez rattaché à son parrainage.`
                  : referral.kind === 'invalid'
                    ? 'Ce code n’est plus valable. Vous pouvez créer votre compte sans lui.'
                    : referral.kind === 'checking'
                      ? 'Vérification du code…'
                      : 'Vous pouvez laisser ce champ vide.'}
              </p>
            </div>
          ) : (
            <button
              type="button"
              data-signup-referral-toggle
              onClick={() => setReferralOpen(true)}
              className={`inline-flex items-center justify-self-start text-caption font-semibold ${INDIGO_LINK}`}
              style={{ minHeight: 44 }}
            >
              J’ai un code de parrainage
            </button>
          )}

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
            search={{ next: safeNext ?? undefined }}
            replace
            className="inline-flex items-center justify-self-center text-title font-semibold"
            style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
          >
            Déjà un compte ?&nbsp;<span className={INDIGO_LINK}>Se connecter</span>
          </Link>
        </div>
      </form>

      {isShowingPhoneNudge ? (
        <ConfirmDialog
          name="signup-phone-nudge"
          title={translate(interfaceLanguage, 'signup.phoneNudge.title')}
          body={translate(interfaceLanguage, 'signup.phoneNudge.body')}
          cancelLabel={translate(interfaceLanguage, 'signup.phoneNudge.add')}
          confirmLabel={translate(interfaceLanguage, 'signup.phoneNudge.continue')}
          tone="default"
          onConfirm={() => answerPhoneNudge('continue')}
          onCancel={() => answerPhoneNudge('add-phone')}
        />
      ) : null}

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
    </AuthColumn>
  );
}
