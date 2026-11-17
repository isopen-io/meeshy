import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { appQueryClient } from '@/lib/api/query-client';
import { callActions } from '@/lib/calls/call-actions';
import { speakerColor } from '@/lib/calls/call-speaker-color';
import type { ActiveCall } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadPillMotion, type ViewMotion } from '@/lib/calls/use-pill-motion';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallPillBar } from './call-floating-pill';

/**
 * **PENDANT MON PARTAGE, L'APPEL RÉDUIT RESTE LA CAPSULE** (P18.10, #17756) — la bulle n'offre pas « Arrêter » :
 * un glissé horizontal de la capsule ne la replie pas en bulle, et ce glissé n'est pas non plus le toucher qui
 * rouvrirait l'appel. Hors partage, le même glissé la replie, comme sur iOS.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: '',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina Diallo',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'pill',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const swipeThenRelease = async (active: ActiveCall) => {
  const seen: string[] = [];
  const original = { collapse: callActions.collapse, expand: callActions.expand };
  callActions.collapse = () => void seen.push('collapse');
  callActions.expand = () => void seen.push('expand');
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  try {
    await act(async () => root.render(<CallPillBar call={active} away={false} />));
    const bar = host.querySelector('[data-call-pill-bar]');
    const body = host.querySelector('button');
    if (bar === null || body === null) throw new Error('capsule absente');
    const pointer = (type: string, clientX: number) => new PointerEvent(type, { bubbles: true, pointerId: 1, clientX, clientY: 20, button: 0, pointerType: 'mouse' });
    await act(async () => void body.dispatchEvent(pointer('pointerdown', 40)));
    await act(async () => void body.dispatchEvent(pointer('pointerup', 240)));
    await act(async () => void body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 240, clientY: 20 })));
    return seen;
  } finally {
    await act(async () => root.unmount());
    host.remove();
    callActions.collapse = original.collapse;
    callActions.expand = original.expand;
  }
};

describe('le glissé de la capsule (P18.10)', () => {
  test('hors partage, il replie la capsule en bulle, sans rouvrir l’appel', async () => {
    expect(await swipeThenRelease(call())).toEqual(['collapse']);
  });

  test('pendant mon partage, il ne replie pas la capsule et ne rouvre pas l’appel non plus', async () => {
    expect(await swipeThenRelease(call({ screenSharing: true }))).toEqual([]);
  });
});

/**
 * **LA CAPSULE DE PARTAGE PREND LE VERRE ROUGE PARTAGÉ** (S1.9, #17774) — le bandeau « Vous partagez » de
 * la pile (`call-share-banner.tsx`) porte déjà `glass-call-danger` ; la capsule n'est plus un aplat rouge
 * posé en style, elle prend la même surface. Et quand le partage commence ou finit pendant qu'elle est là,
 * elle se refait par le mouvement de l'écran d'appel (S1.7) : une capsule ordinaire à « Arrêter », jamais
 * d'un coup.
 */
const mountBar = async (active: ActiveCall) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  await act(async () => root.render(<CallPillBar call={active} away={false} />));
  return {
    bar: () => host.querySelector<HTMLElement>('[data-call-pill-bar]'),
    render: (next: ActiveCall, motion?: ViewMotion) => act(async () => root.render(<CallPillBar call={next} away={false} motion={motion} />)),
    done: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
};

type Played = { readonly element: Element; readonly frames: Keyframe[]; readonly options: KeyframeAnimationOptions };

function recordAnimations() {
  const played: Played[] = [];
  const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      played.push({ element: this, frames, options });
      return { finished: new Promise<void>(() => undefined), cancel: () => undefined, effect: null };
    },
  });
  return { played, restore: () => (real === undefined ? Reflect.deleteProperty(HTMLElement.prototype, 'animate') : Object.defineProperty(HTMLElement.prototype, 'animate', real)) };
}

describe('la capsule de partage (S1.9)', () => {
  test('mon partage la pose sur le verre rouge du kit, sans aplat posé en style', async () => {
    const view = await mountBar(call({ screenSharing: true }));
    expect(view.bar()?.className.split(' ')).toContain('glass-call-danger');
    expect(view.bar()?.style.background ?? '').toBe('');
    await view.done();
  });

  test('hors partage, la pastille garde sa matière ordinaire : pas de verre rouge', async () => {
    const view = await mountBar(call());
    expect(view.bar()?.className.split(' ')).not.toContain('glass-call-danger');
    await view.done();
  });
});

