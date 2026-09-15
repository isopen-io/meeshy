import { useState, type FormEvent } from 'react';

import { AuthAmbient, AuthBrandFooter, AuthSubmitButton } from '@/components/auth-chrome';
import { Field } from '@/components/field';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { AUTH_GLYPHS } from '@/components/glyphs-auth';
import { InfoHintButton, InfoHintText, useInfoHint, type InfoHint } from '@/components/info-hint';
import { auth } from '@/lib/api/auth';
import { useOnline } from '@/lib/net/online';
import { isEmailValid } from '@/lib/signup-form';
import { NOTHING_RECEIVED_LABEL, NOTHING_RECEIVED_TEXT } from '@/lib/view/auth-copy';
import { resolveForgotPasswordOutcome, type ForgotPasswordOutcome } from '@/lib/view/auth-feedback';
import { Link } from '@/routes/route-table';

/**
 * MOT DE PASSE OUBLIÉ, flux E-MAIL (#5816, reformé par #6583) — 200 ET 404
 * rendent le MÊME écran « E-mail envoyé ! » (`resolveForgotPasswordOutcome`,
 * garde de non-révélation). Le segment Email/Téléphone de
 * `MeeshyForgotPasswordView.swift` n'est toujours PAS rendu : le flux
 * téléphone n'existe pas, et un segment inerte violerait la loi 4.
 *
 * ## Pourquoi il ressemble maintenant à `/login`
 *
 * Directive porteur 2026-09-14 : « tu profites pour mettre à jour
 * /forgot-password pour que ça ressemble à /login ». L'écran portait une BARRE
 * DE TITRE — un « X » et « Mot de passe oublié » — héritée de la feuille
 * modale iOS. Sur le web ce n'est pas une feuille : c'est une PAGE, atteinte
 * par un lien de `/login`, et le bouton « retour » du navigateur y ramène
 * déjà. La barre disait donc son nom à qui venait de cliquer son nom, et
 * ajoutait un second geste de sortie en haut de l'écran là où `/login` n'en a
 * aucun.
 *
 * Ce qu'il prend de `/login` : le halo d'ambiance, la colonne centrée à
 * `max-w-sm`, un glyphe pour toute en-tête, une phrase, un champ, un bouton,
 * puis le retour vers la connexion et le pied de marque. La seule différence
 * assumée est la TEINTE (`--color-ios-brand`, `MeeshyForgotPasswordView.swift:309`)
 * : les deux écrans ne font pas la même promesse, et la couleur du bouton est
 * ce qui le dit.
 */

const FORGOT_PASSWORD_TINT = 'var(--color-ios-brand)';

/**
 * LES INDÉSIRABLES, MÊME QUESTION ET MÊME RÉPONSE QUE LE LIEN PAR E-MAIL
 * (#6583) — texte et libellé viennent de `lib/view/auth-copy.ts`, le (i) du
 * socle (`components/info-hint.tsx`, extrait par #6626). Deux écrans attendent
 * le même e-mail : ils le disent avec les mêmes mots, et de la même façon.
 */
const NOTHING_RECEIVED: InfoHint = {
  label: NOTHING_RECEIVED_LABEL,
  text: NOTHING_RECEIVED_TEXT,
  glyph: AUTH_GLYPHS.info,
};

/** Ce que l'écran DEMANDE — injecté pour que le témoin atteigne l'état
 * « envoyé » sans parler à une passerelle, comme `MagicLinkPanel` depuis
 * #6404. Le défaut reste le client réel : aucun écran ne se bouchonne en
 * production. */
export type ForgotPasswordDeps = { readonly request: typeof auth.forgotPassword };

const defaultDeps: ForgotPasswordDeps = { request: auth.forgotPassword };

export default function ForgotPasswordScreen({ deps = defaultDeps }: { readonly deps?: ForgotPasswordDeps } = {}) {
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<ForgotPasswordOutcome | null>(null);
  const nothingReceived = useInfoHint();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isEmailValid(email) || submitting || !online) return;
    setSubmitting(true);
    setOutcome(null);
    const result = await deps.request(email);
    setSubmitting(false);
    setOutcome(resolveForgotPasswordOutcome(result));
  }

  const sent = outcome?.kind === 'sent';
  const fieldError = outcome?.kind === 'invalid-email' ? 'Adresse e-mail invalide' : undefined;
  const banner =
    outcome?.kind === 'offline'
      ? 'Pas de connexion. Vérifiez votre réseau et réessayez.'
      : outcome?.kind === 'failed'
        ? outcome.message
        : null;

  return (
    <div className="relative flex h-dvh flex-col items-center overflow-y-auto pt-safe pb-safe">
      <AuthAmbient />

      <div className="relative flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-6 py-10">
        {sent ? (
          <>
            <Glyph name="envelopeOpen" size={56} style={{ color: FORGOT_PASSWORD_TINT }} />
            <p className="text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
              Si un compte existe avec <strong style={{ color: 'var(--color-ios-ink)' }}>{email}</strong>, un lien de
              réinitialisation vient d’être envoyé.
            </p>
            {/* LES INDÉSIRABLES — voir `NOTHING_RECEIVED` : même question,
                même réponse et même (i) que l'attente du lien par e-mail. */}
            <div className="grid justify-items-center" data-forgot-password-spam-hint>
              <InfoHintButton hint={NOTHING_RECEIVED} state={nothingReceived} showsLabel />
              <InfoHintText hint={NOTHING_RECEIVED} state={nothingReceived} className="text-center" />
            </div>
            <Link
              to="login"
              replace
              className="grid w-full place-items-center rounded-[14px] px-6 font-semibold"
              style={{
                minHeight: 52,
                border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
                color: 'var(--color-ios-ink)',
              }}
            >
              Retour à la connexion
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="grid w-full gap-6" noValidate>
            {/* L'ENVELOPPE POUR TOUTE EN-TÊTE — le pendant de la baguette de
                `/login` (#6583) : elle dit de quoi il s'agit sans qu'aucun
                titre n'ait à le répéter. */}
            <span aria-hidden="true" className="mx-auto" style={{ color: FORGOT_PASSWORD_TINT }}>
              <GlyphSvg glyph={AUTH_GLYPHS.envelope} size={56} />
            </span>

            <p className="text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
              Entrez votre e-mail, nous vous enverrons un lien de réinitialisation.
            </p>

            <Field
              id="forgot-email"
              glyph={AUTH_GLYPHS.envelope}
              tint={FORGOT_PASSWORD_TINT}
              focused={focused}
              error={fieldError}
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-label="Adresse e-mail"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={email}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="nom@exemple.com"
                  className="w-full bg-transparent py-3 text-input outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                />
              )}
            </Field>

            {banner !== null ? (
              <p role="alert" className="text-center text-caption" style={{ color: 'var(--ios-error)' }}>
                {banner}
              </p>
            ) : null}

            <AuthSubmitButton
              disabled={!isEmailValid(email) || !online}
              isSubmitting={submitting}
              label="Recevoir le lien"
              busyLabel="Envoi…"
              background={FORGOT_PASSWORD_TINT}
            />

            {/* LE RETOUR, EN PIED — la place qu'occupent les deux liens de
                `/login`, jamais une croix en haut d'écran (§ doc-comment). */}
            <Link
              to="login"
              replace
              className="inline-flex items-center justify-self-center font-medium text-title"
              style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
            >
              Retour à la connexion
            </Link>
          </form>
        )}

        <AuthBrandFooter />
      </div>
    </div>
  );
}
