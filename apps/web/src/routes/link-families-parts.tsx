import type { ReactNode } from 'react';

import { CHROME_ACTION_HIT_CLASS } from '@/components/chrome-action';
import { Glyph } from '@/components/glyph';
import { SECTION_BRAND_INK, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { translateLinkFamilies, type PlainLinkFamiliesKey } from '@/lib/i18n-link-families-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { BRAND_BUTTON_STYLE, LinksGlyph, SECTION_TITLE_CLASS, SHARE_TINT, SKELETON_TINT, STRETCHED, tinted } from '@/routes/links-parts';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES COMMUNES AUX QUATRE FAMILLES DE « MES LIENS »** (#6408, #6409,
 * #6410) — miroir de `LinksHubView.linkCard`, et des statistiques, lignes,
 * états vides, cartes d'en-tête et barres d'actions que `TrackingLinksView`,
 * `AffiliateView` et `CommunityLinksView` répètent chacune à leur manière.
 * Ici elles n'existent qu'une fois : même geste, même place, même mot.
 *
 * Chaque pièce est PURE (primitives en props) : `link-families.test.tsx` les
 * rend sans DOM ni TanStack Query.
 *
 * Les teintes ne colorent que des GLYPHES et des disques : un texte reste à
 * l'encre de la section, l'état « Inactif » s'écrit en toutes lettres
 * (WCAG 1.4.1), comme sur les liens de partage.
 */

const INK = SECTION_INK;
const INK_2 = SECTION_INK_2;
const CARD_STYLE = SECTION_CARD_STYLE;
const BRAND = 'var(--color-ios-brand)';
const NEUTRAL_TINT = 'var(--color-ios-ink-3)';

export const TRACKING_TINT = 'var(--ios-indigo-600)';
export const COMMUNITY_TINT = 'var(--color-warning)';
export const AFFILIATE_TINT = 'var(--color-success)';
export const FAMILY_ROW_HEIGHT = 72;

export type LinkFamily = 'share' | 'tracking' | 'community' | 'affiliate';

type Phrase = (language: InterfaceLanguage) => string;

const main =
  (key: InterfaceCatalogKey): Phrase =>
  (language) =>
    translate(language, key);
const family =
  (key: PlainLinkFamiliesKey): Phrase =>
  (language) =>
    translateLinkFamilies(language, key);

type FamilySpec = {
  readonly tint: string;
  readonly glyph: ReactNode;
  readonly title: Phrase;
  readonly description: Phrase;
  readonly open: 'shareLinks' | 'myTrackingLinks' | 'communityLinks' | 'affiliateLinks';
  readonly create: {
    readonly to: 'shareLinkNew' | 'myTrackingLinkNew' | 'affiliateLinkNew';
    readonly label: Phrase;
  } | null;
};

/**
 * Miroir de l'ORDRE et des RÔLES de `LinksHubView.linkCategoryCards` : partage,
 * suivi, communauté, parrainage. La communauté n'a pas de « + » : on n'y crée
 * pas un lien, on administre des communautés (iOS : `onCreate: nil`).
 */
export const LINK_FAMILIES: Readonly<Record<LinkFamily, FamilySpec>> = {
  share: {
    tint: SHARE_TINT,
    glyph: <Glyph name="linkSimple" size={22} />,
    title: main('links.hub.share.title'),
    description: main('links.hub.share.description'),
    open: 'shareLinks',
    create: { to: 'shareLinkNew', label: main('links.hub.share.create') },
  },
  tracking: {
    tint: TRACKING_TINT,
    glyph: <LinksGlyph name="chartLine" size={22} />,
    title: family('links.hub.tracking.title'),
    description: family('links.hub.tracking.description'),
    open: 'myTrackingLinks',
    create: {
      to: 'myTrackingLinkNew',
      label: family('links.hub.tracking.create'),
    },
  },
  community: {
    tint: COMMUNITY_TINT,
    glyph: <LinksGlyph name="usersThree" size={22} />,
    title: family('links.hub.community.title'),
    description: family('links.hub.community.description'),
    open: 'communityLinks',
    create: null,
  },
  affiliate: {
    tint: AFFILIATE_TINT,
    glyph: <LinksGlyph name="gift" size={22} />,
    title: family('links.hub.affiliate.title'),
    description: family('links.hub.affiliate.description'),
    open: 'affiliateLinks',
    create: {
      to: 'affiliateLinkNew',
      label: family('links.hub.affiliate.create'),
    },
  },
};

export const HUB_FAMILIES: readonly LinkFamily[] = ['share', 'tracking', 'community', 'affiliate'];

/** Miroir `LinksHubView.linkCard` — la carte ouvre la famille, « + » ouvre la création. */
export function LinkFamilyCard({ language, family }: { readonly language: InterfaceLanguage; readonly family: LinkFamily }) {
  const spec = LINK_FAMILIES[family];
  return (
    <div data-links-family={family} className="relative flex items-center gap-1 rounded-card ps-3.5 pe-1" style={{ ...CARD_STYLE, minHeight: 80 }}>
      <Link
        to={spec.open}
        data-links-family-open
        className={`flex min-w-0 flex-1 items-center gap-3.5 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 ${STRETCHED}`}
        style={{ outlineColor: BRAND }}
      >
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full" style={{ color: spec.tint, backgroundColor: tinted(spec.tint, 15) }}>
          {spec.glyph}
        </span>
        <span className="relative grid min-w-0 gap-0.5">
          <span data-links-family-title className="text-body font-semibold" style={{ color: INK }}>
            {spec.title(language)}
          </span>
          <span className="line-clamp-2 text-caption" style={{ color: INK_2 }}>
            {spec.description(language)}
          </span>
        </span>
      </Link>
      {spec.create === null ? null : (
        <Link
          to={spec.create.to}
          aria-label={spec.create.label(language)}
          data-links-family-create
          className={`${CHROME_ACTION_HIT_CLASS} z-[1] focus-visible:outline-2`}
          style={{ color: spec.tint, outlineColor: BRAND }}
        >
          <LinksGlyph name="plusCircle" size={26} />
        </Link>
      )}
      <span aria-hidden="true" className="pointer-events-none pe-2" style={{ color: INK_2 }}>
        <LinksGlyph name="caretRight" size={14} />
      </span>
    </div>
  );
}

const STAT_COLUMNS: Readonly<Record<number, string>> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

/** Le point médian colle au fait qui le précède : une ligne qui passe à la suivante ne commence jamais par « · ». */
export const SEPARATOR = '\u00a0· ';

export type StatItem = {
  readonly stat: string;
  readonly glyph: ReactNode;
  readonly value: number | null;
  readonly label: string;
};

/** Les agrégats d'une famille — une valeur que la passerelle ne sert pas se dit « — », jamais « 0 ». */
export function FamilyStats({ language, tint, items }: { readonly language: InterfaceLanguage; readonly tint: string; readonly items: readonly StatItem[] }) {
  const format = new Intl.NumberFormat(language);
  return (
    <ul data-family-stats className={`grid gap-2.5 ${STAT_COLUMNS[items.length] ?? 'grid-cols-3'}`}>
      {items.map((item) => (
        <li key={item.stat} data-family-stat={item.stat} className="grid min-w-0 justify-items-center gap-1 rounded-card px-1.5 py-3" style={CARD_STYLE}>
          <span aria-hidden="true" style={{ color: tint }}>
            {item.glyph}
          </span>
          <strong className="font-bold tabular-nums" style={{ color: INK, fontSize: 'var(--text-lg)' }}>
            {item.value === null ? '—' : format.format(item.value)}
          </strong>
          <span className="max-w-full truncate text-chip font-medium" style={{ color: INK_2 }}>
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FamilySection({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h2 id={id} className={SECTION_TITLE_CLASS} style={{ color: INK_2 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function FamilyDisc({ tint, active, glyph, size }: { readonly tint: string; readonly active: boolean; readonly glyph: ReactNode; readonly size: number }) {
  const color = active ? tint : NEUTRAL_TINT;
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        color,
        backgroundColor: tinted(color, 15),
      }}
    >
      {glyph}
    </span>
  );
}

export type RowTarget =
  | {
      readonly to: 'myTrackingLink';
      readonly params: { readonly token: string };
    }
  | {
      readonly to: 'communityLink';
      readonly params: { readonly community: string };
    };

/**
 * Une ligne de famille — un lien ÉTIRÉ qui ouvre le détail, et ses gestes posés
 * au-dessus (jamais un contrôle DANS un lien). Sans cible, la ligne n'ouvre
 * rien : un jeton de parrainage n'a pas de détail sur iOS non plus.
 */
export function FamilyRow({
  rowId,
  target,
  label,
  disc,
  title,
  meta,
  actions,
}: {
  readonly rowId: string;
  readonly target: RowTarget | null;
  readonly label: string;
  readonly disc: ReactNode;
  readonly title: string;
  readonly meta: ReactNode;
  readonly actions: ReactNode;
}) {
  const body = (
    <>
      {disc}
      <span className="relative grid min-w-0 gap-0.5">
        <span data-family-row-title className="truncate text-body font-semibold" style={{ color: INK }}>
          {title}
        </span>
        <span className="line-clamp-2 min-w-0 text-caption" style={{ color: INK_2 }}>
          {meta}
        </span>
      </span>
    </>
  );
  return (
    <li data-family-row={rowId} className="relative flex items-center gap-1 rounded-card ps-3.5 pe-1" style={{ ...CARD_STYLE, minHeight: FAMILY_ROW_HEIGHT }}>
      {target === null ? (
        <div role="group" aria-label={label} className="flex min-w-0 flex-1 items-center gap-3 py-3">
          {body}
        </div>
      ) : (
        <RowLink target={target} label={label}>
          {body}
        </RowLink>
      )}
      {actions}
      {target === null ? null : (
        <span aria-hidden="true" className="pointer-events-none pe-2.5" style={{ color: INK_2 }}>
          <LinksGlyph name="caretRight" size={12} />
        </span>
      )}
    </li>
  );
}

const ROW_LINK_CLASS = `flex min-w-0 flex-1 items-center gap-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 ${STRETCHED}`;

function RowLink({ target, label, children }: { readonly target: RowTarget; readonly label: string; readonly children: ReactNode }) {
  return target.to === 'myTrackingLink' ? (
    <Link to="myTrackingLink" params={target.params} aria-label={label} className={ROW_LINK_CLASS} style={{ outlineColor: BRAND }}>
      {children}
    </Link>
  ) : (
    <Link to="communityLink" params={target.params} aria-label={label} className={ROW_LINK_CLASS} style={{ outlineColor: BRAND }}>
      {children}
    </Link>
  );
}

/** Un geste de ligne : 44 px, nommé, au-dessus du lien étiré. */
export function RowAction({
  name,
  label,
  tint,
  onClick,
  children,
}: {
  readonly name: string;
  readonly label: string;
  readonly tint: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-row-action={name}
      aria-label={label}
      onClick={onClick}
      className={`${CHROME_ACTION_HIT_CLASS} z-[1] focus-visible:outline-2`}
      style={{ color: tint, outlineColor: BRAND }}
    >
      {children}
    </button>
  );
}

export function CopyRowAction({
  language,
  label,
  tint,
  copied,
  onCopy,
}: {
  readonly language: InterfaceLanguage;
  readonly label: string;
  readonly tint: string;
  readonly copied: boolean;
  readonly onCopy: () => void;
}) {
  return (
    <RowAction name="copy" label={copied ? translate(language, 'links.detail.copied') : label} tint={copied ? 'var(--color-success)' : tint} onClick={onCopy}>
      {copied ? <Glyph name="check" size={18} /> : <LinksGlyph name="copy" size={18} />}
    </RowAction>
  );
}

export function FamilySkeleton({ label, rows = 3 }: { readonly label: string; readonly rows?: number }) {
  return (
    <div data-family-skeleton aria-busy="true" aria-label={label} className="grid gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="flex items-center gap-3 rounded-card px-3.5" style={{ ...CARD_STYLE, height: FAMILY_ROW_HEIGHT }}>
          <span className="block size-10 rounded-full" style={{ backgroundColor: SKELETON_TINT }} />
          <span className="block h-3 w-40 rounded-chip" style={{ backgroundColor: SKELETON_TINT }} />
        </span>
      ))}
    </div>
  );
}

/** Nommer, promettre, offrir le geste — miroir des `emptyState` d'iOS. */
export function FamilyEmpty({
  family,
  glyph,
  title,
  subtitle,
  cta,
}: {
  readonly family: LinkFamily;
  readonly glyph: ReactNode;
  readonly title: string;
  readonly subtitle: string;
  readonly cta: {
    readonly to: 'myTrackingLinkNew' | 'affiliateLinkNew' | 'communityNew';
    readonly label: string;
  } | null;
}) {
  return (
    <div data-family-empty={family} className="grid justify-items-center gap-4 px-6 py-10 text-center">
      <span aria-hidden="true" style={{ color: LINK_FAMILIES[family].tint }}>
        {glyph}
      </span>
      <p className="text-thread font-bold" style={{ color: INK }}>
        {title}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {subtitle}
      </p>
      {cta === null ? null : (
        <Link
          to={cta.to}
          data-family-empty-create
          className="flex items-center gap-1.5 rounded-chip px-6 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ ...BRAND_BUTTON_STYLE, minHeight: 44 }}
        >
          <LinksGlyph name="plusCircle" size={18} />
          {cta.label}
        </Link>
      )}
    </div>
  );
}

/** Miroir des `headerCard` de détail : disque, nom, adresse, puces, état écrit. */
export function DetailHero({
  tint,
  active,
  glyph,
  title,
  address,
  chips,
  status,
}: {
  readonly tint: string;
  readonly active: boolean;
  readonly glyph: ReactNode;
  readonly title: string;
  readonly address: string;
  readonly chips: readonly string[];
  readonly status: string | null;
}) {
  return (
    <div
      data-detail-hero
      className="grid justify-items-center gap-2 rounded-hero px-5 py-6 text-center"
      style={{
        ...CARD_STYLE,
        backgroundImage: `linear-gradient(160deg, ${tinted(active ? tint : NEUTRAL_TINT, 14)}, transparent 70%)`,
      }}
    >
      <FamilyDisc tint={tint} active={active} glyph={glyph} size={60} />
      <p data-detail-title className="max-w-full break-words text-thread font-bold" style={{ color: INK }}>
        {title}
      </p>
      <p data-detail-address dir="ltr" className="max-w-full truncate font-mono text-caption" style={{ color: INK_2 }}>
        {address}
      </p>
      {chips.length === 0 && status === null ? null : (
        <p className="flex flex-wrap justify-center gap-1.5">
          {status === null ? null : (
            <span
              data-detail-status
              className="rounded-chip px-2.5 py-0.5 text-chip font-semibold"
              style={{
                color: INK,
                backgroundColor: tinted(active ? 'var(--color-success)' : NEUTRAL_TINT, 18),
              }}
            >
              {status}
            </span>
          )}
          {chips.map((chip) => (
            <span key={chip} className={`rounded-chip px-2.5 py-0.5 text-chip font-medium ${SECTION_BRAND_INK}`} style={{ backgroundColor: tinted(tint, 14) }}>
              {chip}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export type DetailAction = {
  readonly name: string;
  readonly label: string;
  readonly glyph: ReactNode;
  readonly tint: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
};

/** Miroir des `actionsBar` : des tuiles égales, chacune nommée par son mot. */
export function DetailActions({ actions }: { readonly actions: readonly DetailAction[] }) {
  return (
    <div data-detail-actions className={`grid gap-2.5 ${actions.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {actions.map((action) => (
        <button
          key={action.name}
          type="button"
          data-detail-action={action.name}
          onClick={action.onClick}
          disabled={action.disabled === true}
          className="grid min-w-0 justify-items-center gap-1.5 rounded-card px-1 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          style={{ ...CARD_STYLE, minHeight: 72, outlineColor: BRAND }}
        >
          <span aria-hidden="true" style={{ color: action.tint }}>
            {action.glyph}
          </span>
          <span className="max-w-full truncate text-chip font-semibold" style={{ color: INK }}>
            {action.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export type InfoRow = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly ltr?: boolean;
};

export function InfoList({ rows }: { readonly rows: readonly InfoRow[] }) {
  return (
    <dl
      data-info-list
      className="grid divide-y overflow-hidden rounded-card"
      style={{
        ...CARD_STYLE,
        borderColor: 'var(--color-ios-hairline, transparent)',
      }}
    >
      {rows.map((row) => (
        <div
          key={row.key}
          data-info-row={row.key}
          className="flex items-start justify-between gap-3 px-3.5 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)',
          }}
        >
          <dt className="shrink-0 text-caption" style={{ color: INK_2 }}>
            {row.label}
          </dt>
          <dd {...(row.ltr === true ? { dir: 'ltr' } : {})} className="min-w-0 break-all text-end text-caption font-medium" style={{ color: INK }}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Une ventilation (pays, appareils…) — la barre dit la part, le chiffre la dit aussi : la couleur n'est jamais seule. */
export function BreakdownCard({
  language,
  name,
  title,
  glyph,
  tint,
  items,
  labelOf,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly title: string;
  readonly glyph: ReactNode;
  readonly tint: string;
  readonly items: readonly { readonly label: string; readonly count: number }[];
  readonly labelOf?: (label: string) => string;
}) {
  const shown = items.slice(0, 5);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const format = new Intl.NumberFormat(language);
  return (
    <section data-breakdown={name} aria-label={title} className="grid content-start gap-2.5 rounded-card p-3.5" style={CARD_STYLE}>
      <h3 className="flex items-center gap-1.5 text-check font-bold uppercase tracking-wide" style={{ color: INK_2 }}>
        <span aria-hidden="true" style={{ color: tint }}>
          {glyph}
        </span>
        {title}
      </h3>
      {shown.length === 0 ? (
        <p className="text-caption" style={{ color: INK_2 }}>
          {translateLinkFamilies(language, 'linkFamilies.noData')}
        </p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((item) => {
            const share = total === 0 ? 0 : Math.round((item.count / total) * 100);
            return (
              <li key={item.label} className="grid gap-1">
                <span className="flex items-center justify-between gap-2 text-caption">
                  <span className="truncate" style={{ color: INK }}>
                    {labelOf === undefined ? item.label : labelOf(item.label)}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium" style={{ color: INK_2 }}>
                    {format.format(item.count)}
                  </span>
                </span>
                <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-chip" style={{ backgroundColor: SKELETON_TINT }}>
                  <span className="block h-full rounded-chip" style={{ width: `${share}%`, backgroundColor: tint }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function DetailSkeleton({ label }: { readonly label: string }) {
  return (
    <div data-detail-skeleton aria-busy="true" aria-label={label} className="grid gap-4">
      <span className="block rounded-hero" style={{ ...CARD_STYLE, height: 200 }} />
      <span className="block h-[72px] rounded-card" style={{ backgroundColor: SKELETON_TINT }} />
      <span className="block rounded-card" style={{ ...CARD_STYLE, height: 120 }} />
    </div>
  );
}

/** Un identifiant inconnu et un lien d'un AUTRE compte rendent le MÊME refus : aucun oracle d'existence. */
export function FamilyRefused({
  language,
  back,
}: {
  readonly language: InterfaceLanguage;
  readonly back: {
    readonly to: 'myTrackingLinks' | 'communityLinks';
    readonly label: string;
  };
}) {
  return (
    <div role="alert" data-family-refused className="grid justify-items-center gap-3 rounded-card px-6 py-8 text-center" style={CARD_STYLE}>
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
        to={back.to}
        className="grid place-items-center rounded-chip px-5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...BRAND_BUTTON_STYLE, minHeight: 44 }}
      >
        {back.label}
      </Link>
    </div>
  );
}
