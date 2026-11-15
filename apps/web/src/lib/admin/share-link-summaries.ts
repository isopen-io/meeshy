import type { AdminSummaryValue } from '@/components/admin/summary-card';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import type { AdminShareLink } from '@/lib/api/admin-share-links';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';

import { formatCount } from './interpret/numbers';
import { shareLinkGuestPermissions, shareLinkRequirements, shareLinkRestrictions, type ShareLinkFlag } from './share-link-model';
import { conversationRefOf } from './share-link-refs';

/**
 * **LA FICHE D'UN LIEN DE PARTAGE, EN CARTES** (spec 2026-10-04 § 3, lot
 * « Échanges et contenus ») — l'en-tête, les gestes (fermer, rouvrir, révéler)
 * et le bandeau d'usage restent visibles ; les cinq blocs empilés d'hier
 * (conversation, permissions, exigences, restrictions, invités) deviennent des
 * cartes résumées qui ouvrent leur bloc dans une modale (`?open=<id>`).
 *
 * Tout vient de la fiche déjà lue : aucune carte ne lance de requête.
 */
export const ADMIN_SHARE_LINK_SECTIONS = ['conversation', 'permissions', 'requirements', 'restrictions', 'guests'] as const;

export type AdminShareLinkSection = (typeof ADMIN_SHARE_LINK_SECTIONS)[number];

export const ADMIN_SHARE_LINK_SECTION_TITLES = {
  conversation: 'admin.shareLink.section.conversation',
  permissions: 'admin.shareLink.section.permissions',
  requirements: 'admin.shareLink.section.requirements',
  restrictions: 'admin.shareLink.section.restrictions',
  guests: 'admin.shareLink.section.guests',
} as const satisfies Readonly<Record<AdminShareLinkSection, AdminPlainCatalogKey>>;

export const ADMIN_SHARE_LINK_SECTION_GLYPHS = {
  conversation: 'chats',
  permissions: 'checkCircle',
  requirements: 'shieldCheck',
  restrictions: 'globe',
  guests: 'detective',
} as const satisfies Readonly<Record<AdminShareLinkSection, AdminGlyphName>>;

const allowedOf = (flags: readonly ShareLinkFlag[], language: AdminLanguage): string =>
  translateAdmin(language, 'admin.shareLink.card.outOf', {
    count: formatCount(flags.filter((flag) => flag.allowed === true).length, language),
    total: formatCount(flags.length, language),
  });

export function shareLinkSummaryOf(
  section: AdminShareLinkSection,
  link: AdminShareLink,
  language: AdminLanguage,
): { readonly values: readonly AdminSummaryValue[]; readonly sentence: string | null } {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const v = (label: AdminPlainCatalogKey, value: string): AdminSummaryValue => ({ label: t(label), value });

  switch (section) {
    case 'conversation': {
      const ref = conversationRefOf(link.conversation, language);
      return ref === null ? { values: [], sentence: t('admin.shareLink.conversation.none') } : { values: [v('admin.shareLink.col.conversation', ref.label)], sentence: ref.secondary ?? null };
    }
    case 'permissions':
      return { values: [v('admin.shareLink.card.allowed', allowedOf(shareLinkGuestPermissions(link, language), language))], sentence: null };
    case 'requirements':
      return { values: [v('admin.shareLink.card.required', allowedOf(shareLinkRequirements(link, language), language))], sentence: null };
    case 'restrictions': {
      const { countries, languages } = shareLinkRestrictions(link, language);
      return {
        values: [v('admin.shareLink.restrict.countries', formatCount(countries.length, language)), v('admin.shareLink.restrict.languages', formatCount(languages.length, language))],
        sentence: countries.length === 0 && languages.length === 0 ? t('admin.shareLink.restrict.none') : null,
      };
    }
    case 'guests':
      return {
        values: [
          v('admin.shareLink.strip.guests', formatCount(link.guestCount, language)),
          v('admin.shareLink.card.present', formatCount(link.recentGuests.filter((guest) => guest.isActive).length, language)),
        ],
        sentence: link.recentGuests.length === 0 ? t('admin.shareLink.guests.empty') : null,
      };
  }
}
