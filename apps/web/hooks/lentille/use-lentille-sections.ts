/**
 * Adaptateur `Conversation` web → `resolveConversationSections` — WL-103
 * (LWS-10).
 *
 * Miroir du même geste que `useConversationSorting.ts` (historique,
 * INTERDIT d'édition ici : fichier hors périmètre LWS-10) : `isPinned` /
 * `categoryId` / `orderInCategory` viennent TOUJOURS de
 * `preferencesMap.get(conversation.id)` (`UserConversationPreferences`),
 * jamais d'un champ de `Conversation` — re-prouvé, elle n'en porte aucun.
 * `liveCall` reste `null` : aucune plateforme ne porte cette donnée
 * aujourd'hui (LWS-2bis, `ConversationLiveCallProviding` — hors périmètre
 * WL-102..105), donc la section `live` est structurellement vide tant que
 * ce provider n'est pas câblé — jamais une section fabriquée.
 *
 * DIFFÉRENCE avec `useConversationSorting` (E5) : celui-ci délègue à la loi
 * NEUVE `resolveConversationSections` (LWS-1, `pinned → live → catégorie →
 * temporel`), pas au groupement historique `pinned/category/uncategorized`
 * (sans bornes temporelles) que consomme le rendu hors-drapeau.
 */
'use client';

import { useMemo } from 'react';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationCategory, UserConversationPreferences } from '@meeshy/shared/types/user-preferences';
import {
  resolveConversationSections,
  type SectionableCategory,
  type SectionableConversation,
} from '@meeshy/shared/utils/conversation-sections';

export type LentilleSectionKind =
  | 'pinned'
  | 'live'
  | 'category'
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'older';

export type LentilleSection = {
  readonly kind: LentilleSectionKind;
  readonly categoryId?: string;
  readonly conversations: readonly Conversation[];
};

export interface UseLentilleSectionsParams {
  readonly conversations: readonly Conversation[];
  readonly preferencesMap: ReadonlyMap<string, UserConversationPreferences>;
  readonly categories: readonly UserConversationCategory[];
  readonly now: Date;
  readonly locale: string;
  readonly timeZone: string;
}

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
};

export function useLentilleSections({
  conversations,
  preferencesMap,
  categories,
  now,
  locale,
  timeZone,
}: UseLentilleSectionsParams): readonly LentilleSection[] {
  return useMemo(() => {
    const byId = new Map(conversations.map((conversation) => [conversation.id, conversation] as const));

    const sectionable: SectionableConversation[] = conversations.map((conversation) => {
      const prefs = preferencesMap.get(conversation.id);
      return {
        id: conversation.id,
        isPinned: prefs?.isPinned ?? false,
        categoryId: prefs?.categoryId ?? null,
        orderInCategory: prefs?.orderInCategory ?? null,
        lastMessageAt: toDate(conversation.lastMessageAt),
        updatedAt: toDate((conversation as { updatedAt?: Date | string }).updatedAt) ?? new Date(0),
        liveCall: null,
      };
    });

    const orderedCategories = [...categories].sort((a, b) => a.order - b.order);
    const sectionableCategories: SectionableCategory[] = orderedCategories.map((category) => ({ id: category.id }));

    const sections = resolveConversationSections({
      conversations: sectionable,
      categories: sectionableCategories,
      now,
      locale,
      timeZone,
    });

    return sections.map((section) => ({
      kind: section.kind,
      categoryId: section.kind === 'category' ? section.categoryId : undefined,
      conversations: section.conversations
        .map((entry) => byId.get(entry.id))
        .filter((conversation): conversation is Conversation => conversation !== undefined),
    }));
  }, [conversations, preferencesMap, categories, now, locale, timeZone]);
}
