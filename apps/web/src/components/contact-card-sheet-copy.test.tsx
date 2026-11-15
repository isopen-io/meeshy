import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

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

describe('fiche de contact — elle entre et sort en fondu (#18320, défaut de #18552)', () => {
  test('la fiche s’ouvre en fondu, et ✕ la ferme d’un coup en laissant son fantôme jouer la sortie', async () => {
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, writable: true, value() {} });
    try {
      const closed: string[] = [];
      const host = await mounter.mount(
        <ContactCardSheet card={CARD} accounts={[]} language="en" busy={null} onAction={() => {}} onClose={() => closed.push('close')} />,
      );
      const dialog = host.querySelector<HTMLDialogElement>('dialog[data-contact-sheet]');
      expect(dialog?.hasAttribute('data-dialog-fade')).toBe(true);
      await mounter.click(host.querySelector<HTMLButtonElement>('[data-contact-close]'));
      expect(closed).toEqual(['close']);
      expect(dialog?.open).toBe(false);
      expect(document.querySelector('[data-dialog-ghost]')?.getAttribute('data-dialog-ghost')).toBe('centered');
    } finally {
      delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
      for (const ghost of document.querySelectorAll('[data-dialog-ghost]')) ghost.remove();
    }
  });
});

describe('fiche de contact — sur un téléphone, la carte monte du bas et y redescend (#18320, K15)', () => {
  const motion = () => readFileSync(new URL('../styles/sheet-motion.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const phoneBlock = (css: string): string => {
    const start = css.indexOf('@media (width < 48rem)', css.indexOf('@media (prefers-reduced-motion: no-preference)'));
    return start < 0 ? '' : css.slice(start, css.indexOf('@keyframes'));
  };

  test('la carte porte la prise que la feuille de mouvement lit, le voile n’en porte pas', async () => {
    const host = await mounter.mount(<ContactCardSheet card={CARD} accounts={[]} language="en" busy={null} onAction={() => {}} onClose={() => {}} />);
    expect(host.querySelector('dialog[data-contact-sheet] section[data-contact-sheet-card]')).not.toBeNull();
    expect(host.querySelector('[data-contact-backdrop]')?.closest('[data-contact-sheet-card]')).toBeNull();
  });

  test('sous 48 rem, la carte entre par dialog-rise et son fantôme sort par dialog-sink, sur la durée de la feuille', () => {
    const block = phoneBlock(motion());
    expect(block).toMatch(/dialog\[data-contact-sheet\]\[open\]\s+\[data-contact-sheet-card\]\s*\{[^}]*animation\s*:\s*dialog-rise var\(--dialog-rise-ms\)/);
    expect(block).toMatch(/\[data-dialog-ghost\]\s+\[data-contact-sheet-card\]\s*\{[^}]*animation\s*:\s*dialog-sink var\(--dialog-rise-ms\)/);
    expect(block).toMatch(/\[data-dialog-ghost\]:has\(\[data-contact-sheet-card\]\)[^{]*\{[^}]*animation-duration\s*:\s*var\(--dialog-rise-ms\)/);
  });
});
