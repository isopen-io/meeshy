/**
 * Tests all 8 settings section components — they share the same structure:
 * render a card with an implemented-count badge and a SettingField per setting.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { GeneralSettingsSection } from '@/components/admin/settings/GeneralSettingsSection';
import { DatabaseSettingsSection } from '@/components/admin/settings/DatabaseSettingsSection';
import { SecuritySettingsSection } from '@/components/admin/settings/SecuritySettingsSection';
import { RateLimitingSettingsSection } from '@/components/admin/settings/RateLimitingSettingsSection';
import { MessagesSettingsSection } from '@/components/admin/settings/MessagesSettingsSection';
import { UploadsSettingsSection } from '@/components/admin/settings/UploadsSettingsSection';
import { ServerSettingsSection } from '@/components/admin/settings/ServerSettingsSection';
import { FeaturesSettingsSection } from '@/components/admin/settings/FeaturesSettingsSection';
import { SettingsAlerts } from '@/components/admin/settings/SettingsAlerts';
import type { ConfigSetting } from '@/types/admin-settings';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params && 'count' in params && 'total' in params) {
        return `${params.count}/${params.total} implemented`;
      }
      return key;
    },
  }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
}));

// Lightweight SettingField stub that renders the key and calls onUpdate
jest.mock('@/components/admin/settings/SettingField', () => ({
  SettingField: ({
    setting,
    onUpdate,
  }: {
    setting: ConfigSetting;
    onUpdate: (key: string, value: string | number | boolean) => void;
  }) => (
    <div data-testid={`field-${setting.key}`}>
      <button onClick={() => onUpdate(setting.key, 'new-value')}>update-{setting.key}</button>
    </div>
  ),
}));

function makeSetting(key: string, implemented = true): ConfigSetting {
  return {
    key,
    label: key,
    description: '',
    type: 'text',
    value: 'val',
    defaultValue: 'def',
    implemented,
    category: 'system',
  };
}

const ALL_SECTION_COMPONENTS = [
  { Component: GeneralSettingsSection, name: 'GeneralSettingsSection' },
  { Component: DatabaseSettingsSection, name: 'DatabaseSettingsSection' },
  { Component: SecuritySettingsSection, name: 'SecuritySettingsSection' },
  { Component: RateLimitingSettingsSection, name: 'RateLimitingSettingsSection' },
  { Component: MessagesSettingsSection, name: 'MessagesSettingsSection' },
  { Component: UploadsSettingsSection, name: 'UploadsSettingsSection' },
  { Component: ServerSettingsSection, name: 'ServerSettingsSection' },
  { Component: FeaturesSettingsSection, name: 'FeaturesSettingsSection' },
] as const;

describe.each(ALL_SECTION_COMPONENTS)('$name', ({ Component }) => {
  it('renders a SettingField for each setting', () => {
    const settings = [makeSetting('KEY_A'), makeSetting('KEY_B')];
    render(<Component settings={settings} onUpdate={jest.fn()} />);
    expect(screen.getByTestId('field-KEY_A')).toBeInTheDocument();
    expect(screen.getByTestId('field-KEY_B')).toBeInTheDocument();
  });

  it('shows implemented count in the badge', () => {
    const settings = [
      makeSetting('K1', true),
      makeSetting('K2', true),
      makeSetting('K3', false),
    ];
    render(<Component settings={settings} onUpdate={jest.fn()} />);
    expect(screen.getByTestId('badge')).toHaveTextContent('2/3 implemented');
  });

  it('propagates onUpdate to each SettingField', async () => {
    const onUpdate = jest.fn();
    const settings = [makeSetting('MY_KEY')];
    render(<Component settings={settings} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText('update-MY_KEY'));
    expect(onUpdate).toHaveBeenCalledWith('MY_KEY', 'new-value');
  });

  it('renders with an empty settings array without crashing', () => {
    expect(() =>
      render(<Component settings={[]} onUpdate={jest.fn()} />)
    ).not.toThrow();
  });
});

describe('SettingsAlerts', () => {
  it('renders two alert cards', () => {
    render(<SettingsAlerts />);
    // The mock t() returns key strings — check for known i18n keys rendered
    expect(screen.getByText('adminSettings.alerts.sensitive.title')).toBeInTheDocument();
    expect(screen.getByText('adminSettings.alerts.env.title')).toBeInTheDocument();
  });

  it('renders sensitive and env descriptions', () => {
    render(<SettingsAlerts />);
    expect(screen.getByText('adminSettings.alerts.sensitive.description')).toBeInTheDocument();
    expect(screen.getByText('adminSettings.alerts.env.description')).toBeInTheDocument();
  });
});
