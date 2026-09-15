import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { AuthBrandFooter, AuthSubmitButton, AuthTitle } from '@/components/auth-chrome';
import { AuthColumn } from '@/components/auth-column';
import { Field } from '@/components/field';
import { GlyphSvg } from '@/components/glyph';
import { AUTH_GLYPHS } from '@/components/glyphs-auth';
import { MagicLinkPanel, type MagicLinkPanelDeps } from '@/components/magic-link-panel';
import { auth } from '@/lib/api/auth';
import { sessionStore } from '@/lib/api/session';
import { useOnline } from '@/lib/net/online';
import { useSearch } from '@/lib/router';
import { landingAfterSession, safeNextPath } from '@/lib/session-guard';
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

/**
 * LES DEUX PORTES, ET CELLE QUI S'OUVRE PAR DÉFAUT (#6404).
 *
 * Directive porteur 2026-09-13 : « Avec connexion par magic link comme
 * connexion par défaut pour le moment ! […] Proposer l'option se connecter
 * avec identifiant (e-mail, téléphone, pseudo) et mot de passe ». Le mot de
 * passe n'est donc pas retiré — il DESCEND d'un rang, derrière un contrôle
 * nommé.
 *
 * **Le choix vit dans l'ADRESSE**, jamais dans un état local : le retour
 * arrière le rend, un lien le partage, et une recette ouvre directement l'une
 * des deux portes (même règle que la catégorie de la cloche, `notifications.tsx`).
 * `lien` est l'ABSENCE du paramètre — l'adresse par défaut reste `/login` nu,
 * et une valeur inconnue y retombe plutôt que de rendre un écran vide.
 *
 * ## `password`, et `motdepasse` qu'on LIT encore (#6583)
 *
 * Directive porteur 2026-09-14 : « `/login?methode=motdepasse` doit être
 * `/login?methode=password` ». La valeur ÉMISE change donc ; la valeur LUE,
 * elle, s'élargit. `motdepasse` a été l'adresse de cette porte pendant toute
 * la vie de #6404 — elle est dans des signets, des liens partagés et la
 * recette. La retirer du vocabulaire de lecture renverrait ces adresses sur le
 * lien magique, c'est-à-dire sur un écran que personne n'a demandé : une
 * valeur qu'on cesse d'écrire n'est pas une valeur qu'on peut cesser de
 * comprendre.
 */
const METHOD_PARAM = 'methode';

/** La valeur ÉCRITE dans l'adresse de la porte du mot de passe. Un seul site,
 * pour que le lien qui l'émet et la lecture qui l'accepte ne puissent pas
 * diverger. */
const PASSWORD_METHOD = 'password';

/** L'ancienne écriture, LUE mais jamais émise (§ doc-comment ci-dessus). */
const LEGACY_PASSWORD_METHOD = 'motdepasse';

/**
 * `next` — OÙ REVENIR UNE FOIS CONNECTÉ (#5561). Une invitation `/chat/:link`
 * y envoie un visiteur sans session ; la connexion le lui rend. La valeur est
 * clampée à chaque usage (`safeNextPath`), jamais crue.
 */
const NEXT_PARAM = 'next';

type LoginMethod = 'lien' | 'password';

export function loginMethodFromSearch(raw: string | null): LoginMethod {
  return raw === PASSWORD_METHOD || raw === LEGACY_PASSWORD_METHOD ? 'password' : 'lien';
}

/** Le violet de marque du titre — `purple700 → purple600 → purple500`
 * (`LoginView.swift:109`), dérivé de Swift (D-4). C'est la SEULE surface de
 * l'application qui emploie cette rampe : la marque partout ailleurs est
 * indigo (`--color-ios-brand`). */
const TITLE_GRADIENT = 'linear-gradient(90deg, var(--ios-purple-700), var(--ios-purple-600), var(--ios-purple-500))';
const FOCUS_TINT = 'var(--ios-purple-600)';

/** L'ENCRE DES ACTIONS EN TEXTE — un pas de rampe par schéma, comme
 * `signup.tsx` : `indigo500` nu tombe sous 4,5:1 pour du petit texte dans les
 * DEUX schémas. */
const INDIGO_LINK = 'text-[color:var(--ios-indigo-400)] light:text-[color:var(--ios-indigo-600)]';

/**
 * L'ÉCRAN, tel que le routeur le monte : il LIT l'adresse, et délègue tout le
 * reste à `LoginDoors`. Ce découpage n'est pas cosmétique — `useSearch()` exige
 * le contexte du routeur, donc un témoin qui monterait l'écran entier devrait
 * monter le routeur, ses chunks paresseux et son préalable de catalogue pour
 * prouver deux `<input>`. La PORTE est une donnée ; l'adresse qui la choisit
 * est une autre question, et `loginMethodFromSearch` la tient, seule et pure.
 */
export default function LoginScreen({ magicLinkDeps }: { readonly magicLinkDeps?: MagicLinkPanelDeps } = {}) {
  const [search] = useSearch();
  return (
    <LoginDoors
      method={loginMethodFromSearch(search.get(METHOD_PARAM))}
      next={search.get(NEXT_PARAM)}
      {...(magicLinkDeps === undefined ? {} : { magicLinkDeps })}
    />
  );
}

