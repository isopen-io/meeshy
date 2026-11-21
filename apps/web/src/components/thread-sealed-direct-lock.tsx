import { useEffect, type ReactNode } from 'react';

import { apiDeps } from '@/lib/api/deps';
import type { Conversation, Message } from '@/lib/api/types';
import { peerWroteEndToEnd } from '@/lib/end-to-end-thread-signal';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PlaintextDirectGesture } from '@/lib/view/plaintext-direct';
import { directPeerOf } from '@/lib/view/plaintext-direct-gesture';
import { threadPlaintextDirect } from '@/lib/view/thread-plaintext-direct';
import { defaultPeerDevices, usePeerDeviceVerdict, type PeerDevicesPort } from '@/lib/view/use-peer-device-reach';
import type { WriteRestriction } from '@/lib/write-restriction';

import { EndToEndPeerWithoutDeviceBanner } from './end-to-end-peer-without-device-banner';
import { PlaintextDirectAction } from './plaintext-direct-action';
import { ThreadComposerChrome } from './thread-composer-chrome';
import { WriteRestrictionBand } from './write-restriction-band';

/**
 * LE VERROU D'UN TÊTE-À-TÊTE CHIFFRÉ DE BOUT EN BOUT (#12986, #20075, #20181)
 * — chargé à la demande par `thread-write-lock.tsx`, qui montre le bandeau
 * seul en attendant. Un pair dont on ne sait rien, ou qui a un appareil
 * chiffré : le bandeau « écrivez depuis l'app » et l'ouverture de la
 * conversation sans chiffrement de bout en bout. Un pair su sans appareil : le
 * bandeau « ne peut pas recevoir de messages chiffrés », avec le composeur si
 * ce navigateur ne lui a jamais connu d'appareil, sans lui sinon. Un message
 * chiffré écrit par le pair dans ce fil suffit à le dire connu (#20181).
 */
export function SealedDirectLock({
  conversation,
  messages,
  restriction,
  viewerId,
  title,
  plaintextDirect,
  peerDevices,
  language,
  children,
}: {
  readonly conversation: Conversation;
  readonly messages?: readonly Message[] | undefined;
  readonly restriction: WriteRestriction;
  readonly viewerId: string;
  readonly title: string;
  readonly plaintextDirect?: PlaintextDirectGesture | undefined;
  readonly peerDevices?: PeerDevicesPort | undefined;
  readonly language: InterfaceLanguage;
  readonly children: ReactNode;
}) {
  const gesture = plaintextDirect ?? threadPlaintextDirect({ deps: apiDeps, conversation, viewerId, title });
  const port = peerDevices ?? defaultPeerDevices(viewerId);
  const peerId = gesture === undefined ? undefined : directPeerOf(conversation, viewerId, title)?.id;
  const wrote = peerId !== undefined && peerWroteEndToEnd(messages ?? [], peerId);
  useEffect(() => {
    if (wrote && peerId !== undefined) port.store.getState().noteDevice(peerId);
  }, [wrote, peerId, port]);
  const read = usePeerDeviceVerdict(peerId, port);
  const verdict = wrote && read === 'automatic' ? 'gesture' : read;
  if (gesture !== undefined && verdict !== 'unknown') {
    return (
      <>
        <EndToEndPeerWithoutDeviceBanner gesture={gesture} language={language} />
        {verdict === 'automatic' ? children : null}
      </>
    );
  }
  return (
    <ThreadComposerChrome>
      <WriteRestrictionBand restriction={restriction} language={language} />
      {gesture === undefined ? null : <PlaintextDirectAction gesture={gesture} language={language} marker="write-restriction" />}
    </ThreadComposerChrome>
  );
}
