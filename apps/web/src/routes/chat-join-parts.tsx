import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { BrandMark } from '@/components/brand-mark';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { SECTION_BRAND_INK } from '@/components/grouped-section';
import { LINKS_GLYPHS } from '@/components/glyphs-links';
import { LanguageShareBar, endonymOf } from '@/components/language-share-bar';
import { attachmentSrc } from '@/lib/api/media-url';
import type { InvitationKind, LinkInvitation, LinkRefusal } from '@/lib/api/link-join';
import { translateInvite, type InviteCatalogKey } from '@/lib/i18n-invite-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  anonymousRightsOf,
  askedFieldsOf,
  daysLeft,
  displayUrlOf,
  languageSharesOf,
  remainingPlacesOf,
  type AnonymousRight,
  type AskedField,
} from '@/lib/links/invitation-view';
import { initialsOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DE LA PAGE D'ACCUEIL D'INVITATION** (#7796) — la maquette
 * validée (`WebMobile`, `WebBureau`), dans l'ordre que le porteur a fixé : qui
 * invite et son message, le groupe (bannière, logo, nom, type, date,
 * description, lien copiable et repartageable), les chiffres sans identité,
 * ce qu'on pourra faire en anonyme, puis les choix (`chat-join.tsx`).
 *
 * Chaque pièce est PURE (primitives en props) : `chat-join.test.tsx` les rend
 * par l'écran, `chat-join-parts.test.tsx` une à une.
 *
 * **Rien qui identifie un membre** : aucun visage, aucun nom, aucune liste —
 * seulement des COMPTES et des langues (#7796 § 4).
 */

export const INK = 'var(--color-ios-ink)';
export const INK_2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';
export const INVITE_CARD_STYLE = {
  backgroundColor: 'var(--color-ios-card)',
  border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)',
} as const;
/** L'action primaire — assez sombre aux DEUX bouts pour tenir AA sous du blanc
 * (`#fff` sur violet 600 pur : 4,2:1). `backgroundColor` porte la teinte la plus
 * claire, celle que mesurent les gates (`contrast.mjs` ne lit que la couleur). */
export const INVITE_ACTION_BACKGROUND = 'linear-gradient(135deg, var(--ios-indigo-600), color-mix(in srgb, var(--ios-purple-600) 75%, black))';
export const INVITE_ACTION_FLOOR = 'var(--ios-indigo-600)';
export const INVITE_OUTLINE_BUTTON = `flex items-center justify-center gap-2 rounded-[14px] px-4 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2 ${SECTION_BRAND_INK}`;
export const INVITE_OUTLINE_STYLE = {
  minHeight: 46,
  backgroundColor: 'var(--color-ios-card)',
  border: '1.5px solid color-mix(in srgb, var(--ios-indigo-400) 55%, transparent)',
  outlineColor: BRAND,
} as const;
const SECTION_TITLE = 'text-check font-extrabold uppercase tracking-[0.1em]';
const BANNER_GRADIENT =
  'radial-gradient(circle at 18% 30%, color-mix(in srgb, var(--ios-purple-500) 55%, white) 0, transparent 45%), radial-gradient(circle at 85% 20%, color-mix(in srgb, var(--ios-info) 70%, white) 0, transparent 40%), linear-gradient(135deg, var(--ios-indigo-600) 0%, var(--ios-purple-600) 55%, var(--ios-purple-500) 100%)';

const KIND_KEY: Readonly<Record<InvitationKind, Extract<InviteCatalogKey, `invite.kind.${string}`>>> = {
  direct: 'invite.kind.direct',
  group: 'invite.kind.group',
  public: 'invite.kind.public',
  global: 'invite.kind.global',
  broadcast: 'invite.kind.broadcast',
};

const RIGHT_KEY: Readonly<Record<AnonymousRight, Extract<InviteCatalogKey, `invite.rights.${AnonymousRight}`>>> = {
  messages: 'invite.rights.messages',
  images: 'invite.rights.images',
  files: 'invite.rights.files',
  history: 'invite.rights.history',
};

const ASKED_KEY: Readonly<Record<AskedField, Extract<InviteCatalogKey, `invite.asked.${AskedField}`>>> = {
  nickname: 'invite.asked.nickname',
  email: 'invite.asked.email',
  birthday: 'invite.asked.birthday',
};

const REFUSAL_KEY: Readonly<Record<LinkRefusal, Extract<InviteCatalogKey, `invite.refusal.${LinkRefusal}`>>> = {
  'not-found': 'invite.refusal.not-found',
  revoked: 'invite.refusal.revoked',
  expired: 'invite.refusal.expired',
  closed: 'invite.refusal.closed',
  full: 'invite.refusal.full',
  language: 'invite.refusal.language',
  banned: 'invite.refusal.banned',
  region: 'invite.refusal.region',
  'account-required': 'invite.refusal.account-required',
  'session-expired': 'invite.refusal.session-expired',
  'rate-limited': 'invite.refusal.rate-limited',
  offline: 'invite.refusal.offline',
  unavailable: 'invite.refusal.unavailable',
};

export const refusalText = (language: InterfaceLanguage, refusal: LinkRefusal): string => translateInvite(language, REFUSAL_KEY[refusal]);

const plural = <K extends InviteCatalogKey>(count: number, one: K, other: K): K => (count === 1 ? one : other);

/** L'en-tête de la page — la marque, et « Se connecter » pour qui n'a pas de session. */
export function InviteHeader({ language, next }: { readonly language: InterfaceLanguage; readonly next: string | null }) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-12 md:py-6" lang={language}>
      <span className={`flex items-center gap-2 text-thread font-extrabold ${SECTION_BRAND_INK}`}>
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-[10px] text-white" style={{ background: 'linear-gradient(135deg, var(--ios-indigo-800), var(--ios-indigo-500))' }}>
          <BrandMark size={20} lineWidth={2.6} />
        </span>
        {translateInvite(language, 'invite.brand')}
      </span>
      {next === null ? null : (
        <Link
          to="login"
          search={{ next }}
          className={`grid place-items-center rounded-[12px] px-2 text-body font-bold focus-visible:outline-2 ${SECTION_BRAND_INK}`}
          style={{ minHeight: 44, outlineColor: BRAND }}
        >
          {translateInvite(language, 'invite.exits.signIn')}
        </Link>
      )}
    </header>
  );
}

