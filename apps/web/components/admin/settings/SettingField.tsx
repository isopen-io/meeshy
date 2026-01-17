'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, Info } from 'lucide-react';
import { SettingFieldProps } from '@/types/admin-settings';

/**
 * Individual setting field component
 * Renders appropriate input based on setting type
 */
export function SettingField({ setting, onUpdate }: SettingFieldProps) {
  const isImplemented = setting.implemented;

  return (
    <div className="space-y-3 py-4 border-b border-gray-200 dark:border-gray-700 last:border-0">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <Label htmlFor={setting.key} className="text-sm font-medium">
              {setting.label}
            </Label>
            {!isImplemented && (
              <Badge
                variant="outline"
                className="text-xs text-orange-600 border-orange-300"
              >
                <HelpCircle className="h-3 w-3 mr-1" />
                TO IMPLEMENT
              </Badge>
            )}
            {setting.envVar && (
              <Badge variant="outline" className="text-xs font-mono">
                {setting.envVar}
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {setting.description}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {setting.type === 'boolean' ? (
          <div className="flex items-center space-x-2">
            <Switch
              id={setting.key}
              checked={setting.value as boolean}
              disabled={!isImplemented}
              onCheckedChange={checked => onUpdate(setting.key, checked)}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {setting.value ? 'Activé' : 'Désactivé'}
            </span>
          </div>
        ) : setting.type === 'select' ? (
          <select
            id={setting.key}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            value={setting.value as string}
            disabled={!isImplemented}
            onChange={e => onUpdate(setting.key, e.target.value)}
          >
            {setting.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center space-x-2 flex-1">
            <Input
              id={setting.key}
              type={setting.type}
              value={setting.value as string | number}
              disabled={!isImplemented}
              onChange={e => {
                const value =
                  setting.type === 'number'
                    ? parseFloat(e.target.value)
                    : e.target.value;
                onUpdate(setting.key, value);
              }}
              className="flex-1"
            />
            {setting.unit && (
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {setting.unit}
              </span>
            )}
          </div>
        )}
      </div>

      {setting.defaultValue !== setting.value && isImplemented && (
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <Info className="h-3 w-3" />
          <span>Valeur par défaut : {String(setting.defaultValue)}</span>
        </div>
      )}
    </div>
  );
}
