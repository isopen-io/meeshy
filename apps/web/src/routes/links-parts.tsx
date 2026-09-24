
import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { LINKS_GLYPHS, type LinksGlyphName } from '@/components/glyphs-links';
import { SECTION_BRAND_INK, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import type { MyShareLink, ShareLinksSummary } from '@/lib/api/links';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { displayNameOf } from '@/lib/links/view';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DE « MES LIENS »** (#6361) — miroir de `LinksHubView.swift`
 * (bannière, cartes de famille), `ShareLinksView.swift` (statistiques, lignes,
 * état vide) et `ShareLinkDetailView.swift` (carte d'en-tête, barre d'actions,
 * statistiques, informations).
 *
 * Chaque pièce est PURE (primitives en props, aucun magasin global) :
 * `routes/links.test.tsx` les rend sans DOM ni TanStack Query.
 *
 * **Une ligne est un lien ÉTIRÉ, pas un lien qui contient un bouton.** iOS
 * imbrique le bouton « copier » dans le `NavigationLink` de la ligne ; en HTML
 * un contrôle dans un lien est invalide et ambigu au lecteur d'écran. Le lien
 * couvre la ligne par son pseudo-élément, le bouton se pose au-dessus.
 *
 * **L'état se dit en toutes lettres** (WCAG 1.4.1) : iOS ne distingue un lien
 * inactif que par la teinte et la forme du glyphe, et ne le nomme qu'à
 * VoiceOver ; ici « Inactif » s'écrit sur la ligne.
 */

export const LINKS_HEADER_HEIGHT = 64;
/** Au repos, la bannière du hub commence sous les disques flottants (`floating-corridor.ts`). */
export const LINKS_HUB_TOP_RESERVE = FLOATING_CORRIDOR_BOTTOM - LINKS_HEADER_HEIGHT;
export const SHARE_LINK_ROW_HEIGHT = 72;

const INK = SECTION_INK;
const INK_2 = SECTION_INK_2;
const CARD_STYLE = SECTION_CARD_STYLE;
const BRAND = 'var(--color-ios-brand)';
export const SHARE_TINT = 'var(--ios-indigo-500)';
const NEUTRAL_TINT = 'var(--color-ios-ink-3)';
const HUB_TINT = 'var(--color-warning)';
const SKELETON_TINT = 'color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)';
const STRETCHED = "before:absolute before:inset-0 before:rounded-card before:content-['']";
export const SECTION_TITLE_CLASS = 'ps-1 text-check font-bold uppercase tracking-wide';
export const BRAND_BUTTON_STYLE = {
  backgroundColor: 'var(--ios-indigo-600)',
  backgroundImage: 'linear-gradient(90deg, var(--ios-indigo-600), color-mix(in srgb, var(--ios-indigo-600) 78%, black))',
  color: 'white',
  outlineColor: BRAND,
} as const;

export function LinksGlyph({ name, size }: { readonly name: LinksGlyphName; readonly size: number }) {
  return <GlyphSvg glyph={LINKS_GLYPHS[name]} size={size} />;
}

const tinted = (tint: string, percent: number) => `color-mix(in srgb, ${tint} ${percent}%, transparent)`;

function StatusDisc({ active, size }: { readonly active: boolean; readonly size: number }) {
  const tint = active ? SHARE_TINT : NEUTRAL_TINT;
  const glyph = Math.round(size * 0.42);
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, color: tint, backgroundColor: tinted(tint, 15) }}>
      {active ? <Glyph name="linkSimple" size={glyph} /> : <LinksGlyph name="linkBreak" size={glyph} />}
    </span>
  );
}

export const statusLabel = (language: InterfaceLanguage, active: boolean): string =>
  translate(language, active ? 'links.status.active' : 'links.status.inactive');

export const joinedLabel = (language: InterfaceLanguage, count: number): string =>
  translate(language, count === 1 ? 'links.share.joined.one' : 'links.share.joined.other', { count: new Intl.NumberFormat(language).format(count) });

