import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { SECTION_BRAND_INK, SECTION_CARD_STYLE } from '@/components/grouped-section';
import { endonymOf } from '@/components/language-share-bar';
import type { LinkArrival } from '@/lib/api/link-arrivals';
import { translate } from '@/lib/i18n-catalog';
import { translateInvite } from '@/lib/i18n-invite-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { flagOf } from '@/lib/links/invitation-view';
import { initialsOf } from '@/lib/view/conversation';
import { BRAND_BUTTON_STYLE } from '@/routes/links-parts';
import { arrivalAge, countryLabel } from '@/routes/share-link-detail-parts';

/**
 * **LES PIÈCES DE LA LISTE COMPLÈTE DES ARRIVÉES** (#7813) — chaque ligne dit
 * qui (nom, badge « sans compte »), d'où (drapeau, pays nommé pour le lecteur
 * d'écran), dans quelle langue (son nom dans sa langue) et quand ; le pied de
 * liste charge la suite. Pièces PURES : `share-link-arrivals.test.tsx` les
 * rend sans passerelle ni TanStack Query.
 *
 * Aucune présence, aucun visage : la passerelle ne les sert pas, et les
 * initiales en couleur suffisent à distinguer deux lignes.
 */

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const BADGE_STYLE = { backgroundColor: 'color-mix(in srgb, var(--ios-indigo-500) 12%, var(--color-ios-card))' } as const;

function ArrivalLine({ language, arrival, now }: { readonly language: InterfaceLanguage; readonly arrival: LinkArrival; readonly now: Date }) {
  const flag = arrival.country === null ? null : flagOf(arrival.country);
  return (
    <li data-link-arrival className="flex min-w-0 items-center gap-3 py-2.5">
      <span aria-hidden="true" className="shrink-0">
        <Avatar initials={initialsOf(arrival.displayName)} color={colorForName(arrival.displayName)} size={40} />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-body font-bold" style={{ color: INK }}>
            {arrival.displayName}
          </span>
          {arrival.isAnonymous ? (
            <span data-link-arrival-anonymous className={`shrink-0 rounded-chip px-2 py-0.5 text-chip font-bold ${SECTION_BRAND_INK}`} style={BADGE_STYLE}>
              {translateInvite(language, 'linkDetail.recent.anonymous')}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-caption" style={{ color: INK_2 }}>
          {flag === null || arrival.country === null ? null : (
            <span role="img" aria-label={countryLabel(arrival.country, language)}>
              {flag}
            </span>
          )}
          {arrival.language === null ? null : (
            <span data-link-arrival-language lang={arrival.language} className="min-w-0 truncate">
              {endonymOf(arrival.language)}
            </span>
          )}
        </span>
      </span>
      <time dateTime={arrival.joinedAt} className="shrink-0 text-caption" style={{ color: INK_2 }}>
        {arrivalAge(arrival.joinedAt, now, language)}
      </time>
    </li>
  );
}

export function ArrivalsList({ language, arrivals, now }: { readonly language: InterfaceLanguage; readonly arrivals: readonly LinkArrival[]; readonly now: Date }) {
  return (
    <ul data-link-arrivals className="grid divide-y rounded-hero px-4 py-1" style={{ ...SECTION_CARD_STYLE, borderColor: 'var(--color-ios-separator)' }}>
      {arrivals.map((arrival, index) => (
        <ArrivalLine key={`${index}:${arrival.joinedAt}`} language={language} arrival={arrival} now={now} />
      ))}
    </ul>
  );
}

export type ArrivalsScreenState = 'list' | 'empty' | 'loading' | 'refused' | 'error';

const isRefusal = (status: number | null): boolean => status === 403 || status === 404;

/**
 * Ce que l'écran montre : un refus d'abord (des droits retirés ne laissent rien
 * relire du cache), puis la liste dès qu'elle est en main — même pendant une
 * panne de revalidation.
 */
export function arrivalsScreenState(params: {
  readonly arrivals: readonly LinkArrival[] | undefined;
  readonly isError: boolean;
  readonly errorStatus: number | null;
}): ArrivalsScreenState {
  if (params.isError && isRefusal(params.errorStatus)) return 'refused';
  if (params.arrivals !== undefined) return params.arrivals.length === 0 ? 'empty' : 'list';
  return params.isError ? 'error' : 'loading';
}

export function flattenArrivals(data: { readonly pages: ReadonlyArray<{ readonly arrivals: readonly LinkArrival[] }> } | undefined): readonly LinkArrival[] | undefined {
  return data?.pages.flatMap((page) => page.arrivals);
}

export type ArrivalsFooterState = 'more' | 'loading' | 'failed' | 'end';

export function arrivalsFooterState(params: {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isFetchNextPageError: boolean;
}): ArrivalsFooterState {
  if (!params.hasNextPage) return 'end';
  if (params.isFetchingNextPage) return 'loading';
  return params.isFetchNextPageError ? 'failed' : 'more';
}

const FOOTER_BUTTON = 'grid min-h-11 place-items-center rounded-chip px-5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2';

/** Le pied de liste — la suite à charger (aussi déclenchée au défilement), en cours, en échec. */
export function ArrivalsFooter({ language, state, onMore }: { readonly language: InterfaceLanguage; readonly state: ArrivalsFooterState; readonly onMore: () => void }) {
  if (state === 'end') return null;
  if (state === 'loading') {
    return (
      <div data-link-arrivals-loading aria-busy="true" aria-live="polite" className="grid gap-2" aria-label={translate(language, 'links.detail.loading')}>
        {[0, 1].map((row) => (
          <span key={row} className="block h-14 rounded-card" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
        ))}
      </div>
    );
  }
  if (state === 'failed') {
    return (
      <div role="alert" className="grid justify-items-center gap-2 py-2 text-center">
        <p className="text-caption" style={{ color: INK_2 }}>
          {translateInvite(language, 'linkArrivals.moreFailed')}
        </p>
        <button type="button" data-link-arrivals-retry onClick={onMore} className={FOOTER_BUTTON} style={BRAND_BUTTON_STYLE}>
          {translate(language, 'links.retry')}
        </button>
      </div>
    );
  }
  return (
    <div className="grid justify-items-center py-2">
      <button type="button" data-link-arrivals-more onClick={onMore} className={FOOTER_BUTTON} style={BRAND_BUTTON_STYLE}>
        {translateInvite(language, 'linkArrivals.more')}
      </button>
    </div>
  );
}

export function ArrivalsSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-link-arrivals-skeleton aria-busy="true" aria-label={translate(language, 'links.detail.loading')} className="grid gap-2">
      {[0, 1, 2, 3, 4].map((row) => (
        <span key={row} className="block h-14 rounded-card" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
      ))}
    </div>
  );
}
