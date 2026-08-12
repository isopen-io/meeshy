import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettingsStats } from '@/components/admin/settings/SettingsStats';
import type { ConfigSection } from '@/types/admin-settings';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const noop = () => null as any;

function makeSection(
  id: string,
  settings: Array<{ implemented: boolean; category: 'security' | 'performance' | 'features' | 'system' }>
): ConfigSection {
  return {
    id,
    title: id,
    description: '',
    icon: noop,
    settings: settings.map((s, i) => ({
      key: `${id}-key${i}`,
      label: `${id}-label${i}`,
      description: '',
      type: 'text' as const,
      value: 'val',
      defaultValue: 'def',
      ...s,
    })),
  };
}

describe('SettingsStats', () => {
  it('displays the count of implemented settings', () => {
    const sections = [
      makeSection('A', [
        { implemented: true, category: 'system' },
        { implemented: true, category: 'system' },
        { implemented: false, category: 'system' },
      ]),
      makeSection('B', [{ implemented: true, category: 'system' }]),
    ];

    render(<SettingsStats configSections={sections} />);

    // 3 implemented total
    const counts = screen.getAllByText('3');
    expect(counts.length).toBeGreaterThan(0);
  });

  it('displays the count of not-implemented settings', () => {
    const sections = [
      makeSection('A', [
        { implemented: false, category: 'system' },
        { implemented: false, category: 'system' },
      ]),
    ];

    render(<SettingsStats configSections={sections} />);

    const counts = screen.getAllByText('2');
    expect(counts.length).toBeGreaterThan(0);
  });

  it('displays the count of security-category settings', () => {
    const sections = [
      makeSection('A', [
        { implemented: true, category: 'security' },
        { implemented: true, category: 'system' },
        { implemented: false, category: 'security' },
      ]),
    ];

    render(<SettingsStats configSections={sections} />);

    // 2 security settings (regardless of implemented status)
    const counts = screen.getAllByText('2');
    expect(counts.length).toBeGreaterThan(0);
  });

  it('displays the number of sections (categories)', () => {
    const sections = [
      makeSection('A', [{ implemented: true, category: 'system' }]),
      makeSection('B', [{ implemented: true, category: 'system' }]),
      makeSection('C', [{ implemented: true, category: 'system' }]),
    ];

    render(<SettingsStats configSections={sections} />);

    const counts = screen.getAllByText('3');
    expect(counts.length).toBeGreaterThan(0);
  });

  it('shows all 0s when configSections is empty', () => {
    render(<SettingsStats configSections={[]} />);
    // Number of categories = 0, all counts = 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(4);
  });
});
