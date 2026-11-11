import { lazy, Suspense, useEffect } from 'react';
import { useStore } from 'zustand/react';

import { StreamAudio } from '@/components/call-media-elements';
import { CallScreen } from '@/components/call-screen';
import { callStore, type ActiveCall } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

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

const PILL_BG = 'color-mix(in srgb, var(--color-media-backdrop) 92%, transparent)';

/* Le bandeau d'un second appel (#17499) : son chunk, préchargé par l'appel vivant (`call-screen.tsx` › PREFETCH). */
const CallWaitingBanner = lazy(() => import('./call-waiting-banner').then((module) => ({ default: module.CallWaitingBanner })));

/* La pastille de l'appel réduit (`FloatingCallPillView.swift`) : son chunk, chargé dès que l'appel vit (`call-screen.tsx`), si bien que réduire ne l'attend pas. */
const CallPill = lazy(() => import('./call-floating-pill').then((module) => ({ default: module.CallPill })));

function Notice() {
  const language = currentInterfaceLanguage();
  useEffect(() => {
    const handle = setTimeout(() => callStore.setState({ notice: null }), 2500);
    return () => clearTimeout(handle);
  }, []);
  return (
    <div role="status" className="fixed inset-x-0 z-[210] mx-auto w-fit rounded-full px-4 py-2 text-body shadow-lg" style={{ background: PILL_BG, color: 'var(--color-on-media)', bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}>
      {translate(language, 'call.notice.alreadyInCall')}
    </div>
  );
}

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
  return <CallScreen call={call} />;
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
      {waiting === null ? null : (
        <Suspense fallback={null}>
          <CallWaitingBanner waiting={waiting} />
        </Suspense>
      )}
      {notice === null ? null : <Notice />}
    </>
  );
}
