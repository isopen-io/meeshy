import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { scriptedGateway } from '@/test-support/scripted-transport';

import { useAttachmentOpenReport } from './use-attachment-open-report';

/**
 * TÉMOIN (#7363, W6) — patron `use-media-playback.test.tsx` : harnais +
 * happy-dom + `createRoot`/`act`, dépendances INJECTÉES (`scriptedGateway`)
 * pour observer ce qui PART sans réseau réel.
 */
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function Harness(props: { readonly attachmentId: string; readonly isActive: boolean; readonly isMine: boolean; readonly deps: ReturnType<typeof scriptedGateway>['deps'] }) {
  useAttachmentOpenReport(props);
  return <div data-harness />;
}

function mount(props: { readonly attachmentId: string; readonly isActive: boolean; readonly isMine: boolean; readonly deps: ReturnType<typeof scriptedGateway>['deps'] }): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness {...props} />);
  });
}

describe('useAttachmentOpenReport (#7363, W6)', () => {
  test('page ACTIVE et REÇUE ⇒ rapporte "viewed" sur /attachments/:id/status', () => {
    const { calls, deps } = scriptedGateway({ 'POST /api/v1/attachments/att-open-1/status': { ok: true, data: {} } });
    mount({ attachmentId: 'att-open-1', isActive: true, isMine: false, deps });

    expect(calls()).toHaveLength(1);
    expect(calls()[0]?.path).toBe('/api/v1/attachments/att-open-1/status');
    expect(calls()[0]?.method).toBe('POST');
    expect(calls()[0]?.body).toEqual({ action: 'viewed', playPositionMs: 0, durationMs: 0, complete: true });
  });

  test('page INACTIVE ⇒ aucun rapport', () => {
    const { calls, deps } = scriptedGateway({ 'POST /api/v1/attachments/att-open-2/status': { ok: true, data: {} } });
    mount({ attachmentId: 'att-open-2', isActive: false, isMine: false, deps });

    expect(calls()).toHaveLength(0);
  });

  test('SA PROPRE pièce (isMine) ⇒ aucun rapport, même active', () => {
    const { calls, deps } = scriptedGateway({ 'POST /api/v1/attachments/att-open-3/status': { ok: true, data: {} } });
    mount({ attachmentId: 'att-open-3', isActive: true, isMine: true, deps });

    expect(calls()).toHaveLength(0);
  });

  test('une page revisitée (inactive → active à nouveau) rapporte UNE SECONDE FOIS', () => {
    const { calls, deps } = scriptedGateway({ 'POST /api/v1/attachments/att-open-4/status': { ok: true, data: {} } });
    mount({ attachmentId: 'att-open-4', isActive: true, isMine: false, deps });
    expect(calls()).toHaveLength(1);

    act(() => {
      root.render(<Harness attachmentId="att-open-4" isActive={false} isMine={false} deps={deps} />);
    });
    act(() => {
      root.render(<Harness attachmentId="att-open-4" isActive={true} isMine={false} deps={deps} />);
    });

    expect(calls()).toHaveLength(2);
  });
});