describe('la capsule se refait en mouvement (S1.7)', () => {
  beforeAll(async () => {
    await loadPillMotion();
  });

  test('le partage qui commence ou finit pendant qu’elle est là la refait par le fondu et l’échelle de l’écran d’appel', async () => {
    const motion = recordAnimations();
    const view = await mountBar(call());
    motion.played.length = 0;
    await view.render(call({ screenSharing: true }));
    const arrival = motion.played.find((move) => move.element === view.bar());
    expect(arrival?.frames).toEqual([
      { opacity: 0, transform: 'scale(0.92)' },
      { opacity: 1, transform: 'none' },
    ]);
    expect(arrival?.options.duration).toBe(220);
    motion.played.length = 0;
    await view.render(call({ screenSharing: false }));
    expect(motion.played.some((move) => move.element === view.bar())).toBe(true);
    await view.done();
    motion.restore();
  });

  test('la première peinture ne joue rien', async () => {
    const motion = recordAnimations();
    const view = await mountBar(call({ screenSharing: true }));
    expect(motion.played.filter((move) => move.element === view.bar())).toEqual([]);
    await view.done();
    motion.restore();
  });

  test('qui repart est marqué sortant et caché au lecteur d’écran, touchable jusqu’au bout (loi 17.11)', async () => {
    const view = await mountBar(call());
    await view.render(call(), { leaving: true, arrives: false, gone: () => undefined });
    expect(view.bar()?.hasAttribute('data-leaving')).toBe(true);
    expect(view.bar()?.hasAttribute('inert')).toBe(false);
    expect(view.bar()?.getAttribute('aria-hidden')).toBe('true');
    await view.done();
  });
});

/**
 * **L'APPEL RÉDUIT, HORS PARTAGE** (#18223 ; P18.2, P18.3, S1.2, S1.8, loi 18.1 — références iOS #18464,
 * Android #18449). La FORME (capsule pleine largeur avec micro, bulle et raccrocher, ou vignette portrait
 * de P18) attend la décision porteur #17731 : ces témoins ne la jugent pas, ils tiennent ce qui vaut
 * quelle que soit la forme — le verre du kit, la couleur de l'autre, l'étiquette unique, « Arrêter » en
 * capsule blanche à encre rouge, et ce que le lecteur d'écran en dit.
 */
const tagOf = (html: string, marker: string): string => html.match(new RegExp(`<[^>]*${marker}[^>]*>`))?.[0] ?? '';
const textOf = (html: string, marker: string): string => html.match(new RegExp(`<[^>]*${marker}[^>]*>([^<]*)<`))?.[1] ?? '';
const pill = (active: ActiveCall) => renderToStaticMarkup(<CallPillBar call={active} away={false} />);
const knowConversation = (customName: string) =>
  appQueryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pageParams: [],
    pages: [{ conversations: [{ id: 'c-1', type: 'direct', title: 'Amina Diallo', userPreferences: [{ customName }] }] }],
  });
const established = (seconds: number): Partial<ActiveCall> => ({ phase: { kind: 'connected' }, connectedAt: Date.now() - seconds * 1000 });

describe('le verre du kit (loi 18.1)', () => {
  test('la capsule ordinaire est le verre partagé du kit, jamais une teinte opaque posée à la main', () => {
    const bar = tagOf(pill(call()), 'data-call-pill-bar');
    expect(bar).toMatch(/class="[^"]*\bglass-tone\b/);
    expect(bar).toContain('data-glass-tone="deep"');
    expect(bar).not.toContain('color-mix');
    expect(bar).not.toMatch(/\bshadow-lg\b/);
  });

  test('mon partage garde le verre rouge du kit, sans le verre ordinaire par-dessus', () => {
    const bar = tagOf(pill(call({ screenSharing: true })), 'data-call-pill-bar');
    expect(bar).toContain('glass-call-danger');
    expect(bar).not.toContain('glass-tone');
  });
});

describe('la couleur de l’autre (P18.2)', () => {
  test('un liseré à la couleur que l’écran d’appel lui donne, tirée de son identifiant', () => {
    const ring = tagOf(pill(call({ peerKey: 'u-peer', title: 'Amina Diallo' })), 'data-call-pill-ring');
    expect(ring).not.toBe('');
    expect(ring).toContain('aria-hidden');
    expect(ring.toLowerCase()).toContain(speakerColor('u-peer', 'Amina Diallo'));
  });

  test('sans identifiant, la couleur de son nom, sur la même palette que la bulle', () => {
    const ring = tagOf(pill(call({ peerKey: null, title: 'Famille' })), 'data-call-pill-ring');
    expect(ring.toLowerCase()).toContain(colorForName('Famille').toLowerCase());
  });

  test('sans identifiant ni nom, aucune couleur inventée : pas de liseré', () => {
    expect(pill(call({ peerKey: null, title: '' }))).not.toContain('data-call-pill-ring');
  });

  test('pendant mon partage, la capsule rouge ne porte pas de liseré (planche S1)', () => {
    expect(pill(call({ peerKey: 'u-peer', screenSharing: true }))).not.toContain('data-call-pill-ring');
  });
});

