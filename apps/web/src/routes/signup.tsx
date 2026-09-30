import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { AuthColumn, AuthColumnBar } from '@/components/auth-column';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CountrySheet } from '@/components/country-sheet';
import { DerivedIdentity } from '@/components/derived-identity';
import { EmailTakenActions } from '@/components/email-taken-actions';
import { Field } from '@/components/field';
import { Glyph } from '@/components/glyph';
import { AUTH_GLYPHS } from '@/components/glyphs-auth';
import { useInfoHint, type InfoHint } from '@/components/info-hint';
import { LanguageSheet } from '@/components/language-sheet';
import { MagicLinkPanel, type MagicLinkPanelDeps } from '@/components/magic-link-panel';
import { RungReveal } from '@/components/rung-reveal';
import {
  INDIGO_LINK,
  INDIGO_TINT,
  SignupPasswordBlock,
  SignupReferralBlock,
  defaultReferralDeps,
  useSignupReferral,
  type SignupReferralDeps,
} from '@/components/signup-extras';
import { SignupIdentityCard, type SignupCodeDeps } from '@/components/signup-identity-card';
import { SignupPhoneGlass } from '@/components/signup-phone-glass';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { auth, isPhoneConflict, isVerificationRequired, type RegisterBody, type RegisterResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { type Country } from '@/lib/countries';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { sessionStore } from '@/lib/api/session';
import { useOnline } from '@/lib/net/online';
import { forgetPendingVerification } from '@/lib/pending-verification';
import {
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
  usernameFieldRefusal,
  type SignupFormState,
} from '@/lib/signup-form';
import {
  INITIAL_SIGNUP_PROGRESS,
  isPhoneGiven,
  nextSignupProgress,
  shouldNudgePhone,
  signupPhase,
  signupPrimaryAction,
  type SignupProgress,
  type SignupVerification,
} from '@/lib/view/signup-phases';
import { placeSignupFailure, usernameRefusalMessage, type SignupFeedback, type SignupField } from '@/lib/view/auth-feedback';
import { forgetReferralCode } from '@/lib/view/referral-memory';
import { landingAfterSession, safeNextPath } from '@/lib/session-guard';
import { appInstitutionalHref } from '@/lib/institutional-href';
import { Link, href, navigate } from '@/routes/route-table';

export type { SignupReferralDeps } from '@/components/signup-extras';

/**
 * L'ÉCRAN D'INSCRIPTION (#5555), RÉAGENCÉ EN PHASES VIVANTES (#8288) —
 * anatomie de `SignupView.swift`, dont il suit l'ordre :
 *
 * 1. le téléphone en verre liquide qui ondule à la frappe, son pays, et
 *    « Continuer avec l'e-mail seulement » ;
 * 2. l'adresse ;
 * 3. la carte d'identité en verre : nom affiché et @pseudo pré-dérivés et
 *    modifiables, refus (pseudo pris, « Est-ce vous ? »), « Valider mon
 *    compte maintenant » ;
 * 4. le code à 6 chiffres DANS la carte ; le code juste — ou le lien ouvert —
 *    lance le feu d'artifice, et « S'inscrire » devient « Parler aux autres ».
 *
 * La loi des phases est `lib/view/signup-phases.ts` ; ici, sa mémoire et ses
 * observations. Aucune seconde machine : l'inscription (`auth.register`), le
 * code (`EmailCodeForm`), « Est-ce vous ? » (`EmailTakenActions`), le feu
 * d'artifice (`arrival-fireworks.tsx`) et l'onboarding existent déjà.
 */

/** L'AVERTISSEMENT DE VALIDATION (#6479), derrière un (i) depuis #6626. */
const EMAIL_VERIFICATION: InfoHint = {
  label: 'Pourquoi un lien',
  text: 'Nous vous enverrons un lien à cette adresse : il faudra l’ouvrir pour valider votre compte.',
  glyph: AUTH_GLYPHS.info,
};

/** CE QUE LE NUMÉRO OUVRE — derrière le (i) (#6441). */
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
  emailOwner: null,
};

/** `SignupField` énumère ce que la PASSERELLE peut refuser ; le focus couvre
 * aussi le code de parrainage, qu'elle ne refuse jamais. */
