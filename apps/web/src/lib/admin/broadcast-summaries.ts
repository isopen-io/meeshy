import type { AdminSummaryValue } from '@/components/admin/summary-card';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import type { AdminBroadcast, AdminBroadcastPreview } from '@/lib/api/admin-broadcasts';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';

import { audienceSentence } from './broadcast-audience';
import { inAppStateOf, recipientsToReach, type InAppState } from './broadcast-gestures';
import { excerptOf, personLabel } from './interpret/labels';
import { languageName, sentenceCase } from './interpret/language';
import { formatCount } from './interpret/numbers';

/**
 * **LA FICHE D'UNE DIFFUSION, EN CARTES** (spec 2026-10-04 § 3, lot
 * « Modération, croissance, plateforme ») — l'en-tête, les gestes, les avis
 * d'état et le bandeau de chiffres restent visibles ; le contenu, les
 * traductions, l'audience, les deux canaux de livraison et les personnes
 * deviennent des cartes résumées qui ouvrent leur bloc dans une modale
 * (`?open=<id>`).
 *
 * Tout vient de la fiche déjà lue (et de l'aperçu de préparation, s'il est en
 * cache) : aucune carte ne lance de requête.
 */
export const ADMIN_BROADCAST_SECTIONS = ['content', 'translations', 'audience', 'email', 'inApp', 'people'] as const;

export type AdminBroadcastSection = (typeof ADMIN_BROADCAST_SECTIONS)[number];

export const ADMIN_BROADCAST_SECTION_TITLES = {
  content: 'admin.broadcast.section.content',
  translations: 'admin.broadcast.section.translations',
  audience: 'admin.broadcast.section.audience',
  email: 'admin.broadcast.section.email',
  inApp: 'admin.broadcast.section.inApp',
  people: 'admin.broadcast.section.people',
} as const satisfies Readonly<Record<AdminBroadcastSection, AdminPlainCatalogKey>>;

export const ADMIN_BROADCAST_SECTION_GLYPHS = {
  content: 'pencilSimple',
  translations: 'translate',
  audience: 'users',
  email: 'paperPlaneTilt',
  inApp: 'megaphone',
  people: 'user',
} as const satisfies Readonly<Record<AdminBroadcastSection, AdminGlyphName>>;

export const IN_APP_STATE_KEYS = {
  never: 'admin.broadcast.inApp.state.never',
  running: 'admin.broadcast.inApp.state.running',
  done: 'admin.broadcast.inApp.state.done',
  failed: 'admin.broadcast.inApp.state.failed',
} as const satisfies Readonly<Record<InAppState, AdminPlainCatalogKey>>;

const STARTED: readonly string[] = ['SENDING', 'SENT', 'FAILED'];

/** Les langues cibles sans traduction, NOMMÉES (« wolof, peul ») — jamais leurs codes. */
export function untranslatedNames(broadcast: Pick<AdminBroadcast, 'untranslated'>, language: AdminLanguage): string {
  const names = broadcast.untranslated.map((code) => sentenceCase(languageName(code, language), language));
  return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(names);
}

export function broadcastSummaryOf(
  section: AdminBroadcastSection,
  broadcast: AdminBroadcast,
  preview: AdminBroadcastPreview | undefined,
  language: AdminLanguage,
): { readonly values: readonly AdminSummaryValue[]; readonly sentence: string | null } {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const v = (label: AdminPlainCatalogKey, value: string): AdminSummaryValue => ({ label: t(label), value });
  const count = (value: number) => formatCount(value, language);

  switch (section) {
    case 'content':
      return {
        values: [v('admin.broadcast.meta.sourceLanguage', sentenceCase(languageName(broadcast.sourceLanguage, language), language))],
        sentence: excerptOf(broadcast.subject),
      };
    case 'translations':
      return {
        values: [v('admin.broadcast.card.translations', count(broadcast.translations.length))],
        sentence:
          broadcast.untranslated.length > 0
            ? translateAdmin(language, 'admin.broadcast.translations.missing', { languages: untranslatedNames(broadcast, language) })
            : broadcast.translations.length === 0
              ? t(broadcast.status === 'DRAFT' ? 'admin.broadcast.translations.none.draft' : 'admin.broadcast.translations.none.prepared')
              : null,
      };
    case 'audience': {
      const known = broadcast.status !== 'DRAFT';
      const inApp = preview?.inAppRecipients ?? null;
      return {
        values: [
          v('admin.broadcast.card.byEmail', known ? count(recipientsToReach(broadcast, preview, 'email')) : '—'),
          v('admin.broadcast.card.inApp', inApp === null ? '—' : count(inApp)),
        ],
        sentence: audienceSentence(broadcast.targeting, language),
      };
    }
    case 'email': {
      const started = STARTED.includes(broadcast.status);
      return {
        values: started ? [v('admin.broadcast.stat.sent', count(broadcast.sentCount)), v('admin.broadcast.stat.failed', count(broadcast.failedCount))] : [],
        sentence: started ? null : t('admin.broadcast.email.notSent'),
      };
    }
    case 'inApp': {
      const state = inAppStateOf(broadcast);
      return {
        values:
          state === 'never'
            ? []
            : [v('admin.broadcast.inApp.sent', count(broadcast.inAppSentCount)), v('admin.broadcast.inApp.failed', count(broadcast.inAppFailedCount))],
        sentence: t(IN_APP_STATE_KEYS[state]),
      };
    }
    case 'people':
      return {
        values: [
          v('admin.broadcast.people.createdBy', broadcast.createdBy === null ? t('admin.broadcast.people.unknown') : personLabel(broadcast.createdBy, language)),
        ],
        sentence: null,
      };
  }
}