describe('« nom · durée » en une seule étiquette (P18.3)', () => {
  test('établi : le nom d’affichage et la durée dans UNE étiquette', () => {
    expect(textOf(pill(call(established(252))), 'data-call-pill-label')).toBe('Amina Diallo · 4:12');
  });

  test('le nom que j’ai donné passe avant le nom d’affichage', () => {
    knowConversation('Awa');
    try {
      expect(textOf(pill(call({ conversationId: 'c-1', ...established(252) })), 'data-call-pill-label')).toBe('Awa · 4:12');
    } finally {
      appQueryClient.removeQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    }
  });

  test('avant l’établissement : le nom seul, jamais « 0:00 » ; la phase reste dite au lecteur d’écran', () => {
    const html = pill(call({ phase: { kind: 'connecting' } }));
    expect(textOf(html, 'data-call-pill-label')).toBe('Amina Diallo');
    expect(html).toContain('data-call-pill-phase="connecting"');
    expect(textOf(html, 'data-call-pill-spoken')).toContain('Connexion');
  });

  test('pendant mon partage, la même étiquette', () => {
    knowConversation('Awa');
    try {
      expect(textOf(pill(call({ conversationId: 'c-1', screenSharing: true, ...established(252) })), 'data-call-pill-label')).toBe('Awa · 4:12');
    } finally {
      appQueryClient.removeQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    }
  });
});

describe('« Arrêter » en capsule blanche à encre rouge (S1.2)', () => {
  test('le bouton de la capsule de partage est blanc, à l’encre rouge du bandeau « Vous partagez »', () => {
    const stop = tagOf(pill(call({ screenSharing: true })), 'data-call-pill-stop-share');
    expect(stop).toContain('background:var(--color-on-media)');
    expect(stop).toContain('color:var(--ios-error-dark)');
    expect(stop).not.toContain('--color-media-hairline');
    expect(stop).toContain('min-h-11');
  });
});

describe('ce que la capsule dit au lecteur d’écran (S1.8)', () => {
  const describedBy = (html: string): string => tagOf(html, 'data-call-pill-expand').match(/aria-describedby="([^"]*)"/)?.[1] ?? '';

  test('le toucher garde son nom d’action, et la description dit l’appel en cours, la personne et la durée vivante', () => {
    const html = pill(call(established(252)));
    const expand = tagOf(html, 'data-call-pill-expand');
    expect(expand).toContain('aria-label="Revenir à l’appel"');
    const ids = describedBy(html).split(' ');
    expect(ids.length).toBeGreaterThan(0);
    const spoken = tagOf(html, 'data-call-pill-spoken');
    expect(ids).toContain(spoken.match(/id="([^"]*)"/)?.[1] ?? '?');
    expect(textOf(html, 'data-call-pill-spoken')).toBe('Appel en cours — Amina Diallo');
    const clock = tagOf(html, 'data-call-pill-clock');
    expect(clock).toContain('role="timer"');
    expect(ids).toContain(clock.match(/id="([^"]*)"/)?.[1] ?? '?');
    expect(textOf(html, 'data-call-pill-clock')).toBe('4:12');
  });

  test('pendant mon partage aussi, et « Arrêter » reste un bouton nommé', () => {
    const html = pill(call({ screenSharing: true, ...established(252) }));
    expect(textOf(html, 'data-call-pill-spoken')).toBe('Appel en cours — Amina Diallo');
    expect(tagOf(html, 'data-call-pill-clock')).toContain('role="timer"');
    expect(tagOf(html, 'data-call-pill-stop-share')).toContain('aria-label="Arrêter le partage d’écran"');
  });

  test('avant l’établissement, la phase au lieu de « appel en cours », et aucune durée', () => {
    const html = pill(call({ phase: { kind: 'connecting' } }));
    expect(textOf(html, 'data-call-pill-spoken')).toBe('Connexion… — Amina Diallo');
    expect(html).not.toContain('data-call-pill-clock');
  });

  test('l’étiquette visible n’est pas lue une seconde fois', () => {
    expect(tagOf(pill(call(established(252))), 'data-call-pill-label')).toContain('aria-hidden');
  });
});
