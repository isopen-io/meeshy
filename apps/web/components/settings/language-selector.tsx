'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LanguageCode } from '@/types';
import { useI18n } from '@/hooks/useI18n';

interface LanguageSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  languages: LanguageCode[];
  placeholder?: string;
  className?: string;
}

export function LanguageSelector({
  value,
  onValueChange,
  languages,
  placeholder,
  className
}: LanguageSelectorProps) {
  const { t } = useI18n('settings');
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedLanguage = languages.find((lang) => lang.code === value);

  // Filtrer les langues selon la recherche
  const filteredLanguages = languages.filter((lang) =>
    lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lang.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (lang.nativeName && lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate flex-1 text-left">
            {selectedLanguage ? (
              <>
                {selectedLanguage.flag} {selectedLanguage.name}
              </>
            ) : (
              placeholder || t('languageSelector.placeholder')
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={t('languageSelector.searchPlaceholder')}
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-9"
          />
          <CommandEmpty>{t('languageSelector.noLanguageFound')}</CommandEmpty>
          <CommandList className="max-h-[400px]">
            <ScrollArea className="max-h-[320px]">
              <CommandGroup>
                {filteredLanguages.map((lang) => (
                  <CommandItem
                    key={lang.code}
                    value={lang.code}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue === value ? '' : currentValue);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === lang.code ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="mr-2">{lang.flag}</span>
                    <div className="flex flex-col">
                      <span className="font-medium">{lang.name}</span>
                      {lang.nativeName && lang.nativeName !== lang.name && (
                        <span className="text-xs text-muted-foreground">{lang.nativeName}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