export function LinksHeader({
  language,
  back,
  backLabel,
  title,
  createLabel,
}: {
  readonly language: InterfaceLanguage;
  readonly back: 'list' | 'links' | 'shareLinks';
  readonly backLabel: string;
  readonly title: string;
  readonly createLabel?: string;
}) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: LINKS_HEADER_HEIGHT }} lang={language}>
      <Link
        to={back}
        aria-label={backLabel}
        data-links-back
        className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-center text-body font-semibold" style={{ color: INK }}>
        {title}
      </h1>
      {createLabel === undefined ? (
        <span aria-hidden="true" className="block shrink-0" style={{ width: 44 }} />
      ) : (
        <Link
          to="shareLinkNew"
          aria-label={createLabel}
          data-links-create
          className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: BRAND, outlineColor: BRAND }}
        >
          <ChromeActionDisc>
            <LinksGlyph name="plusCircle" size={20} />
          </ChromeActionDisc>
        </Link>
      )}
    </header>
  );
}

/** Miroir `LinksHubView.headerBanner`. */
export function LinksBanner({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-links-banner className="flex items-center gap-3 rounded-card p-4" style={{ ...CARD_STYLE, backgroundImage: `linear-gradient(135deg, ${tinted(HUB_TINT, 14)}, transparent 70%)` }}>
      <span aria-hidden="true" className="shrink-0" style={{ color: HUB_TINT }}>
        <LinksGlyph name="link" size={30} />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="text-body font-bold" style={{ color: INK }}>
          {translate(language, 'links.hub.banner.title')}
        </span>
        <span className="text-caption" style={{ color: INK_2 }}>
          {translate(language, 'links.hub.banner.subtitle')}
        </span>
      </span>
    </div>
  );
}

/**
 * Miroir `LinksHubView.linkCard(.shareLinks)` — la carte ouvre la famille, « + »
 * ouvre la création. Les trois autres familles d'iOS (suivi, communauté,
 * affiliation) ne sont pas dessinées tant que le web ne les sert pas (D-63).
 */
export function ShareLinksFamilyCard({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-links-family="share" className="relative flex items-center gap-1 rounded-card ps-3.5 pe-1" style={{ ...CARD_STYLE, minHeight: 80 }}>
      <Link
        to="shareLinks"
        data-links-family-open
        className={`flex min-w-0 flex-1 items-center gap-3.5 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 ${STRETCHED}`}
        style={{ outlineColor: BRAND }}
      >
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full" style={{ color: SHARE_TINT, backgroundColor: tinted(SHARE_TINT, 15) }}>
          <Glyph name="linkSimple" size={22} />
        </span>
        <span className="relative grid min-w-0 gap-0.5">
          <span data-links-family-title className="text-body font-semibold" style={{ color: INK }}>
            {translate(language, 'links.hub.share.title')}
          </span>
          <span className="line-clamp-2 text-caption" style={{ color: INK_2 }}>
            {translate(language, 'links.hub.share.description')}
          </span>
        </span>
      </Link>
      <Link
        to="shareLinkNew"
        aria-label={translate(language, 'links.hub.share.create')}
        data-links-family-create
        className={`${CHROME_ACTION_HIT_CLASS} z-[1] focus-visible:outline-2`}
        style={{ color: SHARE_TINT, outlineColor: BRAND }}
      >
        <LinksGlyph name="plusCircle" size={26} />
      </Link>
      <span aria-hidden="true" className="pointer-events-none pe-2" style={{ color: INK_2 }}>
        <LinksGlyph name="caretRight" size={14} />
      </span>
    </div>
  );
}

