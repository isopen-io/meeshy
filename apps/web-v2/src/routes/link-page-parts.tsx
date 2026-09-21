import type { CSSProperties, ReactNode } from 'react';

import { AuthColumn } from '@/components/auth-column';
import { Glyph } from '@/components/glyph';
import type { GlyphName } from '@/components/glyphs';
import type { ReachFailure } from '@/lib/api/link-failure';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DES PAGES D'UN LIEN REÇU** (#6714, #6715) — `/l/:token`, son état
 * clos, la suppression de compte, le changement d'adresse et le désabonnement.
 *
 * Ces pages s'ouvrent depuis un e-mail, une messagerie, une publication :
 * souvent sans session, souvent sur mobile, parfois hors ligne. Elles prennent
 * la GÉOMÉTRIE des pages d'accès (`AuthColumn`, D-72) — une colonne centrée,
 * lisible sur un téléphone comme sur un écran de 1 440 px — et un seul
 * vocabulaire : un glyphe, un titre, ce qui se passe, puis les gestes.
 *
 * **Chaque geste mesure 52 px de haut** (au-delà des 44 exigés) et reste un
 * LIEN quand il navigue : ouvrir en nouvel onglet, lire l'adresse, précharger.
 *
 * **Le rouge d'une action destructrice est celui de la déconnexion**
 * (`LogoutButton`, `settings-sections.tsx`) : `--color-danger` sur un voile du
 * même rouge, dont le contraste suit le thème. Un aplat `--ios-error` sous un
 * texte blanc n'atteindrait pas AA.
 */

export type LinkPageTone = 'brand' | 'danger' | 'success';

const TONE_INK: Readonly<Record<LinkPageTone, string>> = {
  brand: 'var(--color-ios-brand)',
  danger: 'var(--color-danger)',
  success: 'var(--color-success)',
};

export function LinkPage({
  glyph,
  tone,
  title,
  body,
  busy = false,
  children,
}: {
  readonly glyph: GlyphName;
  readonly tone: LinkPageTone;
  readonly title: string;
  readonly body?: ReactNode;
  readonly busy?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <AuthColumn className="justify-center gap-6 px-8 text-center">
      <span aria-hidden="true" className="mx-auto" style={{ color: TONE_INK[tone] }}>
        <Glyph name={glyph} size={48} />
      </span>
      <div role="status" aria-busy={busy} className="grid gap-3">
        <h1 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          {title}
        </h1>
        {body}
      </div>
      {children === undefined ? null : <div className="grid gap-3">{children}</div>}
    </AuthColumn>
  );
}

export function LinkText({ children }: { readonly children: ReactNode }) {
  return <p style={{ color: 'var(--color-ios-ink-2)' }}>{children}</p>;
}

export function LinkAlert({ children }: { readonly children: ReactNode }) {
  return (
    <p role="alert" style={{ color: 'var(--color-danger)' }}>
      {children}
    </p>
  );
}

const ACTION_CLASS =
  'grid w-full place-items-center rounded-[14px] px-6 text-center font-bold focus-visible:outline-2 focus-visible:outline-offset-2';

const ACTION_HEIGHT = 52;

export type ActionTone = 'primary' | 'danger' | 'secondary';

const ACTION_FILL: Readonly<Record<ActionTone, CSSProperties>> = {
  primary: {
    color: 'white',
    background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))',
    outlineColor: 'var(--color-ios-brand)',
  },
  danger: {
    color: 'var(--color-danger)',
    backgroundColor: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
    outlineColor: 'var(--color-danger)',
  },
  secondary: {
    color: 'var(--color-ios-ink)',
    border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
    outlineColor: 'var(--color-ios-brand)',
  },
};

export function ActionButton({
  tone = 'primary',
  type = 'button',
  disabled = false,
  onClick,
  children,
}: {
  readonly tone?: ActionTone;
  readonly type?: 'button' | 'submit';
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly children: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={ACTION_CLASS}
      style={{ ...ACTION_FILL[tone], minHeight: ACTION_HEIGHT, opacity: disabled ? 0.5 : 1 }}
    >
      {children}
    </button>
  );
}