/** a. Qui invite — avatar cerclé, « <nom> t'invite », puis son message dans une bulle. */
export function InviterBlock({ language, invitation }: { readonly language: InterfaceLanguage; readonly invitation: LinkInvitation }) {
  const { inviter, message } = invitation;
  return (
    <section aria-labelledby="invite-inviter" data-invite-inviter className="flex items-start gap-3.5 md:gap-4">
      <span aria-hidden="true" className="shrink-0 rounded-full p-[3px]" style={{ background: 'linear-gradient(135deg, var(--ios-indigo-500), var(--ios-purple-500))' }}>
        <span className="block rounded-full p-[3px]" style={{ backgroundColor: 'var(--color-ios-card)' }}>
          {inviter === null ? (
            <span className="grid size-12 place-items-center rounded-full" style={{ backgroundColor: 'var(--color-ios-surface)', color: INK_2 }}>
              <Glyph name="users" size={24} />
            </span>
          ) : (
            <Avatar initials={initialsOf(inviter.name)} color={colorForName(inviter.name)} size={48} {...(inviter.avatar === null ? {} : { src: inviter.avatar })} />
          )}
        </span>
      </span>
      <div className="grid min-w-0 flex-1 gap-2.5">
        <div className="grid gap-0.5 md:flex md:items-baseline md:gap-2.5">
          <p id="invite-inviter" className="text-thread font-extrabold tracking-tight md:text-section" style={{ color: INK }}>
            {inviter === null ? translateInvite(language, 'invite.inviter.unnamed') : translateInvite(language, 'invite.inviter.named', { name: inviter.name })}
          </p>
          {inviter?.username == null ? null : (
            <p className="text-caption" style={{ color: INK_2 }} dir="ltr">
              @{inviter.username}
            </p>
          )}
        </div>
        {message === null ? null : (
          <blockquote
            data-invite-message
            dir="auto"
            aria-label={inviter === null ? undefined : translateInvite(language, 'invite.inviter.message', { name: inviter.name })}
            className="rounded-[20px] rounded-ss-[6px] px-4 py-3.5 text-body leading-relaxed"
            style={{ backgroundColor: 'var(--color-ios-card)', color: INK, boxShadow: '0 6px 20px color-mix(in srgb, var(--ios-indigo-900) 10%, transparent)' }}
          >
            {message}
          </blockquote>
        )}
      </div>
    </section>
  );
}

