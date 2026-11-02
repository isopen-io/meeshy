import { act, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import * as worldEndpoints from '@meeshy/shared/api/endpoints/world';
import type { WorldParticipantCard } from '@meeshy/shared/types/world-participant-card';

import type { ApiResult, HttpTransport } from '@/lib/api/http';
import { createSessionStore, type SessionStoreApi } from '@/lib/api/session';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { WorldParticipantCardContext, type WorldParticipantCardOpener } from '@/lib/view/world-participant-card-context';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { loadColorAliasMap, loadIosSchemes, resolveColor, wcagContrastRatio } from '../../scripts/lib/glass-contrast.mjs';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';
import { WorldParticipantCardHost } from './world-participant-card-host';
import { worldCardKindChipColors } from './world-participant-card-sheet';

/**
 * DANS WORLD WIDE, L'ÉQUIPE TOUCHE UN AUTEUR ET LIT SA FICHE (#10102, partie
 * web) — et PERSONNE D'AUTRE.
 *
 * Trois étages, trois témoins :
 *  1. le GESTE — l'avatar et le nom d'un auteur, compte OU anonyme, ouvrent la
 *     fiche quand le fil le permet (contexte posé) ; sans contexte, rien ne
 *     change : un anonyme reste muet, un compte mène à son profil ;
 *  2. la PORTE — l'hôte ne pose le contexte que dans World Wide, et pour un
 *     rôle de PLATEFORME au-delà de USER, lu sur la matrice servie (jamais
 *     deviné) ; un USER, un invité, une autre conversation : rien ;
 *  3. la FEUILLE — ce que le contrat sert ; un 403 la referme sans rien dire.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/c/c-world' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  document.querySelectorAll('dialog').forEach((node) => node.remove());
  window.history.replaceState(null, '', '/c/c-world');
});

const PARTICIPANT_ID = '66f0a1b2c3d4e5f6a7b8c9d0';

const message = (sender: 'anonymous' | 'account'): Message =>
  ({
    id: `m-${sender}`,
    conversationId: 'c-world',
    senderId: PARTICIPANT_ID,
    content: 'Bonjour le monde',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    maxViewOnceCount: 1,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 1,
    readCount: 1,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date('2026-10-11T09:00:00.000Z'),
    updatedAt: new Date('2026-10-11T09:00:00.000Z'),
    timestamp: new Date('2026-10-11T09:00:00.000Z'),
    translations: [],
    sender:
      sender === 'anonymous'
        ? { id: PARTICIPANT_ID, conversationId: 'c-world', displayName: 'Awa', type: 'anonymous', role: 'member', language: 'fr', isActive: true, joinedAt: new Date('2026-10-11T08:00:00.000Z'), isOnline: false }
        : {
            id: PARTICIPANT_ID,
            conversationId: 'c-world',
            userId: 'u-nour',
            displayName: 'Nour Haddad',
            type: 'user',
            role: 'member',
            language: 'fr',
            isActive: true,
            joinedAt: new Date('2026-10-11T08:00:00.000Z'),
            isOnline: false,
            user: { id: 'u-nour', username: 'nour', displayName: 'Nour Haddad' },
          },
  }) as unknown as Message;

const mount = (node: React.ReactNode) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
};

const skinOf = (skin: 'bubble' | 'focal', sender: 'anonymous' | 'account') => {
  const place: PlacedMessage = { message: message(sender), head: true, tail: true, opensDay: null };
  return skin === 'bubble' ? (
    <Bubble place={place} languages={['fr']} isGrouped viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} />
  ) : (
    <FocalRow mode="focal" place={place} languages={['fr']} viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} />
  );
};

const opener = () => {
  const opened: string[] = [];
  const value: WorldParticipantCardOpener = { open: (id) => void opened.push(id), labelFor: (name) => `Voir la fiche de ${name}` };
  return { opened, value };
};

const triggers = () => [...(container?.querySelectorAll<HTMLElement>('[data-world-card-trigger]') ?? [])];
const click = (element: Element) =>
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });

describe('le geste : toucher un auteur ouvre sa fiche quand le fil le permet', () => {
  for (const skin of ['bubble', 'focal'] as const) {
    for (const sender of ['anonymous', 'account'] as const) {
      test(`${skin} · auteur ${sender} : l’avatar ouvre la fiche du participant (senderId)`, () => {
        const { opened, value } = opener();
        mount(<WorldParticipantCardContext.Provider value={value}>{skinOf(skin, sender)}</WorldParticipantCardContext.Provider>);
        const avatar = triggers().find((node) => node.dataset.worldCardTrigger === 'avatar');
        if (avatar === undefined) throw new Error('aucun déclencheur de fiche sur l’avatar');
        expect(avatar.getAttribute('aria-label')).toBe(`Voir la fiche de ${sender === 'anonymous' ? 'Awa' : 'Nour Haddad'}`);
        expect(avatar.getAttribute('aria-haspopup')).toBe('dialog');
        click(avatar);
        expect(opened).toEqual([PARTICIPANT_ID]);
        expect(window.location.pathname).toBe('/c/c-world');
      });

      test(`${skin} · auteur ${sender} : le nom ouvre la même fiche, sans mener au profil`, () => {
        const { opened, value } = opener();
        mount(<WorldParticipantCardContext.Provider value={value}>{skinOf(skin, sender)}</WorldParticipantCardContext.Provider>);
        const name = triggers().find((node) => node.dataset.worldCardTrigger === 'name' && (node.textContent ?? '').includes(sender === 'anonymous' ? 'Awa' : 'Nour Haddad'));
        if (name === undefined) throw new Error('le nom n’ouvre pas la fiche');
        click(name);
        expect(opened).toEqual([PARTICIPANT_ID]);
        expect(container?.querySelector('a[href="/u/nour"]')).toBeNull();
      });
    }
  }

  test('le geste n’ouvre pas le menu du message de la rangée (l’événement ne remonte pas)', () => {
    const { value } = opener();
    const rowClicks: string[] = [];
    mount(
      <WorldParticipantCardContext.Provider value={value}>
        <div onClick={() => rowClicks.push('rangée')}>{skinOf('bubble', 'anonymous')}</div>
      </WorldParticipantCardContext.Provider>,
    );
    click(triggers()[0] as HTMLElement);
    expect(rowClicks).toEqual([]);
  });
});

describe('sans porte ouverte, rien ne change (comportement d’avant, gardé)', () => {
  for (const skin of ['bubble', 'focal'] as const) {
    test(`${skin} · un anonyme reste muet : ni fiche, ni lien`, () => {
      mount(skinOf(skin, 'anonymous'));
      expect(triggers()).toEqual([]);
      expect(container?.querySelector('a[href^="/u/"]')).toBeNull();
    });

    test(`${skin} · un compte mène toujours à son profil`, () => {
      mount(skinOf(skin, 'account'));
      expect(triggers()).toEqual([]);
      expect(container?.querySelector('a[href="/u/nour"]')).not.toBeNull();
    });
  }
});

/* ───────────────────────── la porte et la feuille ───────────────────────── */

const memory = () => {
  const cells = new Map<string, string>();
  return {
    getItem: (key: string) => cells.get(key) ?? null,
    setItem: (key: string, value: string) => void cells.set(key, value),
    removeItem: (key: string) => void cells.delete(key),
  };
};

const signedIn = (): SessionStoreApi => {
  const session = createSessionStore({ storage: memory() });
  session.getState().establish({
    user: { id: 'u-staff', username: 'staff', displayName: 'Staff' },
    token: 'jeton-de-test',
    sessionToken: 'session-de-test',
    expiresIn: 3600,
  });
  return session;
};

const NO_PERMISSIONS = {
  canAccessAdmin: false,
  canManageUsers: false,
  canManageGroups: false,
  canManageConversations: false,
  canViewAnalytics: false,
  canModerateContent: false,
  canViewAuditLogs: false,
  canManageAgent: false,
  canManageGame: false,
  canManageNotifications: false,
  canManageTranslations: false,
};

const CARD: WorldParticipantCard = {
  participantId: PARTICIPANT_ID,
  participantType: 'anonymous',
  displayName: 'Awa',
  avatar: null,
  username: null,
  conversationRole: 'member',
  accountRole: null,
  languages: { conversation: 'fr', system: null, regional: null, customDestination: null, deviceLocale: null },
  country: 'SN',
  client: { browser: 'Safari', browserVersion: '17', os: 'iOS', osVersion: '17', deviceType: 'mobile', platform: null, appVersion: null },
  joinedAt: '2026-10-11T08:00:00.000Z',
  shareLink: { identifier: 'mshy_world', linkId: '66f0a1b2c3d4e5f6a7b8c9d1', name: 'World Wide' },
  status: 'active',
  accountDetailsWithheld: false,
};

function gateway(role: string, card: () => ApiResult<unknown>) {
  const calls: string[] = [];
  const transport = {
    request: async ({ path }: { readonly path: string }): Promise<ApiResult<unknown>> => {
      calls.push(path);
      if (path === '/api/v1/me/permissions') return { ok: true, data: { role, permissions: NO_PERMISSIONS } };
      return card();
    },
  } as unknown as HttpTransport;
  return { transport, calls };
}

function Probe() {
  const value = useContext(WorldParticipantCardContext);
  return (
    <button type="button" data-probe={value === null ? 'closed' : 'open'} onClick={() => value?.open(PARTICIPANT_ID)}>
      sonde
    </button>
  );
}

async function settle(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

const probe = () => container?.querySelector<HTMLElement>('[data-probe]')?.dataset.probe ?? null;
const sheet = () => document.querySelector<HTMLDialogElement>('dialog[data-world-participant-card]');

const mountHost = (options: {
  readonly identifier: string | null;
  readonly role: string;
  readonly session?: SessionStoreApi;
  readonly card?: () => ApiResult<unknown>;
}) => {
  const served = gateway(options.role, options.card ?? (() => ({ ok: true, data: CARD })));
  mount(
    <WorldParticipantCardHost
      conversationIdentifier={options.identifier}
      access={{ deps: { source: 'gateway', transport: served.transport }, client: new QueryClient(), session: options.session ?? signedIn() }}
    >
      <Probe />
    </WorldParticipantCardHost>,
  );
  return served;
};

describe('la porte : World Wide, et un rôle de plateforme au-delà de USER', () => {
  for (const role of ['ANALYST', 'AUDIT', 'MODERATOR', 'ADMIN', 'BIGBOSS']) {
    test(`${role} dans World Wide ⇒ les auteurs deviennent touchables`, async () => {
      mountHost({ identifier: 'world', role });
      await settle(() => probe() === 'open');
      expect(probe()).toBe('open');
    });
  }

  for (const role of ['USER', 'AGENT', 'INCONNU']) {
    test(`${role} dans World Wide ⇒ rien ne s’ouvre`, async () => {
      const { calls } = mountHost({ identifier: 'world', role });
      await settle(() => calls.length > 0);
      await settle(() => false);
      expect(probe()).toBe('closed');
      expect(calls.filter((path) => path.startsWith('/api/v1/world/'))).toEqual([]);
    });
  }

  test('ADMIN dans une AUTRE conversation ⇒ rien ne s’ouvre', async () => {
    const { calls } = mountHost({ identifier: 'mshy_amis', role: 'ADMIN' });
    await settle(() => false);
    expect(probe()).toBe('closed');
    expect(calls.filter((path) => path.startsWith('/api/v1/world/'))).toEqual([]);
  });

  test('sans session (invité, visiteur) ⇒ aucune lecture du rôle, rien ne s’ouvre', async () => {
    const { calls } = mountHost({ identifier: 'world', role: 'ADMIN', session: createSessionStore({ storage: memory() }) });
    await settle(() => false);
    expect(calls).toEqual([]);
    expect(probe()).toBe('closed');
  });
});

describe('la feuille : ce que le contrat sert, et rien sur un refus', () => {
  test('toucher un auteur ouvre la fiche servie', async () => {
    const { calls } = mountHost({ identifier: 'world', role: 'MODERATOR' });
    await settle(() => probe() === 'open');
    click(container?.querySelector('[data-probe]') as HTMLElement);
    await settle(() => (sheet()?.textContent ?? '').includes('Safari 17'));
    const text = sheet()?.textContent ?? '';
    expect(calls).toContain(worldEndpoints.participantsByParticipantId(PARTICIPANT_ID));
    expect(text).toContain('Awa');
    expect(text).toContain('Anonyme');
    expect(text).toContain('Sénégal');
    expect(text).toContain('iOS 17');
    expect(text).toContain('World Wide');
    expect(text).not.toContain('sans compte');
  });

  test('la photo servie remplace les initiales de l’en-tête (#12571)', async () => {
    mountHost({ identifier: 'world', role: 'MODERATOR', card: () => ({ ok: true, data: { ...CARD, avatar: '2026/09/awa/photo.png' } }) });
    await settle(() => probe() === 'open');
    click(container?.querySelector('[data-probe]') as HTMLElement);
    await settle(() => (sheet()?.textContent ?? '').includes('Safari 17'));
    const img = sheet()?.querySelector('img');
    expect(img?.getAttribute('src')).toContain('/attachments/file/2026%2F09%2Fawa%2Fphoto.png');
    expect(sheet()?.querySelectorAll('.avatar-root')).toHaveLength(1);
  });

  test('sans photo servie : les initiales seules, aucune <img> (#12571)', async () => {
    mountHost({ identifier: 'world', role: 'MODERATOR' });
    await settle(() => probe() === 'open');
    click(container?.querySelector('[data-probe]') as HTMLElement);
    await settle(() => (sheet()?.textContent ?? '').includes('Safari 17'));
    expect(sheet()?.querySelector('img')).toBeNull();
    expect(sheet()?.querySelector('[data-avatar-initials]')?.textContent).toBe('AW');
  });

  test('un 403 : la feuille se referme, rien n’est affiché', async () => {
    mountHost({ identifier: 'world', role: 'MODERATOR', card: () => ({ ok: false, status: 403, error: 'refusé', code: 'WORLD_PARTICIPANT_CARD_FORBIDDEN' }) });
    await settle(() => probe() === 'open');
    click(container?.querySelector('[data-probe]') as HTMLElement);
    await settle(() => false);
    expect(sheet()).toBeNull();
  });

  test('un 403 relit le rôle servi : un rôle retiré referme la porte, aucun auteur ne reste touchable pour rien', async () => {
    let role = 'MODERATOR';
    const permissionReads: string[] = [];
    const transport = {
      request: async ({ path }: { readonly path: string }): Promise<ApiResult<unknown>> => {
        if (path === '/api/v1/me/permissions') {
          permissionReads.push(role);
          return { ok: true, data: { role, permissions: NO_PERMISSIONS } };
        }
        role = 'USER';
        return { ok: false, status: 403, error: 'refusé', code: 'WORLD_PARTICIPANT_CARD_FORBIDDEN' };
      },
    } as unknown as HttpTransport;
    mount(
      <WorldParticipantCardHost conversationIdentifier="world" access={{ deps: { source: 'gateway', transport }, client: new QueryClient(), session: signedIn() }}>
        <Probe />
      </WorldParticipantCardHost>,
    );
    await settle(() => probe() === 'open');
    click(container?.querySelector('[data-probe]') as HTMLElement);
    await settle(() => probe() === 'closed');
    expect(permissionReads).toEqual(['MODERATOR', 'USER']);
    expect(probe()).toBe('closed');
    expect(sheet()).toBeNull();
  });

  test('un 404 : la feuille dit que la personne n’est plus dans World Wide', async () => {
    mountHost({ identifier: 'world', role: 'MODERATOR', card: () => ({ ok: false, status: 404, error: 'absent', code: 'WORLD_PARTICIPANT_NOT_FOUND' }) });
    await settle(() => probe() === 'open');
    click(container?.querySelector('[data-probe]') as HTMLElement);
    await settle(() => (sheet()?.textContent ?? '').includes('World Wide'));
    expect(sheet()?.textContent ?? '').toContain('n’est plus dans World Wide');
  });
});

describe('la feuille : la pastille de nature se lit (WCAG 1.4.3)', () => {
  const aliases = loadColorAliasMap() as Record<string, string>;
  const schemes = loadIosSchemes() as { readonly light: Record<string, string>; readonly dark: Record<string, string> };
  type Rgba = { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
  const varsOf = (scheme: 'light' | 'dark'): Record<string, string> => ({
    ...schemes[scheme],
    ...Object.fromEntries(Object.entries(aliases).map(([alias, token]) => [alias, `var(${token})`])),
  });
  const over = (top: Rgba, bottom: Rgba): Rgba => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });

  for (const kind of ['anonymous', 'account', 'bot'] as const) {
    test(`« ${kind} » : l’encre tient 4,5:1 sur le fond teinté de la pastille, en clair comme en sombre`, () => {
      const chip = worldCardKindChipColors(kind);
      for (const scheme of ['light', 'dark'] as const) {
        const vars = varsOf(scheme);
        const card = resolveColor('var(--color-ios-card)', vars) as Rgba;
        const ink = over(resolveColor(chip.ink, vars) as Rgba, card);
        const ground = over(resolveColor(chip.ground, vars) as Rgba, card);
        expect({ scheme, passes: wcagContrastRatio(ink, ground) >= 4.5 }).toEqual({ scheme, passes: true });
      }
    });
  }

  test('la feuille peint la pastille avec ces couleurs-là', async () => {
    mountHost({ identifier: 'world', role: 'MODERATOR' });
    await settle(() => probe() === 'open');
    click(container?.querySelector('[data-probe]') as HTMLElement);
    await settle(() => sheet()?.querySelector('[data-world-card-kind]') != null);
    const chip = sheet()?.querySelector<HTMLElement>('[data-world-card-kind]');
    expect(chip?.style.color).toBe(worldCardKindChipColors('anonymous').ink);
  });
});
