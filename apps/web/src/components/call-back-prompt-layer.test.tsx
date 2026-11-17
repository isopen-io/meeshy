import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { callActions } from '@/lib/calls/call-actions';
import { callBackPromptStore } from '@/lib/calls/call-back-prompt';
import { rememberCallIdentity } from '@/lib/calls/call-notice';
import type { StartCallRequest } from '@/lib/calls/engine';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import CallBackPromptLayer, { CallBackPromptPanel } from './call-back-prompt-layer';

/**
 * « APPELER » QUAND LE NAVIGATEUR ATTEND UN GESTE (#8199) — le rappel d'un
 * onglet ouvert à froid se confirme d'un toucher, qui débloque le son.
 */

const noop = () => undefined;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const request = (overrides: Partial<StartCallRequest> = {}): StartCallRequest => ({
  conversationId: 'conv-1',
  media: 'audio',
  title: 'Awa',
  avatar: null,
  isGroup: false,
  ...overrides,
});

const render = (value: StartCallRequest) =>
  renderToStaticMarkup(<CallBackPromptPanel request={value} language="fr" onCall={noop} onCancel={noop} />);

describe('la confirmation du rappel (#8199)', () => {
  test('elle nomme la personne rappelée et offre « Appeler » et « Annuler », en cibles de 44 px', () => {
    const html = render(request());
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-label="Rappeler Awa ?"');
    expect(html).toContain('data-call-back-prompt-action="call"');
    expect(html).toContain('>Appeler<');
    expect(html).toContain('>Annuler<');
    expect(html.match(/min-h-11/g)?.length).toBe(2);
  });

  test('un rappel vidéo le dit', () => {
    const html = render(request({ media: 'video' }));
    expect(html).toContain('Rappeler Awa en vidéo ?');
    expect(html).toContain('data-call-back-prompt="video"');
  });

  test('sans nom connu, la question nomme le type d’appel', () => {
    expect(render(request({ title: '' }))).toContain('aria-label="Appel vocal"');
    expect(render(request({ title: '', media: 'video' }))).toContain('aria-label="Appel vidéo"');
  });
});

describe('l’invite de rappel est en verre du kit (loi 18.1, #18223)', () => {
  test('le verre partagé du kit, jamais une teinte opaque posée à la main', () => {
    const panel = render(request()).match(/<[^>]*role="alertdialog"[^>]*>/)?.[0] ?? '';
    expect(panel).toMatch(/class="[^"]*\bglass-tone\b/);
    expect(panel).toContain('data-glass-tone="deep"');
    expect(panel).not.toContain('color-mix');
    expect(panel).not.toMatch(/\bshadow-lg\b/);
  });
});

describe('« Appeler » relit l’identité du fil au toucher (#18907)', () => {
  test('un rappel de groupe posé avant que son fil soit connu part en GROUPE, sous le nom du groupe', async () => {
    const started: StartCallRequest[] = [];
    const original = callActions.start;
    callActions.start = (value) => void started.push(value);
    callBackPromptStore.setState({ request: request({ conversationId: 'conv-cold-group', title: '', isGroup: false, media: 'video' }) });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<CallBackPromptLayer />));
      rememberCallIdentity('conv-cold-group', { title: 'Famille', avatar: null, isGroup: true });
      const call = host.querySelector<HTMLButtonElement>('[data-call-back-prompt-action="call"]');
      if (call === null) throw new Error('invite absente');
      await act(async () => call.click());
      expect(started).toEqual([{ conversationId: 'conv-cold-group', media: 'video', title: 'Famille', avatar: null, isGroup: true }]);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      callActions.start = original;
      callBackPromptStore.setState({ request: null });
    }
  });
});