/** Miroir `ShareLinksView.shareLinkStatsOverview` — les agrégats RÉELS de la passerelle. */
export function ShareLinksStats({ language, summary }: { readonly language: InterfaceLanguage; readonly summary: ShareLinksSummary }) {
  const format = new Intl.NumberFormat(language);
  const items = [
    { stat: 'total', glyph: <Glyph name="linkSimple" size={18} />, value: summary.totalLinks, label: translate(language, 'links.share.stats.total') },
    { stat: 'active', glyph: <LinksGlyph name="checkCircle" size={18} />, value: summary.activeLinks, label: translate(language, 'links.share.stats.active') },
    { stat: 'joined', glyph: <LinksGlyph name="userPlus" size={18} />, value: summary.totalUses, label: translate(language, 'links.share.stats.joined') },
  ] as const;
  return (
    <ul data-share-links-stats className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <li key={item.stat} data-share-links-stat={item.stat} className="grid justify-items-center gap-1 rounded-card px-2 py-3" style={CARD_STYLE}>
          <span aria-hidden="true" style={{ color: SHARE_TINT }}>
            {item.glyph}
          </span>
          <strong className="font-bold" style={{ color: INK, fontSize: 'var(--text-lg)' }}>
            {format.format(item.value)}
          </strong>
          <span className="text-chip font-medium" style={{ color: INK_2 }}>
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Miroir `ShareLinksView.shareLinkRow` — le lien ouvre le détail, « copier » copie son adresse. */
export function ShareLinkRow({
  language,
  link,
  copied,
  onCopy,
}: {
  readonly language: InterfaceLanguage;
  readonly link: MyShareLink;
  readonly copied: boolean;
  readonly onCopy: () => void;
}) {
  const name = displayNameOf(link);
  const joined = joinedLabel(language, link.currentUses);
  const label = new Intl.ListFormat(language, { type: 'unit', style: 'short' }).format([
    name,
    statusLabel(language, link.isActive),
    joined,
    ...(link.conversationTitle === null ? [] : [link.conversationTitle]),
  ]);
  return (
    <li data-share-link={link.linkId} data-share-link-active={link.isActive} className="relative flex items-center gap-1 rounded-card ps-3.5 pe-1" style={{ ...CARD_STYLE, minHeight: SHARE_LINK_ROW_HEIGHT }}>
      <Link
        to="shareLink"
        params={{ link: link.linkId }}
        aria-label={label}
        className={`flex min-w-0 flex-1 items-center gap-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 ${STRETCHED}`}
        style={{ outlineColor: BRAND }}
      >
        <StatusDisc active={link.isActive} size={40} />
        <span className="relative grid min-w-0 gap-0.5">
          <span data-share-link-name className="truncate text-body font-semibold" style={{ color: INK }}>
            {name}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-caption">
            <span data-share-link-joined className={`shrink-0 font-medium ${SECTION_BRAND_INK}`}>
              {joined}
            </span>
            {link.isActive ? null : (
              <span data-share-link-status className="shrink-0 font-medium" style={{ color: INK_2 }}>
                · {statusLabel(language, false)}
              </span>
            )}
            {link.conversationTitle === null ? null : (
              <span data-share-link-conversation className="truncate" style={{ color: INK_2 }}>
                · {link.conversationTitle}
              </span>
            )}
          </span>
        </span>
      </Link>
      <button
        type="button"
        data-share-link-copy
        aria-label={translate(language, 'links.share.copy')}
        onClick={onCopy}
        className={`${CHROME_ACTION_HIT_CLASS} z-[1] focus-visible:outline-2`}
        style={{ color: copied ? 'var(--color-success)' : SHARE_TINT, outlineColor: BRAND }}
      >
        {copied ? <Glyph name="check" size={18} /> : <LinksGlyph name="copy" size={18} />}
      </button>
      <span aria-hidden="true" className="pointer-events-none pe-2.5" style={{ color: INK_2 }}>
        <LinksGlyph name="caretRight" size={12} />
      </span>
    </li>
  );
}

export function ShareLinksSkeleton({ language, rows = 3 }: { readonly language: InterfaceLanguage; readonly rows?: number }) {
  return (
    <div data-share-links-skeleton aria-busy="true" aria-label={translate(language, 'links.share.loading')} className="grid gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="flex items-center gap-3 rounded-card px-3.5" style={{ ...CARD_STYLE, height: SHARE_LINK_ROW_HEIGHT }}>
          <span className="block size-10 rounded-full" style={{ backgroundColor: SKELETON_TINT }} />
          <span className="block h-3 w-40 rounded-chip" style={{ backgroundColor: SKELETON_TINT }} />
        </span>
      ))}
    </div>
  );
}

