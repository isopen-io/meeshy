import type { QueryClient } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { usePhoneCallHeadline } from '@/lib/phone-call/use-phone-call';

import { PhoneCallGlyph } from './phone-call-glyph';

/**
 * **« EN APPEL » DANS L'EN-TÊTE D'UN DIRECT** (#18753, ACT-01) — « En appel depuis 12 min » sous le nom du Sang,
 * tant que le serveur le sert et qu'il n'a pas expiré. Le glyphe est muet, le texte dit l'état. Un signal n'est
 * JAMAIS un message de la conversation, et il ne dit jamais avec qui. `userId` absent (un groupe) : rien.
 */
export function ThreadPhoneCallLine({ userId, language, client = appQueryClient }: { readonly userId: string | undefined; readonly language: InterfaceLanguage; readonly client?: QueryClient }) {
  const headline = usePhoneCallHeadline(userId, language, client);
  if (headline === undefined) return null;
  return (
    <p data-thread-phone-call="" className="pointer-events-none flex items-center gap-1 text-mini font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
      <span style={{ color: 'var(--color-ok)' }}>
        <PhoneCallGlyph active size={10} />
      </span>
      {headline}
    </p>
  );
}
