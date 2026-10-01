import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ParsedVCard } from '@meeshy/shared/types/contact-card';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ContactCardSheet } from './contact-card-sheet';

/**
 * LA FICHE DE CONTACT COPIE AVEC LE REPLI (#8986) — comme le menu d'un message
 * (#8734) et les invitations (#8937) : un presse-papiers qui refuse (WebView
 * Android, geste périmé) ne doit pas annoncer « Copie impossible » quand le
 * repli historique copie.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
});

const CARD: ParsedVCard = {
  formattedName: 'Awa Diallo',
  phones: [{ label: 'mobile', value: '+33 6 12 34 56 78' }],
  emails: [],
  urls: [],
  addresses: [],
};

function clipboardRefuses(): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: () => Promise.reject(new DOMException('refusé', 'NotAllowedError')) },
    configurable: true,
  });
}

function legacyCopies(): string[] {
  const copied: string[] = [];
  Object.defineProperty(document, 'execCommand', {
    value: () => {
      const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-hidden="true"]');
      if (field !== null) copied.push(field.value);
      return field !== null;
    },
    configurable: true,
  });
  return copied;
}

describe('fiche de contact — copier sans presse-papiers asynchrone (#8986)', () => {
  test('le presse-papiers refuse, le repli copie ⇒ « Copied to clipboard »', async () => {
    clipboardRefuses();
    const copied = legacyCopies();
    const host = await mounter.mount(
      <ContactCardSheet card={CARD} accounts={[]} language="en" busy={null} onAction={() => {}} onClose={() => {}} />,
    );
    await mounter.settle();
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-contact-field="phone"] [data-contact-copy]'));
    await mounter.settle();
    expect(copied).toEqual(['+33 6 12 34 56 78']);
    expect(host.querySelector('[data-contact-toast]')?.textContent?.trim()).toBe('Copied to clipboard');
  });
});
