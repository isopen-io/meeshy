import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettingField } from '@/components/admin/settings/SettingField';
import type { ConfigSetting } from '@/types/admin-settings';

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    disabled,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      data-testid="switch"
    />
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    variant,
    className,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

function makeSetting(overrides: Partial<ConfigSetting> & { key: string }): ConfigSetting {
  return {
    key: overrides.key,
    label: overrides.label ?? overrides.key,
    description: overrides.description ?? 'A description',
    type: overrides.type ?? 'text',
    value: overrides.value ?? 'default-val',
    defaultValue: overrides.defaultValue ?? 'default-val',
    implemented: overrides.implemented ?? true,
    category: overrides.category ?? 'system',
    ...overrides,
  };
}

describe('SettingField', () => {
  describe('text type', () => {
    it('renders an input of type text', () => {
      const setting = makeSetting({ key: 'MY_KEY', type: 'text', value: 'hello' });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('calls onUpdate with the new string value on change', () => {
      const onUpdate = jest.fn();
      const setting = makeSetting({ key: 'MY_KEY', type: 'text', value: 'old' });
      render(<SettingField setting={setting} onUpdate={onUpdate} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new' } });
      expect(onUpdate).toHaveBeenCalledWith('MY_KEY', 'new');
    });

    it('is disabled when implemented=false', () => {
      const setting = makeSetting({ key: 'MY_KEY', type: 'text', implemented: false });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('shows the unit label when unit is provided', () => {
      const setting = makeSetting({ key: 'MY_KEY', type: 'text', value: '100', unit: 'ms' });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByText('ms')).toBeInTheDocument();
    });

    it('does not show the unit label when unit is absent', () => {
      const setting = makeSetting({ key: 'MY_KEY', type: 'text', value: '100' });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.queryByText('ms')).not.toBeInTheDocument();
    });
  });

  describe('number type', () => {
    it('renders an input of type number', () => {
      const setting = makeSetting({ key: 'MY_KEY', type: 'number', value: 42 });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });

    it('calls onUpdate with a parsed float on change', () => {
      const onUpdate = jest.fn();
      const setting = makeSetting({ key: 'PORT', type: 'number', value: 3000 });
      render(<SettingField setting={setting} onUpdate={onUpdate} />);
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '8080' } });
      expect(onUpdate).toHaveBeenCalledWith('PORT', 8080);
    });
  });

  describe('boolean type', () => {
    it('renders a switch', () => {
      const setting = makeSetting({ key: 'ENABLED', type: 'boolean', value: true });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByTestId('switch')).toBeInTheDocument();
    });

    it('shows "Activé" when value is true', () => {
      const setting = makeSetting({ key: 'ENABLED', type: 'boolean', value: true });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByText('Activé')).toBeInTheDocument();
    });

    it('shows "Désactivé" when value is false', () => {
      const setting = makeSetting({ key: 'ENABLED', type: 'boolean', value: false });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByText('Désactivé')).toBeInTheDocument();
    });

    it('calls onUpdate with the toggled boolean', () => {
      const onUpdate = jest.fn();
      const setting = makeSetting({ key: 'ENABLED', type: 'boolean', value: false });
      render(<SettingField setting={setting} onUpdate={onUpdate} />);
      fireEvent.click(screen.getByTestId('switch'));
      expect(onUpdate).toHaveBeenCalledWith('ENABLED', true);
    });

    it('is disabled when implemented=false', () => {
      const setting = makeSetting({
        key: 'ENABLED',
        type: 'boolean',
        value: true,
        implemented: false,
      });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByTestId('switch')).toBeDisabled();
    });
  });

  describe('select type', () => {
    const options = [
      { label: 'Production', value: 'production' },
      { label: 'Development', value: 'development' },
    ];

    it('renders a select element', () => {
      const setting = makeSetting({
        key: 'NODE_ENV',
        type: 'select',
        value: 'production',
        options,
      });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders all options', () => {
      const setting = makeSetting({
        key: 'NODE_ENV',
        type: 'select',
        value: 'production',
        options,
      });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByRole('option', { name: 'Production' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Development' })).toBeInTheDocument();
    });

    it('calls onUpdate with the selected string value', () => {
      const onUpdate = jest.fn();
      const setting = makeSetting({
        key: 'NODE_ENV',
        type: 'select',
        value: 'production',
        options,
      });
      render(<SettingField setting={setting} onUpdate={onUpdate} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'development' } });
      expect(onUpdate).toHaveBeenCalledWith('NODE_ENV', 'development');
    });

    it('is disabled when implemented=false', () => {
      const setting = makeSetting({
        key: 'NODE_ENV',
        type: 'select',
        value: 'production',
        options,
        implemented: false,
      });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('implementation badge', () => {
    it('shows "TO IMPLEMENT" badge when implemented=false', () => {
      const setting = makeSetting({ key: 'FUTURE', implemented: false });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByText('TO IMPLEMENT')).toBeInTheDocument();
    });

    it('does not show "TO IMPLEMENT" badge when implemented=true', () => {
      const setting = makeSetting({ key: 'FUTURE', implemented: true });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.queryByText('TO IMPLEMENT')).not.toBeInTheDocument();
    });

    it('shows envVar badge when envVar is provided', () => {
      const setting = makeSetting({ key: 'MY_KEY', envVar: 'MY_ENV_VAR' });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByText('MY_ENV_VAR')).toBeInTheDocument();
    });

    it('does not show envVar badge when envVar is absent', () => {
      const setting = makeSetting({ key: 'MY_KEY', label: 'My Setting' });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      // No envVar → the envVar badge text should not appear (distinct from the label)
      // The label 'My Setting' is shown but no monospace envVar badge
      expect(screen.queryByText('MY_ENV_VAR')).not.toBeInTheDocument();
    });
  });

  describe('default value indicator', () => {
    it('shows the default value info when value differs from defaultValue and is implemented', () => {
      const setting = makeSetting({
        key: 'KEY',
        value: 'modified',
        defaultValue: 'original',
        implemented: true,
      });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByText(/Valeur par défaut/)).toBeInTheDocument();
      expect(screen.getByText(/original/)).toBeInTheDocument();
    });

    it('does not show the default value info when value equals defaultValue', () => {
      const setting = makeSetting({ key: 'KEY', value: 'same', defaultValue: 'same' });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.queryByText(/Valeur par défaut/)).not.toBeInTheDocument();
    });

    it('does not show the default value info when not implemented', () => {
      const setting = makeSetting({
        key: 'KEY',
        value: 'different',
        defaultValue: 'original',
        implemented: false,
      });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.queryByText(/Valeur par défaut/)).not.toBeInTheDocument();
    });
  });

  describe('label and description', () => {
    it('renders the setting label', () => {
      const setting = makeSetting({ key: 'MY_KEY', label: 'My Setting' });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByText('My Setting')).toBeInTheDocument();
    });

    it('renders the setting description', () => {
      const setting = makeSetting({ key: 'MY_KEY', description: 'Helps with X' });
      render(<SettingField setting={setting} onUpdate={jest.fn()} />);
      expect(screen.getByText('Helps with X')).toBeInTheDocument();
    });
  });
});
