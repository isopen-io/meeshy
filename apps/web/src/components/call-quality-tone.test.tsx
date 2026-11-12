import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallQualityChip } from './call-quality';

/**
 * LA CAPSULE CHANGE DE TON EN FONDU (L5.8, #17849) — un écran reçu assombrit le verre de l'en-tête, puis le
 * rend : la capsule ne change pas de ton d'un coup, le voile passe par le moteur de mouvement.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
  await loadPillMotion();
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

describe('le ton du verre de la capsule', () => {
  test('la première peinture ne joue rien ; prominent → fondu du voile ; retour → fondu inverse', async () => {
    const plays: { readonly keyframes: Keyframe[]; readonly pseudo: string | null | undefined }[] = [];
    const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        plays.push({ keyframes, pseudo: options.pseudoElement });
        return { finished: new Promise(() => undefined), cancel: () => undefined, playState: 'running' };
      },
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const chip = (prominent: boolean) => <CallQualityChip capsule={{ title: 'Awa', participantCount: null, duration: true, network: false }} clock="1:23" quality={null} language="fr" prominent={prominent} />;
    await act(async () => root.render(chip(false)));
    expect(plays).toHaveLength(0);
    await act(async () => root.render(chip(true)));
    expect(plays).toHaveLength(1);
    expect(plays[0]).toEqual({ keyframes: [{ opacity: 0 }, { opacity: 0.5 }], pseudo: '::after' });
    expect(host.querySelector('[data-call-chip]')?.className).toContain('glass-call-prominent');
    await act(async () => root.render(chip(true)));
    expect(plays).toHaveLength(1);
    await act(async () => root.render(chip(false)));
    expect(plays).toHaveLength(2);
    expect(plays[1]?.keyframes[1]).toEqual({ opacity: 0 });
    await act(async () => root.unmount());
    host.remove();
    if (real === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    else Object.defineProperty(HTMLElement.prototype, 'animate', real);
  });
});
