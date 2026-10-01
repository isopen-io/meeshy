import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { HttpTransport } from '@/lib/api/http';
import type { Conversation } from '@/lib/api/types';
import { loadSendSheetCatalog } from '@/lib/i18n-send-sheet-catalog';
import type { PortailPartage } from '@/lib/view/invitation';

import { ShareLinkSheet } from './share-link-sheet';

/**
 * LA FEUILLE « CRÉER UN LIEN DE PARTAGE » SUR LE CADRE COMMUN (#8884) — la
 * même base que la feuille d'envoi : verre, « Annuler » lisible à gauche,
 * textes du catalogue `shareLinkSheet.*` (plus de français codé en dur). Son
 * CONTENU ne change pas : choisir une conversation éligible crée le lien
 * d'invitation et le partage.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadSendSheetCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    title: 'Sans titre',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    currentUserRole: 'admin',
    ...partial,
  }) as Conversation;

const deps: ConversationsDeps = { source: 'fixtures', transport: (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport };

type Probe = { readonly closed: number; readonly feedback: readonly (string | null)[]; readonly shared: string[] };

function props(conversations: readonly Conversation[], portail: PortailPartage, probe: { closed: number; feedback: (string | null)[] }) {
  return {
    conversations,
    viewerId: 'u-me',
    deps,
    origin: 'https://meeshy.me',
    portail,
    onClose: () => {
      probe.closed += 1;
    },
    onFeedback: (message: string | null) => {
      probe.feedback.push(message);
    },
  };
}

async function open(conversations: readonly Conversation[], portail: PortailPartage = {}): Promise<{ host: HTMLDivElement; probe: Probe }> {
  const probe = { closed: 0, feedback: [] as (string | null)[], shared: [] as string[] };
  const host = await mounter.mount(<ShareLinkSheet {...props(conversations, portail, probe)} />);
  return { host, probe };
}

describe('ShareLinkSheet — sur le cadre commun des feuilles de partage', () => {
  test('une modale de verre, nommée par son titre du catalogue, avec un « Annuler » texte', async () => {
    const { host } = await open([conversation({})]);
    const dialog = host.querySelector('dialog');
    expect(dialog?.open).toBe(true);
    expect(dialog?.hasAttribute('data-send-sheet-frame')).toBe(true);
    expect(dialog?.className).toContain('glass-prominent');
    expect(host.querySelector('h2')?.textContent).toBe('Créer un lien de partage');
    expect(buttonNamed(host, 'Annuler')).not.toBeNull();
  });

  test('« Annuler » referme la feuille sans rien créer', async () => {
    const { host, probe } = await open([conversation({})], { copier: async () => undefined });
    await mounter.click(buttonNamed(host, 'Annuler'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await mounter.settle();
    expect(probe.closed).toBe(1);
    expect(probe.feedback).toEqual([]);
  });

  test('ne liste que les conversations éligibles : jamais un direct', async () => {
    const { host } = await open([
      conversation({ id: 'g', title: 'Équipe' }),
      conversation({ id: 'd', title: 'Alice', type: 'direct' }),
    ]);
    const labels = [...host.querySelectorAll('li button')].map((b) => b.textContent);
    expect(labels).toEqual(['Équipe']);
  });

  test('sans conversation éligible, le catalogue dit pourquoi la liste est vide', async () => {
    const { host } = await open([conversation({ id: 'd', type: 'direct' })]);
    expect(host.textContent).toContain('Aucune conversation ne peut recevoir un lien pour l’instant.');
    expect(host.querySelectorAll('li button').length).toBe(0);
  });

  test('choisir une conversation crée le lien, le partage au système, puis ferme', async () => {
    const shared: string[] = [];
    const { host, probe } = await open([conversation({ id: 'g', title: 'Équipe' })], {
      share: async (data) => {
        shared.push(data.url);
      },
    });
    await mounter.click(buttonNamed(host, 'Équipe'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await mounter.settle();
    expect(shared).toHaveLength(1);
    expect(shared[0]?.startsWith('https://meeshy.me/')).toBe(true);
    expect(probe.closed).toBe(1);
    expect(probe.feedback).toEqual([]);
  });

  test('le repli presse-papiers annonce « Lien copié » dans le texte du catalogue', async () => {
    const { host, probe } = await open([conversation({ id: 'g', title: 'Équipe' })], { copier: async () => undefined });
    await mounter.click(buttonNamed(host, 'Équipe'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await mounter.settle();
    expect(probe.feedback).toEqual(['Lien copié — il ne reste qu’à le coller.']);
  });

  test('un lien qui ne se crée pas se dit, et la feuille reste ouverte pour réessayer', async () => {
    const failing: ConversationsDeps = {
      source: 'gateway',
      transport: { request: async () => ({ ok: false, status: 500, error: 'boom' }) } as unknown as HttpTransport,
    };
    const probe = { closed: 0, feedback: [] as (string | null)[] };
    const host = await mounter.mount(<ShareLinkSheet {...props([conversation({ id: 'g', title: 'Équipe' })], {}, probe)} deps={failing} />);
    await mounter.click(buttonNamed(host, 'Équipe'));
    expect(probe.feedback).toEqual(['Impossible de créer le lien — réessayez dans un instant.']);
    expect(probe.closed).toBe(0);
  });

  test('sans aucune porte de partage, l’impossibilité se dit', async () => {
    const { host, probe } = await open([conversation({ id: 'g', title: 'Équipe' })], {});
    await mounter.click(buttonNamed(host, 'Équipe'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await mounter.settle();
    expect(probe.feedback).toEqual(['Impossible de partager ici. Copiez l’adresse de cette page.']);
  });
});
