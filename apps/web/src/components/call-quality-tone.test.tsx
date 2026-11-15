import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CallMember } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Arrives } from './call-arrives';
import { CallModerationMenu } from './call-moderation-menu';
import { CallQualityChip } from './call-quality';

/**
 * LE VERRE D'APPEL CHANGE DE TON EN FONDU (L5.8, #17849) — un écran reçu assombrit le verre de ce qui
 * flotte sur la scène, puis le rend : ni la capsule de l'en-tête, ni le bouton de modération d'une tuile,
 * ni la capsule « Revenir à la grille · Plein écran » de la une ne changent de ton d'un coup, le voile
 * passe par le moteur de mouvement.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
  await loadCallControlsCatalog('fr');
  await loadPillMotion();
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

type Play = { readonly keyframes: Keyframe[]; readonly pseudo: string | null | undefined };

/** Rend une surface en ton habituel, l'assombrit, la rend, et relève chaque fondu joué. */
async function toneCycle(surface: (prominent: boolean) => ReactNode, selector: string): Promise<{ readonly plays: readonly Play[]; readonly darkClass: string }> {
  const plays: Play[] = [];
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
  try {
    await act(async () => root.render(surface(false)));
    expect(plays.filter((play) => play.pseudo === '::before')).toHaveLength(0);
    await act(async () => root.render(surface(true)));
    const darkClass = host.querySelector(selector)?.className ?? '';
    await act(async () => root.render(surface(true)));
    await act(async () => root.render(surface(false)));
    await act(async () => root.unmount());
    return { plays, darkClass };
  } finally {
    host.remove();
    if (real === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    else Object.defineProperty(HTMLElement.prototype, 'animate', real);
  }
}

const expectFadeInThenOut = (all: readonly Play[]): void => {
  const plays = all.filter((play) => play.pseudo === '::before');
  expect(plays).toHaveLength(2);
  expect(plays[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 0.5 }]);
  expect(plays[1]?.keyframes[1]).toEqual({ opacity: 0 });
};

const member: CallMember = { userId: 'u-nadia', name: 'Nadia', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' };

describe('le ton du verre d’appel', () => {
  test('la capsule : la première peinture ne joue rien ; prominent → fondu du voile ; retour → fondu inverse', async () => {
    const { plays, darkClass } = await toneCycle(
      (prominent) => <CallQualityChip capsule={{ title: 'Awa', participantCount: null, duration: true, network: false }} clock="1:23" quality={null} language="fr" prominent={prominent} />,
      '[data-call-chip]',
    );
    expectFadeInThenOut(plays);
    expect(darkClass).toContain('glass-call-prominent');
  });

  test('le bouton de modération d’une tuile change de ton en fondu, comme la capsule', async () => {
    const { plays, darkClass } = await toneCycle(
      (prominent) => <CallModerationMenu member={member} language="fr" moderation={{ canModerate: () => true, mute: () => undefined, remove: () => undefined }} glyphs={{ more: '…', mute: 'm', remove: 'r' }} prominent={prominent} />,
      '[data-call-moderate]',
    );
    expectFadeInThenOut(plays);
    expect(darkClass).toContain('glass-call-prominent');
  });

  test('la capsule de la une passe d’une personne à un écran partagé en fondu, sans se remonter', async () => {
    const { plays, darkClass } = await toneCycle(
      (screen) => (
        <Arrives className={`${screen ? 'glass-call-prominent' : 'glass-call'} flex gap-1 rounded-full p-1`} prominent={screen} data-call-spotlight-capsule="">
          <span />
        </Arrives>
      ),
      '[data-call-spotlight-capsule]',
    );
    expectFadeInThenOut(plays);
    expect(darkClass).toContain('glass-call-prominent');
    expect(plays.filter((play) => play.pseudo === undefined)).toHaveLength(1);
  });
});
