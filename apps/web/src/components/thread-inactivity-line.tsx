import type { QueryClient } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { useInactivityHeadline } from '@/lib/inactivity/use-inactivity';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { InactivityGlyph } from './inactivity-glyph';

/**
 * **L'ALERTE D'INACTIVITÉ DANS L'EN-TÊTE D'UN DIRECT** (#18738, TEL-02) — « Aucune activité depuis 08:00 » sous le
 * nom du Sang, tant que le serveur la sert ; le détail (batterie, carte) vit dans la fiche. Un signal n'est JAMAIS
 * un message de la conversation. `userId` absent (un groupe) : rien.
 */
export function ThreadInactivityLine({ userId, language, client = appQueryClient }: { readonly userId: string | undefined; readonly language: InterfaceLanguage; readonly client?: QueryClient }) {
  const headline = useInactivityHeadline(userId, language, client);
  if (headline === undefined) return null;
  return (
    <p data-thread-inactivity="" className="pointer-events-none flex items-center gap-1 text-mini font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
      <span style={{ color: 'var(--color-error)' }}>
        <InactivityGlyph responded={false} size={10} />
      </span>
      {headline}
    </p>
  );
}