/** Le logo du groupe — son image, sinon ses initiales sur le dégradé de la marque. */
function GroupLogo({ language, title, avatar }: { readonly language: InterfaceLanguage; readonly title: string; readonly avatar: string | null }) {
  return (
    <span
      className="relative -mt-[34px] grid size-[76px] shrink-0 place-items-center overflow-hidden rounded-[22px] md:-mt-10 md:size-[88px] md:rounded-[26px]"
      style={{
        border: '4px solid var(--color-ios-card)',
        background: 'linear-gradient(135deg, var(--ios-indigo-800), var(--ios-indigo-500))',
        boxShadow: '0 8px 20px color-mix(in srgb, var(--ios-indigo-900) 25%, transparent)',
      }}
    >
      {avatar === null ? (
        <span aria-hidden="true" className="text-section font-extrabold text-white">
          {initialsOf(title)}
        </span>
      ) : (
        <img src={attachmentSrc(avatar)} alt={translateInvite(language, 'invite.group.logo', { name: title })} className="size-full object-cover" />
      )}
    </span>
  );
}

/** b. Le groupe — bannière ou dégradé, logo, nom, type · date, description, puis le lien et ses deux gestes. */
export function GroupCard({
  language,
  invitation,
  url,
  copied,
  onCopy,
  onReshare,
}: {
  readonly language: InterfaceLanguage;
  readonly invitation: LinkInvitation;
  readonly url: string;
  readonly copied: boolean;
  readonly onCopy: () => void;
  readonly onReshare: () => void;
}) {
  const title = invitation.title ?? translateInvite(language, 'invite.group.fallbackTitle');
  const { group } = invitation;
  const created = group.createdAt === null ? null : translateInvite(language, 'invite.group.created', { date: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(group.createdAt)) });
  const kind = invitation.kind === null ? null : translateInvite(language, KIND_KEY[invitation.kind]);
  const meta = [kind, created].filter((part): part is string => part !== null).join(' · ');
  return (
    <section
      aria-labelledby="chat-join-title"
      data-invite-group
      className="overflow-hidden rounded-[28px]"
      style={{ backgroundColor: 'var(--color-ios-card)', boxShadow: '0 18px 40px color-mix(in srgb, var(--ios-indigo-600) 16%, transparent)' }}
    >
      <div data-invite-banner={group.banner === null ? 'gradient' : 'image'} className="relative h-[132px] md:h-[150px]" style={{ background: BANNER_GRADIENT }}>
        {group.banner === null ? null : <img src={attachmentSrc(group.banner)} alt="" className="absolute inset-0 size-full object-cover" />}
      </div>
      {/* Le logo MORD sur la bannière ; le nom, lui, commence SOUS elle — un nom
          long qui passe à la ligne ne remonte jamais sur l'image. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-5 pb-5 md:gap-3.5 md:px-7 md:pb-6">
        <div className="flex items-start gap-3.5 md:gap-4">
          <GroupLogo language={language} title={title} avatar={group.avatar} />
          <div className="grid min-w-0 gap-0.5 pt-2.5">
            <h1 id="chat-join-title" dir="auto" className="break-words text-section font-extrabold tracking-tight" style={{ color: INK }}>
              {title}
            </h1>
            {meta === '' ? null : (
              <p data-invite-meta className="text-caption font-semibold" style={{ color: INK_2 }}>
                {meta}
              </p>
            )}
          </div>
        </div>
        {group.description === null ? null : (
          <p data-invite-description dir="auto" className="text-body leading-relaxed" style={{ color: INK }}>
            {group.description}
          </p>
        )}
        <div className="grid gap-2.5 md:flex md:items-center">
          <p
            data-invite-url
            className={`flex min-w-0 items-center gap-2.5 rounded-[14px] px-3.5 md:flex-1 ${SECTION_BRAND_INK}`}
            style={{ minHeight: 48, backgroundColor: 'color-mix(in srgb, var(--ios-indigo-500) 12%, var(--color-ios-card))' }}
          >
            <span aria-hidden="true" className="shrink-0">
              <Glyph name="linkSimple" size={18} />
            </span>
            <span className="sr-only">{translateInvite(language, 'invite.link.label')}</span>
            <span dir="ltr" className="min-w-0 truncate font-mono text-body" style={{ color: INK }}>
              {displayUrlOf(url)}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2.5 md:flex">
            <button type="button" data-invite-copy onClick={onCopy} className={INVITE_OUTLINE_BUTTON} style={INVITE_OUTLINE_STYLE}>
              <span aria-hidden="true">{copied ? <Glyph name="check" size={17} /> : <GlyphSvg glyph={LINKS_GLYPHS.copy} size={17} />}</span>
              {translateInvite(language, copied ? 'invite.link.copied' : 'invite.link.copy')}
            </button>
            <button type="button" data-invite-reshare onClick={onReshare} className={INVITE_OUTLINE_BUTTON} style={INVITE_OUTLINE_STYLE}>
              <span aria-hidden="true">
                <GlyphSvg glyph={LINKS_GLYPHS.export} size={17} />
              </span>
              {translateInvite(language, 'invite.link.reshare')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function FigureTile({ figure, value, label }: { readonly figure: string; readonly value: string; readonly label: string }) {
  return (
    <li data-invite-figure={figure} className="grid gap-0.5 rounded-[20px] p-4 md:p-5" style={INVITE_CARD_STYLE}>
      <strong className="text-screen font-extrabold tracking-tight" style={{ color: INK }}>
        {value}
      </strong>
      <span className="text-body font-semibold" style={{ color: INK_2 }}>
        {label}
      </span>
    </li>
  );
}

/** c. Les chiffres sans identité — personnes, langues parlées, et leur barre. */
export function InvitationFigures({ language, invitation }: { readonly language: InterfaceLanguage; readonly invitation: LinkInvitation }) {
  const { people, languages } = invitation.stats;
  if (people === null && languages.length === 0) return null;
  const format = new Intl.NumberFormat(language);
  const shares = languageSharesOf(languages);
  return (
    <section aria-label={translateInvite(language, 'invite.stats.spoken')} data-invite-figures className="grid gap-2.5">
      <ul className="grid grid-cols-2 gap-2.5">
        {people === null ? null : (
          <FigureTile figure="people" value={format.format(people)} label={translateInvite(language, plural(people, 'invite.stats.people.one', 'invite.stats.people.other'))} />
        )}
        {languages.length === 0 ? null : (
          <FigureTile
            figure="languages"
            value={format.format(languages.length)}
            label={translateInvite(language, plural(languages.length, 'invite.stats.languages.one', 'invite.stats.languages.other'))}
          />
        )}
      </ul>
      {shares.length === 0 ? null : (
        <div className="grid gap-3 rounded-[20px] p-4 md:p-5" style={INVITE_CARD_STYLE}>
          <h2 className={`${SECTION_TITLE} ${SECTION_BRAND_INK}`}>
            {translateInvite(language, 'invite.stats.spoken')}
          </h2>
          <LanguageShareBar language={language} shares={shares} compose={(name, percent) => translateInvite(language, 'invite.stats.share', { language: name, percent })} />
        </div>
      )}
    </section>
  );
}

function RightRow({ language, right, granted }: { readonly language: InterfaceLanguage; readonly right: AnonymousRight; readonly granted: boolean }) {
  return (
    <li data-invite-right={right} data-granted={granted} className="flex items-center gap-2.5 text-body font-semibold" style={{ color: granted ? INK : INK_2 }}>
      <span aria-hidden="true" className="shrink-0" style={{ color: granted ? 'var(--color-success)' : 'var(--color-error)' }}>
        {granted ? <Glyph name="check" size={18} /> : <Glyph name="x" size={18} />}
      </span>
      <span className={granted ? '' : 'line-through decoration-1'}>{translateInvite(language, RIGHT_KEY[right])}</span>
      <span className="sr-only">{translateInvite(language, granted ? 'invite.rights.granted' : 'invite.rights.denied')}</span>
    </li>
  );
}

function TermLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <p className="text-caption leading-snug" style={{ color: INK_2 }}>
      <b className="font-bold" style={{ color: INK }}>
        {label}
      </b>{' '}
      {value}
    </p>
  );
}

