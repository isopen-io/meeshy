import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { ADMIN_PERMISSIONS_QUERY_KEY, type AdminIdentity } from '@/lib/api/admin';
import type { DataSource } from '@/lib/api/config';
import type { ApiResult, HttpTransport } from '@/lib/api/http';
import { createSessionStore, type SessionStoreApi } from '@/lib/api/session';
import type { AdminPermissions } from '@/lib/admin/sections';

import { useAdminAccess, type AdminAccessOptions } from './use-admin-access';

/**
 * QUI VOIT LE BARREAU « ADMINISTRATION » (#6458) — la garde de la DÉCOUVERTE.
 *
 * Le barreau n'existe que lorsque la matrice est SERVIE et porte
 * `canAccessAdmin: true`. Chaque autre état — pas de session, requête en vol,
 * refus, panne, matrice sans le droit, session refermée — doit le laisser
 * absent, et chacun a son témoin : une garde écrite « tout sauf faux » serait
 * verte sur la matrice servie et OUVERTE pendant le vol, l'état par lequel
 * toute ouverture passe.
 *
 * La lecture est CELLE de l'écran `/admin` (`ADMIN_PERMISSIONS_QUERY_KEY`) :
 * le témoin du cache prouve qu'aucune seconde requête ne part quand la matrice
 * est déjà là.
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

const AUCUNE: AdminPermissions = {
  canAccessAdmin: false,
  canManageUsers: false,
  canManageGroups: false,
  canManageConversations: false,
  canViewAnalytics: false,
  canModerateContent: false,
  canViewAuditLogs: false,
  canManageAgent: false,
  canManageNotifications: false,
  canManageTranslations: false,
};

const memoire = () => {
  const cases = new Map<string, string>();
  return {
    getItem: (clef: string) => cases.get(clef) ?? null,
    setItem: (clef: string, valeur: string) => void cases.set(clef, valeur),
    removeItem: (clef: string) => void cases.delete(clef),
  };
};

const sessionOuverte = (): SessionStoreApi => {
  const session = createSessionStore({ storage: memoire() });
  session.getState().establish({
    user: { id: 'u-admin', username: 'admin', displayName: 'Admin' },
    token: 'jeton-de-test',
    sessionToken: 'session-de-test',
    expiresIn: 3600,
  });
  return session;
};

/**
 * Un transport qui COMPTE ses appels et rend ce qu'on lui dit. Le double cast
 * suit les autres témoins de ports : `HttpTransport` est aussi une FONCTION
 * (`net/transport.ts`) que la lecture des permissions n'appelle jamais.
 */
function transportFactice(reponse: () => Promise<ApiResult<unknown>>) {
  const appels: string[] = [];
  const transport = {
    request: async ({ path }: { readonly path: string }) => {
      appels.push(path);
      return reponse();
    },
  } as unknown as HttpTransport;
  return { transport, appels };
}

const servie = (permissions: Partial<AdminPermissions>) => async (): Promise<ApiResult<unknown>> => ({
  ok: true,
  data: { role: 'ADMIN', permissions: { ...AUCUNE, ...permissions } },
});

const refusee = (status: number) => async (): Promise<ApiResult<unknown>> => ({ ok: false, status, error: `Erreur ${status}` });

function Sonde({ options }: { readonly options: AdminAccessOptions }) {
  return <output data-admin={useAdminAccess(options) ? 'oui' : 'non'} />;
}

function monter(options: AdminAccessOptions): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Sonde options={options} />);
  });
}

const verdict = () => container?.querySelector('output')?.getAttribute('data-admin') ?? null;

