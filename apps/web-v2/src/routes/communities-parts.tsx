import type { ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { COMMUNITIES_GLYPHS, type CommunitiesGlyphName } from '@/components/glyphs-communities';
import { GroupedSection, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import type { CommunityConversation, CommunityDraft, CommunitySummary } from '@/lib/api/communities';
import { attachmentSrc } from '@/lib/api/media-url';
import { communityAccent, compactCount, conversationTitleOf, initialsOf } from '@/lib/communities/view';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DES ÉCRANS DE COMMUNAUTÉ** (#6364) — miroir de
 * `CommunityListView.swift` (en-tête, recherche, grille de cartes, état vide),
 * `CommunityDetailView.swift` (bannière, avatar, confidentialité, compteurs,
 * conversations) et `CommunityCreateView.swift` (aperçu, confidentialité).
 *
 * Chaque pièce est PURE (primitives en props, aucun magasin global) :
 * `routes/communities.test.tsx` les rend sans DOM ni TanStack Query, et les
 * trois écrans ne font que les composer.
 *
 * **Les textes blancs sur une bannière** tiennent AA quelle que soit la teinte
 * de la communauté : le repli de bannière est la teinte ASSOMBRIE (80 % puis
 * 40 % de la couleur, le reste en noir) et un voile descend sous le texte. iOS
 * pose la teinte à 80 % puis 40 % d'OPACITÉ, si bien qu'un nom blanc sur une
 * communauté jaune y descend sous 2:1 ; `scripts/check-communities.mjs` mesure
 * le pixel le plus clair sous chaque texte.
 */

export const COMMUNITIES_HEADER_HEIGHT = 64;
export const COMMUNITIES_SEARCH_HEIGHT = 56;
/** Au repos, la première carte commence sous les disques flottants (`floating-corridor.ts`). */
export const COMMUNITIES_TOP_RESERVE = FLOATING_CORRIDOR_BOTTOM - COMMUNITIES_HEADER_HEIGHT - COMMUNITIES_SEARCH_HEIGHT;
export const COMMUNITY_CARD_HEIGHT = 180;
export const COMMUNITY_BANNER_HEIGHT = 190;

const INK = SECTION_INK;
const INK_2 = SECTION_INK_2;
const CARD_STYLE = SECTION_CARD_STYLE;
const BRAND = 'var(--color-ios-brand)';
const BRAND_BUTTON_STYLE = {
  backgroundColor: 'var(--ios-indigo-600)',
  backgroundImage: 'linear-gradient(90deg, var(--ios-indigo-600), color-mix(in srgb, var(--ios-indigo-600) 78%, black))',
  color: 'white',
  outlineColor: BRAND,
} as const;
const SKELETON_TINT = 'color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)';
const CARD_SCRIM = 'linear-gradient(to bottom, transparent 30%, rgb(0 0 0 / 0.72))';

export const bannerBackground = (accent: string): string =>
  `linear-gradient(135deg, color-mix(in srgb, ${accent} 80%, black), color-mix(in srgb, ${accent} 40%, black))`;

export function ScreenGlyph({ name, size }: { readonly name: CommunitiesGlyphName; readonly size: number }) {
  return <GlyphSvg glyph={COMMUNITIES_GLYPHS[name]} size={size} />;
}

const membersLabel = (language: InterfaceLanguage, count: number): string =>
  translate(language, count === 1 ? 'community.members.one' : 'community.members.other', { count: compactCount(count, language) });

const conversationsLabel = (language: InterfaceLanguage, count: number): string =>
  translate(language, count === 1 ? 'community.conversations.one' : 'community.conversations.other', { count: compactCount(count, language) });

const privacyKey = (isPrivate: boolean) => (isPrivate ? 'community.privacy.private' : 'community.privacy.public');

function PrivacyGlyph({ isPrivate, size }: { readonly isPrivate: boolean; readonly size: number }) {
  return isPrivate ? <Glyph name="lock" size={size} /> : <ScreenGlyph name="globe" size={size} />;
}

export function BackLink({
  to,
  label,
  overMedia = false,
}: {
  readonly to: 'list' | 'communities';
  readonly label: string;
  readonly overMedia?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      data-community-back
      className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
      style={{ color: overMedia ? 'white' : BRAND, outlineColor: BRAND }}
    >
      {overMedia ? (
        <span
          className="grid place-items-center rounded-chip"
          style={{ width: 'var(--size-header-circle)', height: 'var(--size-header-circle)', backgroundColor: 'rgb(0 0 0 / 0.45)' }}
        >
          <Glyph name="caretLeft" size={16} />
        </span>
      ) : (
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      )}
    </Link>
  );
}

export function CommunitiesHeader({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: COMMUNITIES_HEADER_HEIGHT }}>
      <BackLink to="list" label={translate(language, 'pending.back')} />
      <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'root.menu.communities')}
      </h1>
      <Link
        to="communityNew"
        aria-label={translate(language, 'community.list.create.accessibilityLabel')}
        data-community-create
        className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        <ChromeActionDisc>
          <ScreenGlyph name="plusCircle" size={20} />
        </ChromeActionDisc>
      </Link>
    </header>
  );
}

