import type { AdminSummaryValue } from '@/components/admin/summary-card';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import type { AdminTrackingLink } from '@/lib/api/admin-tracking-links';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';

import { interpretTrackingTarget } from './interpret/enums';
import { countryName } from './interpret/language';
import { formatCount } from './interpret/numbers';
import { topDatum, trackingCountryData, trackingShareAddress, trackingTargetRef } from './tracking-link-model';

/**
 * **LA FICHE D'UN LIEN DE SUIVI, EN CARTES** (spec 2026-10-04 § 3, lot
 * « Modération, croissance, plateforme ») — l'en-tête, le geste, le bandeau de
 * chiffres et les métadonnées restent visibles ; la destination, la campagne, la
 * cible, les graphiques et les derniers clics deviennent des cartes résumées qui
 * ouvrent leur bloc dans une modale (`?open=<id>`). Les graphiques — huit — ne
 * montent qu'à l'ouverture.
 *
 * Tout vient de la fiche déjà lue : aucune carte ne lance de requête.
 */
export const ADMIN_TRACKING_LINK_SECTIONS = ['destination', 'campaign', 'target', 'stats', 'recent'] as const;

export type AdminTrackingLinkSection = (typeof ADMIN_TRACKING_LINK_SECTIONS)[number];

export const ADMIN_TRACKING_LINK_SECTION_TITLES = {
  destination: 'admin.tracking.section.destination',
  campaign: 'admin.tracking.section.campaign',
  target: 'admin.tracking.section.target',
  stats: 'admin.tracking.section.stats',
  recent: 'admin.tracking.section.recent',
} as const satisfies Readonly<Record<AdminTrackingLinkSection, AdminPlainCatalogKey>>;

export const ADMIN_TRACKING_LINK_SECTION_GLYPHS = {
  destination: 'arrowSquareOut',
  campaign: 'megaphone',
  target: 'target',
  stats: 'chartBar',
  recent: 'clock',
} as const satisfies Readonly<Record<AdminTrackingLinkSection, AdminGlyphName>>;

export function trackingLinkSummaryOf(
  section: AdminTrackingLinkSection,
  link: AdminTrackingLink,
  language: AdminLanguage,
): { readonly values: readonly AdminSummaryValue[]; readonly sentence: string | null } {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const v = (label: AdminPlainCatalogKey, value: string): AdminSummaryValue => ({ label: t(label), value });
  const none = t('admin.value.notProvided');

  switch (section) {
    case 'destination': {
      const address = trackingShareAddress(link);
      return { values: [], sentence: address === '' ? null : translateAdmin(language, 'admin.tracking.card.share', { address }) };
    }
    case 'campaign':
      return {
        values: [
          v('admin.tracking.utm.campaign', link.campaign ?? none),
          v('admin.tracking.utm.source', link.source ?? none),
          v('admin.tracking.utm.medium', link.medium ?? none),
        ],
        sentence: null,
      };
    case 'target': {
      const target = trackingTargetRef(link, language);
      return {
        values: [v('admin.tracking.target.kind', interpretTrackingTarget(link.targetType, language).label)],
        sentence: target === null ? t('admin.tracking.target.none') : target.label,
      };
    }
    case 'stats': {
      const top = topDatum(trackingCountryData(link.stats.byCountry, language));
      return {
        values: [
          v('admin.tracking.strip.confirmed', formatCount(link.stats.confirmedClicks, language)),
          v('admin.tracking.card.countries', formatCount(link.stats.byCountry.length, language)),
        ],
        sentence:
          top === null ? t('admin.tracking.chart.none') : translateAdmin(language, 'admin.tracking.chart.top', { label: top.label, count: formatCount(top.value, language) }),
      };
    }
    case 'recent': {
      const last = link.recentClicks[0];
      return {
        values: [v('admin.tracking.card.recent', formatCount(link.recentClicks.length, language))],
        sentence: last === undefined ? t('admin.tracking.recent.empty') : translateAdmin(language, 'admin.tracking.card.lastFrom', { place: countryName(last.country, language) }),
      };
    }
  }
}
