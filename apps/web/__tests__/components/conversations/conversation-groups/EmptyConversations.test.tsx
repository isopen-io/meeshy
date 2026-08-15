/**
 * W9-003 (Lentille LWS-9, écart E14) — regression guard.
 *
 * `EmptyConversations` receives `t` as an injected prop. Tracing the injection:
 * `ConversationLayout` → `const { t } = useI18n('conversations')` → prop-drilled
 * through `ConversationList` → `EmptyConversations`.
 *
 * `useI18n(ns)` scopes `t(key)` to the namespace file (`<ns>.json`, unwrapped at
 * its `<ns>` root key) and resolves `key` by splitting on `.` — it does NOT
 * search nested objects. `noConversationsFound` only exists in the locale files
 * at `conversations.conversationSearch.noConversationsFound`, never at the
 * `conversations` root, so `t('noConversationsFound')` (the call the component
 * makes) always misses and `t()` returns the raw key back.
 *
 * This test renders the REAL `useI18n('conversations')` hook (only the Zustand
 * language store is mocked, to pin the locale) against the REAL locale JSON on
 * disk — no `t` stub — to prove what today's call actually renders.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { useI18n } from '@/hooks/use-i18n';
import { EmptyConversations } from '@/components/conversations/conversation-groups/EmptyConversations';
import enConversations from '@/locales/en/conversations.json';
import frConversations from '@/locales/fr/conversations.json';

let mockLocale = 'en';

jest.mock('@/stores', () => ({
  useLanguageStore: (selector: (state: { currentInterfaceLanguage: string; setInterfaceLanguage: () => void }) => unknown) =>
    selector({
      currentInterfaceLanguage: mockLocale,
      setInterfaceLanguage: jest.fn(),
    }),
}));

/** Mirrors ConversationLayout's real injection: useI18n('conversations') → t prop. */
function ConversationLayoutHarness({ searchQuery }: { searchQuery: string }) {
  const { t, isLoading } = useI18n('conversations');
  if (isLoading) return null;
  return <EmptyConversations searchQuery={searchQuery} t={t} />;
}

const expected = {
  en: {
    noConversations: (enConversations as any).conversations.noConversations,
    noConversationsFound: (enConversations as any).conversations.conversationSearch.noConversationsFound,
  },
  fr: {
    noConversations: (frConversations as any).conversations.noConversations,
    noConversationsFound: (frConversations as any).conversations.conversationSearch.noConversationsFound,
  },
};

describe('EmptyConversations — real useI18n injection (E14)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  (['en', 'fr'] as const).forEach((locale) => {
    describe(`locale=${locale}`, () => {
      beforeEach(() => {
        mockLocale = locale;
      });

      it('renders the real translated "search with no results" string, not the raw key', async () => {
        render(<ConversationLayoutHarness searchQuery="xyz" />);

        await waitFor(() => {
          expect(screen.getByText(expected[locale].noConversationsFound)).toBeInTheDocument();
        });

        expect(screen.queryByText('noConversationsFound')).not.toBeInTheDocument();
      });

      it('renders the real translated "no conversations at all" string', async () => {
        render(<ConversationLayoutHarness searchQuery="" />);

        await waitFor(() => {
          expect(screen.getByText(expected[locale].noConversations)).toBeInTheDocument();
        });

        expect(screen.queryByText('noConversations')).not.toBeInTheDocument();
      });
    });
  });
});
