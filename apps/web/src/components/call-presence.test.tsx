import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CallRecord } from '@/lib/api/calls';
import { presenceStore } from '@/lib/api/presence-store';
import { baseCall } from '@/lib/calls/engine-session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { CallRow } from '@/routes/calls-parts';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Portrait } from './call-grid';

/**
 * **LA PRÉSENCE SERVIE SE PEINT DANS LES APPELS** (#10956, décision #10955 —
 * D-60 levée) : le portrait d'un pair, la ligne du journal, la bannière d'un
 * second appel. Toujours la carte VIVANTE (ce que la passerelle sert à CE
 * lecteur) ; absente ou hors ligne ⇒ aucun point ; soi et un groupe n'ont
 * pas de clé.
 */

/* Les écritures dans la carte vivante passent par `act` : un abonné laissé par
   un autre fichier y est rendu sur-le-champ, jamais après le démontage du DOM. */
const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => act(() => presenceStore.getState().clear()));

const online = (userId: string) => act(() => presenceStore.getState().put(userId, { isOnline: true, lastActiveAt: new Date().toISOString() }));
const dotOf = (html: string): string | null => /data-presence="([a-z]+)"/.exec(html)?.[1] ?? null;

describe('un appel connaît la clé de présence de son pair', () => {
  const request = { conversationId: 'c-1', media: 'audio' as const, title: 'Amina', avatar: null };

  test('un direct la reçoit de qui le lance', () => {
    expect(baseCall({ ...request, isGroup: false, peerKey: 'u-amina' }, 'outgoing', { kind: 'outgoing' }).peerKey).toBe('u-amina');
  });

  test('un groupe n’en a jamais, même si on lui en passe une', () => {
    expect(baseCall({ ...request, isGroup: true, peerKey: 'u-amina' }, 'outgoing', { kind: 'outgoing' }).peerKey).toBeNull();
  });
});

describe('le portrait d’un pair', () => {
  test('peint sa présence servie, et rien sans elle', () => {
    expect(dotOf(renderToStaticMarkup(<Portrait name="Amina" avatar={null} size={96} pulse={false} presenceKey="u-amina" />))).toBeNull();
    online('u-amina');
    expect(dotOf(renderToStaticMarkup(<Portrait name="Amina" avatar={null} size={96} pulse={false} presenceKey="u-amina" />))).toBe('online');
  });

  test('mon propre portrait n’a pas de clé', () => {
    online('u-amina');
    expect(dotOf(renderToStaticMarkup(<Portrait name="Moi" avatar={null} size={96} pulse={false} presenceKey={undefined} />))).toBeNull();
  });
});

describe('la ligne du journal d’appels', () => {
  const record = (overrides: Partial<CallRecord> = {}): CallRecord => ({
    callId: 'call-1',
    conversationId: 'c-1',
    conversationType: 'direct',
    conversationTitle: null,
    conversationAvatar: null,
    direction: 'incoming',
    isVideo: false,
    startedAt: '2026-09-26T09:00:00.000Z',
    durationSec: 185,
    bytes: null,
    peer: { userId: 'u-amina', username: 'amina', displayName: 'Amina Diallo', avatar: null },
    reactionCounts: {},
    participants: [],
    ...overrides,
  });
  const row = (overrides: Partial<CallRecord> = {}) => renderToStaticMarkup(<CallRow language="fr" record={record(overrides)} now={new Date('2026-09-26T12:00:00.000Z')} />);

  test('un direct peint la présence servie du pair', () => {
    expect(dotOf(row())).toBeNull();
    online('u-amina');
    expect(dotOf(row())).toBe('online');
  });

  test('un appel de groupe ne peint personne', () => {
    online('u-amina');
    expect(dotOf(row({ conversationType: 'group', conversationTitle: 'Équipe' }))).toBeNull();
  });
});
