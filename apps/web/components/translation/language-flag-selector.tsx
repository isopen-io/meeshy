"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SUPPORTED_LANGUAGES, formatLanguageName } from "@/utils/language-detection";
import { INTERFACE_LANGUAGES } from "@/types/frontend";
import { type LanguageChoice } from "@/lib/bubble-stream-modules";

interface LanguageFlagSelectorProps {
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
	choices?: LanguageChoice[];
	interfaceOnly?: boolean;
	showLanguageName?: boolean;
	popoverSide?: "top" | "right" | "bottom" | "left";
	popoverAlign?: "start" | "center" | "end";
	popoverSideOffset?: number;
}

export function LanguageFlagSelector({
	value,
	onValueChange,
	disabled = false,
	className,
	choices,
	interfaceOnly = false,
	showLanguageName = true,
	popoverSide = "top",
	popoverAlign = "center",
	popoverSideOffset = 8,
}: LanguageFlagSelectorProps) {
	const [open, setOpen] = useState(false);

  // Utiliser les choix fournis, les langues d'interface limitées, ou les langues supportées par défaut
  const availableLanguages = choices 
    ? choices.map(choice => SUPPORTED_LANGUAGES.find(lang => lang.code === choice.code)).filter((lang): lang is typeof SUPPORTED_LANGUAGES[0] => lang !== undefined)
    : interfaceOnly 
      ? INTERFACE_LANGUAGES
      : SUPPORTED_LANGUAGES;

  const selectedLanguage = availableLanguages.find(
    (language) => language.code === value
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-[30px] w-[30px] sm:h-[32px] sm:w-[32px] p-0 rounded-full hover:bg-gray-100 relative min-w-0 min-h-0",
            className
          )}
        >
          <span className="text-base sm:text-lg leading-none">
            {selectedLanguage?.flag || '🌐'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={popoverAlign}
        side={popoverSide}
        sideOffset={popoverSideOffset}
        className={cn(
          "p-2",
          showLanguageName
            ? "w-[90px] max-w-[96vw] sm:max-w-[160px] min-w-[70px]"
            : "w-[50px] max-w-[96vw] min-w-[50px]"
        )}
      >
        <div className="flex flex-col gap-2 items-center max-h-[50vh] overflow-y-auto">
          {availableLanguages.map((language) => (
            <Button
              key={language.code}
              variant="ghost"
              size="sm"
              onClick={() => {
                onValueChange(language.code);
                setOpen(false);
              }}
              className={cn(
                "flex flex-row items-center h-10 w-full gap-2 hover:bg-blue-100",
                showLanguageName ? "justify-start px-3" : "justify-center px-0",
                value === language.code && "bg-blue-50 dark:bg-blue-900/30"
              )}
              title={formatLanguageName(language.code)}
            >
              <span className="text-base">{language.flag}</span>
              {showLanguageName && (
                <span className="font-medium text-sm">
                  {language.name}
                </span>
              )}
            </Button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
