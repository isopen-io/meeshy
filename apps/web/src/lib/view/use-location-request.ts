import { useCallback, useRef, useState } from 'react';

import { sharedPlaceOf, type SharedPlace } from '@/lib/send/shared-place';

/**
 * LA DEMANDE DE POSITION, DERRIÈRE UNE INTERFACE BOUCHONNABLE (#7280) —
 * même patron que `useRecorder` (`use-recorder.ts`) : le moteur navigateur
 * réel (`createBrowserLocationEngine`) n'est appelé par aucun témoin, qui
 * injectent le leur. C'est ce qui rend le REFUS mesurable — une permission
 * refusée ne se simule pas dans happy-dom.
 *
 * ## LE REFUS EST UN ÉTAT DESSINÉ, JAMAIS UN SILENCE
 *
 * `denied` (l'utilisateur a dit non, ou le site est bloqué),
 * `unsupported` (pas de `navigator.geolocation` : contexte non sécurisé,
 * navigateur ancien) et `failed` (satellite, délai dépassé) sont TROIS causes
 * distinctes, parce qu'elles appellent trois phrases différentes et deux
 * conduites : `denied` et `failed` se REJOUENT (le même `request()`),
 * `unsupported` ne se rejoue pas — d'où la garde `locationSupported()` en
 * amont, qui empêche la tuile d'exister sur un tel navigateur.
 *
 * `locating` est un état VISIBLE : une invite de permission peut rester
 * plusieurs secondes à l'écran, et un tap sans retour immédiat se retape.
 */
export type LocationRequestStatus = 'idle' | 'locating' | 'denied' | 'unsupported' | 'failed';

export type LocationRequestState = { readonly status: LocationRequestStatus };

export type LocationEngineResult =
  | { readonly ok: true; readonly place: SharedPlace }
  | { readonly ok: false; readonly reason: 'denied' | 'unsupported' | 'failed' };

export type LocationEngine = {
  readonly locate: () => Promise<LocationEngineResult>;
};

/** `navigator.geolocation` existe DANS CE NAVIGATEUR — la question se pose
 * une fois, chez l'hôte, et la réponse garde la tuile (loi 4 : une tuile
 * n'existe que si son geste a un effet). */
export function locationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.geolocation?.getCurrentPosition === 'function';
}

/**
 * LE MOTEUR NAVIGATEUR RÉEL — jamais appelé par un témoin.
 *
 * `enableHighAccuracy: false` et un `maximumAge` d'une minute : on PARTAGE un
 * lieu, on ne guide pas un pas-à-pas. La haute précision réveille le GPS,
 * coûte des secondes et de la batterie pour une épingle que le destinataire
 * ouvrira dans une carte ; un relevé d'il y a une minute est le même lieu.
 *
 * `PERMISSION_DENIED` (1) est la SEULE cause qu'un « Réessayer » ne résout
 * pas tout seul, et c'est elle qui mérite sa phrase ; les deux autres codes
 * (`POSITION_UNAVAILABLE`, `TIMEOUT`) se rejouent à l'identique.
 */
export function createBrowserLocationEngine(): LocationEngine {
  return {
    locate: () =>
      new Promise<LocationEngineResult>((resolve) => {
        if (!locationSupported()) {
          resolve({ ok: false, reason: 'unsupported' });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const place = sharedPlaceOf(position.coords);
            resolve(place === null ? { ok: false, reason: 'failed' } : { ok: true, place });
          },
          (error) => resolve({ ok: false, reason: error.code === error.PERMISSION_DENIED ? 'denied' : 'failed' }),
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
        );
      }),
  };
}

const IDLE: LocationRequestState = { status: 'idle' };

export function useLocationRequest(params?: { readonly engine?: LocationEngine }): {
  readonly state: LocationRequestState;
  /** Le lieu ATTACHÉ au prochain message — `null` tant qu'aucun n'a abouti. */
  readonly place: SharedPlace | null;
  readonly request: () => void;
  /** Ferme l'avertissement, garde le lieu (deux gestes, deux effets). */
  readonly dismiss: () => void;
  /** Retire le lieu attaché ET remet l'état au repos. */
  readonly clear: () => void;
} {
  const [state, setState] = useState<LocationRequestState>(IDLE);
  const [place, setPlace] = useState<SharedPlace | null>(null);
  /* LE MOTEUR EST FIGÉ AU MONTAGE — `createBrowserLocationEngine()` appelé
     dans le corps en reconstruirait un à chaque rendu, et le composeur en
     rend beaucoup (chaque frappe). Motif `useRecorder`. */
  const engine = useRef<LocationEngine | null>(null);
  if (engine.current === null) engine.current = params?.engine ?? createBrowserLocationEngine();

  const request = useCallback(() => {
    setState({ status: 'locating' });
    void engine.current?.locate().then((outcome) => {
      if (outcome.ok) {
        setPlace(outcome.place);
        setState(IDLE);
        return;
      }
      setState({ status: outcome.reason });
    });
  }, []);

  const dismiss = useCallback(() => setState(IDLE), []);

  const clear = useCallback(() => {
    setPlace(null);
    setState(IDLE);
  }, []);

  return { state, place, request, dismiss, clear };
}
