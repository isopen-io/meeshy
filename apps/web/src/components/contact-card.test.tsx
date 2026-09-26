import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { QueryClient } from '@tanstack/react-query';

import type { PublicContactAccount } from '@meeshy/shared/types/contact-card';

import type { FriendActionOutcome } from '@/lib/api/friend-actions';
import type { Attachment } from '@/lib/api/types';
import { contactResolveQueryKey } from '@/lib/contact-card/resolve';
import type { ContactActionPorts } from '@/lib/contact-card/use-contact-actions';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { scriptedGateway } from '@/test-support/scripted-transport';

import ContactCard from './contact-card';

/**
 * **LA CARTE DE VISITE DANS LA BULLE, ET SA FICHE** (#8101).
 *
 * Nom du CARNET DE L'AUTEUR + premier numéro ; mini-profil Meeshy avec les
 * gestes que la relation autorise ; toucher le nom ouvre la fiche qui liste
 * TOUS les champs, chacun copiable par bouton (clavier) et par clic droit.
 * Les textes s'assertent en anglais — une clé absente ne produit jamais
 * « Connect ».
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const VCARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:Diallo;Awa;;;',
  'FN:Awa (Dakar)',
  'ORG:Meeshy SAS',
  'item1.TEL;type=CELL:+33 6 12 34 56 78',
  'EMAIL;type=WORK:awa@example.com',
  'NOTE:Appeler le matin',
  'END:VCARD',
].join('\r\n');

const REQUEST = { phones: ['+33 6 12 34 56 78'], emails: ['awa@example.com'] };

const ATTACHMENT = {
  id: 'att-vcf-1',
  messageId: 'm-1',
  fileName: 'awa.vcf',
  originalName: 'Awa.vcf',
  mimeType: 'text/vcard',
  fileSize: 180,
  fileUrl: '/api/v1/attachments/file/2026/09/awa.vcf',
  createdAt: new Date('2026-09-26T09:00:00.000Z'),
} as unknown as Attachment;

const account = (overrides: Partial<PublicContactAccount> = {}): PublicContactAccount => ({
  userId: '507f1f77bcf86cd799439022',
  displayName: 'Awa Diallo',
  username: 'awa',
  avatarUrl: null,
  bannerUrl: null,
  bio: 'Photographe',
  relation: 'none',
  ...overrides,
});

type Harness = {
  readonly accounts?: readonly PublicContactAccount[] | 'network';
  readonly vcard?: string | Error;
  readonly sendRequest?: () => Promise<FriendActionOutcome>;
};

async function mountCard(harness: Harness = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const gateway = scriptedGateway({
    'POST /api/v1/contacts/resolve': { ok: true, data: { accounts: harness.accounts === 'network' ? [account()] : [] } },
  });
  if (harness.accounts !== undefined && harness.accounts !== 'network') {
    client.setQueryData(contactResolveQueryKey(REQUEST), harness.accounts);
  }
  const sent: string[] = [];
  const copied: string[] = [];
  const ports: ContactActionPorts = {
    sendRequest: async (target) => {
      sent.push(target.userId);
      return harness.sendRequest ? harness.sendRequest() : 'done';
    },
    openDirect: async () => 'done',
  };
  const vcard = harness.vcard ?? VCARD;
  const host = await mounter.mount(
    <ContactCard
      attachment={ATTACHMENT}
      queryClient={client}
      deps={gateway.deps}
      ports={ports}
      language="en"
      fetchText={async () => {
        if (vcard instanceof Error) throw vcard;
        return vcard;
      }}
      clipboard={async (text) => {
        copied.push(text);
      }}
    />,
  );
  await mounter.settle();
  return { host, client, gateway, sent, copied };
}

const text = (node: ParentNode | null): string => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const action = (host: ParentNode, name: string) => host.querySelector<HTMLButtonElement>(`[data-contact-action="${name}"]`);

describe('la bulle — le carnet de l’auteur d’abord', () => {
  test('affiche le nom TEL QUE DANS LA VCARD et le premier numéro dessous', async () => {
    const { host } = await mountCard({ accounts: [] });
    expect(text(host.querySelector('[data-contact-name]'))).toBe('Awa (Dakar)');
    expect(text(host.querySelector('[data-contact-first]'))).toBe('+33 6 12 34 56 78');
    expect(host.querySelector('[data-contact-account]')).toBeNull();
  });

  test('une résolution déjà en cache se peint sans appel réseau', async () => {
    const { host, gateway } = await mountCard({ accounts: [account()] });
    expect(text(host.querySelector('[data-contact-account]'))).toContain('@awa');
    expect(gateway.calls()).toEqual([]);
  });

  test('sans cache, la résolution part une fois avec les identifiants de la carte', async () => {
    const { host, gateway } = await mountCard({ accounts: 'network' });
    expect(gateway.calls().map((call) => call.body)).toEqual([REQUEST]);
    expect(host.querySelector('[data-contact-account]')).not.toBeNull();
  });

  test('carte illisible : le dit et offre le téléchargement', async () => {
    const { host } = await mountCard({ vcard: 'pas une vcard' });
    expect(host.querySelector('[data-contact-card="unreadable"]')).not.toBeNull();
    expect(text(host)).toContain('Unreadable contact card');
    expect(host.querySelector('a[download]')).not.toBeNull();
  });

  test('panne de lecture : offre de réessayer', async () => {
    const { host } = await mountCard({ vcard: new Error('réseau') });
    expect(text(host)).toContain('The contact card could not be read');
    expect([...host.querySelectorAll('button')].some((button) => text(button) === 'Retry')).toBe(true);
  });
});

describe('la bulle — les gestes que la relation autorise', () => {
  test('aucune relation : Se connecter ET Écrire', async () => {
    const { host } = await mountCard({ accounts: [account()] });
    expect(text(action(host, 'connect'))).toBe('Connect');
    expect(text(action(host, 'write'))).toBe('Message');
  });

  test('ami : Écrire seul', async () => {
    const { host } = await mountCard({ accounts: [account({ relation: 'friend' })] });
    expect(action(host, 'connect')).toBeNull();
    expect(action(host, 'write')).not.toBeNull();
  });

  test('soi : aucun bouton', async () => {
    const { host } = await mountCard({ accounts: [account({ relation: 'self' })] });
    expect(host.querySelectorAll('[data-contact-action]')).toHaveLength(0);
    expect(text(host.querySelector('[data-contact-state]'))).toBe('This is you');
  });

  test('demande envoyée : un état, jamais un bouton', async () => {
    const { host } = await mountCard({ accounts: [account({ relation: 'request-sent' })] });
    expect(action(host, 'connect')).toBeNull();
    expect(text(host.querySelector('[data-contact-state]'))).toBe('Request sent');
  });

  test('Se connecter passe la carte en « Demande envoyée » au tap', async () => {
    const { host, sent } = await mountCard({ accounts: [account()] });
    await mounter.click(action(host, 'connect'));
    expect(sent).toEqual(['507f1f77bcf86cd799439022']);
    expect(action(host, 'connect')).toBeNull();
    expect(text(host.querySelector('[data-contact-state]'))).toBe('Request sent');
  });

  test('un refus de la passerelle rend le bouton et le dit', async () => {
    const { host } = await mountCard({ accounts: [account()], sendRequest: async () => 'failed' });
    await mounter.click(action(host, 'connect'));
    expect(action(host, 'connect')).not.toBeNull();
    expect(text(host.querySelector('[role="status"]'))).not.toBe('');
  });
});

describe('la fiche de verre', () => {
  const openSheet = async (harness: Harness = { accounts: [account()] }) => {
    const mounted = await mountCard(harness);
    await mounter.click(mounted.host.querySelector('[data-contact-open]'));
    const sheet = mounted.host.querySelector('[data-contact-sheet]');
    return { ...mounted, sheet };
  };

  test('toucher le nom floute la conversation et liste TOUS les champs', async () => {
    const { sheet } = await openSheet();
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelector('.message-menu-backdrop')).not.toBeNull();
    expect(sheet?.querySelector('.glass-prominent')).not.toBeNull();
    expect([...(sheet?.querySelectorAll('[data-contact-field]') ?? [])].map((row) => row.getAttribute('data-contact-field'))).toEqual([
      'phone',
      'email',
      'organization',
      'note',
    ]);
  });

  test('la section « Sur Meeshy » porte le profil public et ses gestes', async () => {
    const { sheet } = await openSheet();
    expect(text(sheet)).toContain('On Meeshy');
    expect(text(sheet)).toContain('Photographe');
    expect(sheet?.querySelector('[data-contact-action="connect"]')).not.toBeNull();
  });

  test('le bouton Copier, nommé pour le lecteur d’écran, copie et le dit', async () => {
    const { sheet, copied } = await openSheet();
    const button = sheet?.querySelector<HTMLButtonElement>('[data-contact-field="phone"] [data-contact-copy]') ?? null;
    expect(button?.getAttribute('aria-label')).toBe('Copy: Phone · mobile +33 6 12 34 56 78');
    await mounter.click(button);
    expect(copied).toEqual(['+33 6 12 34 56 78']);
    expect(text(sheet?.querySelector('[data-contact-toast]') ?? null)).toBe('Copied to clipboard');
  });

  test('le clic droit copie le champ', async () => {
    const { sheet, copied } = await openSheet();
    const row = sheet?.querySelector('[data-contact-field="email"]');
    await act(async () => {
      row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await mounter.settle();
    expect(copied).toEqual(['awa@example.com']);
  });

  test('fermer rend la bulle sans fiche', async () => {
    const { host, sheet } = await openSheet();
    await mounter.click(sheet?.querySelector<HTMLButtonElement>('button[aria-label="Close"]') ?? null);
    expect(host.querySelector('[data-contact-sheet]')).toBeNull();
  });
});