function CommunityBanner({ accent, banner }: { readonly accent: string; readonly banner: string | null }) {
  return (
    <>
      <span aria-hidden="true" className="absolute inset-0" style={{ background: bannerBackground(accent) }} />
      {banner === null ? null : (
        <img
          /* Une RÉFÉRENCE de média, jamais une adresse (#6388) — cf. `media-url.ts`. */
          src={attachmentSrc(banner)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </>
  );
}

function Count({ icon, value, label }: { readonly icon: ReactNode; readonly value: string; readonly label: string }) {
  return (
    <span className="flex items-center">
      <span aria-hidden="true" className="flex items-center gap-1">
        {icon}
        {value}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Miroir `VibrantCommunityCard` — la carte entière est le LIEN vers le détail. */
export function CommunityCard({ language, community }: { readonly language: InterfaceLanguage; readonly community: CommunitySummary }) {
  const accent = communityAccent(community.name);
  return (
    <Link
      to="community"
      params={{ community: community.id }}
      data-community-card={community.id}
      className="relative block overflow-hidden rounded-hero focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ height: COMMUNITY_CARD_HEIGHT, outlineColor: BRAND, boxShadow: `0 4px 8px color-mix(in srgb, ${accent} 30%, transparent)` }}
    >
      <CommunityBanner accent={accent} banner={community.banner} />
      <span aria-hidden="true" className="absolute inset-0" style={{ background: CARD_SCRIM }} />
      <span
        data-community-privacy
        className="absolute start-2.5 top-2.5 flex items-center rounded-chip px-1.5 py-1"
        style={{ backgroundColor: 'rgb(0 0 0 / 0.3)', color: 'rgb(255 255 255 / 0.9)' }}
      >
        <PrivacyGlyph isPrivate={community.isPrivate} size={10} />
        <span className="sr-only">{translate(language, privacyKey(community.isPrivate))}</span>
      </span>
      <span
        aria-hidden="true"
        className="absolute end-2.5 top-2.5 block rounded-full"
        style={{ boxShadow: '0 0 0 2px rgb(255 255 255 / 0.85), 0 2px 4px rgb(0 0 0 / 0.25)' }}
      >
        <Avatar initials={initialsOf(community.name)} color={accent} size={44} {...(community.avatar === null ? {} : { src: community.avatar })} />
      </span>
      <span className="absolute inset-x-0 bottom-0 grid gap-0.5 p-3">
        <span data-community-name className="line-clamp-2 text-secondary leading-tight font-bold" style={{ color: 'white' }}>
          {community.name}
        </span>
        {community.description === null ? null : (
          <span data-community-description className="line-clamp-2 text-chip leading-snug" style={{ color: 'rgb(255 255 255 / 0.88)' }}>
            {community.description}
          </span>
        )}
        <span data-community-counts className="flex items-center gap-2 text-chip font-semibold" style={{ color: 'rgb(255 255 255 / 0.94)' }}>
          <Count icon={<Glyph name="users" size={11} />} value={compactCount(community.memberCount, language)} label={membersLabel(language, community.memberCount)} />
          <Count
            icon={<ScreenGlyph name="chatCircle" size={11} />}
            value={compactCount(community.conversationCount, language)}
            label={conversationsLabel(language, community.conversationCount)}
          />
        </span>
      </span>
    </Link>
  );
}

export function CommunityGridSkeleton({ language, count = 4 }: { readonly language: InterfaceLanguage; readonly count?: number }) {
  return (
    <div data-community-skeleton aria-busy="true" aria-label={translate(language, 'community.list.loading')} className="grid grid-cols-2 gap-3.5">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="block rounded-hero" style={{ ...CARD_STYLE, height: COMMUNITY_CARD_HEIGHT }} />
      ))}
    </div>
  );
}

/** Miroir `CommunityListView.emptyState` — nommer, promettre, offrir le geste. */
export function CommunitiesEmpty({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-community-empty className="grid justify-items-center gap-4 px-6 py-10 text-center">
      <span aria-hidden="true" style={{ color: BRAND }}>
        <ScreenGlyph name="usersThree" size={48} />
      </span>
      <p className="text-thread font-bold" style={{ color: INK }}>
        {translate(language, 'community.list.empty.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, 'community.list.empty.subtitle')}
      </p>
      <Link
        to="communityNew"
        data-community-empty-create
        className="flex items-center gap-1.5 rounded-chip px-6 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...BRAND_BUTTON_STYLE, minHeight: 44 }}
      >
        <ScreenGlyph name="plusCircle" size={18} />
        {translate(language, 'community.list.create.accessibilityLabel')}
      </Link>
    </div>
  );
}

export function CommunitiesSearchEmpty({ language, query }: { readonly language: InterfaceLanguage; readonly query: string }) {
  return (
    <p data-community-search-empty role="status" className="px-6 py-10 text-center text-body" style={{ color: INK_2 }}>
      {translate(language, 'community.list.search.empty', { query })}
    </p>
  );
}

export function CommunitiesLoadError({
  language,
  title,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly title: Extract<InterfaceCatalogKey, 'community.error.title' | 'community.detail.error.title'>;
  readonly onRetry: () => void;
}) {
  return (
    <div role="alert" data-community-error className="grid justify-items-center gap-3 rounded-card px-6 py-8 text-center" style={CARD_STYLE}>
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, title)}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, 'community.error.body')}
      </p>
      <button
        type="button"
        data-community-retry
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...BRAND_BUTTON_STYLE, minHeight: 44 }}
      >
        {translate(language, 'community.retry')}
      </button>
    </div>
  );
}

