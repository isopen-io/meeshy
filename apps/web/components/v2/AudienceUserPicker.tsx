'use client';

import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { X, Search } from 'lucide-react';
import { useSearchUsersQuery } from '@/hooks/queries/use-users-query';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';

/**
 * W3 inc.2 — sélection d'audience explicite pour les visibilités EXCEPT
 * (« tous sauf… ») et ONLY (« seulement… »), parité du
 * `AudienceUserPickerView` iOS. Composant contrôlé : le parent possède la
 * liste (`selectedIds`) et la publie dans `visibilityUserIds`. Réutilise le
 * hook générique `useSearchUsersQuery` (même source que le UserPicker admin).
 */
interface AudienceUserPickerProps {
  mode: 'EXCEPT' | 'ONLY';
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

interface PickedUser {
  id: string;
  username?: string;
  displayName?: string | null;
}

export function AudienceUserPicker({ mode, selectedIds, onChange }: AudienceUserPickerProps) {
  const { t } = useI18n('common');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch] = useDebounce(searchTerm, 400);
  const { data: results = [], isLoading } = useSearchUsersQuery(debouncedSearch);
  // Cache local id → identité pour rendre les chips des utilisateurs déjà
  // sélectionnés après que la recherche a changé (les résultats sont éphémères).
  const [known, setKnown] = useState<Record<string, PickedUser>>({});

  const add = (user: PickedUser) => {
    if (selectedIds.includes(user.id)) return;
    setKnown((prev) => ({ ...prev, [user.id]: user }));
    onChange([...selectedIds, user.id]);
  };
  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id));

  const candidates = (results as PickedUser[]).filter((u) => !selectedIds.includes(u.id));

  return (
    <div className="space-y-2" data-testid="audience-user-picker">
      <p className="text-xs text-[var(--gp-text-secondary)] text-center">
        {mode === 'EXCEPT' ? t('audiencePicker.exceptHint') : t('audiencePicker.onlyHint')}
      </p>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1 rounded-full bg-[var(--gp-hover)] px-2.5 py-1 text-xs text-[var(--gp-text-primary)]"
            >
              {known[id]?.displayName || known[id]?.username || id}
              <button
                type="button"
                onClick={() => remove(id)}
                aria-label={t('audiencePicker.remove')}
                className="text-[var(--gp-text-secondary)] hover:text-[var(--gp-text-primary)]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gp-text-secondary)]" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t('audiencePicker.searchPlaceholder')}
          className="w-full rounded-full bg-[var(--gp-hover)] py-2 pl-9 pr-3 text-sm text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-secondary)] outline-none"
        />
      </div>

      {debouncedSearch.length >= 2 && (
        <div className="max-h-36 space-y-1 overflow-y-auto">
          {isLoading && (
            <p className="text-center text-xs text-[var(--gp-text-secondary)]">…</p>
          )}
          {!isLoading && candidates.length === 0 && (
            <p className="text-center text-xs text-[var(--gp-text-secondary)]">
              {t('audiencePicker.empty')}
            </p>
          )}
          {candidates.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => add(u)}
              className={cn(
                'block w-full rounded-lg px-3 py-1.5 text-left text-sm',
                'text-[var(--gp-text-primary)] hover:bg-[var(--gp-hover)] transition-colors'
              )}
            >
              {u.displayName || u.username}
              {u.username && (
                <span className="ml-1.5 text-xs text-[var(--gp-text-secondary)]">@{u.username}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
