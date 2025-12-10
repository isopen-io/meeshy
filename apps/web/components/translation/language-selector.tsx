'use client';

import { useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { SUPPORTED_LANGUAGES, formatLanguageName } from '@/utils/language-detection';
import { INTERFACE_LANGUAGES } from '@/types/frontend';
import { type LanguageChoice } from '@/lib/bubble-stream-modules';
import { useI18n } from '@/hooks/useI18n';

interface LanguageSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  choices?: LanguageChoice[]; // Choix de langues spécifiques ou utilise SUPPORTED_LANGUAGES par défaut
  interfaceOnly?: boolean; // Si true, utilise seulement les langues d'interface (EN, FR, PT)
}

export function LanguageSelector({
  value,
  onValueChange,
  disabled = false,
  placeholder,
  className,
  choices,
  interfaceOnly = false,
}: LanguageSelectorProps) {
  const { t } = useI18n('common');
  const [open, setOpen] = useState(false);

  // Utiliser les choix fournis, les langues d'interface limitées, ou les langues supportées par défaut
  const availableLanguages = choices 
    ? choices.map(choice => SUPPORTED_LANGUAGES.find(lang => lang.code === choice.code)).filter(Boolean)
    : interfaceOnly 
      ? INTERFACE_LANGUAGES
      : SUPPORTED_LANGUAGES;

  const selectedLanguage = availableLanguages.find(
    (language) => language?.code === value
  );
  
  const displayPlaceholder = placeholder || t('languageSelector.selectLanguage');

  // N'afficher l'input de recherche que si > 10 langues disponibles
  const showSearchInput = availableLanguages.length > 10;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "justify-between min-w-[100px]",
            className
          )}
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            {selectedLanguage ? (
              <span className="flex items-center gap-1">
                {formatLanguageName(selectedLanguage.code)}
              </span>
            ) : (
              <span className="text-muted-foreground">{displayPlaceholder}</span>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[150px] max-w-[96vw] p-0">
        <Command>
          {showSearchInput && (
            <CommandInput placeholder={t('languageSelector.searchLanguage') || "Search language..."} />
          )}
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>{t('languageSelector.noLanguageFound')}</CommandEmpty>
            <CommandGroup>
              {availableLanguages.map((language) => (
                <CommandItem
                  key={language?.code}
                  value={`${language?.name} ${language?.code}`}
                  onSelect={() => {
                    if (language?.code) {
                      onValueChange(language.code);
                      setOpen(false);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-2">
                      {language?.code && formatLanguageName(language.code)}
                    </span>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === language?.code ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
