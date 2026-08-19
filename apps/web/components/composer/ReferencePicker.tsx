'use client';

import { useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { AtSign, Bell, MoreVertical, Search, Tag, X } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TAP_DEFAULT } from '@/hooks/composer/useReferences';
import type { ComposerReference, PostReferenceDisplay } from '@meeshy/shared/types/post-reference';
import type { User } from '@/types';

type DeclarableDisplay = Exclude<PostReferenceDisplay, 'INLINE'>;

const MODE_ICON: Record<PostReferenceDisplay, typeof Bell> = {
  INLINE: AtSign,
  PINNED: Tag,
  NOTE: Tag,
  SILENT: Bell,
};

type PickedPerson = { readonly username: string; readonly userId?: string };

export interface ReferencePickerProps {
  references: readonly ComposerReference[];
  onChange: (person: PickedPerson, display: PostReferenceDisplay) => void;
  onRemove: (username: string) => void;
  modes: readonly DeclarableDisplay[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Menu de mode, identique pour un chip déjà posé (changer d'avis) et pour un
 * résultat de recherche (choisir autre chose que le défaut du tap). Un
 * bouton dédié, pas un clic droit / appui long : accessible clavier et
 * lecteur d'écran, et ouvre exactement le même menu.
 */
function ModeMenuTrigger({
  modes,
  onSelect,
  label,
}: {
  modes: readonly DeclarableDisplay[];
  onSelect: (mode: DeclarableDisplay) => void;
  label: string;
}) {
  const { t } = useI18n('common');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="shrink-0 rounded p-1 text-[var(--gp-text-muted)] hover:text-[var(--gp-text-primary)]"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {modes.map((mode) => {
          const Icon = MODE_ICON[mode];
          return (
            <DropdownMenuItem key={mode} onSelect={() => onSelect(mode)}>
              <Icon className="mr-2 h-3.5 w-3.5" />
              {t(`references.mode.${mode}`, mode)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReferenceChip({
  reference,
  modes,
  onModeChange,
  onRemove,
}: {
  reference: ComposerReference;
  modes: readonly DeclarableDisplay[];
  onModeChange: (mode: DeclarableDisplay) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n('common');
  const Icon = MODE_ICON[reference.display];
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--gp-hover)] pl-2.5 pr-1 py-1 text-xs text-[var(--gp-text-primary)]">
      <Icon className="h-3 w-3 text-[var(--gp-terracotta)]" />
      {reference.username}
      <ModeMenuTrigger modes={modes} onSelect={onModeChange} label={t('references.changeMode', 'Change how this is shown')} />
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('references.remove', 'Remove')}
        className="rounded p-0.5 text-[var(--gp-text-secondary)] hover:text-[var(--gp-text-primary)]"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function ReferencePickerBody({
  references,
  onChange,
  onRemove,
  modes,
}: Pick<ReferencePickerProps, 'references' | 'onChange' | 'onRemove' | 'modes'>) {
  const { t } = useI18n('common');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch] = useDebounce(searchTerm, 400);
  const [results, setResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (debouncedSearch.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    usersService
      .searchUsers(debouncedSearch)
      .then((users) => {
        if (!cancelled) setResults(users);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  // Comparaison insensible à la casse des deux côtés : `references` porte
  // désormais le username tel qu'ajouté (casse d'origine, jumelle exacte de
  // `ComposerReferences.upsert` côté Swift), donc plus garanti minuscule.
  const referencedUsernames = new Set(references.map((r) => r.username.toLowerCase()));
  const candidates = results.filter((u) => !referencedUsernames.has((u.username ?? '').toLowerCase()));

  return (
    <div className="space-y-2">
      {references.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {references.map((reference) => (
            <ReferenceChip
              key={reference.username}
              reference={reference}
              modes={modes}
              onModeChange={(mode) => onChange({ username: reference.username, userId: reference.userId }, mode)}
              onRemove={() => onRemove(reference.username)}
            />
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gp-text-secondary)]" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t('references.searchPlaceholder', 'Search for someone')}
          className="w-full rounded-full bg-[var(--gp-hover)] py-2 pl-9 pr-3 text-sm text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-secondary)] outline-none"
        />
      </div>

      {debouncedSearch.trim().length >= 2 && (
        <div className="max-h-48 space-y-0.5 overflow-y-auto">
          {isLoading && <p className="py-2 text-center text-xs text-[var(--gp-text-secondary)]">…</p>}
          {!isLoading && candidates.length === 0 && (
            <p className="py-2 text-center text-xs text-[var(--gp-text-secondary)]">{t('references.empty', 'No one found')}</p>
          )}
          {candidates.map((u) => (
            <div key={u.id} className="flex items-center gap-1 rounded-lg hover:bg-[var(--gp-hover)]">
              <button
                type="button"
                onClick={() => onChange({ username: u.username ?? '', userId: u.id }, TAP_DEFAULT.picker)}
                className={cn('flex-1 truncate rounded-lg px-3 py-1.5 text-left text-sm text-[var(--gp-text-primary)]')}
              >
                {u.displayName || u.username}
                {u.username && <span className="ml-1.5 text-xs text-[var(--gp-text-secondary)]">@{u.username}</span>}
              </button>
              <ModeMenuTrigger
                modes={modes}
                onSelect={(mode) => onChange({ username: u.username ?? '', userId: u.id }, mode)}
                label={t('references.changeMode', 'Change how this is shown')}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Feuille/popover : recherche + chips horizontaux des déjà-référencées avec
 * leur pastille de mode et un ✕. Ne se ferme pas au clic — on en ajoute
 * plusieurs d'affilée (`open`/`onOpenChange` restent au parent).
 */
export function ReferencePicker({ references, onChange, onRemove, modes, open, onOpenChange }: ReferencePickerProps) {
  const { t } = useI18n('common');

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 p-2 rounded-lg text-[var(--gp-text-muted)] hover:bg-[var(--gp-parchment)] transition-colors"
          aria-label={t('references.trigger', 'Mention someone')}
        >
          <AtSign className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <ReferencePickerBody references={references} onChange={onChange} onRemove={onRemove} modes={modes} />
      </PopoverContent>
    </Popover>
  );
}