/**
 * UN GESTE QUI SORT DU SITE (#7297) — la fiche d'une boutique d'applications.
 *
 * Même géométrie et même teinte que `ActionButton` / `ActionLink` : sur ces
 * pages, ce qui a l'air d'un geste EST un geste, qu'il reste dans Meeshy ou
 * non. `rel="noopener noreferrer"` parce que la cible est un site TIERS —
 * `target="_blank"` sans lui laisse à la page ouverte une référence
 * manipulable sur l'onglet d'origine, et fuite l'adresse d'où l'on vient.
 */
export function ActionAnchor({
  href,
  tone = 'primary',
  children,
}: {
  readonly href: string;
  readonly tone?: ActionTone;
  readonly children: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={ACTION_CLASS}
      style={{ ...ACTION_FILL[tone], minHeight: ACTION_HEIGHT }}
    >
      {children}
    </a>
  );
}

/** Les seules destinations qu'une page de lien propose : l'accueil, la connexion, les réglages. */
export type LinkDestination = 'list' | 'login' | 'settings';

/**
 * `replace` : la page d'un lien reçu est une ENTRÉE, pas une étape. La
 * remplacer évite que « retour » ramène sur un lien déjà consommé — un clic
 * recompté, un jeton déjà dépensé.
 */
export function ActionLink({ to, tone, children }: { readonly to: LinkDestination; readonly tone: ActionTone; readonly children: string }) {
  return (
    <Link to={to} replace className={ACTION_CLASS} style={{ ...ACTION_FILL[tone], minHeight: ACTION_HEIGHT }}>
      {children}
    </Link>
  );
}

export const REACH_FAILURE_BODY = {
  offline: 'linkPage.offline.body',
  'rate-limited': 'linkPage.rateLimited',
  unavailable: 'linkPage.unavailable.body',
} as const satisfies Readonly<Record<ReachFailure, string>>;

const REACH_FAILURE_TITLE = {
  offline: 'linkPage.offline.title',
  'rate-limited': 'linkPage.unavailable.title',
  unavailable: 'linkPage.unavailable.title',
} as const satisfies Readonly<Record<ReachFailure, string>>;

/**
 * La passerelle n'a pas répondu, ou a refusé pour une raison qui ne tient pas
 * au lien : l'état le DIT, et propose de réessayer. Jamais « lien mort » — un
 * lecteur hors ligne qui le lirait ne réessaierait jamais.
 */
export function ReachFailurePage({
  language,
  failure,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly failure: ReachFailure;
  readonly onRetry: () => void;
}) {
  return (
    <LinkPage
      glyph="warningCircle"
      tone="brand"
      title={translate(language, REACH_FAILURE_TITLE[failure])}
      body={<LinkText>{translate(language, REACH_FAILURE_BODY[failure])}</LinkText>}
    >
      <ActionButton onClick={onRetry}>{translate(language, 'linkPage.retry')}</ActionButton>
      <ActionLink to="list" tone="secondary">
        {translate(language, 'linkPage.home')}
      </ActionLink>
    </LinkPage>
  );
}

/**
 * Le lien agit sur le compte CONNECTÉ et il n'y a pas de session : rien n'est
 * dépensé, et la page dit quoi faire. La connexion ne sait pas encore ramener
 * ici — d'où « rouvrez-le depuis l'e-mail », qui reste vrai quoi qu'il arrive.
 */
export function SignedOutPage({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <LinkPage
      glyph="lock"
      tone="brand"
      title={translate(language, 'linkPage.signedOut.title')}
      body={<LinkText>{translate(language, 'linkPage.signedOut.body')}</LinkText>}
    >
      <ActionLink to="login" tone="primary">
        {translate(language, 'linkPage.signIn')}
      </ActionLink>
    </LinkPage>
  );
}
