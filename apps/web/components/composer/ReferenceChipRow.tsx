'use client';

import { AtSign, Bell, Tag, Users } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ComposerReference, PostReferenceDisplay } from '@meeshy/shared/types/post-reference';

const MODE_ICON: Record<PostReferenceDisplay, typeof Bell> = {
  INLINE: AtSign,
  PINNED: Tag,
  NOTE: Tag,
  SILENT: Bell,
};

/**
 * `👤 3 personnes` avec la pastille de chaque mode, qui rouvre la feuille.
 *
 * Seul endroit d'où l'auteur voit et retire ses références silencieuses —
 * sans elle, une SILENT posée par erreur serait invisible et irrécupérable
 * jusqu'à la publication.
 */
export function ReferenceChipRow({
  references,
  onOpen,
}: {
  references: readonly ComposerReference[];
  onOpen: () => void;
}) {
  const { t } = useI18n('common');
  if (references.length === 0) return null;

  const label = `${references.length} ${t('references.people', 'people')}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="inline-flex items-center gap-2 rounded-full bg-[var(--gp-terracotta)]/10 px-3 py-1.5 text-xs font-medium text-[var(--gp-terracotta)] transition-colors hover:bg-[var(--gp-terracotta)]/20"
    >
      <Users className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span className="flex items-center gap-1">
        {references.map((reference) => {
          const Icon = MODE_ICON[reference.display];
          return (
            <Icon
              key={reference.username}
              className={cn('h-3 w-3', reference.display === 'SILENT' ? 'text-[var(--gp-text-muted)]' : 'text-[var(--gp-terracotta)]')}
            />
          );
        })}
      </span>
    </button>
  );
}
