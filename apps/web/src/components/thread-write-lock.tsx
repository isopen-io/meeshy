import type { ReactNode } from 'react';

import { apiDeps } from '@/lib/api/deps';
import type { Conversation, Message } from '@/lib/api/types';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { PlaintextDirectGesture } from '@/lib/view/plaintext-direct';
import { threadPlaintextDirect } from '@/lib/view/thread-plaintext-direct';
import { useWriteRestriction } from '@/lib/view/use-write-restriction';

import { PlaintextDirectAction } from './plaintext-direct-action';
import { ThreadComposerChrome } from './thread-composer-chrome';
import { WriteRestrictionBand } from './write-restriction-band';

/**
 * **LE VERROU D'ÉCRITURE DU FIL** (#9928) — enveloppe le composeur : quand la
 * passerelle ferme Meeshy Global à un mineur (ou qu'un refus vient de
 * l'apprendre), le bandeau tient sa place, dans le même verre, et aucun champ
 * de saisie n'est monté. Sinon, le composeur passe tel quel.
 *
 * `messages` est le fil chargé : il dit si la conversation a été vue chiffrée
 * de bout en bout — l'avis d'activation ou un message chiffré (#12949,
 * #12986) —, ce qui la garde fermée au clair pour toujours.
 *
 * L'état final d'un TÊTE-À-TÊTE chiffré sur le web (#12986, #12966) : le
 * bandeau dit d'écrire depuis l'app, et offre d'ouvrir, à côté, la
 * conversation non chiffrée avec ce contact (`threadPlaintextDirect`, depuis
 * `viewerId` et `title` ; `plaintextDirect` le remplace). Aucun geste n'écrit
 * dans ce fil ; un groupe n'a que le bandeau.
 */
export function ThreadWriteLock({
  conversationId,
  conversation,
  messages,
  viewerId = '',
  title = '',
  plaintextDirect,
  children,
}: {
  readonly conversationId: string;
  readonly conversation: Conversation | undefined;
  readonly messages?: readonly Message[] | undefined;
  readonly viewerId?: string;
  readonly title?: string;
  readonly plaintextDirect?: PlaintextDirectGesture | undefined;
  readonly children: ReactNode;
}) {
  const restriction = useWriteRestriction({ conversationId, conversation, messages });
  if (restriction === null) return <>{children}</>;
  const language = currentInterfaceLanguage();
  const offered = restriction === 'end-to-end-encrypted' && conversation?.type === 'direct';
  const gesture = offered ? (plaintextDirect ?? threadPlaintextDirect({ deps: apiDeps, conversation, viewerId, title })) : undefined;
  return (
    <ThreadComposerChrome>
      <WriteRestrictionBand restriction={restriction} language={language} />
      {gesture === undefined ? null : <PlaintextDirectAction gesture={gesture} language={language} marker="write-restriction" />}
    </ThreadComposerChrome>
  );
}
