import type { AdminSummaryValue } from '@/components/admin/summary-card';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import type { AdminPostFiche, AdminPostStory } from '@/lib/api/admin-posts-detail';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';

import { languageName, sentenceCase } from './interpret/language';
import { personLabel } from './interpret/labels';
import { formatCount } from './interpret/numbers';
import { formatDuration } from './interpret/time';
import { translationsPhrase } from './post-phrases';

/**
 * **LA FICHE D'UNE PUBLICATION, EN CARTES** (spec 2026-10-04 § 3, lot « Échanges
 * et contenus ») — l'en-tête, le geste « Retirer », les six compteurs et les
 * métadonnées restent visibles ; contenu, médias, auteur et contexte, audience et
 * réactions, effets de la story, commentaires et spectateurs deviennent des
 * cartes résumées qui ouvrent leur section dans une modale (`?open=<id>`).
 *
 * Les cartes Médias et Story n'existent que si la publication en a. Tout vient de
 * la fiche déjà lue.
 */
export const ADMIN_POST_SECTIONS = ['content', 'media', 'context', 'engagement', 'story', 'comments', 'viewers'] as const;

export type AdminPostSection = (typeof ADMIN_POST_SECTIONS)[number];

export const ADMIN_POST_SECTION_TITLES = {
  content: 'admin.posts.section.content',
  media: 'admin.posts.section.media',
  context: 'admin.posts.section.context',
  engagement: 'admin.posts.section.engagement',
  story: 'admin.posts.section.story',
  comments: 'admin.posts.section.comments',
  viewers: 'admin.posts.section.viewers',
} as const satisfies Readonly<Record<AdminPostSection, AdminPlainCatalogKey>>;

export const ADMIN_POST_SECTION_GLYPHS = {
  content: 'scroll',
  media: 'image',
  context: 'user',
  engagement: 'chartBar',
  story: 'lightning',
  comments: 'chats',
  viewers: 'eye',
} as const satisfies Readonly<Record<AdminPostSection, AdminGlyphName>>;

/** Les sections que CETTE publication a : pas de carte Médias sans média, pas de carte Story sans effets. */
export function postSectionsOf(fiche: AdminPostFiche): readonly AdminPostSection[] {
  return ADMIN_POST_SECTIONS.filter((section) => (section === 'media' ? fiche.media.length > 0 : section === 'story' ? fiche.story !== null : true));
}

const TEXT_STYLES = {
  bold: 'admin.posts.story.textStyle.bold',
  neon: 'admin.posts.story.textStyle.neon',
  typewriter: 'admin.posts.story.textStyle.typewriter',
  handwriting: 'admin.posts.story.textStyle.handwriting',
} as const satisfies Readonly<Record<string, AdminPlainCatalogKey>>;

const FILTERS = {
  vintage: 'admin.posts.story.filter.vintage',
  bw: 'admin.posts.story.filter.bw',
  warm: 'admin.posts.story.filter.warm',
  cool: 'admin.posts.story.filter.cool',
  dramatic: 'admin.posts.story.filter.dramatic',
} as const satisfies Readonly<Record<string, AdminPlainCatalogKey>>;

const LAYOUTS = {
  wave: 'admin.posts.story.layout.wave',
  hero: 'admin.posts.story.layout.hero',
  reel: 'admin.posts.story.layout.reel',
  sine: 'admin.posts.story.layout.sine',
  carousel: 'admin.posts.story.layout.carousel',
} as const satisfies Readonly<Record<string, AdminPlainCatalogKey>>;

const keyOf = (table: Readonly<Record<string, AdminPlainCatalogKey>>, value: string): AdminPlainCatalogKey | null =>
  Object.prototype.hasOwnProperty.call(table, value) ? (table[value] ?? null) : null;

/**
 * LE STYLE D'UNE STORY, NOMMÉ — style de texte, filtre, disposition, chacun en mots
 * (jamais `neon`, `bw`, `hero`). Une valeur que l'écran ne connaît pas se dit
 * « autre », jamais telle que servie.
 */
export function storyStyleWords(story: AdminPostStory, language: AdminLanguage): readonly string[] {
  const word = (table: Readonly<Record<string, AdminPlainCatalogKey>>, raw: string | null): readonly string[] =>
    raw === null ? [] : [translateAdmin(language, keyOf(table, raw) ?? 'admin.posts.story.styleOther')];
  return [...word(TEXT_STYLES, story.textStyle), ...word(FILTERS, story.filter), ...word(LAYOUTS, story.layout)];
}

export function postSummaryOf(
  section: AdminPostSection,
  fiche: AdminPostFiche,
  language: AdminLanguage,
): { readonly values: readonly AdminSummaryValue[]; readonly sentence: string | null } {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const v = (label: AdminPlainCatalogKey, value: string): AdminSummaryValue => ({ label: t(label), value });

  switch (section) {
    case 'content':
      return {
        values: [
          v(
            'admin.posts.content.language',
            fiche.originalLanguage === null ? t('admin.posts.content.languageUnknown') : sentenceCase(languageName(fiche.originalLanguage, language), language),
          ),
        ],
        sentence:
          fiche.audio === null
            ? translationsPhrase(fiche.translationCount, language)
            : `${translationsPhrase(fiche.translationCount, language)} · ${translateAdmin(language, 'admin.posts.audio.withTrack', { duration: formatDuration(fiche.audio.durationMs, 'ms', language) })}`,
      };
    case 'media':
      return { values: [v('admin.posts.section.media', formatCount(fiche.media.length, language))], sentence: null };
    case 'context':
      return {
        values: [
          v('admin.posts.context.author', personLabel(fiche.author, language)),
          ...(fiche.community === null ? [] : [v('admin.posts.context.community', fiche.community.name)]),
        ],
        sentence: fiche.repostOf === null ? null : t(fiche.isQuote ? 'admin.posts.context.repostQuote' : 'admin.posts.context.repostSimple'),
      };
    case 'engagement':
      return {
        values: [
          v('admin.posts.metric.reactions', formatCount(fiche.reactionTally.total, language)),
          v('admin.posts.metric.impressions', formatCount(fiche.metrics.impressions, language)),
          v('admin.posts.metric.opens', formatCount(fiche.metrics.opens, language)),
          v('admin.posts.metric.qualifiedViews', formatCount(fiche.metrics.qualifiedViews, language)),
        ],
        sentence: null,
      };
    case 'story': {
      const story = fiche.story;
      if (story === null) return { values: [], sentence: null };
      const style = storyStyleWords(story, language);
      return {
        values: [
          v('admin.posts.story.stickers', formatCount(story.stickerCount, language)),
          v('admin.posts.story.link', story.linkDomain ?? t('admin.posts.story.noLink')),
        ],
        sentence: style.length === 0 ? null : style.join(' · '),
      };
    }
    case 'comments':
      return { values: [v('admin.posts.stat.comments', formatCount(fiche.commentTotal, language))], sentence: null };
    case 'viewers':
      return { values: [v('admin.posts.card.viewers', formatCount(fiche.viewerTotal, language))], sentence: null };
  }
}
