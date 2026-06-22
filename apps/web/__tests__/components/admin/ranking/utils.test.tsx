import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/stores/language-store', () => ({
  getCurrentInterfaceLocale: () => 'en',
}));

import {
  formatCount,
  getRankBadge,
  getTypeIcon,
  getTypeLabel,
  getMessageTypeIcon,
} from '@/components/admin/ranking/utils';

describe('formatCount', () => {
  it('returns "0" when count is undefined', () => {
    expect(formatCount(undefined, 'en')).toBe('0');
  });

  it('formats a positive integer with the given locale', () => {
    expect(formatCount(1000, 'en')).toBe('1,000');
  });

  it('formats 0 as "0"', () => {
    expect(formatCount(0, 'en')).toBe('0');
  });

  it('uses the locale from the store when no locale is passed', () => {
    // getCurrentInterfaceLocale returns 'en', so 1500 → '1,500'
    expect(formatCount(1500)).toBe('1,500');
  });
});

describe('getRankBadge', () => {
  it('renders a Medal icon for rank 1', () => {
    render(<>{getRankBadge(1)}</>);
    expect(screen.getByTestId('medal-icon')).toBeInTheDocument();
  });

  it('renders a Medal icon for rank 2', () => {
    render(<>{getRankBadge(2)}</>);
    expect(screen.getByTestId('medal-icon')).toBeInTheDocument();
  });

  it('renders a Medal icon for rank 3', () => {
    render(<>{getRankBadge(3)}</>);
    expect(screen.getByTestId('medal-icon')).toBeInTheDocument();
  });

  it('renders a # span for rank 4 and above', () => {
    render(<>{getRankBadge(4)}</>);
    expect(screen.getByText('#4')).toBeInTheDocument();
  });

  it('renders the correct rank number in the span', () => {
    render(<>{getRankBadge(99)}</>);
    expect(screen.getByText('#99')).toBeInTheDocument();
  });
});

describe('getTypeIcon', () => {
  it('returns 💬 for direct', () => {
    expect(getTypeIcon('direct')).toBe('💬');
  });

  it('returns 👥 for group', () => {
    expect(getTypeIcon('group')).toBe('👥');
  });

  it('returns 🌐 for public', () => {
    expect(getTypeIcon('public')).toBe('🌐');
  });

  it('returns 📢 for broadcast', () => {
    expect(getTypeIcon('broadcast')).toBe('📢');
  });

  it('returns 💬 for unknown types', () => {
    expect(getTypeIcon('unknown')).toBe('💬');
  });

  it('returns 💬 when type is undefined', () => {
    expect(getTypeIcon(undefined)).toBe('💬');
  });
});

describe('getTypeLabel', () => {
  const t = (key: string) => key;

  it('returns the translation key for direct', () => {
    expect(getTypeLabel('direct', t)).toBe('ranking.conversationType.direct');
  });

  it('returns the translation key for group', () => {
    expect(getTypeLabel('group', t)).toBe('ranking.conversationType.group');
  });

  it('returns the translation key for public', () => {
    expect(getTypeLabel('public', t)).toBe('ranking.conversationType.public');
  });

  it('returns the translation key for broadcast', () => {
    expect(getTypeLabel('broadcast', t)).toBe('ranking.conversationType.broadcast');
  });

  it('returns the type itself when it is not in the map', () => {
    expect(getTypeLabel('mystery', t)).toBe('mystery');
  });

  it('returns the unknown translation key when type is undefined', () => {
    expect(getTypeLabel(undefined, t)).toBe('ranking.conversationType.unknown');
  });
});

describe('getMessageTypeIcon', () => {
  it('returns 📝 for text', () => {
    expect(getMessageTypeIcon('text')).toBe('📝');
  });

  it('returns 🖼️ for image', () => {
    expect(getMessageTypeIcon('image')).toBe('🖼️');
  });

  it('returns 🎥 for video', () => {
    expect(getMessageTypeIcon('video')).toBe('🎥');
  });

  it('returns 🎵 for audio', () => {
    expect(getMessageTypeIcon('audio')).toBe('🎵');
  });

  it('returns 📎 for file', () => {
    expect(getMessageTypeIcon('file')).toBe('📎');
  });

  it('returns 📝 for unknown types', () => {
    expect(getMessageTypeIcon('unknown')).toBe('📝');
  });

  it('returns 📝 when type is undefined', () => {
    expect(getMessageTypeIcon(undefined)).toBe('📝');
  });
});