async function attendre(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

const deps = (transport: HttpTransport, source: DataSource = 'gateway') => ({ source, transport });

describe('le barreau d’administration est fail-closed', () => {
  test('visiteur sans session : aucune lecture des permissions, aucun barreau', async () => {
    const { transport, appels } = transportFactice(servie({ canAccessAdmin: true }));
    monter({ deps: deps(transport), client: new QueryClient(), session: createSessionStore({ storage: memoire() }) });
    await attendre(() => false);

    expect(appels).toEqual([]);
    expect(verdict()).toBe('non');
  });

  test('requête EN VOL : aucun barreau tant que la matrice n’est pas servie', async () => {
    const { transport, appels } = transportFactice(() => new Promise<ApiResult<unknown>>(() => undefined));
    monter({ deps: deps(transport), client: new QueryClient(), session: sessionOuverte() });
    await attendre(() => appels.length === 1);

    expect(appels).toEqual(['/api/v1/me/permissions']);
    expect(verdict()).toBe('non');
  });

  test('403 : aucun barreau, et rien ne le dit', async () => {
    const client = new QueryClient();
    const { transport } = transportFactice(refusee(403));
    monter({ deps: deps(transport), client, session: sessionOuverte() });
    await attendre(() => client.getQueryState(ADMIN_PERMISSIONS_QUERY_KEY)?.status === 'error');

    expect(client.getQueryState(ADMIN_PERMISSIONS_QUERY_KEY)?.status).toBe('error');
    expect(verdict()).toBe('non');
  });

  test('panne réseau : aucun barreau', async () => {
    const client = new QueryClient();
    const { transport } = transportFactice(refusee(0));
    monter({ deps: deps(transport), client, session: sessionOuverte() });
    await attendre(() => client.getQueryState(ADMIN_PERMISSIONS_QUERY_KEY)?.status === 'error');

    expect(client.getQueryState(ADMIN_PERMISSIONS_QUERY_KEY)?.status).toBe('error');
    expect(verdict()).toBe('non');
  });

  /**
   * Une permission FINE vraie n'ouvre pas la porte : `canAccessAdmin` précède
   * les pièces, comme `visibleAdminSections` le tient pour l'écran.
   */
  test('matrice servie sans canAccessAdmin, même avec une permission fine : aucun barreau', async () => {
    const client = new QueryClient();
    const { transport } = transportFactice(servie({ canManageUsers: true, canViewAnalytics: true }));
    monter({ deps: deps(transport), client, session: sessionOuverte() });
    await attendre(() => client.getQueryState(ADMIN_PERMISSIONS_QUERY_KEY)?.status === 'success');

    expect(client.getQueryState(ADMIN_PERMISSIONS_QUERY_KEY)?.status).toBe('success');
    expect(verdict()).toBe('non');
  });

  test('matrice servie avec canAccessAdmin : le barreau', async () => {
    const { transport, appels } = transportFactice(servie({ canAccessAdmin: true }));
    monter({ deps: deps(transport), client: new QueryClient(), session: sessionOuverte() });
    await attendre(() => verdict() === 'oui');

    expect(verdict()).toBe('oui');
    expect(appels).toEqual(['/api/v1/me/permissions']);
  });

  test('construction fixtures : l’administration n’a pas de démonstration, aucune lecture', async () => {
    const { transport, appels } = transportFactice(servie({ canAccessAdmin: true }));
    monter({ deps: deps(transport, 'fixtures'), client: new QueryClient(), session: sessionOuverte() });
    await attendre(() => false);

    expect(appels).toEqual([]);
    expect(verdict()).toBe('non');
  });

  test('session refermée : le barreau tombe avec elle', async () => {
    const session = sessionOuverte();
    const { transport } = transportFactice(servie({ canAccessAdmin: true }));
    monter({ deps: deps(transport), client: new QueryClient(), session });
    await attendre(() => verdict() === 'oui');
    expect(verdict()).toBe('oui');

    act(() => {
      session.getState().clearSession();
    });

    expect(verdict()).toBe('non');
  });
});

describe('la lecture est celle de l’écran d’administration', () => {
  /**
   * L'écran `/admin` a déjà lu la matrice : ouvrir l'échelle ne la relit pas.
   * Une seconde lecture sous une autre clé rougirait ici par son appel.
   */
  test('matrice déjà en cache : le barreau sans aucune requête', async () => {
    const client = new QueryClient();
    const identite: AdminIdentity = { role: 'ADMIN', permissions: { ...AUCUNE, canAccessAdmin: true } };
    client.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, identite);
    const { transport, appels } = transportFactice(servie({ canAccessAdmin: true }));

    monter({ deps: deps(transport), client, session: sessionOuverte() });
    await attendre(() => false);

    expect(verdict()).toBe('oui');
    expect(appels).toEqual([]);
  });
});