/**
 * d. « En anonyme, tu pourras » — les quatre droits cochés ou barrés, ce qu'on
 * demandera, les langues acceptées, la validité et les places. Un lien qui
 * exige un compte ne la montre pas : elle décrirait une porte fermée.
 */
export function RightsCard({ language, invitation, now }: { readonly language: InterfaceLanguage; readonly invitation: LinkInvitation; readonly now: Date }) {
  const { guest } = invitation;
  if (!guest.allowed) return null;
  const list = new Intl.ListFormat(language, { type: 'conjunction' });
  const asked = askedFieldsOf(guest);
  const days = daysLeft(invitation.limits.expiresAt, now);
  const places = remainingPlacesOf(invitation.limits);
  const format = new Intl.NumberFormat(language);
  const validity =
    days === null
      ? translateInvite(language, 'invite.validity.forever')
      : days === 0
        ? translateInvite(language, 'invite.validity.today')
        : translateInvite(language, plural(days, 'invite.validity.days.one', 'invite.validity.days.other'), { count: format.format(days) });
  const placesText =
    places === null ? translateInvite(language, 'invite.places.unlimited') : translateInvite(language, plural(places, 'invite.places.one', 'invite.places.other'), { count: format.format(places) });
  return (
    <section aria-labelledby="invite-rights" data-invite-rights className="grid gap-2.5 rounded-[20px] p-4 md:p-5" style={INVITE_CARD_STYLE}>
      <h2 id="invite-rights" className={`${SECTION_TITLE} ${SECTION_BRAND_INK}`}>
        {translateInvite(language, 'invite.rights.title')}
      </h2>
      <ul className="grid gap-2.5">
        {anonymousRightsOf(guest, invitation.readsHistory).map((row) => (
          <RightRow key={row.right} language={language} right={row.right} granted={row.granted} />
        ))}
      </ul>
      <span aria-hidden="true" className="my-0.5 block h-px" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)' }} />
      <div data-invite-terms className="grid gap-1.5">
        <TermLine
          label={translateInvite(language, 'invite.asked.label')}
          value={asked.length === 0 ? translateInvite(language, 'invite.asked.nothing') : list.format(asked.map((field) => translateInvite(language, ASKED_KEY[field])))}
        />
        <TermLine
          label={translateInvite(language, 'invite.languages.label')}
          value={guest.languages.length === 0 ? translateInvite(language, 'invite.languages.all') : list.format(guest.languages.map(endonymOf))}
        />
        <TermLine label={translateInvite(language, 'invite.validity.label')} value={`${validity} · ${placesText}`} />
      </div>
    </section>
  );
}

