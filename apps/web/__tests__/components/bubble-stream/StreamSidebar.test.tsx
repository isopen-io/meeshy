import { render } from '@testing-library/react';
import { StreamSidebar } from '@/components/bubble-stream/StreamSidebar';
import type { User } from '@meeshy/shared/types';

jest.mock('@/lib/bubble-stream-modules', () => ({
  FoldableSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LanguageIndicators: () => null,
  SidebarLanguageHeader: () => null,
}));

jest.mock('@/components/common/trending-section', () => ({
  TrendingSection: () => null,
}));

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  username: 'jdoe',
  firstName: 'John',
  lastName: 'Doe',
  email: 'jdoe@example.com',
  phoneNumber: '',
  role: 'USER',
  systemLanguage: 'en',
  regionalLanguage: 'en',
  isOnline: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as unknown as User);

const t = (key: string) => key;

describe('StreamSidebar — active user presence dot', () => {
  it('renders no dot for an offline user (offline = no dot, matches app-wide convention)', () => {
    const { container } = render(
      <StreamSidebar
        messageLanguageStats={[]}
        activeLanguageStats={[]}
        userLanguage="en"
        activeUsers={[makeUser({ isOnline: false, lastActiveAt: undefined })]}
        trendingHashtags={[]}
        t={t}
        tCommon={t}
      />
    );

    expect(container.querySelector('.bg-gray-400')).toBeNull();
  });

  it('still renders a green dot for an online user', () => {
    const { container } = render(
      <StreamSidebar
        messageLanguageStats={[]}
        activeLanguageStats={[]}
        userLanguage="en"
        activeUsers={[makeUser({ isOnline: true })]}
        trendingHashtags={[]}
        t={t}
        tCommon={t}
      />
    );

    expect(container.querySelector('.bg-emerald-400')).not.toBeNull();
  });
});