/** Miroir `ShareLinksView.emptyState` — nommer, promettre, offrir le geste. */
export function ShareLinksEmpty({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-share-links-empty className="grid justify-items-center gap-4 px-6 py-10 text-center">
      <span aria-hidden="true" style={{ color: SHARE_TINT }}>
        <LinksGlyph name="link" size={48} />
      </span>
      <p className="text-thread font-bold" style={{ color: INK }}>
        {translate(language, 'links.share.empty.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, 'links.share.empty.subtitle')}
      </p>
      <Link
        to="shareLinkNew"
        data-share-links-empty-create
        className="flex items-center gap-1.5 rounded-chip px-6 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...BRAND_BUTTON_STYLE, minHeight: 44 }}
      >
        <LinksGlyph name="plusCircle" size={18} />
        {translate(language, 'links.hub.share.create')}
      </Link>
    </div>
  );
}

export function LinksLoadError({ language, onRetry }: { readonly language: InterfaceLanguage; readonly onRetry: () => void }) {
  return (
    <div role="alert" data-links-error className="grid justify-items-center gap-3 rounded-card px-6 py-8 text-center" style={CARD_STYLE}>
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'links.error.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, 'links.error.body')}
      </p>
      <button
        type="button"
        data-links-retry
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...BRAND_BUTTON_STYLE, minHeight: 44 }}
      >
        {translate(language, 'links.retry')}
      </button>
    </div>
  );
}

export function LinksOfflineNotice({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div role="status" data-links-offline className="flex items-start gap-3 rounded-card px-3.5 py-3" style={CARD_STYLE}>
      <span aria-hidden="true" className="pt-0.5" style={{ color: 'var(--color-warning)' }}>
        <Glyph name="warningCircle" size={18} />
      </span>
      <span className="grid gap-0.5">
        <span className="text-body font-semibold" style={{ color: INK }}>
          {translate(language, 'links.offline.title')}
        </span>
        <span className="text-caption" style={{ color: INK_2 }}>
          {translate(language, 'links.offline.body')}
        </span>
      </span>
    </div>
  );
}

/** L'issue d'un geste, lue ET vue — la région reste montée pour que l'annonce parte. */
export function LinksAnnouncement({ text }: { readonly text: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-links-announcement
      className={
        text === ''
          ? 'sr-only'
          : 'pointer-events-none fixed inset-x-0 z-20 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-chip px-4 py-2.5 text-center text-caption font-semibold'
      }
      style={text === '' ? undefined : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', color: 'var(--color-ios-card)', backgroundColor: 'var(--color-ios-ink)' }}
    >
      {text}
    </p>
  );
}

export function ShareLinkDetailSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-share-link-skeleton aria-busy="true" aria-label={translate(language, 'links.detail.loading')} className="grid gap-4">
      <span className="block rounded-hero" style={{ ...CARD_STYLE, height: 200 }} />
      <span className="block h-16 rounded-card" style={{ backgroundColor: SKELETON_TINT }} />
      <span className="block rounded-card" style={{ ...CARD_STYLE, height: 72 }} />
    </div>
  );
}

/** Un linkId inconnu et un lien d'un AUTRE compte rendent le MÊME refus : aucun oracle d'existence. */
export function ShareLinkRefused({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div role="alert" data-share-link-refused className="grid justify-items-center gap-3 rounded-card px-6 py-8 text-center" style={CARD_STYLE}>
      <span aria-hidden="true" style={{ color: INK_2 }}>
        <LinksGlyph name="linkBreak" size={32} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'links.detail.refused.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, 'links.detail.refused.body')}
      </p>
      <Link
        to="shareLinks"
        className="grid place-items-center rounded-chip px-5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...BRAND_BUTTON_STYLE, minHeight: 44 }}
      >
        {translate(language, 'links.detail.back')}
      </Link>
    </div>
  );
}
