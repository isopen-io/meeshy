'use client';

import { useI18n } from '@/hooks/use-i18n';
import type { PostReference } from '@meeshy/shared/types/post-reference';

/**
 * « Avec Alice B., Bob » sous le contenu.
 *
 * SILENT n'y figure JAMAIS, d'où que vienne la charge utile. Un post détaillé
 * mis en cache puis réutilisé pour rendre une carte de feed porte les
 * silencieuses du lecteur : la garde est ICI, dans le rendu, parce que la
 * couche réseau n'a aucun moyen de savoir où sa charge utile sera réaffichée.
 *
 * PINNED n'y figure pas non plus : sur un contenu qui en porte, la pastille du
 * canevas EST déjà son affichage. Sur le web, aucun contenu n'en porte encore.
 */
export function ReferenceNoteRow({
  references,
  viewerId,
}: {
  references: readonly PostReference[];
  viewerId?: string;
}) {
  const { t } = useI18n('components');

  const noted = references.filter((r) => r.display === 'NOTE');
  const selfSilent = references.some((r) => r.display === 'SILENT' && r.userId === viewerId);

  if (noted.length === 0 && !selfSilent) return null;

  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {noted.length > 0 && (
        <p className="text-xs text-[var(--gp-text-secondary)]">
          {t('post.references.with', 'With')}{' '}
          {noted.flatMap((reference, index) => [
            ...(index > 0 ? [', '] : []),
            <span key={reference.userId}>{reference.displayName ?? reference.username}</span>,
          ])}
        </p>
      )}
      {selfSilent && (
        <p className="text-xs font-medium text-[var(--gp-terracotta)]">
          {t('post.references.selfSilent', "You're referenced here")}
        </p>
      )}
    </div>
  );
}
