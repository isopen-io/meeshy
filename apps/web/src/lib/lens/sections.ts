import { resolveConversationSections, type ConversationSection, type SectionableConversation } from '@meeshy/shared/utils/conversation-sections';

import { effectiveFlagsOf, type ConversationOverride } from '@/lib/conversation-store';
import { listRankField } from '@/lib/api/list-preview';
import { categoryIdOf } from '@/lib/api/preferences';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { Conversation } from '@/lib/api/types';

/**
 * LES SECTIONS DE LA LENTILLE (#5694, écart 6) — REPREND `resolveConversationSections`
 * de `@meeshy/shared`, LA loi partagée (§1.1 de la spécification), plutôt que
 * de la réécrire : c'est exactement le dispositif que `lens/filters.ts::orderConversations`
 * emploie déjà pour le TRI, ici étendu au PARTITIONNEMENT.
 *
 * LES CATÉGORIES DE L'UTILISATEUR ENTRENT (#10103). Celles qu'il a créées
 * (`GET /me/categories`, `lib/api/conversation-categories.ts`) arrivent ici
 * DANS L'ORDRE qu'il leur a donné ; une conversation rangée
 * (`userPreferences[0].categoryId`) y tombe, les autres retombent sur les
 * sections par date. Une catégorie inconnue (supprimée, pas encore chargée)
 * retombe sur le temporel — le repli que la loi documente (`classify`).
 * `liveCall` n'est jamais posé : AUCUNE plateforme du dépôt ne le modélise
 * encore (même garde que `SectionableConversation.liveCall`).
 *
 * Identité des sections — `Lentille/Chrome/LentilleSectionIdentity.swift:54-66` :
 * `pinned`, `lentille.live`, `lentille.today`, `lentille.yesterday`,
 * `lentille.thisWeek`, `lentille.older` ; une catégorie est `category:<id>`
 * (iOS prend l'identifiant nu — le préfixe ne sert ici qu'à ce qu'aucun
 * identifiant de catégorie ne puisse jamais se confondre avec une section
 * calculée).
 */
export type FixedLensSectionId =
  | 'pinned'
  | 'lentille.live'
  | 'lentille.today'
  | 'lentille.yesterday'
  | 'lentille.thisWeek'
  | 'lentille.older';

export type LensSectionId = FixedLensSectionId | `category:${string}`;

/** Ce que la section d'une catégorie sait d'elle : son nom (rendu tel que
 * l'utilisateur l'a écrit) et la préférence serveur de son pliage. */
export type LensSectionCategory = {
  readonly id: string;
  readonly name: string;
  readonly isExpanded: boolean;
};

export type LensSection = {
  readonly id: LensSectionId;
  readonly conversations: readonly Conversation[];
  readonly category?: LensSectionCategory;
};

const SECTION_ID: Record<Exclude<ConversationSection['kind'], 'category'>, FixedLensSectionId> = {
  pinned: 'pinned',
  live: 'lentille.live',
  today: 'lentille.today',
  yesterday: 'lentille.yesterday',
  thisWeek: 'lentille.thisWeek',
  older: 'lentille.older',
};

/**
 * Libellés en CASSE NORMALE (`LentilleSectionIdentity.swift:127-138`) — la
 * MAJUSCULE est le fait du STICKER (`textTransform: uppercase`,
 * `lens-sticker.tsx`), jamais de la donnée. Les sept langues reprennent mot
 * pour mot le vocabulaire d'iOS (`lentille.section.*`, `Localizable.xcstrings`).
 */
const SECTION_LABEL_KEY = {
  pinned: 'lensSection.label.pinned',
  'lentille.live': 'lensSection.label.live',
  'lentille.today': 'lensSection.label.today',
  'lentille.yesterday': 'lensSection.label.yesterday',
  'lentille.thisWeek': 'lensSection.label.thisWeek',
  'lentille.older': 'lensSection.label.older',
} as const satisfies Readonly<Record<FixedLensSectionId, InterfaceCatalogKey>>;

const isFixedSectionId = (id: LensSectionId): id is FixedLensSectionId => id in SECTION_LABEL_KEY;

/** Le nom d'une section : celui que l'utilisateur a donné à sa catégorie, ou
 * le libellé de la section calculée dans la langue de l'interface. */
export function lensSectionLabel(
  section: { readonly id: LensSectionId; readonly category?: { readonly name: string } },
  language: InterfaceLanguage,
): string {
  if (section.category !== undefined) return section.category.name;
  return isFixedSectionId(section.id) ? translate(language, SECTION_LABEL_KEY[section.id]) : section.id;
}

type Overrides = Readonly<Record<string, ConversationOverride>>;

/**
 * L'ADAPTATEUR — projette `Conversation` (wire) sur `SectionableConversation`
 * (loi), `isPinned` portant les flags EFFECTIFS (wire fusionné à l'override
 * optimiste) : une conversation épinglée localement, avant confirmation
 * serveur, doit déjà migrer vers `pinned` — le même point que
 * `filters.ts::orderConversations` documente pour le tri.
 */
function toSectionable(conversation: Conversation, overrides: Overrides): SectionableConversation {
  const categoryId = categoryIdOf(conversation);
  return {
    id: conversation.id,
    isPinned: effectiveFlagsOf(conversation, overrides).isPinned,
    // `exactOptionalPropertyTypes` : n'écrire la clé QUE si elle a une valeur
    // (même garde que `filters.ts::orderConversations`).
    ...(categoryId === undefined ? {} : { categoryId }),
    // LE RANG SERVI (#7592) : max(rang du lecteur, `lastMessageAt`).
    ...listRankField(conversation),
    updatedAt: conversation.updatedAt,
  };
}

const NO_CATEGORIES: readonly LensSectionCategory[] = [];

/**
 * `resolveLensSections` — partitionne `conversations` (déjà FILTRÉES par
 * `applyFilter`, §1.1 de la spécification : recherche et corpus archivé sont
 * réglés AVANT le sectionnement) en sections ORDONNÉES et non vides.
 * `categories` arrive dans l'ordre DÉCLARÉ par l'utilisateur.
 * `now`/`timeZone` sont INJECTÉS par l'appelant (la peau) — jamais lus ici.
 */
export function resolveLensSections(params: {
  readonly conversations: readonly Conversation[];
  readonly overrides: Overrides;
  readonly categories?: readonly LensSectionCategory[];
  readonly now: Date;
  readonly timeZone: string;
}): readonly LensSection[] {
  const { conversations, overrides, now, timeZone } = params;
  const categories = params.categories ?? NO_CATEGORIES;
  const categoryById = new Map(categories.map((c) => [c.id, c] as const));
  const byId = new Map(conversations.map((c) => [c.id, c] as const));
  const sectionable = conversations.map((c) => toSectionable(c, overrides));
  const sections = resolveConversationSections({ conversations: sectionable, categories, now, locale: 'fr-FR', timeZone });
  const conversationsOf = (section: ConversationSection): readonly Conversation[] =>
    section.conversations.map((s) => byId.get(s.id)).filter((c): c is Conversation => c !== undefined);

  return sections.flatMap((section): readonly LensSection[] => {
    if (section.kind !== 'category') return [{ id: SECTION_ID[section.kind], conversations: conversationsOf(section) }];
    const category = categoryById.get(section.categoryId);
    if (category === undefined) return [];
    return [
      {
        id: `category:${category.id}`,
        conversations: conversationsOf(section),
        category: { id: category.id, name: category.name, isExpanded: category.isExpanded },
      },
    ];
  });
}
