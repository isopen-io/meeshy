import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CallCaption } from '@/lib/calls/call-captions';
import { SELF_SPEAKER_COLOR, speakerColor } from '@/lib/calls/call-speaker-color';
import type { ActiveCall } from '@/lib/calls/call-store';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { CallCaptionsPanel } from './call-captions-panel';

const colorOf = (line: CallCaption): string => (line.mine ? SELF_SPEAKER_COLOR : speakerColor(line.speakerId));

/**
 * LE BANDEAU DES SOUS-TITRES (#8393) — un verre d'appel sombre, une couleur
 * STABLE par personne (celle du liseré de sa vignette), la petite étiquette
 * « EN → FR » d'une ligne traduite, et l'original déplié d'un toucher sur la
 * phrase. La région reste `aria-live` polie ; une ligne en révision n'y est
 * pas annoncée ; chaque texte porte `dir="auto"`.
 */

const caption = (overrides: Partial<CallCaption> = {}): CallCaption => ({
  id: 'w-1',
  speakerId: 'u-nadia',
  speakerName: 'Nadia',
  original: 'Hello everyone',
  translated: 'Bonjour à tous',
  pair: { from: 'en', to: 'fr' },
  isFinal: true,
  at: 1_000,
  mine: false,
  ...overrides,
});

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Nadia',
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
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [caption()],
  captionsMode: 'translated',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const panel = (overrides: Partial<ActiveCall> = {}, surface: 'glass' | 'inset' = 'glass') => renderToStaticMarkup(<CallCaptionsPanel call={call(overrides)} language="fr" colorOf={colorOf} surface={surface} />);

describe('le bandeau', () => {
  test('un verre d’appel sombre — sauf posé DANS le cadre de verre d’un groupe (pas de verre sur verre)', () => {
    expect(panel()).toMatch(/<section[^>]*class="glass-call-prominent/);
    expect(panel({}, 'inset')).not.toContain('glass-call');
  });

  test('région vivante polie, texte en dir="auto"', () => {
    const html = panel();
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('dir="auto"');
  });

  test('le nom de chaque personne dans SA couleur ; le mien en blanc', () => {
    const html = panel({ captions: [caption(), caption({ id: 'w-2', speakerId: 'u-me', mine: true, translated: null, pair: null, original: 'Salut', at: 2_000 })] });
    expect(html).toContain(`color:${speakerColor('u-nadia')}`);
    expect(html).toContain(`color:${SELF_SPEAKER_COLOR}`);
  });

  test('une ligne traduite porte l’étiquette « EN → FR » ; l’original n’en porte pas', () => {
    expect(panel()).toContain('EN → FR');
    expect(panel({ captionsMode: 'original' })).not.toContain('EN → FR');
    expect(panel({ captionsMode: 'original' })).toContain('Hello everyone');
  });

  test('une ligne en révision n’est pas annoncée', () => {
    expect(panel({ captions: [caption({ isFinal: false })] })).toContain('aria-hidden="true"');
  });
});

describe('les gestes', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = (overrides: Partial<ActiveCall> = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallCaptionsPanel call={call(overrides)} language="fr" colorOf={colorOf} surface="glass" />));
    const press = (selector: string) => act(() => (host.querySelector(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, press, done };
  };

  test('toucher une phrase traduite déplie son original sous elle, un second toucher le replie', () => {
    const view = mount();
    const line = view.host.querySelector('[data-call-caption-line="w-1"]');
    expect(line?.getAttribute('aria-expanded')).toBe('false');
    expect(view.host.querySelector('[data-call-caption-original]')).toBeNull();
    view.press('[data-call-caption-line="w-1"]');
    const original = view.host.querySelector('[data-call-caption-original]');
    expect(original?.textContent).toBe('Hello everyone');
    expect(original?.getAttribute('dir')).toBe('auto');
    expect(original?.getAttribute('lang')).toBe('en');
    expect(view.host.querySelector('[data-call-caption-line="w-1"]')?.getAttribute('aria-expanded')).toBe('true');
    view.press('[data-call-caption-line="w-1"]');
    expect(view.host.querySelector('[data-call-caption-original]')).toBeNull();
    view.done();
  });

  test('une ligne qui EST l’original ne promet rien à déplier', () => {
    const view = mount({ captionsMode: 'original' });
    expect(view.host.querySelector('[data-call-caption-line="w-1"]')?.hasAttribute('aria-expanded')).toBe(false);
    view.done();
  });

  test('le bandeau ne montre que le direct : le Journal vit dans son panneau (#8579)', () => {
    const view = mount();
    expect(view.host.querySelector('[data-call-captions-journal-toggle]')).toBeNull();
    expect(view.host.querySelector('[data-call-journal-entry]')).toBeNull();
    view.done();
  });
});

describe('la voix non transcrite (#9142)', () => {
  test('la note ne nomme pas le navigateur : la coque Android n’en a pas, et la note y est permanente', () => {
    const notes = SUPPORTED_INTERFACE_LANGUAGES.map((language) =>
      renderToStaticMarkup(<CallCaptionsPanel call={call({ transcription: 'unsupported' })} language={language} colorOf={colorOf} />).match(/data-call-captions-note="unsupported">([^<]*)</)?.[1] ?? '',
    );
    expect(notes.every((note) => note !== '')).toBe(true);
    expect(notes.filter((note) => /navigateur|browser|navegador|المتصفح/i.test(note))).toEqual([]);
  });
});
