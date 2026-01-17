'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ResponsiveTabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

interface ResponsiveTabsProps {
  items: ResponsiveTabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  mobileBreakpoint?: 'sm' | 'md' | 'lg';
}

/**
 * Composant Tabs responsive :
 * - Desktop/Tablet : Icône + texte horizontal
 * - Mobile : Icône au-dessus du texte (colonne verticale)
 * - Les tabs restent toujours visibles et sélectionnables sur tous les écrans
 */
export function ResponsiveTabs({
  items,
  defaultValue,
  value,
  onValueChange,
  className,
  mobileBreakpoint = 'lg'
}: ResponsiveTabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || items[0]?.value || '');
  const currentValue = value || internalValue;

  const handleValueChange = (newValue: string) => {
    if (!value) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <>
      {/* Tabs visibles sur tous les écrans */}
      <Tabs
        value={currentValue}
        onValueChange={handleValueChange}
        className={cn("w-full", className)}
      >
        <TabsList className="grid w-full h-auto p-1.5 bg-gray-100 dark:bg-gray-800" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
          {items.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="data-[state=active]:bg-blue-500 data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-[color,background-color] flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
            >
              {item.icon}
              <span className="text-xs md:text-sm">{item.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Contenu des onglets (partagé entre mobile et desktop) */}
      <div className="mt-4">
        {items.map((item) => (
          <div
            key={item.value}
            className={cn(
              "space-y-4",
              currentValue === item.value ? "block" : "hidden"
            )}
          >
            {item.content}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Version avec TabsContent pour compatibilité avec l'API Tabs existante
 */
export function ResponsiveTabsWithContent({
  items,
  defaultValue,
  value,
  onValueChange,
  className,
  mobileBreakpoint = 'lg',
  children
}: ResponsiveTabsProps & { children?: React.ReactNode }) {
  const [internalValue, setInternalValue] = useState(defaultValue || items[0]?.value || '');
  const currentValue = value || internalValue;

  const handleValueChange = (newValue: string) => {
    if (!value) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <Tabs
      value={currentValue}
      onValueChange={handleValueChange}
      className={cn("w-full", className)}
    >
      <TabsList className="grid w-full h-auto p-1.5 bg-gray-100 dark:bg-gray-800" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="data-[state=active]:bg-blue-500 data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
          >
            {item.icon}
            <span className="text-xs md:text-sm">{item.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Utilise les enfants comme TabsContent */}
      {children}
    </Tabs>
  );
}
