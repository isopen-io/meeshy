import type { QueryClient } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { useFallHeadline } from '@/lib/fall/use-fall';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { FallGlyph } from './fall-glyph';

/**
 * **LA CHUTE DÉTECTÉE DANS L'EN-TÊTE D'UN DIRECT** (#18748, SAN-01) — « Chute détectée à 16:42 » sous le nom du Sang,
 * tant que le serveur la sert et que `expiresAt` n'est pas passé ; le détail (batterie, carte) vit dans la fiche. Un
 * signal n'est JAMAIS un message de la conversation. `userId` absent (un groupe) : rien.
 */
export function ThreadFallLine({ userId, language, client = appQueryClient }: { readonly userId: string | undefined; readonly language: InterfaceLanguage; readonly client?: QueryClient }) {
  const headline = useFallHeadline(userId, language, client);
  if (headline === undefined) return null;
  return (
    <p data-thread-fall="" className="pointer-events-none flex items-center gap-1 text-mini font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
      <span style={{ color: 'var(--color-error)' }}>
        <FallGlyph responded={false} size={10} />
      </span>
      {headline}
    </p>
  );
}
