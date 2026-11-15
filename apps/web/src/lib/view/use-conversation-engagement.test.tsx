import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ApiResult, HttpTransport } from '@/lib/api/http';

import { useEngagementRevalidation, type EngagementRevalidation } from './use-conversation-engagement';

/**
 * LE FIL D'UN INVITÉ NE DEMANDE PAS L'ÉTAT D'ENGAGEMENT (#10122).
 *
 * `GET /conversations/:id/engagement` est réservé aux comptes : la passerelle
 * rend 403 `REGISTERED_USER_REQUIRED` à une session invitée. Le fil d'un invité
 * le lançait à chaque ouverture — un refus certain et une erreur console, pour
 * une flamme qu'un invité n'a pas. Le fil d'un compte, lui, le relit toujours.
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

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

function transportFactice() {
  const appels: string[] = [];
  const transport = {
    request: async ({ path }: { readonly path: string }): Promise<ApiResult<unknown>> => {
      appels.push(path);
      return { ok: false, status: 403, error: 'Erreur 403', code: 'REGISTERED_USER_REQUIRED' };
    },
  } as unknown as HttpTransport;
  return { transport, appels };
}

function Sonde({ options }: { readonly options: EngagementRevalidation }) {
  useEngagementRevalidation(options);
  return null;
}

function monter(options: EngagementRevalidation): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Sonde options={options} />);
  });
}

describe("l'état d'engagement relu à l'ouverture du fil (#8906, #10122)", () => {
  test("le fil d'un COMPTE relit l'état serveur de sa conversation", () => {
    const { transport, appels } = transportFactice();
    monter({ conversationId: 'c-world', registered: true, deps: { source: 'gateway', transport } });
    expect(appels).toEqual(['/api/v1/conversations/c-world/engagement']);
  });

  test("le fil d'un INVITÉ ne lance pas la requête réservée aux comptes", () => {
    const { transport, appels } = transportFactice();
    monter({ conversationId: 'c-world', registered: false, deps: { source: 'gateway', transport } });
    expect(appels).toEqual([]);
  });
});
