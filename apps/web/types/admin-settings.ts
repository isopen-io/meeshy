export interface ConfigSetting {
  key: string;
  label: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  value: string | number | boolean;
  defaultValue: string | number | boolean;
  envVar?: string;
  options?: { label: string; value: string }[];
  unit?: string;
  implemented: boolean;
  category: 'security' | 'performance' | 'features' | 'system';
}

export interface ConfigSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  settings: ConfigSetting[];
}

export interface SettingFieldProps {
  setting: ConfigSetting;
  onUpdate: (key: string, value: string | number | boolean) => void;
}
