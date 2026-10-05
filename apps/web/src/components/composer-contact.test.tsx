import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { parseVCard } from '@meeshy/shared/utils/vcard';

import type { PendingAttachment } from '@/lib/send/attachments';
import type { PickedContact } from '@/lib/send/contact-card';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * ENVOYER UN CONTACT DEPUIS LE COMPOSEUR (#8242) — le geste COMPLET, du « + »
 * à `onSend` : la tuile « Contact » met une carte `text/vcard` en attente, et
 * c'est elle qui part. Aucun témoin ne regarde la plomberie des sources
 * (`lib/send/contact-card.test.ts` s'en charge) : ils lisent la PIÈCE.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
/** Lu à CHAQUE usage : happy-dom remplace `navigator` après le chargement du module. */
const nav = (): Navigator & { contacts?: unknown } => globalThis.navigator as Navigator & { contacts?: unknown };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
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
  delete nav().contacts;
});

type Sent = { readonly attachments: readonly PendingAttachment[] };

const mount = (onSend: (payload: Sent) => void): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Composer onSend={onSend} />);
  });
  return container;
};

const flush = async (condition?: () => boolean): Promise<void> => {
  const limite = Date.now() + 2000;
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    if (condition === undefined || condition() || Date.now() >= limite) return;
  }
};

const openPanel = async (el: HTMLElement): Promise<void> => {
  act(() => {
    el.querySelector<HTMLButtonElement>('[aria-label="Ouvrir le menu des pièces jointes"]')?.click();
  });
  await flush(() => el.querySelector('[data-composer-source="contact"]') !== null);
};

const chooseFile = (input: HTMLInputElement, file: File): void => {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  act(() => {
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const sendNow = (el: HTMLElement): void => {
  act(() => {
    el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')?.click();
  });
};

const AWA_VCF = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Awa Diallo', 'TEL;TYPE=CELL:+33 6 12 34 56 78', 'END:VCARD'].join('\r\n');

describe('la tuile « Contact » du composeur (#8242)', () => {
  test('sur un ordinateur : une fiche .vcf choisie part en carte text/vcard nommée comme le contact', async () => {
    const sent: Sent[] = [];
    const el = mount((payload) => sent.push(payload));
    await openPanel(el);

    const input = el.querySelector<HTMLInputElement>('[data-composer-source="contact"] input[type="file"]');
    if (input === null) throw new Error('La tuile « Contact » devait ouvrir un choix de fiche');
    chooseFile(input, new File([AWA_VCF], 'export.vcf', { type: '' }));
    await flush(() => el.querySelector('[aria-label="Supprimer Awa Diallo.vcf"]') !== null);
    sendNow(el);

    const [attachment] = sent[0]?.attachments ?? [];
    expect(attachment?.file.type).toBe('text/vcard');
    expect(attachment?.name).toBe('Awa Diallo.vcf');
    expect(parseVCard(await (attachment?.file.text() ?? Promise.resolve('')))?.phones).toEqual([
      { label: 'mobile', value: '+33 6 12 34 56 78' },
    ]);
  });

  test('une fiche qui n’est pas une carte de visite : rien n’est joint, et le refus est DIT', async () => {
    const el = mount(() => {});
    await openPanel(el);
    const input = el.querySelector<HTMLInputElement>('[data-composer-source="contact"] input[type="file"]');
    if (input === null) throw new Error('La tuile « Contact » devait ouvrir un choix de fiche');
    chooseFile(input, new File(['bonjour'], 'notes.vcf', { type: '' }));
    await flush(() => el.textContent?.includes('Ce contact ne peut pas être partagé') === true);

    expect(el.textContent).toContain('Ce contact ne peut pas être partagé');
    expect(el.querySelector('[role="group"][aria-label="Pièces jointes en attente"]')).toBeNull();
  });

  test('dans un navigateur qui a l’API Contact Picker : un geste ouvre le sélecteur, la fiche choisie part', async () => {
    const picked: PickedContact[] = [{ name: ['Awa Diallo'], tel: ['+33 6 12 34 56 78'] }];
    nav().contacts = { getProperties: async () => ['name', 'tel'], select: async () => picked };
    const sent: Sent[] = [];
    const el = mount((payload) => sent.push(payload));
    await openPanel(el);

    act(() => {
      el.querySelector<HTMLButtonElement>('button[data-composer-source="contact"]')?.click();
    });
    await flush(() => el.querySelector('[aria-label="Supprimer Awa Diallo.vcf"]') !== null);
    sendNow(el);

    expect(sent[0]?.attachments[0]?.file.type).toBe('text/vcard');
  });

  test('un sélecteur refermé sans choix n’ajoute rien', async () => {
    nav().contacts = { getProperties: async () => ['name'], select: async () => [] };
    const el = mount(() => {});
    await openPanel(el);
    act(() => {
      el.querySelector<HTMLButtonElement>('button[data-composer-source="contact"]')?.click();
    });
    await flush();

    expect(el.querySelector('[role="group"][aria-label="Pièces jointes en attente"]')).toBeNull();
    expect(el.textContent).not.toContain('Ce contact ne peut pas être partagé');
  });
});