export function InvitationPending({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div aria-busy="true" data-invite-pending className="grid w-full gap-4">
      <span aria-hidden="true" className="block h-16 rounded-[20px]" style={{ backgroundColor: 'var(--color-ios-card)' }} />
      <span aria-hidden="true" className="block h-72 rounded-[28px]" style={{ backgroundColor: 'var(--color-ios-card)' }} />
      <p className="text-center text-body" style={{ color: INK_2 }}>
        {translateInvite(language, 'invite.loading')}
      </p>
    </div>
  );
}

export function RefusalBanner({ language, refusal, onRetry }: { readonly language: InterfaceLanguage; readonly refusal: LinkRefusal; readonly onRetry?: () => void }) {
  return (
    <div role="alert" className="grid w-full gap-3 rounded-[20px] p-4 text-center" style={INVITE_CARD_STYLE}>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {refusalText(language, refusal)}
      </p>
      <div className="grid gap-2">
        {onRetry === undefined ? null : (
          <button type="button" onClick={onRetry} className={INVITE_OUTLINE_BUTTON} style={INVITE_OUTLINE_STYLE}>
            {translateInvite(language, 'invite.retry')}
          </button>
        )}
        <Link to="list" className="grid w-full place-items-center rounded-[14px] px-6 font-semibold" style={{ minHeight: 44, color: INK_2 }}>
          {translateInvite(language, 'invite.home')}
        </Link>
      </div>
    </div>
  );
}