export function LoginDoors({
  method,
  next = null,
  magicLinkDeps,
}: {
  readonly method: LoginMethod;
  /** La valeur BRUTE de `?next=` — clampée ici, là où elle sert. */
  readonly next?: string | null;
  readonly magicLinkDeps?: MagicLinkPanelDeps;
}) {
  const session = useStore(sessionStore, (s) => s.session);
  const online = useOnline();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [focused, setFocused] = useState<'username' | 'password' | 'code' | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requires2FA = session.status === 'pending2fa';
  /** Ce que les liens qui RÉÉCRIVENT l'adresse transmettent — changer de porte
   * ou aller s'inscrire ne doit pas perdre l'invitation, ni propager un `next`
   * hostile. `undefined` : `href()` omet alors le paramètre. */
  const nextSearch = { [NEXT_PARAM]: safeNextPath(next) ?? undefined };

  /**
   * L'AUTHENTIFICATION PARLE TOUJOURS À LA PASSERELLE RÉELLE (`auth.ts` importe
   * `httpTransport`, jamais les fixtures) — indépendamment de `apiConfig.source`,
   * qui ne gouverne QUE les données de liste/fil. Une connexion réussie doit
   * donc mener vers `/` ICI, sans attendre `SessionGate` (`main.tsx`), dont la
   * garde `redirect-home` ne mord qu'en source `'gateway'` (T7 : les fixtures
   * restent `allow` partout, délibérément, pour ne pas casser le POC).
   */
  useEffect(() => {
    if (session.status === 'authenticated') navigate(landingAfterSession(next, href('list')), true);
  }, [session.status, next]);

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
    <AuthColumn className="items-center justify-center gap-8 px-6 py-10">
      {/* LE BLASON NE PARAÎT QUE LÀ OÙ IL NOMME QUELQUE CHOSE (#6583).
          Directive porteur 2026-09-14 : « à la connexion la page doit être
          sans titre sauf la baguette magique ». La porte par défaut a la
          baguette, un titre de champ et un bouton — le blason y disait une
          seconde fois ce que la page est, à quelqu'un qui vient de cliquer
          « Se connecter ». Les DEUX autres sections le gardent : la porte du
          mot de passe n'a pas de baguette, et le second facteur est un écran
          d'arrêt au milieu d'un parcours, où savoir de QUI vient la demande
          de code n'est pas un ornement.

          Ce que cette directive retirait AUSSI — le titre de section du
          panneau — est revenu par celle du 2026-09-15 (#6626) : « Votre
          adresse e-mail » y ancre le (i) « Comment ça marche », donc annonce
          quelque chose au lieu de répéter le champ. `MagicLinkPanel` n'a
          plus de prop `heading` : plus personne ne le taisait. */}
      {method === 'password' || requires2FA ? <AuthTitle gradient="login" /> : null}

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
      ) : method === 'lien' ? (
        /* LA PORTE PAR DÉFAUT — le MÊME panneau que l'écran plein
           `/auth/magic-link` (`MagicLinkPanel`), jamais une seconde machine :
           saisie, envoi, compte à rebours, renvoi et la note sur les
           indésirables y vivent une seule fois. `autoFocus` est FAUX ici :
           le panneau partage l'écran avec le titre et les deux liens du bas,
           et voler le focus au montage déplacerait le défilement sans que
           personne ne l'ait demandé. */
        <MagicLinkPanel
          {...(magicLinkDeps === undefined ? {} : { deps: magicLinkDeps })}
          footer={
            <div className="mt-1 grid justify-items-center gap-2">
              <Link
                to="login"
                search={{ [METHOD_PARAM]: PASSWORD_METHOD, ...nextSearch }}
                replace
                className={`inline-flex items-center text-title font-semibold ${INDIGO_LINK}`}
                style={{ minHeight: 44 }}
              >
                Se connecter avec un identifiant et un mot de passe
              </Link>
            </div>
          }
        />
      ) : (
        <form onSubmit={handleLoginSubmit} className="grid w-full gap-4" noValidate>
          <Field
            id="login-username"
            label="E-mail, téléphone ou pseudo"
            icon="user"
            tint={FOCUS_TINT}
            focused={focused === 'username'}
          >
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

          {/* LES DEUX PORTES (#5816) — `LoginView.swift:478-503` : la
              connexion par e-mail EN PREMIER (action mise en avant,
              l.481-493), « Mot de passe oublié ? » EN DESSOUS (l.495-501) —
              empilées, jamais côte à côte (doc-comment l.479-480). Ancres,
              pas des boutons qui naviguent : pas d'`history`, un vrai `href`.

              « Se connecter par e-mail », baguette en tête (#6626) : le mot
              dit CE QUE l'on fait, la baguette garde l'identité de la porte.
              Le glyphe porte sa propre teinte — le dégradé du libellé est
              découpé dans le TEXTE (`background-clip: text`), et un tracé en
              `currentColor` y serait transparent. */}
          <div className="mt-1 grid justify-items-center gap-2">
            <Link to="login" search={nextSearch} replace className="inline-flex items-center gap-2 font-semibold text-title" style={{ minHeight: 44 }}>
              <GlyphSvg glyph={AUTH_GLYPHS.magicWand} size={18} style={{ color: 'var(--ios-purple-500)' }} />
              <span
                style={{
                  background: 'linear-gradient(90deg, var(--ios-purple-500), var(--ios-indigo-400))',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                Se connecter par e-mail
              </span>
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
        <Link to="signup" search={nextSearch} className="font-semibold" style={{ background: TITLE_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          Créer un compte
        </Link>
      </p>

      <AuthBrandFooter />
    </AuthColumn>
  );
}