export function CommunitiesOfflineNotice({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div role="status" data-community-offline className="flex items-start gap-3 rounded-card px-3.5 py-3" style={CARD_STYLE}>
      <span aria-hidden="true" className="pt-0.5" style={{ color: 'var(--color-warning)' }}>
        <Glyph name="warningCircle" size={18} />
      </span>
      <span className="grid gap-0.5">
        <span className="text-body font-semibold" style={{ color: INK }}>
          {translate(language, 'community.offline.title')}
        </span>
        <span className="text-caption" style={{ color: INK_2 }}>
          {translate(language, 'community.offline.body')}
        </span>
      </span>
    </div>
  );
}

function EntityAvatar({ name, avatar, accent }: { readonly name: string; readonly avatar: string | null; readonly accent: string }) {
  return (
    <span
      aria-hidden="true"
      className="relative grid shrink-0 place-items-center overflow-hidden font-bold"
      style={{
        width: 72,
        height: 72,
        borderRadius: 18,
        background: bannerBackground(accent),
        color: 'white',
        fontSize: 27,
        boxShadow: '0 0 0 3px var(--color-ios-card)',
      }}
    >
      {initialsOf(name)}
      {avatar === null ? null : (
        <img
          /* Idem la bannière : la clé (ou l'adresse héritée) passe par la route de flux (#6388). */
          src={attachmentSrc(avatar)}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </span>
  );
}

/** Miroir `CommunityDetailView.headerSection` — bannière, avatar qui la chevauche, nom, description, confidentialité. */
export function CommunityHero({ language, community }: { readonly language: InterfaceLanguage; readonly community: CommunitySummary }) {
  const accent = communityAccent(community.name);
  return (
    <div data-community-hero>
      <div className="relative overflow-hidden" style={{ height: COMMUNITY_BANNER_HEIGHT }}>
        <CommunityBanner accent={accent} banner={community.banner} />
        <span aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.25), transparent 40%, rgb(0 0 0 / 0.3))' }} />
      </div>
      <div className="mx-auto max-w-xl px-4">
        <div style={{ marginTop: -36 }}>
          <EntityAvatar name={community.name} avatar={community.avatar} accent={accent} />
        </div>
        <div className="mt-3 flex items-start gap-3">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <h1 data-community-title className="break-words text-thread font-bold" style={{ color: INK }}>
              {community.name}
            </h1>
            {community.description === null ? null : (
              <p className="line-clamp-2 text-caption" style={{ color: INK_2 }}>
                {community.description}
              </p>
            )}
          </div>
          <span
            data-community-privacy
            className="flex shrink-0 items-center gap-1 rounded-chip px-3 py-1 text-chip font-medium"
            style={{ ...CARD_STYLE, color: INK_2 }}
          >
            <PrivacyGlyph isPrivate={community.isPrivate} size={11} />
            {translate(language, privacyKey(community.isPrivate))}
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label, stat }: { readonly icon: ReactNode; readonly value: string; readonly label: string; readonly stat: string }) {
  return (
    <div data-community-stat={stat} className="grid flex-1 justify-items-center gap-1 py-3">
      <span className="flex items-center gap-1">
        <span aria-hidden="true" style={{ color: BRAND }}>
          {icon}
        </span>
        <strong className="font-bold" style={{ color: INK, fontSize: 'var(--text-lg)' }}>
          {value}
        </strong>
      </span>
      <span className="text-chip font-medium" style={{ color: INK_2 }}>
        {label}
      </span>
    </div>
  );
}

