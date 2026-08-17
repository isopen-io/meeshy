/**
 * Point de montage de la peau Lentille — WL-102/WL-103/WL-104 (LWS-10).
 *
 * Remplace le placeholder de WL-101 (voir historique git) : rang plat
 * (`LentilleRow`), sectionnement (`resolveConversationSections` via
 * `useLentilleSections`), stickers sticky (`LentilleSticker`), pilule de
 * défilement (`SectionScrollPill`, pilotée par `useScrollActivity` —
 * `scrollActivityLaw` partagée), rail vivants (`LivesRail`), squelette
 * (`LentilleSkeletonRow`, affiché uniquement cache vide), perspective de
 * liste (`useLentillePerspective` — `focusCurve('list', …)` partagée) et
 * ÉLECTION de la focus card (WL-108, `electFocusRow` — même hook, même
 * passe rAF, aucun observateur de défilement supplémentaire).
 *
 * Ce composant n'est monté QUE sous drapeau Lentille actif (mux
 * `next/dynamic` de `ConversationList.tsx`, WL-101) — aucun `useQuery` ici
 * ni dans aucun fichier de ce dossier (garde de contrat LWS-10).
 *
 * Le LIBELLÉ de la pilule (quelle section est active) n'est PAS gouverné
 * par une loi partagée — c'est de la présentation pure, elle vit ici en
 * dur : `updateActiveSection` compare les positions des stickers au bord
 * haut du conteneur de défilement.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import type { UserConversationCategory, UserConversationPreferences } from '@meeshy/shared/types/user-preferences';
import { useLentilleListTyping } from '@/hooks/lentille/use-lentille-list-typing';
import { useLentilleSections, type LentilleSection } from '@/hooks/lentille/use-lentille-sections';
import { useLentilleBridges } from '@/hooks/lentille/use-lentille-bridges';
import { useScrollActivity } from '@/hooks/lentille/use-scroll-activity';
import { useLentillePerspective } from '@/hooks/lentille/use-lentille-perspective';
import { useConversationUIStore } from '@/stores/conversation-ui-store';
import { ConversationListLoadMore } from '../conversation-groups/ConversationListLoadMore';
import { EmptyConversations } from '../conversation-groups/EmptyConversations';
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
  /**
   * REV-4/B2 — la recherche courante, transmise telle quelle à la branche
   * vide HISTORIQUE (`EmptyConversations`), qui distingue « aucun résultat
   * pour cette recherche » d'« aucune conversation ». La peau ne réinvente
   * pas cette distinction : elle monte le même composant.
   */
  searchQuery?: string;
  /** REV-4/B2 — pagination : les mêmes drapeaux que le chemin historique. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /**
   * Ref-setter de l'UNIQUE observateur de pagination
   * (`useLoadMoreSentinel`, chez `ConversationList`) — la peau porte la
   * CIBLE, jamais un second observateur.
   */
  loadMoreSentinelRef?: (element: HTMLDivElement | null) => void;
}

const SKELETON_ROW_COUNT = 8;

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
  searchQuery = '',
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  loadMoreSentinelRef,
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
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(
    sections[0] ? sectionKey(sections[0]) : null
  );

  // WL-104 — visibilité de la pilule pilotée par `scrollActivityLaw` (loi
  // partagée avec le futur Focal web), plus de minuteur ad hoc local.
  const { visible: pillVisible, notifyScrolled } = useScrollActivity();

  // WL-104 — UN SEUL requestAnimationFrame sur le conteneur de défilement,
  // qui écrit opacity/transform sur le wrapper interne de chaque rang
  // (`focusCurve('list', …)`, jamais recopiée).
  // WL-108 — `election` est un magasin à RÉFÉRENCE STABLE : le passer à
  // chaque rang ne provoque aucun re-rendu, et l'élu ne vit JAMAIS dans
  // l'état de ce composant (sinon les vingt rangs se re-rendraient à chaque
  // rang franchi — voir `lentille-focus-election.ts`).
  const { registerRow, election } = useLentillePerspective({ containerRef: scrollContainerRef });

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
    scrollContainerRef.current = root;

    const handleScroll = () => {
      notifyScrolled();
      updateActiveSection(root);
    };

    root.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', handleScroll);
    };
  }, [notifyScrolled, updateActiveSection]);

  const activeSection = sections.find((section) => sectionKey(section) === activeSectionKey) ?? sections[0];
  const activeSectionLabel = activeSection ? sectionLabel(activeSection, categories, t) : '';

  const showSkeleton = isLoading && conversations.length === 0;
  // REV-4/B2 — même prédicat que `renderContent` (« zéro conversation après
  // filtrage »), même composant, même distinction recherche/vide.
  const showEmptyBranch = !showSkeleton && conversations.length === 0;

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
      ) : showEmptyBranch ? (
        // behaviour-matrix:L17 — la branche vide HISTORIQUE, montée telle
        // quelle : c'est le même résolveur de message (recherche vs vide), le
        // même marquage, la même i18n. Le drapeau change la peau des rangs,
        // jamais ce que la liste dit quand elle n'a rien à montrer.
        <EmptyConversations searchQuery={searchQuery} t={t as (key: string) => string} />
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
                  perspectiveRef={registerRow(conversation.id)}
                  election={election}
                />
              ))}
            </div>
          );
        })
      )}

      {/* behaviour-matrix:L17 — le pied de pagination historique, monté par
          la peau : même bouton, même indicateur, même CIBLE de sentinelle.
          L'observateur reste unique et vit chez `ConversationList`
          (`useLoadMoreSentinel`) — la peau n'en possède que la cible. */}
      {!showSkeleton && !showEmptyBranch && (
        <ConversationListLoadMore
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
          t={t as (key: string) => string}
          sentinelRef={loadMoreSentinelRef}
        />
      )}
    </div>
  );
}

export default LentilleConversationListMount;
