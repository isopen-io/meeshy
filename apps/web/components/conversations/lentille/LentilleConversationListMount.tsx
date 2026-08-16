/**
 * Point de montage de la peau Lentille — WL-102/WL-103 (LWS-10).
 *
 * Remplace le placeholder de WL-101 (voir historique git) : rang plat
 * (`LentilleRow`), sectionnement (`resolveConversationSections` via
 * `useLentilleSections`), stickers sticky (`LentilleSticker`), pilule de
 * défilement (`SectionScrollPill`), rail vivants (`LivesRail`), squelette
 * (`LentilleSkeletonRow`, affiché uniquement cache vide).
 *
 * Ce composant n'est monté QUE sous drapeau Lentille actif (mux
 * `next/dynamic` de `ConversationList.tsx`, WL-101) — aucun `useQuery` ici
 * ni dans aucun fichier de ce dossier (garde de contrat LWS-10).
 *
 * Pilule de défilement — WIRING TEMPORAIRE (documenté, contrat WL-103) :
 * la VISIBILITÉ suit un minuteur local 900 ms posé ICI en attendant
 * `useScrollActivity` (WL-104, `scrollActivityLaw` partagée) qui la
 * remplacera au commit suivant SANS changer le rendu. Le LIBELLÉ (quelle
 * section est active) n'est PAS gouverné par une loi partagée — c'est de la
 * présentation pure, elle reste ici définitivement.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import type { UserConversationCategory, UserConversationPreferences } from '@meeshy/shared/types/user-preferences';
import { useLentilleListTyping } from '@/hooks/lentille/use-lentille-list-typing';
import { useLentilleSections, type LentilleSection } from '@/hooks/lentille/use-lentille-sections';
import { useLentilleBridges } from '@/hooks/lentille/use-lentille-bridges';
import { useConversationUIStore } from '@/stores/conversation-ui-store';
import { LentilleRow, type LentilleRowTranslate } from './LentilleRow';
import { LentilleSticker } from './LentilleSticker';
import { SectionScrollPill } from './SectionScrollPill';
import { LivesRail, type LentilleLiveEntry } from './LivesRail';
import { LentilleSkeletonRow } from './LentilleSkeletonRow';

export interface LentilleConversationListMountProps {
  /** Utilisateur courant — sert à ignorer son propre écho typing, et de lecteur pour le Prisme/le pont. */
  currentUserId: string | null | undefined;
  currentUser: User;
  conversations: readonly Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversation: Conversation) => void;
  preferencesMap: ReadonlyMap<string, UserConversationPreferences>;
  categories: readonly UserConversationCategory[];
  /** Chargement initial — le squelette n'apparaît QUE si aucune conversation n'est encore en cache. */
  isLoading: boolean;
  t: LentilleRowTranslate;
}

const SKELETON_ROW_COUNT = 8;

/** Fenêtre de linger de la pilule — TEMPORAIRE, voir en-tête (remplacé WL-104). */
const TEMP_PILL_LINGER_MS = 900;

function sectionKey(section: LentilleSection): string {
  return section.kind === 'category' ? `category-${section.categoryId}` : section.kind;
}

function sectionLabel(section: LentilleSection, categories: readonly UserConversationCategory[], t: LentilleRowTranslate): string {
  if (section.kind === 'category') {
    return categories.find((category) => category.id === section.categoryId)?.name ?? '';
  }
  return t(`lentille.sections.${section.kind}`);
}

/**
 * Résout le pont d'un rang — `conversation.bridge` (le fil, une fois LWS-4
 * livré côté gateway) est PRIORITAIRE ; `bridgesByConversation` (substitut
 * local, `useLentilleBridges`) est le repli honnête tant qu'il ne l'est pas.
 * Le champ n'existe pas encore sur le type `Conversation` du web (re-prouvé,
 * LWS-2 ne l'a porté que côté SDK Swift) — lu ici de façon défensive plutôt
 * que d'étendre un type possédé par un autre workstream.
 */
