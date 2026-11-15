import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { SECTION_CARD_STYLE, SECTION_INK } from '@/components/grouped-section';
import { translateMembership } from '@/lib/i18n-community-membership-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES DEUX ONGLETS DU DÉTAIL** (#6379) — miroir du `Picker(.segmented)` de
 * `CommunityDetailScreen.swift` : Conversations, puis Publications. Une liste
 * d'onglets (`role="tablist"`), un seul arrêt de tabulation, les flèches (et
 * Début / Fin) pour passer de l'un à l'autre, sens de lecture respecté, cibles
 * de 44 px.
 */
export type CommunityDetailTab = 'channels' | 'posts';

const TABS: readonly CommunityDetailTab[] = ['channels', 'posts'];

export const communityTabId = (tab: CommunityDetailTab): string => `community-tab-${tab}`;
export const communityPanelId = (tab: CommunityDetailTab): string => `community-panel-${tab}`;

export function CommunityDetailTabs({
  language,
  selected,
  onSelect,
}: {
  readonly language: InterfaceLanguage;
  readonly selected: CommunityDetailTab;
  readonly onSelect: (tab: CommunityDetailTab) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const current = TABS.indexOf(selected);
    const rtl = document.documentElement.dir === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, Home: -current, End: TABS.length - 1 - current }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (current + step + TABS.length) % TABS.length;
    const target = TABS[next];
    if (target === undefined) return;
    onSelect(target);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={translateMembership(language, 'community.posts.tabs.label')}
      onKeyDown={onKeyDown}
      data-community-tabs
      className="grid grid-cols-2 gap-1 rounded-chip p-1"
      style={SECTION_CARD_STYLE}
    >
      {TABS.map((tab, index) => {
        const isSelected = tab === selected;
        return (
          <button
            key={tab}
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={communityTabId(tab)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={communityPanelId(tab)}
            tabIndex={isSelected ? 0 : -1}
            data-community-tab={tab}
            onClick={() => onSelect(tab)}
            className="rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              color: isSelected ? 'var(--color-ios-on-brand)' : SECTION_INK,
              backgroundColor: isSelected ? 'var(--ios-indigo-600)' : 'transparent',
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            {translateMembership(language, tab === 'channels' ? 'community.posts.tab.channels' : 'community.posts.tab.posts')}
          </button>
        );
      })}
    </div>
  );
}