type FocusedField = SignupField | 'referral' | null;

/**
 * OÙ MÈNE UN COMPTE QUI VIENT D'ÊTRE CRÉÉ (#5561, #8288).
 *
 * Avec un `next` sûr — l'invitation d'où l'on s'est inscrit —, l'invitation :
 * c'est la raison pour laquelle ce compte existe. Sans lui, l'ONBOARDING
 * (notifications, contacts, photo) : le code se saisit désormais DANS la
 * carte de l'inscription, et un compte sans code s'utilise pendant son délai
 * de grâce (#8238) — l'écran du code n'est plus une étape.
 */
export function landingAfterRegistration(input: { readonly next: string | null }): string {
  return safeNextPath(input.next) ?? href('onboarding');
}

/** `next` lu sur l'ADRESSE plutôt que par `useSearch()` : l'écran est monté
 * tel quel par ses témoins, hors du routeur. */
function nextFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('next');
}

/** `POST /auth/register` — injectable pour les témoins, `auth.register` sinon. */
export type SignupRegister = (body: RegisterBody) => Promise<ApiResult<RegisterResponseData>>;

/** La vérification du code et l'attente de la preuve — injectables. */
export type SignupVerificationDeps = SignupCodeDeps;

const defaultVerificationDeps: SignupVerificationDeps = {
  verifyEmail: auth.verifyEmail,
  verificationStatus: auth.verificationStatus,
};

/** Ce que la réponse d'une création réussie dit du compte, pour la carte. */
function awaitingCode(data: RegisterResponseData, email: string): SignupVerification {
  if (isVerificationRequired(data)) {
    return { kind: 'awaiting-code', email: data.email, pendingSessionToken: data.pendingSessionToken ?? null, signedIn: false };
  }
  const token = 'pendingSessionToken' in data ? data.pendingSessionToken : undefined;
  return { kind: 'awaiting-code', email, pendingSessionToken: token ?? null, signedIn: true };
}

