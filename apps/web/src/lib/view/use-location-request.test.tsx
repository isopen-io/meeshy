import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useLocationRequest, type LocationEngine } from './use-location-request';

/**
 * **LE REFUS DE POSITION EST UN ÉTAT, PAS UN SILENCE (#7280)** — le critère
 * de fin de l'issue le nomme : « le refus de permission a son état visible et
 * son moyen de réessayer ».
 *
 * Le moteur RÉEL (`navigator.geolocation`) n'est appelé par AUCUN témoin :
 * ils injectent un `LocationEngine`, exactement comme `use-recorder.test`
 * injecte son `RecorderEngine`. C'est ce qui rend le REFUS testable — une
 * permission refusée ne se simule pas dans happy-dom.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Harness = {
  readonly current: () => ReturnType<typeof useLocationRequest>;
};

function mount(engine: LocationEngine): Harness {
  let latest: ReturnType<typeof useLocationRequest> | null = null;
  function Probe() {
    latest = useLocationRequest({ engine });
    return null;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  return {
    current: () => {
      if (latest === null) throw new Error('sonde non montée');
      return latest;
    },
  };
}

const engineThat = (outcome: Awaited<ReturnType<LocationEngine['locate']>>): LocationEngine => ({
  locate: () => Promise.resolve(outcome),
});

describe('useLocationRequest (#7280)', () => {
  test('une position obtenue devient le lieu ATTACHÉ au prochain message', async () => {
    const harness = mount(engineThat({ ok: true, place: { latitude: 48.8566, longitude: 2.3522 } }));
    await act(async () => {
      harness.current().request();
    });
    expect(harness.current().place).toEqual({ latitude: 48.8566, longitude: 2.3522 });
    expect(harness.current().state.status).toBe('idle');
  });

  test('un REFUS se dit — et il se rejoue', async () => {
    let attempts = 0;
    const engine: LocationEngine = {
      locate: () => {
        attempts += 1;
        return Promise.resolve(attempts === 1 ? { ok: false, reason: 'denied' } : { ok: true, place: { latitude: 1, longitude: 2 } });
      },
    };
    const harness = mount(engine);
    await act(async () => {
      harness.current().request();
    });
    expect(harness.current().state.status).toBe('denied');
    expect(harness.current().place).toBeNull();

    /* LE MOYEN DE RÉESSAYER — le même geste, et il ABOUTIT : un « Réessayer »
       qui ne rappelle pas le moteur serait exactement le contrôle inerte que
       la loi 4 interdit. */
    await act(async () => {
      harness.current().request();
    });
    expect(attempts).toBe(2);
    expect(harness.current().state.status).toBe('idle');
    expect(harness.current().place).toEqual({ latitude: 1, longitude: 2 });
  });

  test('un navigateur SANS géolocalisation le dit, il ne reste pas à « recherche »', async () => {
    const harness = mount(engineThat({ ok: false, reason: 'unsupported' }));
    await act(async () => {
      harness.current().request();
    });
    expect(harness.current().state.status).toBe('unsupported');
  });

  test('une panne (satellite, délai) se dit à part d’un refus', async () => {
    const harness = mount(engineThat({ ok: false, reason: 'failed' }));
    await act(async () => {
      harness.current().request();
    });
    expect(harness.current().state.status).toBe('failed');
  });

  test('« fermer » efface l’avertissement sans effacer un lieu déjà obtenu', async () => {
    const harness = mount(engineThat({ ok: false, reason: 'denied' }));
    await act(async () => {
      harness.current().request();
    });
    act(() => {
      harness.current().dismiss();
    });
    expect(harness.current().state.status).toBe('idle');
  });

  test('« retirer la position » rend le lieu à null', async () => {
    const harness = mount(engineThat({ ok: true, place: { latitude: 10, longitude: 20 } }));
    await act(async () => {
      harness.current().request();
    });
    act(() => {
      harness.current().clear();
    });
    expect(harness.current().place).toBeNull();
  });

  /** Pendant la demande, l'état est `locating` — c'est lui qui dessine le
   * « Recherche de votre position… » : une permission peut attendre plusieurs
   * secondes, et un tap sans retour immédiat se retape. */
  test('la demande en cours est un état visible', async () => {
    let settle: ((outcome: { ok: false; reason: 'denied' }) => void) | null = null;
    const engine: LocationEngine = {
      locate: () => new Promise((resolve) => (settle = resolve)),
    };
    const harness = mount(engine);
    act(() => {
      harness.current().request();
    });
    expect(harness.current().state.status).toBe('locating');
    await act(async () => {
      settle?.({ ok: false, reason: 'denied' });
    });
    expect(harness.current().state.status).toBe('denied');
  });
});
