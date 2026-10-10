import type { ReactNode } from 'react';

import type { Conversation } from '@/lib/api/types';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useWriteRestriction } from '@/lib/view/use-write-restriction';

import { WriteRestrictionBand } from './write-restriction-band';

/**
 * **LE VERROU D'ÉCRITURE DU FIL** (#9928) — enveloppe le composeur : quand la
 * passerelle ferme Meeshy Global à un mineur (ou qu'un refus vient de
 * l'apprendre), le bandeau tient sa place, dans le même verre, et aucun champ
 * de saisie n'est monté. Sinon, le composeur passe tel quel.
 */
export function ThreadWriteLock({
  conversationId,
  conversation,
  children,
}: {
  readonly conversationId: string;
  readonly conversation: Conversation | undefined;
  readonly children: ReactNode;
}) {
  const restriction = useWriteRestriction({ conversationId, conversation });
  if (restriction === null) return <>{children}</>;
  return (
    <div className="thread-composer-chrome glass-prominent">
      <WriteRestrictionBand restriction={restriction} language={currentInterfaceLanguage()} />
    </div>
  );
}