export default function SignupScreen({
  referralDeps = defaultReferralDeps,
  register = auth.register,
  magicLinkDeps,
  verification: verificationDeps = defaultVerificationDeps,
}: {
  readonly referralDeps?: SignupReferralDeps;
  readonly register?: SignupRegister;
  /** La demande du lien de connexion d'une adresse déjà utilisée (#8216). */
  readonly magicLinkDeps?: MagicLinkPanelDeps;
  readonly verification?: SignupVerificationDeps;
} = {}) {
  const session = useStore(sessionStore, (s) => s.session);
  const online = useOnline();
  const locale = typeof navigator === 'object' && typeof navigator.language === 'string' ? navigator.language : 'fr-FR';

  const [form, setForm] = useState<SignupFormState>(() => emptySignupForm(locale));
  const [focused, setFocused] = useState<FocusedField>(null);
  const [feedback, setFeedback] = useState<SignupFeedback>(EMPTY_FEEDBACK);
  /** L'adresse que la passerelle a refusée comme DÉJÀ UTILISÉE (#8216). */
  const [takenEmail, setTakenEmail] = useState<string | null>(null);
  /** Non nul : le lien de connexion part vers cette adresse (#8216). */
  const [signInLinkEmail, setSignInLinkEmail] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isValidating, setValidating] = useState(false);
  const [isShowingCountrySheet, setShowingCountrySheet] = useState(false);
  const [isShowingLanguageSheet, setShowingLanguageSheet] = useState(false);
  const phoneHint = useInfoHint('signup-phone-hint');
  const referral = useSignupReferral(referralDeps);

  /** L'ALERTE D'UNE INSCRIPTION SANS NUMÉRO (#8040) — le drapeau MIROIR
   * répond une seule fois par ouverture. */
  const [isShowingPhoneNudge, setShowingPhoneNudge] = useState(false);
  const phoneNudgeOpen = useRef(false);
  const phoneInput = useRef<HTMLInputElement>(null);
  const [phoneFocusRequest, setPhoneFocusRequest] = useState(0);
  useEffect(() => {
    if (phoneFocusRequest > 0) phoneInput.current?.focus();
  }, [phoneFocusRequest]);

  /** Un compte créé par cet écran AUTHENTIFIE déjà (#4264) : sans ce drapeau,
   * l'effet ci-dessous mènerait à `list` avant la carte ou l'onboarding. */
  const [justRegistered, setJustRegistered] = useState(false);
  const [next] = useState(nextFromLocation);
  const safeNext = safeNextPath(next);

  /** « Continuer avec l'e-mail seulement » a été touché (#8288). */
  const [phoneSkipped, setPhoneSkipped] = useState(false);
  /** CE QUI EST PARU — dérivé pendant le rendu, monotone (`signup-phases.ts`). */
  const [progress, setProgress] = useState<SignupProgress>(INITIAL_SIGNUP_PROGRESS);
  const nextProgress = nextSignupProgress(progress, {
    phoneGiven: isPhoneGiven(form.phoneDigits),
    phoneSkipped,
    emailValid: isEmailValid(form.email),
  });
  if (nextProgress !== progress) setProgress(nextProgress);
  /** CE QUE LA CARTE SAIT DU COMPTE (#8288). */
  const [verification, setVerification] = useState<SignupVerification>({ kind: 'none' });
  /** Le mot de passe paru ne se REFERME pas (#6405, #7897). */
  const [isPasswordRevealed, setPasswordRevealed] = useState(false);
  if (!isPasswordRevealed && isIdentityDefined(form)) setPasswordRevealed(true);

  useEffect(() => {
    if (session.status === 'authenticated' && !justRegistered) navigate(landingAfterSession(next, href('list')), true);
  }, [session.status, justRegistered, next]);

  function patch(fields: Partial<SignupFormState>) {
    setForm((current) => ({ ...current, ...fields }));
  }

  function enter() {
    forgetPendingVerification();
    setJustRegistered(true);
    navigate(landingAfterRegistration({ next }), true);
  }

  const formReady = canSubmit(form) && online;
  const primary = signupPrimaryAction({ progress, verification, formReady });
  const phase = signupPhase(progress, verification);

  function handlePrimary(event?: FormEvent) {
    event?.preventDefault();
    if (primary.kind === 'talk') return enter();
    if (!primary.enabled || isSubmitting || isValidating) return;
    if (verification.kind === 'awaiting-code') return enter();
    if (shouldNudgePhone({ hasPhone: hasPhoneNumber(form), phoneSkipped })) {
      phoneNudgeOpen.current = true;
      setShowingPhoneNudge(true);
      return;
    }
    void createAccount({ intent: 'enter' });
  }

  /** Répond UNE fois : le premier geste referme, les suivants se taisent. */
  function answerPhoneNudge(choice: 'add-phone' | 'continue') {
    if (!phoneNudgeOpen.current) return;
    phoneNudgeOpen.current = false;
    setShowingPhoneNudge(false);
    if (choice === 'continue') void createAccount({ intent: 'enter' });
    else setPhoneFocusRequest((n) => n + 1);
  }

  /**
   * CRÉE LE COMPTE — la MÊME inscription pour les trois gestes :
   * « S'inscrire » (`enter` : on entre aussitôt), « Valider mon compte
   * maintenant » (`validate` : le code paraît dans la carte), et « Ce n'est
   * pas moi » (#8214, `claimEmail`) — dont le compte, sans session, n'entre que
   * par son code. Un compte qui attend son code l'attend TOUJOURS dans la
   * carte, jamais sur un autre écran.
   */
  async function createAccount({ intent, claimEmail = false }: { readonly intent: 'enter' | 'validate'; readonly claimEmail?: boolean }) {
    const setBusy = intent === 'validate' ? setValidating : setSubmitting;
    setBusy(true);
    setFeedback(EMPTY_FEEDBACK);
    /* La session que `auth.register` établit REND le magasin « connecté »
       AVANT la suite de cet `await` : l'effet de redirection doit déjà
       savoir que c'est cet écran qui l'a ouverte, sinon il mène à la liste
       sous les doigts de la carte (#8288). */
    setJustRegistered(true);

    const body = composeRegisterBody(form, { referralCode: referral.code });
    const result = await register(claimEmail ? { ...body, claimEmail: true } : body);
    setBusy(false);

    if (!result.ok || isPhoneConflict(result.data)) setJustRegistered(false);
    if (!result.ok) {
      const placed = placeSignupFailure(result);
      setFeedback(placed);
      setTakenEmail(placed.showSignIn ? form.email : null);
      return;
    }
    if (isPhoneConflict(result.data)) {
      setFeedback(placeSignupFailure({ kind: 'phone-conflict' }));
      return;
    }
    /* LE PARRAINAGE EST NOUÉ PAR LA CRÉATION DU COMPTE (#8058) : le code a
       servi, il est OUBLIÉ — sinon il se rattacherait à une inscription
       suivante sur ce navigateur. */
    forgetReferralCode();
    setJustRegistered(true);
    setTakenEmail(null);
    if (intent === 'enter' && !isVerificationRequired(result.data)) {
      navigate(landingAfterRegistration({ next }), true);
      return;
    }
    setVerification(awaitingCode(result.data, form.email.trim().toLowerCase()));
  }

  const interfaceLanguage = currentInterfaceLanguage();
  const isEmailTaken = feedback.showSignIn && takenEmail === form.email;
  const emailError = isEmailTaken
    ? translate(interfaceLanguage, 'signup.emailTaken.message')
    : feedback.showSignIn
      ? undefined
      : feedback.fieldErrors.email;
  const typedEmail = isEmailValid(form.email) ? form.email.trim() : undefined;
  const loginSearch = { next: safeNext ?? undefined, email: typedEmail };
  const usernameRefusal = usernameFieldRefusal(form);
  const usernameError =
    feedback.fieldErrors.username ?? (usernameRefusal !== null ? usernameRefusalMessage(usernameRefusal) : undefined);
  const isPasswordStrong = hasPassword(form.password) && isPasswordValid(form.password);
  const language = getLanguageInfo(form.systemLanguage);
  const busy = isSubmitting || isValidating;

  if (signInLinkEmail !== null) {
    return (
      <AuthColumn className="min-h-0">
        <AuthColumnBar to="login" search={loginSearch} />
        <MagicLinkPanel
          {...(magicLinkDeps === undefined ? {} : { deps: magicLinkDeps })}
          next={next}
          initialEmail={signInLinkEmail}
          sendOnMount
          onCancel={() => setSignInLinkEmail(null)}
        />
      </AuthColumn>
    );
  }

  return (
    <AuthColumn className="min-h-0">
      <AuthColumnBar to="login" search={loginSearch} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6" data-signup-phase={phase}>
        <form id="signup-form" onSubmit={handlePrimary} noValidate>
          <div className="grid gap-2 pt-2 pb-6">
            <h1 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
              Créer votre compte
            </h1>
            <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
              Vous lirez tout le monde dans votre langue.
            </p>
          </div>

          <div className="grid gap-5 pb-5">
            {/* PHASE 1 — LE TÉLÉPHONE D'ABORD (#8288). */}
            <SignupPhoneGlass
              language={interfaceLanguage}
              locale={locale}
              country={form.country}
              phoneDigits={form.phoneDigits}
              onPhoneDigits={(phoneDigits) => patch({ phoneDigits })}
              onOpenCountry={() => setShowingCountrySheet(true)}
              onSkip={() => setPhoneSkipped(true)}
              showsSkip={!progress.emailShown}
              focused={focused === 'phoneNumber'}
              onFocus={() => setFocused('phoneNumber')}
              onBlur={() => setFocused(null)}
              error={feedback.fieldErrors.phoneNumber}
              hint={PHONE_BENEFIT}
              hintState={phoneHint}
              inputRef={phoneInput}
            />

            {/* PHASE 2 — L'ADRESSE PARAÎT. `aria-invalid` suit le REFUS. */}
            <RungReveal shown={progress.emailShown}>
              <Field id="signup-email" label="Adresse e-mail" tint={INDIGO_TINT} focused={focused === 'email'} error={emailError} hint={EMAIL_VERIFICATION}>
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoFocus={phoneSkipped}
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
            </RungReveal>
          </div>
        </form>

        {/* PHASES 3 ET 4 — LA CARTE D'IDENTITÉ, puis le code DANS la carte.
            Hors du `<form>` de l'inscription : le code porte le sien, et un
            formulaire ne s'imbrique pas dans un autre. */}
        {progress.cardShown ? (
          <div className="grid gap-5 pb-5">
            <SignupIdentityCard
              language={interfaceLanguage}
              verification={verification}
              identity={
                <DerivedIdentity
                  framed={false}
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
                  usernameError={usernameError}
                  displayNameError={feedback.fieldErrors.displayName}
                  suggestions={feedback.usernameSuggestions}
                />
              }
              refusals={
                isEmailTaken && typedEmail !== undefined ? (
                  <EmailTakenActions
                    email={typedEmail}
                    owner={feedback.emailOwner}
                    language={interfaceLanguage}
                    linkClassName={INDIGO_LINK}
                    isClaiming={busy}
                    onSendLink={() => setSignInLinkEmail(typedEmail)}
                    onClaim={() => void createAccount({ intent: 'validate', claimEmail: true })}
                  />
                ) : null
              }
              extra={
                isPasswordRevealed ? (
                  <SignupPasswordBlock
                    password={form.password}
                    onPassword={(password) => patch({ password })}
                    focused={focused === 'password'}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    isStrong={isPasswordStrong}
                    error={feedback.fieldErrors.password}
                  />
                ) : null
              }
              canValidate={formReady}
              isValidating={isValidating}
              onValidateNow={() => void createAccount({ intent: 'validate' })}
              onVerified={() => setVerification({ kind: 'verified' })}
              codeDeps={verificationDeps}
            />

            {verification.kind === 'none' ? (
              <>
                {/* LA PASTILLE LIT LE MÊME CATALOGUE QUE LA FEUILLE (`getLanguageInfo`). */}
                <button
                  type="button"
                  onClick={() => setShowingLanguageSheet(true)}
                  className="flex items-center gap-2 rounded-[14px] px-4 text-start"
                  style={{ minHeight: 48, backgroundColor: 'var(--color-ios-card)' }}
                >
                  <span aria-hidden="true">{language.flag}</span>
                  <span className="flex-1 text-title font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
                    Vous lirez Meeshy en <span lang={language.code}>{language.nativeName ?? language.name}</span>
                  </span>
                  <span className={`text-title font-semibold ${INDIGO_LINK}`}>Changer</span>
                </button>

                <SignupReferralBlock
                  referral={referral}
                  focused={focused === 'referral'}
                  onFocus={() => setFocused('referral')}
                  onBlur={() => setFocused(null)}
                />
              </>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-5 pb-8">
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

          {/* « S'INSCRIRE », PUIS « PARLER AUX AUTRES » (#8288) — présent dès
              l'ouverture, actif dès la carte ; le compte validé le change. */}
          <button
            type="submit"
            form="signup-form"
            data-signup-primary={primary.kind}
            disabled={primary.kind === 'signup' && (!primary.enabled || busy)}
            aria-busy={isSubmitting}
            className="grid place-items-center rounded-[14px] font-bold text-white transition-opacity"
            style={{
              minHeight: 52,
              background: 'linear-gradient(90deg, var(--ios-indigo-500), var(--ios-indigo-700))',
              opacity: primary.kind === 'signup' && (!primary.enabled || busy) ? 0.6 : 1,
            }}
          >
            {primary.kind === 'talk'
              ? translate(interfaceLanguage, 'signup.talk')
              : translate(interfaceLanguage, isSubmitting ? 'signup.submit.busy' : 'signup.submit')}
          </button>

          <div className="grid gap-2">
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
              En continuant, vous acceptez les conditions d’utilisation et la politique de confidentialité.
            </p>
            <div className="flex gap-4">
              <a href={appInstitutionalHref('terms')} className={`text-caption font-semibold ${INDIGO_LINK}`} style={{ minHeight: 44 }}>
                Conditions d’utilisation
              </a>
              <a href={appInstitutionalHref('privacy')} className={`text-caption font-semibold ${INDIGO_LINK}`} style={{ minHeight: 44 }}>
                Politique de confidentialité
              </a>
            </div>
          </div>

          {/* UNE SORTIE, pas un champ (#6405) : dite dès la première seconde. */}
          <Link
            to="login"
            search={loginSearch}
            replace
            className="inline-flex items-center justify-self-center text-title font-semibold"
            style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
          >
            Déjà un compte ?&nbsp;<span className={INDIGO_LINK}>Se connecter</span>
          </Link>
        </div>
      </div>

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