/** Miroir `CommunityDetailView.statsSection` — membres et conversations, en nombres entiers. */
export function CommunityStats({ language, community }: { readonly language: InterfaceLanguage; readonly community: CommunitySummary }) {
  const format = new Intl.NumberFormat(language);
  return (
    <div className="flex items-stretch rounded-card" style={CARD_STYLE}>
      <Stat stat="members" icon={<Glyph name="users" size={13} />} value={format.format(community.memberCount)} label={translate(language, 'community.detail.stats.members')} />
      <span aria-hidden="true" className="my-3 w-px" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)' }} />
      <Stat
        stat="conversations"
        icon={<ScreenGlyph name="chatsCircle" size={13} />}
        value={format.format(community.conversationCount)}
        label={translate(language, 'community.detail.channels')}
      />
    </div>
  );
}

export function CommunityConversationsSection({ language, children }: { readonly language: InterfaceLanguage; readonly children: ReactNode }) {
  return (
    <GroupedSection id="community-conversations" title={translate(language, 'community.detail.channels')} icon={<ScreenGlyph name="chatsCircle" size={12} />}>
      {children}
    </GroupedSection>
  );
}

/** Une conversation de la communauté — un LIEN vers son fil. */
export function CommunityConversationRow({
  language,
  conversation,
}: {
  readonly language: InterfaceLanguage;
  readonly conversation: CommunityConversation;
}) {
  const title = conversationTitleOf(conversation, translate(language, 'community.detail.untitled'));
  return (
    <Link
      to="thread"
      params={{ conversation: conversation.id }}
      data-community-conversation={conversation.id}
      className="flex items-center gap-3 px-3.5 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2"
      style={{ minHeight: 60, outlineColor: BRAND }}
    >
      <span aria-hidden="true" className="shrink-0">
        <Avatar initials={initialsOf(title)} color={communityAccent(title)} size={40} {...(conversation.avatar === null ? {} : { src: conversation.avatar })} />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-body font-semibold" style={{ color: INK }}>
          {title}
        </span>
        <span className="text-caption" style={{ color: INK_2 }}>
          {membersLabel(language, conversation.memberCount)}
        </span>
      </span>
      <span aria-hidden="true" style={{ color: INK_2 }}>
        <ScreenGlyph name="caretRight" size={14} />
      </span>
    </Link>
  );
}

export function CommunityConversationsEmpty({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <p data-community-conversations-empty className="px-3.5 py-4 text-caption" style={{ color: INK_2 }}>
      {translate(language, 'community.detail.channels.empty')}
    </p>
  );
}

export function CommunityRowsSkeleton({ rows = 2 }: { readonly rows?: number }) {
  return (
    <div aria-hidden="true" className="grid">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="flex items-center gap-3 px-3.5 py-2" style={{ minHeight: 60 }}>
          <span className="block size-10 rounded-full" style={{ backgroundColor: SKELETON_TINT }} />
          <span className="block h-3 w-40 rounded-chip" style={{ backgroundColor: SKELETON_TINT }} />
        </span>
      ))}
    </div>
  );
}

export function CommunityDetailSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-community-skeleton aria-busy="true" aria-label={translate(language, 'community.detail.loading')} className="grid gap-4">
      <span className="block rounded-card" style={{ ...CARD_STYLE, height: COMMUNITY_BANNER_HEIGHT - 64 }} />
      <span className="block h-5 w-48 rounded-chip" style={{ backgroundColor: SKELETON_TINT }} />
      <span className="block rounded-card" style={{ ...CARD_STYLE, height: 72 }} />
      <span className="block rounded-card" style={CARD_STYLE}>
        <CommunityRowsSkeleton />
      </span>
    </div>
  );
}

