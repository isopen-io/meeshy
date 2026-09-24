import type { ReactNode } from 'react';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { endonymOf, LanguageShareBar } from '@/components/language-share-bar';
import { SECTION_BRAND_INK, SECTION_CARD_STYLE } from '@/components/grouped-section';
import type { RecentArrival, ShareLinkStats } from '@/lib/api/link-stats';
import type { MyShareLink, ShareLinkInactiveReason, ShareLinkPolicy } from '@/lib/api/links';
import { translate } from '@/lib/i18n-catalog';
import { translateInvite, type InviteCatalogKey } from '@/lib/i18n-invite-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { displayUrlOf, flagOf, languageSharesOf } from '@/lib/links/invitation-view';
import { classifyRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';
import { LinksGlyph } from '@/routes/links-parts';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DE LA PAGE DU CRÉATEUR D'UN LIEN** (#7797) — la maquette
 * validée (`WebLienDetail`, `IosLienDetail`) : la carte du lien en dégradé,
 * les trois tuiles Visites / Arrivées / Sans compte, les langues des arrivants,
 * les derniers arrivés et la configuration EN LECTURE. L'édition vit dans
 * `share-link-edit.tsx`.
 *
 * Chaque pièce est PURE (primitives en props) : `share-link.test.tsx` les rend
 * sans passerelle ni TanStack Query.
 *
 * **Les statistiques absentes se dessinent absentes** : tant que la route de
 * la passerelle (#7794) ne répond pas, les tuiles portent « — » et le disent
 * (« pas encore mesuré »), jamais un zéro qui dirait « personne n'est venu ».
 */

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const TITLE_CLASS = 'text-check font-extrabold uppercase tracking-[0.1em]';
const SUB_TITLE_CLASS = 'text-chip font-extrabold uppercase tracking-[0.08em]';
const CARD_CLASS = 'grid gap-3 rounded-[20px] p-4';
const ACTIVE_GRADIENT = 'linear-gradient(135deg, var(--ios-indigo-600) 0%, var(--ios-indigo-700) 45%, color-mix(in srgb, var(--ios-purple-600) 75%, black) 100%)';
const INACTIVE_GRADIENT = 'linear-gradient(135deg, var(--ios-neutral-600), var(--ios-neutral-500))';
const PILL_BUTTON = 'flex items-center justify-center gap-2 rounded-chip px-3 text-caption font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-body';

const REASON_KEY: Readonly<Record<ShareLinkInactiveReason, 'links.detail.reason.closed' | 'links.detail.reason.expired' | 'links.detail.reason.revoked'>> = {
  CONVERSATION_CLOSED: 'links.detail.reason.closed',
  LINK_EXPIRED: 'links.detail.reason.expired',
  REVOKED: 'links.detail.reason.revoked',
};

const dateOf = (language: InterfaceLanguage, iso: string, withTime = false): string =>
  new Intl.DateTimeFormat(language, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(iso));

/** Le fil d'Ariane du bureau — Liens › Liens de conversation › le lien. */
export function LinkBreadcrumb({ language, name }: { readonly language: InterfaceLanguage; readonly name: string }) {
  return (
    <nav aria-label={translateInvite(language, 'linkDetail.breadcrumb')} data-link-breadcrumb className="hidden md:block">
      <ol className="flex flex-wrap items-center gap-2 text-caption font-semibold" style={{ color: INK_2 }}>
        <li>
          <Link to="links" className="rounded-[6px] underline-offset-2 hover:underline focus-visible:outline-2" style={{ color: INK_2 }}>
            {translateInvite(language, 'linkDetail.breadcrumb.links')}
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li>
          <Link to="shareLinks" className="rounded-[6px] underline-offset-2 hover:underline focus-visible:outline-2" style={{ color: INK_2 }}>
            {translateInvite(language, 'linkDetail.breadcrumb.share')}
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li aria-current="page" className="min-w-0 truncate" style={{ color: INK }}>
          {name}
        </li>
      </ol>
    </nav>
  );
}

/**
 * La carte du lien — le groupe, la date, l'état, l'adresse `meeshy.me/chat/…`,
 * le message d'invitation, puis Partager et Copier le lien. En dégradé quand
 * le lien est actif, en gris quand il ne l'est plus : la couleur le dit, le
 * badge l'ÉCRIT (WCAG 1.4.1).
 */
export function InviteLinkCard({
  language,
  link,
  url,
  copied,
  onShare,
  onCopy,
}: {
  readonly language: InterfaceLanguage;
  readonly link: MyShareLink;
  readonly url: string;
  readonly copied: boolean;
  readonly onShare: () => void;
  readonly onCopy: () => void;
}) {
  const group = link.conversationTitle ?? link.name ?? link.linkId;
  return (
    <section
      data-share-link-hero
      aria-label={translateInvite(language, 'linkDetail.title')}
      className="grid gap-3.5 rounded-[28px] p-5 text-white"
      style={{
        /* Le dégradé est une IMAGE : la couleur pleine sous lui est la teinte la
           plus claire qu'il traverse, celle que mesurent les contrôles de
           contraste (`scripts/lib/contrast.mjs` ne lit que la couleur). */
        backgroundColor: link.isActive ? 'var(--ios-indigo-600)' : 'var(--ios-neutral-500)',
        backgroundImage: link.isActive ? ACTIVE_GRADIENT : INACTIVE_GRADIENT,
        boxShadow: '0 18px 40px color-mix(in srgb, var(--ios-indigo-600) 30%, transparent)',
      }}
    >
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-[16px] text-thread font-extrabold"
          style={{ border: '2px solid rgb(255 255 255 / 0.55)', backgroundColor: 'rgb(30 27 75 / 0.45)' }}
        >
          {initialsOf(group)}
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span data-share-link-conversation dir="auto" className="line-clamp-2 break-words text-thread font-extrabold">
            {group}
          </span>
          <span className="text-caption" style={{ opacity: 0.92 }}>
            {translateInvite(language, 'linkDetail.card.created', { date: dateOf(language, link.createdAt) })}
          </span>
        </span>
        <span
          data-share-link-status
          className="shrink-0 rounded-chip px-2.5 py-1 text-chip font-extrabold uppercase"
          style={link.isActive ? { backgroundColor: 'var(--color-success)', color: 'var(--color-on-status)' } : { backgroundColor: 'rgb(0 0 0 / 0.35)' }}
        >
          {translate(language, link.isActive ? 'links.status.active' : 'links.status.inactive')}
        </span>
      </div>
      <p className="flex min-w-0 items-center gap-2.5 rounded-[14px] px-3.5 py-3" style={{ backgroundColor: 'rgb(255 255 255 / 0.18)' }}>
        <span aria-hidden="true" className="shrink-0">
          <Glyph name="linkSimple" size={18} />
        </span>
        <span data-share-link-url dir="ltr" className="min-w-0 truncate font-mono text-body">
          {displayUrlOf(url)}
        </span>
      </p>
      {link.inactiveReason === null ? null : (
        <p data-share-link-reason className="text-caption font-semibold">
          {translate(language, REASON_KEY[link.inactiveReason])}
        </p>
      )}
      {link.description === null ? null : (
        <p data-share-link-message dir="auto" className="text-body leading-relaxed" style={{ opacity: 0.95 }}>
          « {link.description} »
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          data-share-link-action="share"
          onClick={onShare}
          className={PILL_BUTTON}
          style={{ minHeight: 48, backgroundColor: 'white', color: 'var(--ios-indigo-700)', outlineColor: 'white' }}
        >
          <span aria-hidden="true">
            <LinksGlyph name="export" size={18} />
          </span>
          {translateInvite(language, 'linkDetail.card.share')}
        </button>
        <button
          type="button"
          data-share-link-action="copy"
          onClick={onCopy}
          className={PILL_BUTTON}
          style={{ minHeight: 48, backgroundColor: 'rgb(255 255 255 / 0.22)', color: 'white', outlineColor: 'white' }}
        >
          <span aria-hidden="true">{copied ? <Glyph name="check" size={18} /> : <LinksGlyph name="copy" size={18} />}</span>
          {translateInvite(language, copied ? 'linkDetail.card.copied' : 'linkDetail.card.copy')}
        </button>
      </div>
    </section>
  );
}

type StatKey = 'visits' | 'arrivals' | 'anonymous';

const STAT_LABEL: Readonly<Record<StatKey, Extract<InviteCatalogKey, `linkDetail.stats.${StatKey}`>>> = {
  visits: 'linkDetail.stats.visits',
  arrivals: 'linkDetail.stats.arrivals',
  anonymous: 'linkDetail.stats.anonymous',
};

/**
 * Visites / Arrivées / Sans compte. `stats === null` : la route ne sert pas
 * encore — « — », dit « pas encore mesuré ». `undefined` : première lecture en
 * cours, sans rien en cache — la même forme, marquée occupée.
 */
export function LinkStatTiles({ language, stats }: { readonly language: InterfaceLanguage; readonly stats: ShareLinkStats | null | undefined }) {
  const format = new Intl.NumberFormat(language);
  const values: Readonly<Record<StatKey, number | null>> = {
    visits: stats?.visits ?? null,
    arrivals: stats?.arrivals ?? null,
    anonymous: stats?.anonymousArrivals ?? null,
  };
  return (
    <section aria-label={translateInvite(language, 'linkDetail.stats.title')} className="grid gap-2" aria-busy={stats === undefined}>
      <ul className="grid grid-cols-3 gap-2">
        {(['visits', 'arrivals', 'anonymous'] as const).map((key) => {
          const value = values[key];
          const highlighted = key === 'anonymous';
          return (
            <li
              key={key}
              data-share-link-stat={key}
              className="grid gap-0.5 rounded-[18px] px-3 py-3.5"
              style={
                highlighted
                  ? { backgroundColor: 'color-mix(in srgb, var(--ios-indigo-500) 12%, var(--color-ios-card))', border: '1.5px solid color-mix(in srgb, var(--ios-indigo-400) 45%, transparent)' }
                  : SECTION_CARD_STYLE
              }
            >
              <strong className={`text-section font-extrabold ${highlighted ? SECTION_BRAND_INK : ''}`} style={highlighted ? undefined : { color: INK }} {...(value === null ? { 'aria-hidden': true } : {})}>
                {value === null ? '—' : format.format(value)}
              </strong>
              {value === null ? <span className="sr-only">{translateInvite(language, 'linkDetail.stats.unknown')}</span> : null}
              <span className={`text-caption font-semibold ${highlighted ? SECTION_BRAND_INK : ''}`} style={highlighted ? undefined : { color: INK_2 }}>
                {translateInvite(language, STAT_LABEL[key])}
              </span>
            </li>
          );
        })}
      </ul>
      {stats === null ? (
        <p data-share-link-stats-unavailable className="ps-1 text-caption" style={{ color: INK_2 }}>
          {translateInvite(language, 'linkDetail.stats.unavailable')}
        </p>
      ) : null}
    </section>
  );
}

/** Langues des arrivants — la même barre que la page d'accueil (`LanguageShareBar`). */
export function ArrivalLanguages({ language, stats }: { readonly language: InterfaceLanguage; readonly stats: ShareLinkStats }) {
  const shares = languageSharesOf(stats.arrivalsByLanguage);
  return (
    <section aria-labelledby="link-arrival-languages" data-share-link-languages className={CARD_CLASS} style={SECTION_CARD_STYLE}>
      <h2 id="link-arrival-languages" className={`${TITLE_CLASS} ${SECTION_BRAND_INK}`}>
        {translateInvite(language, 'linkDetail.languages.title')}
      </h2>
      {shares.length === 0 ? (
        <p className="text-caption" style={{ color: INK_2 }}>
          {translateInvite(language, 'linkDetail.languages.empty')}
        </p>
      ) : (
        <LanguageShareBar language={language} shares={shares} compose={(name, percent) => translateInvite(language, 'invite.stats.share', { language: name, percent })} />
      )}
    </section>
  );
}

/** L'ancienneté d'une arrivée, dans la langue de l'interface (`Intl.RelativeTimeFormat`). */
export function arrivalAge(joinedAt: string, now: Date, language: InterfaceLanguage): string {
  const unit = classifyRelativeTime(new Date(joinedAt), now);
  const relative = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
  switch (unit.kind) {
    case 'now':
      return relative.format(0, 'second');
    case 'seconds':
      return relative.format(-unit.value, 'second');
    case 'minutes':
      return relative.format(-unit.value, 'minute');
    case 'hours':
      return relative.format(-unit.value, 'hour');
    case 'days':
      return relative.format(-unit.value, 'day');
    case 'weeks':
      return relative.format(-unit.value, 'week');
    case 'months':
      return relative.format(-unit.value, 'month');
    case 'date':
      return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(unit.value);
  }
}

const countryLabel = (country: string, language: InterfaceLanguage): string => {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(country) ?? country;
  } catch {
    return country;
  }
};

function ArrivalRow({ language, arrival, now }: { readonly language: InterfaceLanguage; readonly arrival: RecentArrival; readonly now: Date }) {
  const flag = arrival.country === null ? null : flagOf(arrival.country);
  return (
    <li data-share-link-arrival={arrival.participantId} className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="shrink-0">
        <Avatar initials={initialsOf(arrival.displayName)} color={colorForName(arrival.displayName)} size={42} {...(arrival.avatar === null ? {} : { src: arrival.avatar })} />
      </span>
      <span className="min-w-0 flex-1 truncate text-body font-bold" style={{ color: INK }}>
        {arrival.displayName}
      </span>
      {flag === null || arrival.country === null ? null : (
        <span role="img" aria-label={countryLabel(arrival.country, language)} className="shrink-0 text-body">
          {flag}
        </span>
      )}
      {arrival.isAnonymous ? (
        <span data-share-link-arrival-anonymous className={`shrink-0 rounded-chip px-2.5 py-1 text-chip font-bold ${SECTION_BRAND_INK}`} style={{ backgroundColor: 'color-mix(in srgb, var(--ios-indigo-500) 12%, var(--color-ios-card))' }}>
          {translateInvite(language, 'linkDetail.recent.anonymous')}
        </span>
      ) : null}
      <time dateTime={arrival.joinedAt} className="shrink-0 text-caption" style={{ color: INK_2 }}>
        {arrivalAge(arrival.joinedAt, now, language)}
      </time>
    </li>
  );
}

/** Arrivés récemment — nom, drapeau du pays, badge « sans compte », ancienneté. */
export function RecentArrivals({ language, stats, now }: { readonly language: InterfaceLanguage; readonly stats: ShareLinkStats; readonly now: Date }) {
  return (
    <section aria-labelledby="link-recent-arrivals" data-share-link-recent className={CARD_CLASS} style={SECTION_CARD_STYLE}>
      <h2 id="link-recent-arrivals" className={`${TITLE_CLASS} ${SECTION_BRAND_INK}`}>
        {translateInvite(language, 'linkDetail.recent.title')}
      </h2>
      {stats.recentArrivals.length === 0 ? (
        <p className="text-caption" style={{ color: INK_2 }}>
          {translateInvite(language, 'linkDetail.recent.empty')}
        </p>
      ) : (
        <ul className="grid gap-3.5">
          {stats.recentArrivals.map((arrival) => (
            <ArrivalRow key={arrival.participantId} language={language} arrival={arrival} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ConfigRow({ row, label, children }: { readonly row: string; readonly label: string; readonly children: ReactNode }) {
  return (
    <div data-share-link-config={row} className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-body" style={{ color: INK_2 }}>
        {label}
      </dt>
      <dd className="min-w-0 text-end text-body font-semibold" style={{ color: INK }}>
        {children}
      </dd>
    </div>
  );
}

function RightMark({ language, label, granted }: { readonly language: InterfaceLanguage; readonly label: string; readonly granted: boolean }) {
  return (
    <li className="flex items-center gap-2 text-body font-semibold" style={{ color: granted ? INK : INK_2 }}>
      <span aria-hidden="true" style={{ color: granted ? 'var(--color-success)' : 'var(--color-error)' }}>
        {granted ? <Glyph name="check" size={16} /> : <Glyph name="x" size={16} />}
      </span>
      <span className={granted ? '' : 'line-through decoration-1'}>{label}</span>
      <span className="sr-only">{translateInvite(language, granted ? 'invite.rights.granted' : 'invite.rights.denied')}</span>
    </li>
  );
}

/**
 * LA CONFIGURATION, EN LECTURE — droits des invités sans compte, conditions
 * d'entrée, limites, langues autorisées ; « Modifier » mène au formulaire.
 * Sans politique lue (cache d'avant #7797), elle le dit le temps de la relire.
 */
export function ConfigurationCard({ language, link, policy }: { readonly language: InterfaceLanguage; readonly link: MyShareLink; readonly policy: ShareLinkPolicy | null }) {
  const format = new Intl.NumberFormat(language);
  const list = new Intl.ListFormat(language, { type: 'conjunction' });
  const asked = policy === null
    ? []
    : [
        ...(policy.requireNickname && !policy.requireAccount ? [translateInvite(language, 'linkDetail.config.asked.nickname')] : []),
        ...(policy.requireEmail && !policy.requireAccount ? [translateInvite(language, 'linkDetail.config.asked.email')] : []),
        ...(policy.requireBirthday && !policy.requireAccount ? [translateInvite(language, 'linkDetail.config.asked.birthday')] : []),
      ];
  return (
    <section aria-labelledby="link-configuration" data-share-link-configuration className={CARD_CLASS} style={SECTION_CARD_STYLE}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="link-configuration" className={`${TITLE_CLASS} ${SECTION_BRAND_INK}`}>
          {translateInvite(language, 'linkDetail.config.title')}
        </h2>
        <a
          href="#link-edit"
          data-share-link-edit-anchor
          className={`grid place-items-center rounded-[10px] px-2 text-body font-bold focus-visible:outline-2 ${SECTION_BRAND_INK}`}
          style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
        >
          {translateInvite(language, 'linkDetail.config.edit')}
        </a>
      </div>
      {policy === null ? (
        <p aria-busy="true" className="text-caption" style={{ color: INK_2 }}>
          {translateInvite(language, 'linkDetail.config.pending')}
        </p>
      ) : (
        <>
          <h3 className={SUB_TITLE_CLASS} style={{ color: INK_2 }}>
            {translateInvite(language, 'linkDetail.config.rights')}
          </h3>
          <ul data-share-link-config-rights className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <RightMark language={language} label={translateInvite(language, 'linkDetail.rights.messages')} granted={policy.allowAnonymousMessages} />
            <RightMark language={language} label={translateInvite(language, 'linkDetail.rights.images')} granted={policy.allowAnonymousImages} />
            <RightMark language={language} label={translateInvite(language, 'linkDetail.rights.files')} granted={policy.allowAnonymousFiles} />
            <RightMark language={language} label={translateInvite(language, 'linkDetail.rights.history')} granted={policy.allowViewHistory} />
          </ul>
          <h3 className={SUB_TITLE_CLASS} style={{ color: INK_2 }}>
            {translateInvite(language, 'linkDetail.config.entry')}
          </h3>
          <dl>
            <ConfigRow row="account" label={translateInvite(language, 'linkDetail.config.account')}>
              {translateInvite(language, policy.requireAccount ? 'linkDetail.config.account.required' : 'linkDetail.config.account.optional')}
            </ConfigRow>
            <ConfigRow row="asked" label={translateInvite(language, 'linkDetail.config.asked')}>
              {asked.length === 0 ? translateInvite(language, 'linkDetail.config.asked.none') : list.format(asked)}
            </ConfigRow>
          </dl>
          <h3 className={SUB_TITLE_CLASS} style={{ color: INK_2 }}>
            {translateInvite(language, 'linkDetail.config.limits')}
          </h3>
          <dl>
            <ConfigRow row="uses" label={translateInvite(language, 'linkDetail.config.uses')}>
              {translateInvite(language, 'linkDetail.config.uses.value', {
                count: format.format(link.currentUses),
                max: link.maxUses === null ? translateInvite(language, 'linkDetail.config.unlimited') : format.format(link.maxUses),
              })}
            </ConfigRow>
            <ConfigRow row="concurrent" label={translateInvite(language, 'linkDetail.config.concurrent')}>
              {policy.maxConcurrentUsers === null
                ? translateInvite(language, 'linkDetail.config.unlimited')
                : translateInvite(language, 'linkDetail.config.concurrent.value', { count: format.format(policy.maxConcurrentUsers) })}
            </ConfigRow>
            <ConfigRow row="expires" label={translateInvite(language, 'linkDetail.config.expires')}>
              {link.expiresAt === null
                ? translateInvite(language, 'linkDetail.config.expires.never')
                : translateInvite(language, 'linkDetail.config.expires.value', { date: dateOf(language, link.expiresAt, true) })}
            </ConfigRow>
          </dl>
          <h3 className={SUB_TITLE_CLASS} style={{ color: INK_2 }}>
            {translateInvite(language, 'linkDetail.config.languages')}
          </h3>
          <p data-share-link-config-languages className="text-body font-semibold" style={{ color: INK }}>
            {policy.allowedLanguages.length === 0 ? translateInvite(language, 'linkDetail.config.languages.all') : list.format(policy.allowedLanguages.map(endonymOf))}
          </p>
        </>
      )}
    </section>
  );
}
