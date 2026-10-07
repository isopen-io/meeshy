import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { ForwardResult } from '@/lib/api/forward';
import { message, VIEWER_ID } from '@/lib/api/fixtures-base';
import { appQueryClient } from '@/lib/api/query-client';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadSendSheetCatalog } from '@/lib/i18n-send-sheet-catalog';
import type { SendSheetPorts } from '@/lib/send/send-sheet-run';
import { forwardRequestOf } from '@/lib/view/forward';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SendSheet } from './send-sheet';

/**
 * LA RANGÉE DE DURÉE DE LA FEUILLE DE TRANSFERT (#9573) — source flamme à
 * durée ⇒ la durée de la source présélectionnée, seuls les paliers inférieurs
 * ou égaux ; la valeur choisie part dans `ephemeralDuration`. Et un refus du
 * serveur se lit comme une explication.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { EPHEMERAL } = MESSAGE_EFFECT_FLAGS;
const NOW = Date.parse('2026-10-07T10:00:00.000Z');

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadSendSheetCatalog('fr'), loadInterfaceCatalog('fr')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const seedCache = (): void => {
  appQueryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [
          { id: 'c-cible', type: 'group', title: 'Équipe', participants: [], status: 'active', visibility: 'private', isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW) },
        ],
        pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
};

const line = (id: string, overrides: Partial<Message> = {}): Message =>
  message({ id, senderId: 'u-autre', content: `texte ${id}`, originalLanguage: 'fr', createdAt: new Date(NOW - 60_000), translations: [], ...overrides });

const flame = (id: string, seconds: number): Message => line(id, { effectFlags: EPHEMERAL, ephemeralDuration: seconds });

type Forwarded = { readonly ids: readonly string[]; readonly ephemeralDuration: number | undefined };

const mount = async (messages: readonly Message[], answer: ForwardResult = { ok: true, count: 1 }) => {
  const forwarded: Forwarded[] = [];
  const unused = async () => ({ ok: false as const, status: 500, error: 'inutilisé' });
  const ports: SendSheetPorts = {
    online: () => true,
    openDirect: unused,
    forward: async (params) => {
      forwarded.push({ ids: params.messages.map((m) => m.id), ephemeralDuration: params.ephemeralDuration });
      return answer;
    },
    sendMessage: unused,
    uploadFiles: unused,
    fetchFile: async () => null,
    uploadMedia: unused,
    publishMedia: unused,
    publishFromAttachment: unused,
    repost: unused,
    createTextPost: unused,
    newClientMessageId: () => 'cid',
  };
  seedCache();
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <SendSheet request={forwardRequestOf({ conversationId: 'c-src', messages, now: NOW })} viewerId={VIEWER_ID} language="fr" contentLanguage="fr" ports={ports} onClose={() => {}} />
    </QueryClientProvider>,
  );
  return { host, forwarded };
};

const group = (host: ParentNode): HTMLElement | null => host.querySelector('[data-send-duration]');
const radios = (host: ParentNode): readonly HTMLInputElement[] => [...host.querySelectorAll<HTMLInputElement>('[data-send-duration] input[type="radio"]')];
const send = async (host: ParentNode): Promise<void> => {
  await mounter.click(host.querySelector('[data-send-target="conversation:c-cible"]'));
  await mounter.click(host.querySelector('[data-send-sheet-send]'));
  await mounter.settle();
};

describe('la rangée de durée', () => {
  test('un message ordinaire : aucune rangée', async () => {
    const { host } = await mount([line('m1')]);
    expect(group(host)).toBe(null);
  });

  test('une flamme de 5 minutes : 5 min présélectionné, puis 1 min, 30 s, 15 s — rien au-dessus', async () => {
    const { host } = await mount([flame('f1', 300)]);
    expect(radios(host).map((radio) => [radio.value, radio.checked])).toEqual([
      ['300', true],
      ['60', false],
      ['30', false],
      ['15', false],
    ]);
    expect(group(host)?.textContent).toContain('5 minutes');
    expect(group(host)?.textContent).not.toContain('1 heure');
  });

  test('une durée source HORS palier s’affiche telle quelle en tête', async () => {
    const { host } = await mount([flame('f1', 45)]);
    expect(radios(host).map((radio) => radio.value)).toEqual(['45', '30', '15']);
    expect(group(host)?.textContent).toContain('45s');
  });

  test('accessible : un groupe NOMMÉ de boutons radio natifs (flèches du clavier, lecteur d’écran)', async () => {
    const { host } = await mount([flame('f1', 300)]);
    const fieldset = group(host);
    expect(fieldset?.tagName).toBe('FIELDSET');
    expect(fieldset?.querySelector('legend')?.textContent).toBe('Disparaît après');
    const names = new Set(radios(host).map((radio) => radio.name));
    expect(names.size).toBe(1);
    expect([...names][0]).not.toBe('');
    radios(host).forEach((radio) => expect(radio.closest('label')?.textContent?.trim()).not.toBe(''));
  });

  test('sans y toucher, la durée de la source part dans `ephemeralDuration`', async () => {
    const { host, forwarded } = await mount([flame('f1', 300)]);
    await send(host);
    expect(forwarded).toEqual([{ ids: ['f1'], ephemeralDuration: 300 }]);
  });

  test('la durée CHOISIE part dans `ephemeralDuration`', async () => {
    const { host, forwarded } = await mount([flame('f1', 300)]);
    await mounter.click(radios(host).find((radio) => radio.value === '30') ?? null);
    expect(radios(host).find((radio) => radio.value === '30')?.checked).toBe(true);
    await send(host);
    expect(forwarded).toEqual([{ ids: ['f1'], ephemeralDuration: 30 }]);
  });

  test('plusieurs flammes : la plus courte borne le choix', async () => {
    const { host } = await mount([flame('f1', 3600), line('m2'), flame('f3', 60)]);
    expect(radios(host).map((radio) => radio.value)).toEqual(['60', '30', '15']);
  });
});

describe('un refus du serveur se lit comme une explication', () => {
  test('la flamme après lecture refusée : la phrase du motif, pas « L’envoi a été refusé », et pas de « Réessayer »', async () => {
    const { host } = await mount([line('m1')], { ok: false, status: 400, error: 'Un message qui disparaît après lecture ne peut pas être transféré' });
    await send(host);
    const status = host.querySelector('[data-send-status="failed"]');
    expect(status?.textContent).toContain('Un message qui disparaît après lecture ne peut pas être transféré');
    expect(host.textContent).not.toContain('L’envoi a été refusé');
    expect(status?.querySelector('button')).toBe(null);
    const primary = host.querySelector<HTMLButtonElement>('[data-send-sheet-send]');
    expect(primary?.textContent).not.toContain('Réessayer');
    expect(primary?.disabled).toBe(true);
  });
});