/** 403 et 404 rendent le MÊME refus : aucun oracle d'existence d'une communauté privée (D-6). */
export function CommunityRefused({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div role="alert" data-community-refused className="grid justify-items-center gap-3 rounded-card px-6 py-8 text-center" style={CARD_STYLE}>
      <span aria-hidden="true" style={{ color: INK_2 }}>
        <ScreenGlyph name="usersThree" size={32} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'community.detail.refused.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, 'community.detail.refused.body')}
      </p>
      <Link
        to="communities"
        className="grid place-items-center rounded-chip px-5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...BRAND_BUTTON_STYLE, minHeight: 44 }}
      >
        {translate(language, 'community.detail.back')}
      </Link>
    </div>
  );
}

/** Miroir `CommunityCreateView.communityPreviewCard` — la communauté telle qu'elle se lira. */
export function CommunityPreviewCard({ language, draft }: { readonly language: InterfaceLanguage; readonly draft: CommunityDraft }) {
  const name = draft.name.trim();
  const description = draft.description.trim();
  const accent = communityAccent(name === '' ? 'New' : name);
  return (
    <div data-community-preview aria-hidden="true" className="relative overflow-hidden rounded-hero" style={{ height: 160, boxShadow: `0 6px 12px color-mix(in srgb, ${accent} 35%, transparent)` }}>
      <span className="absolute inset-0" style={{ background: bannerBackground(accent) }} />
      <span className="absolute inset-0" style={{ background: CARD_SCRIM }} />
      <span className="absolute inset-x-0 bottom-0 grid gap-1 p-4">
        <span className="line-clamp-2 font-bold" style={{ color: 'white', fontSize: 'var(--text-lg)' }}>
          {name === '' ? translate(language, 'community.create.preview.placeholder') : name}
        </span>
        {description === '' ? null : (
          <span className="line-clamp-2 text-chip" style={{ color: 'rgb(255 255 255 / 0.88)' }}>
            {description}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-chip font-semibold" style={{ color: 'rgb(255 255 255 / 0.94)' }}>
          <PrivacyGlyph isPrivate={draft.isPrivate} size={10} />
          {translate(language, privacyKey(draft.isPrivate))}
        </span>
      </span>
    </div>
  );
}

function Switch({ checked }: { readonly checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative block rounded-chip"
      style={{
        width: 51,
        height: 31,
        backgroundColor: checked ? BRAND : 'color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)',
        transition: 'background-color 160ms ease',
      }}
    >
      <span
        className="absolute block rounded-chip"
        style={{
          top: 2,
          insetInlineStart: checked ? 22 : 2,
          width: 27,
          height: 27,
          backgroundColor: 'white',
          boxShadow: '0 1px 3px rgb(0 0 0 / 0.3)',
          transition: 'inset-inline-start 160ms ease',
        }}
      />
    </span>
  );
}

/** Miroir `CommunityCreateView.privacyToggle` — ce que la bascule change se lit SOUS elle. */
export function PrivacyToggle({
  language,
  isPrivate,
  onToggle,
}: {
  readonly language: InterfaceLanguage;
  readonly isPrivate: boolean;
  readonly onToggle: (next: boolean) => void;
}) {
  const captionId = 'community-privacy-caption';
  return (
    <div className="flex items-center gap-3 rounded-card px-3.5 py-2.5" style={CARD_STYLE}>
      <span aria-hidden="true" className="grid w-8 shrink-0 place-items-center" style={{ color: isPrivate ? BRAND : 'var(--color-success)' }}>
        <ScreenGlyph name={isPrivate ? 'shieldCheck' : 'eye'} size={20} />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-body font-semibold" style={{ color: INK }}>
          {translate(language, 'community.create.privacy.title')}
        </span>
        <span id={captionId} className="text-caption" style={{ color: INK_2 }}>
          {translate(language, isPrivate ? 'community.create.privacy.private.description' : 'community.create.privacy.public.description')}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isPrivate}
        aria-label={translate(language, 'community.create.privacy.title')}
        aria-describedby={captionId}
        data-community-privacy-toggle
        onClick={() => onToggle(!isPrivate)}
        className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2"
        style={{ minWidth: 56, minHeight: 44, outlineColor: BRAND }}
      >
        <Switch checked={isPrivate} />
      </button>
    </div>
  );
}

export function SubmitButton({ language, submitting, disabled }: { readonly language: InterfaceLanguage; readonly submitting: boolean; readonly disabled: boolean }) {
  return (
    <button
      type="submit"
      data-community-submit
      disabled={disabled}
      aria-disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-card text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ ...BRAND_BUTTON_STYLE, minHeight: 50, opacity: disabled ? 0.55 : 1 }}
    >
      <ScreenGlyph name="plusCircle" size={18} />
      {translate(language, submitting ? 'community.create.inprogress' : 'community.create.button')}
    </button>
  );
}
