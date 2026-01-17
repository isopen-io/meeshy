'use client';

import { Globe, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/hooks/useI18n';
import { SelectableSquare } from '../../components/SelectableSquare';
import { SUPPORTED_LANGUAGES } from '@/types';

interface LanguagesSectionProps {
  isLanguagesOpen: boolean;
  setIsLanguagesOpen: (open: boolean) => void;
  allowedLanguages: string[];
  setAllowedLanguages: (languages: string[]) => void;
  languageSearchQuery: string;
  setLanguageSearchQuery: (query: string) => void;
}

export function LanguagesSection({
  isLanguagesOpen,
  setIsLanguagesOpen,
  allowedLanguages,
  setAllowedLanguages,
  languageSearchQuery,
  setLanguageSearchQuery
}: LanguagesSectionProps) {
  const { t } = useI18n('modals');

  return (
    <Card>
      <CardHeader
        className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsLanguagesOpen(!isLanguagesOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Globe className="h-4 w-4 mr-2" />
            <CardTitle className="text-lg">
              {t('createLinkModal.allowedLanguages.title')}
            </CardTitle>
          </div>
          {isLanguagesOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
        <CardDescription>{t('createLinkModal.allowedLanguages.description')}</CardDescription>
      </CardHeader>
      {isLanguagesOpen && (
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('createLinkModal.allowedLanguages.searchPlaceholder')}
              value={languageSearchQuery}
              onChange={(e) => setLanguageSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[300px] pr-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SUPPORTED_LANGUAGES.filter(
                (lang) =>
                  languageSearchQuery === '' ||
                  lang.name.toLowerCase().includes(languageSearchQuery.toLowerCase()) ||
                  lang.code.toLowerCase().includes(languageSearchQuery.toLowerCase()) ||
                  (lang.nativeName &&
                    lang.nativeName.toLowerCase().includes(languageSearchQuery.toLowerCase()))
              ).map((lang) => (
                <SelectableSquare
                  key={lang.code}
                  checked={allowedLanguages.includes(lang.code)}
                  onChange={(checked) => {
                    if (checked) {
                      setAllowedLanguages([...allowedLanguages, lang.code]);
                    } else {
                      setAllowedLanguages(allowedLanguages.filter((l) => l !== lang.code));
                    }
                  }}
                  label={`${lang.flag} ${lang.name}`}
                  description={t('createLinkModal.allowedLanguages.allowLanguage', {
                    language: lang.name
                  })}
                  icon={<Globe className="w-4 h-4" />}
                />
              ))}
            </div>
          </ScrollArea>

          <p className="text-xs text-muted-foreground italic">
            💡 {t('createLinkModal.allowedLanguages.allowAllLanguagesHint')}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
