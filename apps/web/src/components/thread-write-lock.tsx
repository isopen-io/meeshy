import type { ReactNode } from 'react';

import type { Conversation, Message } from '@/lib/api/types';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useWriteRestriction } from '@/lib/view/use-write-restriction';

import { ThreadComposerChrome } from './thread-composer-chrome';
import { WriteRestrictionBand } from './write-restriction-band';

/**
 * **LE VERROU D'ÉCRITURE DU FIL** (#9928) — enveloppe le composeur : quand la
 * passerelle ferme Meeshy Global à un mineur (ou qu'un refus vient de
 * l'apprendre), le bandeau tient sa place, dans le même verre, et aucun champ
 * de saisie n'est monté. Sinon, le composeur passe tel quel.
 *
 * `messages` est le fil chargé : il dit si la conversation a été vue chiffrée
 * de bout en bout, ce qui la garde fermée au clair pour toujours (#12949).
 */
export function ThreadWriteLock({
  conversationId,
  conversation,
  messages,
  children,
}: {
  readonly conversationId: string;
  readonly conversation: Conversation | undefined;
  readonly messages?: readonly Message[] | undefined;
  readonly children: ReactNode;
}) {
  const restriction = useWriteRestriction({ conversationId, conversation, messages });
  if (restriction === null) return <>{children}</>;
  return (
    <ThreadComposerChrome>
      <WriteRestrictionBand restriction={restriction} language={currentInterfaceLanguage()} />
    </ThreadComposerChrome>
  );
}