function resolveRowBridge(
  conversation: Conversation,
  bridgesByConversation: ReadonlyMap<string, ConversationBridge | null>
): ConversationBridge | null | undefined {
  const wireBridge = (conversation as { bridge?: ConversationBridge }).bridge;
  return wireBridge ?? bridgesByConversation.get(conversation.id) ?? null;
}

export function LentilleConversationListMount({
  currentUserId,
  currentUser,
  conversations,
  selectedConversationId,
  onSelectConversation,
  preferencesMap,
  categories,
  isLoading,
  t,
}: LentilleConversationListMountProps) {
  const typingByConversation = useLentilleListTyping(currentUserId);
  const draftMessages = useConversationUIStore((state) => state.draftMessages);

  const now = useMemo(() => new Date(), []);
  const locale = useMemo(() => (typeof navigator !== 'undefined' ? navigator.language : 'en'), []);
  const timeZone = useMemo(
    () => (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
    []
  );

  const sections = useLentilleSections({ conversations, preferencesMap, categories, now, locale, timeZone });
  const bridgesByConversation = useLentilleBridges(conversations, currentUserId);

  const liveSection = sections.find((section) => section.kind === 'live');
  const liveEntries: readonly LentilleLiveEntry[] = useMemo(
    () =>
      (liveSection?.conversations ?? []).map((conversation) => ({
        id: conversation.id,
        name: conversation.title || 'Conversation',
        avatarUrl: conversation.avatar || conversation.image,
        isLive: true,
      })),
    [liveSection]
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const [pillVisible, setPillVisible] = useState(false);
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(
    sections[0] ? sectionKey(sections[0]) : null
  );

  const updateActiveSection = useCallback(
    (root: HTMLElement) => {
      const rootTop = root.getBoundingClientRect().top;
      let current: string | null = null;
      for (const section of sections) {
        const el = sectionRefs.current.get(sectionKey(section));
        if (!el) continue;
        if (el.getBoundingClientRect().top - rootTop <= 0) {
          current = sectionKey(section);
        }
      }
      setActiveSectionKey(current ?? (sections[0] ? sectionKey(sections[0]) : null));
    },
    [sections]
  );

  useEffect(() => {
    const root = rootRef.current?.parentElement;
    if (!root) return;

    let dismissTimer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      setPillVisible(true);
      updateActiveSection(root);
      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = setTimeout(() => setPillVisible(false), TEMP_PILL_LINGER_MS);
    };

    root.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', handleScroll);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, [updateActiveSection]);

  const activeSection = sections.find((section) => sectionKey(section) === activeSectionKey) ?? sections[0];
  const activeSectionLabel = activeSection ? sectionLabel(activeSection, categories, t) : '';

  const showSkeleton = isLoading && conversations.length === 0;

  return (
    <div ref={rootRef} data-testid="lentille-list-mount">
      {sections.length > 0 && (
        <SectionScrollPill label={activeSectionLabel} visible={pillVisible} />
      )}

      <LivesRail entries={liveEntries} label={t('lentille.sections.live')} />

      {showSkeleton ? (
        <div role="status" aria-busy="true" aria-label={t('loadingConversations')} data-testid="lentille-list-skeleton">
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
            <LentilleSkeletonRow key={index} />
          ))}
        </div>
      ) : (
        sections.map((section) => {
          const key = sectionKey(section);
          return (
            <div
              key={key}
              ref={(el) => {
                if (el) sectionRefs.current.set(key, el);
                else sectionRefs.current.delete(key);
              }}
            >
              <LentilleSticker label={sectionLabel(section, categories, t)} />
              {section.conversations.map((conversation) => (
                <LentilleRow
                  key={conversation.id}
                  conversation={conversation}
                  currentUser={currentUser}
                  isSelected={selectedConversationId === conversation.id}
                  onClick={() => onSelectConversation(conversation)}
                  typingUsers={typingByConversation.get(conversation.id)}
                  draft={draftMessages[conversation.id]}
                  bridge={resolveRowBridge(conversation, bridgesByConversation)}
                  t={t}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

export default LentilleConversationListMount;
