import { lazy, Suspense } from 'react';
import { useStore } from 'zustand/react';

import { StreamAudio } from '@/components/call-media-elements';
import { CallScreen } from '@/components/call-screen';
import { callStore, type ActiveCall } from '@/lib/calls/call-store';

/**
 * **CE QUE LA COUCHE D'APPEL PEINT** (#6382) — l'écran plein, OU la pastille
 * flottante quand l'appel est réduit (`FloatingCallPillView.swift` : durée ou
 * état, micro, raccrocher, toucher pour revenir), le bandeau d'appel en
 * attente (`CallWaitingBannerView.swift`), et le refus « un appel est déjà en
 * cours ». Le son des pairs est monté ICI, hors de l'écran : réduire l'appel
 * ne le coupe pas.
 *
 * #8046 — la pastille se replie en BULLE déplaçable (bouton, ou glissement
 * horizontal franc comme sur iOS). La bulle et l'image dans l'image sont des
 * chunks FRÈRES montés par `call-layer.tsx`, pas des enfants : ils partagent
 * les éléments média avec cet écran sans l'importer. Ni la pastille ni la
 * bulle ne couvrent l'application : on navigue et on écrit dessous.
 */

/* Le SECOND appel (#17499) : le bandeau de celui qui arrive et le refus « un appel est déjà en cours » d'en composer un, dans un chunk préchargé par l'appel vivant (`call-screen.tsx` › PREFETCH). */
const SecondCallLayer = lazy(() => import('./call-waiting-banner').then((module) => ({ default: module.SecondCallLayer })));

/* La pastille de l'appel réduit (`FloatingCallPillView.swift`) : son chunk, chargé dès que l'appel vit (`call-screen.tsx`), si bien que réduire ne l'attend pas. */
const CallPill = lazy(() => import('./call-floating-pill').then((module) => ({ default: module.CallPill })));

/** L'écran plein ou la pastille — la bulle est un chunk frère (`call-layer.tsx`) ; la sonnerie et la fin reprennent toujours l'écran plein. */
export function ActiveCallView({ call }: { readonly call: ActiveCall }) {
  const reduced = call.phase.kind !== 'incoming' && call.phase.kind !== 'ended';
  if (reduced && call.display === 'pill')
    return (
      <Suspense fallback={null}>
        <CallPill call={call} />
      </Suspense>
    );
  if (reduced && call.display === 'bubble') return null;
  /* Ce que l'écran charge à part pour son premier rendu (la réponse d'un appel entrant, #17650) le retient ENTIER : jamais un portrait sans ses boutons. Le son des pairs, monté à côté, n'attend rien. */
  return (
    <Suspense fallback={null}>
      <CallScreen call={call} />
    </Suspense>
  );
}

export function CallOverlay() {
  const call = useStore(callStore, (state) => state.call);
  const waiting = useStore(callStore, (state) => state.waiting);
  const notice = useStore(callStore, (state) => state.notice);
  const streams = call === null ? [] : Object.entries(call.remoteStreams);
  return (
    <>
      {streams.map(([userId, stream]) => (
        <StreamAudio key={userId} stream={stream} />
      ))}
      {call === null ? null : <ActiveCallView call={call} />}
      {waiting === null && notice === null ? null : (
        <Suspense fallback={null}>
          <SecondCallLayer waiting={waiting} busy={notice !== null} />
        </Suspense>
      )}
    </>
  );
}
