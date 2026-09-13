import { resolveConversationSections, type ConversationSection, type SectionableConversation } from '@meeshy/shared/utils/conversation-sections';

import { effectiveFlagsOf, type ConversationOverride } from '@/lib/conversation-store';
import type { Conversation } from '@/lib/api/types';

/**
 * LES SECTIONS DE LA LENTILLE (#5694, écart 6) — REPREND `resolveConversationSections`
 * de `@meeshy/shared`, LA loi partagée (§1.1 de la spécification), plutôt que
 * de la réécrire : c'est exactement le dispositif que `lens/filters.ts::orderConversations`
 * emploie déjà pour le TRI, ici étendu au PARTITIONNEMENT.
 *
 * `categories: []` TOUJOURS (§3 de la spécification — aucune catégorie n'est
 * câblée côté web-v2 cette itération) : un `categoryId` qui existerait sur le
 * wire retombe alors mécaniquement sur le temporel, exactement le repli que
 * la loi documente pour une catégorie inconnue (`conversation-sections.ts`
 * commentaire de `classify`). `liveCall` n'est jamais posé non plus — AUCUNE
 * plateforme du dépôt ne le modélise encore (même garde que
 * `SectionableConversation.liveCall`, `conversation-sections.ts:44-48`).
 *
 * Identité des sections — `Lentille/Chrome/LentilleSectionIdentity.swift:54-66` :
 * `pinned`, `lentille.live`, `lentille.today`, `lentille.yesterday`,
 * `lentille.thisWeek`, `lentille.older`. Le préfixe `lentille.` marque les
 * sections NI repliables NI cibles de drop (`:479-485`) — la seule qui y
 * échappe est `pinned`, brute.
 */
export type LensSectionId =
  | 'pinned'
  | 'lentille.live'
  | 'lentille.today'
  | 'lentille.yesterday'
  | 'lentille.thisWeek'
  | 'lentille.older';

export type LensSection = {
  readonly id: LensSectionId;
  readonly conversations: readonly Conversation[];
};

const SECTION_ID: Record<Exclude<ConversationSection['kind'], 'category'>, LensSectionId> = {
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
 * `lens-sticker.tsx`), jamais de la donnée : une section porte son nom
 * lisible, le rendu décide de le crier ou non.
 */
const SECTION_LABEL: Readonly<Record<LensSectionId, string>> = {
  pinned: 'Épingles',
  'lentille.live': 'En direct',
  'lentille.today': "Aujourd'hui",
  'lentille.yesterday': 'Hier',
  'lentille.thisWeek': 'Cette semaine',
  'lentille.older': 'Plus ancien',
};

export function sectionLabelOf(id: LensSectionId): string {
  return SECTION_LABEL[id];
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
  return {
    id: conversation.id,
    isPinned: effectiveFlagsOf(conversation, overrides).isPinned,
    // `exactOptionalPropertyTypes` : n'écrire la clé QUE si elle a une valeur
    // (même garde que `filters.ts::orderConversations`).
    ...(conversation.lastMessageAt === undefined ? {} : { lastMessageAt: conversation.lastMessageAt }),
    updatedAt: conversation.updatedAt,
  };
}

/**
 * `resolveLensSections` — partitionne `conversations` (déjà FILTRÉES par
 * `applyFilter`, §1.1 de la spécification : recherche et corpus archivé sont
 * réglés AVANT le sectionnement) en sections ORDONNÉES et non vides.
 * `now`/`timeZone` sont INJECTÉS par l'appelant (la peau) — jamais lus ici.
 */
export function resolveLensSections(params: {
  readonly conversations: readonly Conversation[];
  readonly overrides: Overrides;
  readonly now: Date;
  readonly timeZone: string;
}): readonly LensSection[] {
  const { conversations, overrides, now, timeZone } = params;
  const byId = new Map(conversations.map((c) => [c.id, c] as const));
  const sectionable = conversations.map((c) => toSectionable(c, overrides));
  const sections = resolveConversationSections({ conversations: sectionable, categories: [], now, locale: 'fr-FR', timeZone });

  return sections.flatMap((section): readonly LensSection[] => {
    // `categories: []` en entrée : la loi n'émet jamais `kind: 'category'`
    // ici (aucune catégorie déclarée ne peut donc jamais matcher) — la garde
    // rend ce cas IMPOSSIBLE à l'exécution plutôt que de laisser
    // `SECTION_ID[section.kind]` échouer silencieusement en TypeScript non
    // strict.
    if (section.kind === 'category') return [];
    return [
      {
        id: SECTION_ID[section.kind],
        conversations: section.conversations
          .map((s) => byId.get(s.id))
          .filter((c): c is Conversation => c !== undefined),
      },
    ];
  });
}
